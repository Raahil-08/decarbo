"""Plan explanation API router per PRD §15.4, §15.6, §16.2 and §22 Phase 8."""

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai.guardrail import (
    build_allowed_numbers_set,
    validate_numeric_grounding,
)
from app.ai.prompts import (
    build_plan_explanation_system_prompt,
    build_plan_explanation_user_prompt,
)
from app.ai.provider import Message, get_llm_provider
from app.ai.template_explanation import render_template_explanation
from app.auth import AuthenticatedUser, get_current_user
from app.config import get_settings
from app.db import get_db
from app.models.models import Factory, FactoryMember, Intervention, Plan, PlanItem

logger = logging.getLogger(__name__)

router = APIRouter(tags=["explanation"])

# In-memory sliding-window rate limiter: user_id -> list of call timestamps (PRD §15.6)
_USER_CALL_TIMESTAMPS: dict[str, list[float]] = {}


def _check_rate_limit(user_id: str, limit: int = 30) -> None:
    now = time.time()
    cutoff = now - 3600.0
    history = _USER_CALL_TIMESTAMPS.setdefault(user_id, [])
    # Evict older timestamps
    _USER_CALL_TIMESTAMPS[user_id] = [t for t in history if t > cutoff]
    if len(_USER_CALL_TIMESTAMPS[user_id]) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message_key": "errors.rate_limit_exceeded",
                    "details": {"limit": limit, "window_hours": 1},
                }
            },
        )
    _USER_CALL_TIMESTAMPS[user_id].append(now)


class ExplanationResponse(BaseModel):
    text: str
    locale: str
    source: str  # "ai" | "template"
    cached: bool


def _verify_plan_access(db: Session, plan_id: uuid.UUID, user_id: uuid.UUID) -> tuple[Plan, Factory]:
    """Verify tenant access: user must have membership in the plan's factory."""
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PLAN_NOT_FOUND", "message_key": "errors.plan_not_found"}},
        )

    # Check factory membership
    membership = (
        db.query(FactoryMember)
        .filter(FactoryMember.factory_id == plan.factory_id, FactoryMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    factory = db.query(Factory).filter(Factory.id == plan.factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    return plan, factory


def _load_plan_context(db: Session, plan: Plan) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Load items and top hotspots for plan explanation."""
    # Ledger items with intervention details
    items = (
        db.query(PlanItem, Intervention)
        .join(Intervention, PlanItem.intervention_code == Intervention.code)
        .filter(PlanItem.plan_id == plan.id)
        .order_by(PlanItem.sequence.asc())
        .all()
    )

    ledger_items = []
    for pi, itv in items:
        ledger_items.append({
            "sequence": int(pi.sequence),
            "intervention_code": pi.intervention_code,
            "title_en": itv.title_en,
            "category": itv.category,
            "capex_inr": float(pi.capex_inr),
            "annual_savings_inr": float(pi.annual_savings_inr),
            "reduction_kgco2e": float(pi.reduction_kgco2e),
            "payback_months": float(pi.payback_months) if pi.payback_months is not None else None,
            "level": pi.level,
        })

    # Hotspots from plan totals / summary
    hotspots: list[dict[str, Any]] = []
    totals = plan.totals or {}
    pool_breakdown = totals.get("pool_breakdown") or totals.get("pool_emissions_tco2e")
    if isinstance(pool_breakdown, dict):
        total_co2 = sum(float(v) for v in pool_breakdown.values()) or 1.0
        for pool, amt in pool_breakdown.items():
            amt_f = float(amt)
            hotspots.append({
                "activity_type": pool,
                "tco2e": amt_f if amt_f < 1000 else amt_f / 1000.0,
                "kgco2e": amt_f * 1000.0 if amt_f < 1000 else amt_f,
                "share_pct": (amt_f / total_co2) * 100.0,
            })
        hotspots.sort(key=lambda h: h["share_pct"], reverse=True)

    return ledger_items, hotspots


async def _generate_explanation_content(
    plan: Plan,
    factory: Factory,
    ledger_items: list[dict[str, Any]],
    hotspots: list[dict[str, Any]],
    locale: str,
    db: Session,
    user_id: str,
) -> tuple[str, str]:
    """Generate plan explanation using LLM with guardrail, or template fallback.

    Returns:
        (text, source) where source is 'ai' or 'template'
    """
    settings = get_settings()
    totals = plan.totals or {}

    # If LLM disabled or no API key, use deterministic template immediately
    if not settings.llm_enabled or not settings.anthropic_api_key:
        text = render_template_explanation(
            plan_totals=totals,
            ledger_items=ledger_items,
            hotspots=hotspots,
            locale=locale,
        )
        return text, "template"

    # Rate limiting check
    _check_rate_limit(user_id, limit=settings.RATE_LIMIT_LLM_PER_HOUR)

    # Allowed numbers set
    allowed_numbers = build_allowed_numbers_set(
        plan_totals=totals,
        ledger_items=ledger_items,
        hotspots=hotspots,
    )

    mode_label = {
        "best_value": "Best value",
        "min_capex_for_target": "Lowest investment",
        "max_reduction_in_budget": "Biggest cut",
    }.get(plan.mode, plan.mode)

    sys_prompt = build_plan_explanation_system_prompt(locale)
    user_prompt = build_plan_explanation_user_prompt(
        factory_name=factory.name,
        industry=factory.industry or "brass manufacturing",
        plan_mode_label=mode_label,
        plan_totals=totals,
        ledger_items=ledger_items,
        hotspots=hotspots,
        locale=locale,
    )

    provider = get_llm_provider(settings)

    # Attempt 1
    try:
        chunks = []
        async for chunk in provider.stream_text(
            system=sys_prompt,
            messages=[Message(role="user", content=user_prompt)],
            model=settings.LLM_MODEL_SMART,
        ):
            chunks.append(chunk)
        candidate = "".join(chunks).strip()

        is_valid, ungrounded = validate_numeric_grounding(candidate, allowed_numbers)
        if is_valid:
            return candidate, "ai"

        logger.warning(
            "Plan %s explanation failed numeric grounding (ungrounded: %s). Retrying once.",
            plan.id,
            ungrounded,
        )

        # Attempt 2: Retry with explicit feedback on offending numbers
        retry_msg = (
            f"Your previous response included numbers that are not permitted: {ungrounded}. "
            f"Rewrite the explanation using ONLY the allowed numbers from the prompt."
        )
        retry_chunks = []
        async for chunk in provider.stream_text(
            system=sys_prompt,
            messages=[
                Message(role="user", content=user_prompt),
                Message(role="assistant", content=candidate),
                Message(role="user", content=retry_msg),
            ],
            model=settings.LLM_MODEL_SMART,
        ):
            retry_chunks.append(chunk)
        retry_candidate = "".join(retry_chunks).strip()

        is_valid_retry, ungrounded_retry = validate_numeric_grounding(retry_candidate, allowed_numbers)
        if is_valid_retry:
            return retry_candidate, "ai"

        logger.warning(
            "Plan %s retry failed numeric grounding (ungrounded: %s). Falling back to template.",
            plan.id,
            ungrounded_retry,
        )
    except Exception as exc:
        logger.error("LLM explanation error for plan %s: %s. Falling back to template.", plan.id, exc)

    # Fallback to deterministic template
    fallback_text = render_template_explanation(
        plan_totals=totals,
        ledger_items=ledger_items,
        hotspots=hotspots,
        locale=locale,
    )
    return fallback_text, "template"


def _save_explanation_cache(db: Session, plan_id: uuid.UUID, locale: str, text: str) -> None:
    """Save generated explanation into plans.explanation JSON map."""
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan:
        cache = dict(plan.explanation or {})
        cache[locale] = text
        plan.explanation = cache
        db.commit()


@router.get(
    "/plans/{plan_id}/explanation",
    status_code=status.HTTP_200_OK,
)
@router.get(
    "/factories/{factory_id}/plans/{plan_id}/explanation",
    status_code=status.HTTP_200_OK,
)
async def get_plan_explanation(
    plan_id: uuid.UUID,
    factory_id: uuid.UUID | None = None,
    locale: str = Query("en", pattern="^(en|gu|hi)$"),
    stream: bool = Query(True),
    regenerate: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Retrieve or stream AI explanation in en, gu, or hi per PRD §15.4 and §16.2."""
    plan, factory = _verify_plan_access(db, plan_id, current_user.id)
    locale_key = locale.lower()

    # 1. Check cache if not regenerating
    existing_cache = plan.explanation or {}
    if not regenerate and locale_key in existing_cache:
        cached_text = existing_cache[locale_key]
        if stream:
            async def cached_stream() -> AsyncIterator[str]:
                chunk_size = 12
                for i in range(0, len(cached_text), chunk_size):
                    part = cached_text[i : i + chunk_size]
                    payload = json.dumps({"text": part, "done": False, "source": "cached", "locale": locale_key})
                    yield f"data: {payload}\n\n"
                final_payload = json.dumps({"text": "", "done": True, "source": "cached", "locale": locale_key})
                yield f"data: {final_payload}\n\n"

            return StreamingResponse(cached_stream(), media_type="text/event-stream")

        return JSONResponse(
            content=ExplanationResponse(
                text=cached_text,
                locale=locale_key,
                source="cached",
                cached=True,
            ).model_dump()
        )

    # 2. Generate explanation
    ledger_items, hotspots = _load_plan_context(db, plan)
    text, source = await _generate_explanation_content(
        plan=plan,
        factory=factory,
        ledger_items=ledger_items,
        hotspots=hotspots,
        locale=locale_key,
        db=db,
        user_id=str(current_user.id),
    )

    # 3. Cache result
    _save_explanation_cache(db, plan.id, locale_key, text)

    # 4. Return as SSE stream or JSON
    if stream:
        async def response_stream() -> AsyncIterator[str]:
            chunk_size = 12
            for i in range(0, len(text), chunk_size):
                part = text[i : i + chunk_size]
                payload = json.dumps({"text": part, "done": False, "source": source, "locale": locale_key})
                yield f"data: {payload}\n\n"
            final_payload = json.dumps({"text": "", "done": True, "source": source, "locale": locale_key})
            yield f"data: {final_payload}\n\n"

        return StreamingResponse(response_stream(), media_type="text/event-stream")

    return JSONResponse(
        content=ExplanationResponse(
            text=text,
            locale=locale_key,
            source=source,
            cached=False,
        ).model_dump()
    )
