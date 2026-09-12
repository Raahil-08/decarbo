"""Adoption tracking and decarbonisation progress API router per PRD §14.3, §16, and §22."""

import uuid
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, require_factory_access
from app.db import get_db
from app.models.models import (
    Adoption,
    CalcRun,
    Factory,
    Intervention,
    Plan,
    PlanItem,
)

router = APIRouter(prefix="/factories", tags=["tracking"])


class AdoptionUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(planned|in_progress|done|dropped)$")
    actual_capex_inr: float | None = None
    started_on: date | None = None
    completed_on: date | None = None
    notes: str | None = None


class AdoptionItemResponse(BaseModel):
    id: str
    factory_id: str
    plan_item_id: str | None = None
    intervention_code: str
    title_en: str
    title_gu: str | None = None
    title_hi: str | None = None
    category: str
    pool: str
    status: str
    started_on: date | None = None
    completed_on: date | None = None
    actual_capex_inr: float | None = None
    estimated_capex_inr: float = 0.0
    estimated_reduction_tco2e: float = 0.0
    estimated_annual_savings_inr: float = 0.0
    notes: str | None = None
    sequence: int = 1


class TrackingTrendPoint(BaseModel):
    month: str = Field(..., alias="month")
    intensity: float
    is_recent: bool = False
    completed_fixes: list[str] = []


class FactoryTrackingResponse(BaseModel):
    factory_id: str
    active_plan_id: str | None = None
    baseline_intensity: float
    current_intensity: float
    target_intensity: float
    progress_pct: float
    production_change_alert: bool = False
    production_change_pct: float = 0.0
    adoptions: list[AdoptionItemResponse]
    trend: list[dict[str, Any]] = []


@router.get(
    "/{factory_id}/tracking",
    response_model=FactoryTrackingResponse,
    status_code=status.HTTP_200_OK,
)
def get_factory_tracking(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="viewer")),
) -> FactoryTrackingResponse:
    """Retrieve implementation adoptions, intensity progress, and alerts per PRD §14.3."""
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    # 1. Find active plan or latest plan
    active_plan = (
        db.query(Plan)
        .filter(Plan.factory_id == factory_id, Plan.is_selected == True)  # noqa: E712
        .first()
    )
    if not active_plan:
        active_plan = (
            db.query(Plan)
            .filter(Plan.factory_id == factory_id)
            .order_by(Plan.created_at.desc())
            .first()
        )

    # 2. Check existing adoptions, or initialize if active plan exists
    adoptions_query = (
        db.query(Adoption, Intervention, PlanItem)
        .join(Intervention, Adoption.intervention_code == Intervention.code)
        .outerjoin(PlanItem, Adoption.plan_item_id == PlanItem.id)
        .filter(Adoption.factory_id == factory_id)
        .all()
    )

    if not adoptions_query and active_plan:
        plan_items = (
            db.query(PlanItem)
            .filter(PlanItem.plan_id == active_plan.id)
            .order_by(PlanItem.sequence.asc())
            .all()
        )
        for pi in plan_items:
            new_ad = Adoption(
                id=uuid.uuid4(),
                factory_id=factory_id,
                plan_item_id=pi.id,
                intervention_code=pi.intervention_code,
                status="planned",
            )
            db.add(new_ad)
        db.commit()

        adoptions_query = (
            db.query(Adoption, Intervention, PlanItem)
            .join(Intervention, Adoption.intervention_code == Intervention.code)
            .outerjoin(PlanItem, Adoption.plan_item_id == PlanItem.id)
            .filter(Adoption.factory_id == factory_id)
            .all()
        )

    # Format adoption items
    formatted_adoptions: list[AdoptionItemResponse] = []
    completed_codes_by_month: dict[str, list[str]] = {}

    for ad, itv, pi in adoptions_query:
        c_month = ad.completed_on.strftime("%Y-%m") if ad.completed_on else None
        if c_month and ad.status == "done":
            completed_codes_by_month.setdefault(c_month, []).append(itv.code)

        est_capex = float(pi.capex_inr) if pi else 0.0
        est_red_t = float(pi.reduction_kgco2e or 0.0) / 1000.0 if pi else 0.0
        est_sav = float(pi.annual_savings_inr) if pi else 0.0
        seq = int(pi.sequence) if pi else 1

        formatted_adoptions.append(
            AdoptionItemResponse(
                id=str(ad.id),
                factory_id=str(ad.factory_id),
                plan_item_id=str(ad.plan_item_id) if ad.plan_item_id else None,
                intervention_code=ad.intervention_code,
                title_en=itv.title_en,
                title_gu=itv.title_gu,
                title_hi=itv.title_hi,
                category=itv.category,
                pool=itv.pool,
                status=ad.status,
                started_on=ad.started_on,
                completed_on=ad.completed_on,
                actual_capex_inr=float(ad.actual_capex_inr) if ad.actual_capex_inr is not None else None,
                estimated_capex_inr=est_capex,
                estimated_reduction_tco2e=round(est_red_t, 3),
                estimated_annual_savings_inr=est_sav,
                notes=ad.notes,
                sequence=seq,
            )
        )

    formatted_adoptions.sort(key=lambda x: x.sequence)

    # 3. Calculate intensity metrics & progress
    latest_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory_id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )

    base_intensity = float(latest_run.intensity_kgco2e_per_output or 0.0) if latest_run else 0.0
    if base_intensity <= 0:
        base_intensity = 1500.0  # fallback typical Jamnagar brass intensity

    # Plan target reduction %
    target_pct = 20.0
    if active_plan and isinstance(active_plan.inputs, dict):
        target_pct = float(active_plan.inputs.get("target_reduction_pct") or 20.0)

    target_intensity = max(0.0, base_intensity * (1.0 - (target_pct / 100.0)))

    # Compute current intensity from monthly records & completed interventions
    monthly_recs = []
    if latest_run and isinstance(latest_run.summary, dict):
        monthly_recs = latest_run.summary.get("monthly", [])

    prod_alert = False
    prod_change_pct = 0.0

    trend_points: list[dict[str, Any]] = []

    if len(monthly_recs) >= 4:
        recent_window = min(3, len(monthly_recs) // 2)
        prior_recs = monthly_recs[:-recent_window]
        recent_recs = monthly_recs[-recent_window:]

        prior_prod = sum(r.get("output", 0.0) for r in prior_recs) / max(1, len(prior_recs))
        recent_prod = sum(r.get("output", 0.0) for r in recent_recs) / max(1, len(recent_recs))

        if prior_prod > 0:
            prod_change_pct = (recent_prod - prior_prod) / prior_prod
            if abs(prod_change_pct) > 0.20:
                prod_alert = True

        # Build monthly intensity trend points
        for idx, r in enumerate(monthly_recs):
            m = r.get("month", f"M{idx+1}")
            m_kwh = r.get("kwh", 0.0)
            m_out = r.get("output", 1.0)
            m_int = (m_kwh / m_out * 0.716) if m_out > 0 else base_intensity
            is_rec = idx >= (len(monthly_recs) - recent_window)

            trend_points.append({
                "month": m,
                "intensity": round(m_int, 1),
                "is_recent": is_rec,
                "completed_fixes": completed_codes_by_month.get(m, []),
            })

    # Account for completed interventions in current intensity
    completed_reduction_t = sum(
        ad.estimated_reduction_tco2e for ad in formatted_adoptions if ad.status == "done"
    )
    # Intensity decrease from completed fixes
    annual_output = float(factory.annual_output or 1200.0)
    intensity_cut = (completed_reduction_t * 1000.0 / annual_output) if annual_output > 0 else 0.0

    current_intensity = max(target_intensity, base_intensity - intensity_cut)

    # Calculate Progress %
    denom = base_intensity - target_intensity
    if denom > 0:
        raw_progress = (base_intensity - current_intensity) / denom * 100.0
        progress_pct = round(max(0.0, min(100.0, raw_progress)), 1)
    else:
        progress_pct = 0.0

    return FactoryTrackingResponse(
        factory_id=str(factory_id),
        active_plan_id=str(active_plan.id) if active_plan else None,
        baseline_intensity=round(base_intensity, 1),
        current_intensity=round(current_intensity, 1),
        target_intensity=round(target_intensity, 1),
        progress_pct=progress_pct,
        production_change_alert=prod_alert,
        production_change_pct=round(prod_change_pct, 3),
        adoptions=formatted_adoptions,
        trend=trend_points,
    )


@router.patch(
    "/{factory_id}/tracking/adoptions/{adoption_id}",
    response_model=dict[str, Any],
    status_code=status.HTTP_200_OK,
)
def update_adoption_status(
    factory_id: uuid.UUID,
    adoption_id: uuid.UUID,
    req: AdoptionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="editor")),
) -> dict[str, Any]:
    """Update adoption status, actual capex, and dates per PRD §14.3."""
    adoption = (
        db.query(Adoption)
        .filter(Adoption.id == adoption_id, Adoption.factory_id == factory_id)
        .first()
    )
    if not adoption:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "ADOPTION_NOT_FOUND", "message_key": "errors.adoption_not_found"}},
        )

    adoption.status = req.status
    if req.actual_capex_inr is not None:
        adoption.actual_capex_inr = req.actual_capex_inr
    if req.started_on is not None:
        adoption.started_on = req.started_on
    if req.completed_on is not None:
        adoption.completed_on = req.completed_on
    elif req.status == "done" and not adoption.completed_on:
        adoption.completed_on = date.today()
    if req.notes is not None:
        adoption.notes = req.notes

    adoption.updated_at = datetime.utcnow()
    db.commit()

    return {
        "status": "ok",
        "adoption_id": str(adoption.id),
        "adoption_status": adoption.status,
    }


@router.post(
    "/{factory_id}/tracking/init",
    status_code=status.HTTP_200_OK,
)
def init_tracking_from_active_plan(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="editor")),
) -> dict[str, Any]:
    """Synchronize adoptions from the factory's active plan items."""
    active_plan = (
        db.query(Plan)
        .filter(Plan.factory_id == factory_id, Plan.is_selected == True)  # noqa: E712
        .first()
    )
    if not active_plan:
        active_plan = (
            db.query(Plan)
            .filter(Plan.factory_id == factory_id)
            .order_by(Plan.created_at.desc())
            .first()
        )
    if not active_plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "NO_PLAN_FOUND", "message_key": "errors.no_plan_found"}},
        )

    existing_codes = {
        ad.intervention_code
        for ad in db.query(Adoption).filter(Adoption.factory_id == factory_id).all()
    }

    plan_items = db.query(PlanItem).filter(PlanItem.plan_id == active_plan.id).all()
    added_count = 0
    for pi in plan_items:
        if pi.intervention_code not in existing_codes:
            db.add(
                Adoption(
                    id=uuid.uuid4(),
                    factory_id=factory_id,
                    plan_item_id=pi.id,
                    intervention_code=pi.intervention_code,
                    status="planned",
                )
            )
            added_count += 1

    db.commit()
    return {"status": "ok", "added_adoptions": added_count}
