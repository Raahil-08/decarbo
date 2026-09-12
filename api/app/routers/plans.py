"""Plans and Optimizer API router per PRD §13, §14.1, and §22."""

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, require_factory_access
from app.db import get_db
from app.engine.emissions import calculate_emissions_summary
from app.interventions.effects import apply_interventions_in_order
from app.interventions.matcher import (
    extract_baseline_pools,
    is_applicable,
)
from app.models.models import (
    ActivityRecord,
    ActivityType,
    CalcRun,
    EmissionFactor,
    Factory,
    Intervention,
    Plan,
    PlanItem,
)
from app.optimizer.combinations import _calc_pool_state_emissions, generate_pool_combinations
from app.optimizer.evaluator import re_evaluate_with_tightening
from app.optimizer.macc import generate_macc_curve
from app.optimizer.solver import OptimizerSolver

router = APIRouter(prefix="/factories", tags=["plans"])


class GeneratePlansRequest(BaseModel):
    budget_inr: float
    target_reduction_pct: float | None = None
    horizon_months: int = 24
    max_payback_months: float | None = None
    max_difficulty: int | None = None
    weights: dict[str, float] | None = None
    excluded_codes: list[str] = []
    forced_codes: list[str] = []


class PlanItemResponse(BaseModel):
    id: str | None = None
    sequence: int
    intervention_code: str
    title_en: str
    category: str
    pool: str
    difficulty: int = 1
    circularity_points: int = 0
    level: dict[str, Any] | None = None
    capex_inr: float
    annual_savings_inr: float
    reduction_kgco2e: float
    reduction_tco2e: float
    payback_months: float | None = None
    cost_per_tonne_inr: float | None = None
    added_grid_kwh: float = 0.0


class PlanResponse(BaseModel):
    id: str
    mode: str
    label: str
    feasible: bool
    message: str | None = None
    duplicate_of: str | None = None
    is_selected: bool = False
    totals: dict[str, Any]
    ledger: list[PlanItemResponse]


class MaccItemResponse(BaseModel):
    code: str
    title_en: str
    tco2_cut: float
    cost_per_tonne_inr: float
    capex_inr: float
    annual_savings_inr: float
    payback_months: float | None = None
    cumulative_tco2: float
    in_selected_plan: bool = False


class GeneratePlansResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    plans: list[PlanResponse]
    macc: list[MaccItemResponse]


@router.post(
    "/{factory_id}/plans",
    response_model=GeneratePlansResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_plans(
    factory_id: uuid.UUID,
    req: GeneratePlansRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="editor")),
) -> GeneratePlansResponse:
    """Generate three plans (Best value, Lowest investment, Biggest cut) and MACC curve."""
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    # 1. Fetch latest CalcRun and records
    calc_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory_id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )
    records = (
        db.query(ActivityRecord)
        .filter(ActivityRecord.factory_id == factory_id)
        .all()
    )

    factors = db.query(EmissionFactor).all()
    activity_types = db.query(ActivityType).all()

    if not calc_run and records:
        summary, results = calculate_emissions_summary(
            records=records,
            factors=factors,
            activity_types=activity_types,
            factory_region=factory.grid_region or "IN-GJ",
            output_unit=factory.output_unit or "t",
        )
        calc_run = CalcRun(
            id=uuid.uuid4(),
            factory_id=factory.id,
            period_start=min(r.period_month for r in records),
            period_end=max(r.period_month for r in records),
            total_kgco2e=summary["total_kgco2e"],
            intensity_kgco2e_per_output=summary["intensity_kgco2e_per_output"],
            summary=summary,
        )
        db.add(calc_run)
        db.commit()
        db.refresh(calc_run)

    baseline_total_kg = float(calc_run.total_kgco2e) if calc_run else 100000.0
    baseline_summary = calc_run.summary if calc_run else {"total_kgco2e": baseline_total_kg}

    # 2. Extract baseline pools and tariffs
    baseline_state, pool_costs = extract_baseline_pools(records)
    tariff_inr = float(factory.electricity_tariff_inr_per_kwh or 7.8)

    # Factors map
    factors_map = {f.activity_type: float(f.kgco2e_per_unit) for f in factors}

    # Active activities
    active_activities = {r.activity_type for r in records}

    # 3. Applicable interventions
    all_interventions = db.query(Intervention).all()
    applicable_itvs = [
        itv
        for itv in all_interventions
        if is_applicable(itv, baseline_state, baseline_summary, factory, active_activities)
    ]

    # Group applicable interventions by pool
    pool_to_itvs: dict[str, list[Intervention]] = {}
    for itv in applicable_itvs:
        pool_to_itvs.setdefault(itv.pool, []).append(itv)

    # 4. Generate per-pool non-dominated combinations
    roof_area = float(getattr(factory, "roof_area_m2", None) or 2500.0)
    max_solar_kwp = roof_area / 10.0  # ~10 m2 per kWp

    pool_combinations: dict[str, Any] = {}
    for pool_name, itvs in pool_to_itvs.items():
        combos = generate_pool_combinations(
            pool_name=pool_name,
            applicable_interventions=itvs,
            baseline_state=baseline_state,
            tariff_inr=tariff_inr,
            emission_factors_map=factors_map,
            pool_costs=pool_costs,
            max_kwp=max_solar_kwp,
        )
        pool_combinations[pool_name] = combos

    # Cross-pool conflicts and requires
    cross_conflicts: list[tuple[str, str]] = []
    cross_requires: list[tuple[str, str]] = []
    for itv in applicable_itvs:
        confs = itv.conflicts or []
        if isinstance(confs, str):
            try:
                confs = json.loads(confs)
            except Exception:
                confs = []
        for c in confs:
            if (c, itv.code) not in cross_conflicts:
                cross_conflicts.append((itv.code, c))

        reqs = itv.requires or []
        if isinstance(reqs, str):
            try:
                reqs = json.loads(reqs)
            except Exception:
                reqs = []
        for r in reqs:
            cross_requires.append((itv.code, r))

    # 5. Initialize MILP solver
    solver = OptimizerSolver(
        pool_combinations=pool_combinations,
        cross_conflicts=cross_conflicts,
        cross_requires=cross_requires,
    )

    # 6. Generate 3 plans per PRD §13.2
    # Plan A: best_value
    plan_a_raw = re_evaluate_with_tightening(
        solver=solver,
        mode="best_value",
        budget_inr=req.budget_inr,
        baseline_total_kg=baseline_total_kg,
        baseline_state=baseline_state,
        tariff_inr=tariff_inr,
        emission_factors_map=factors_map,
        pool_costs=pool_costs,
        target_reduction_pct=req.target_reduction_pct,
        max_payback_months=req.max_payback_months,
        max_difficulty=req.max_difficulty,
        weights=req.weights,
        excluded_codes=req.excluded_codes,
        forced_codes=req.forced_codes,
    )

    # Plan B: min_capex_for_target (only if target is specified)
    plan_b_raw = None
    if req.target_reduction_pct and req.target_reduction_pct > 0:
        plan_b_raw = re_evaluate_with_tightening(
            solver=solver,
            mode="min_capex_for_target",
            budget_inr=req.budget_inr,
            baseline_total_kg=baseline_total_kg,
            baseline_state=baseline_state,
            tariff_inr=tariff_inr,
            emission_factors_map=factors_map,
            pool_costs=pool_costs,
            target_reduction_pct=req.target_reduction_pct,
            max_payback_months=req.max_payback_months,
            max_difficulty=req.max_difficulty,
            weights=req.weights,
            excluded_codes=req.excluded_codes,
            forced_codes=req.forced_codes,
        )

    # Plan C: max_reduction_in_budget
    plan_c_raw = re_evaluate_with_tightening(
        solver=solver,
        mode="max_reduction_in_budget",
        budget_inr=req.budget_inr,
        baseline_total_kg=baseline_total_kg,
        baseline_state=baseline_state,
        tariff_inr=tariff_inr,
        emission_factors_map=factors_map,
        pool_costs=pool_costs,
        target_reduction_pct=None,
        max_payback_months=req.max_payback_months,
        max_difficulty=req.max_difficulty,
        weights=req.weights,
        excluded_codes=req.excluded_codes,
        forced_codes=req.forced_codes,
    )

    # Deduplication check
    def plan_signature(ledger: list[dict[str, Any]]) -> str:
        codes = sorted([f"{item['intervention_code']}:{item.get('level')}" for item in ledger])
        return "|".join(codes)

    sig_a = plan_signature(plan_a_raw["ledger"])
    sig_b = plan_signature(plan_b_raw["ledger"]) if plan_b_raw else None
    sig_c = plan_signature(plan_c_raw["ledger"])

    plan_responses: list[PlanResponse] = []

    # Store Plan A
    plan_a_db = Plan(
        id=uuid.uuid4(),
        factory_id=factory.id,
        calc_run_id=calc_run.id,
        mode="best_value",
        inputs=req.model_dump(),
        totals=plan_a_raw["totals"],
        feasible=plan_a_raw["feasible"],
        message=plan_a_raw["message"],
        is_selected=True,
    )
    db.add(plan_a_db)
    db.flush()

    for item in plan_a_raw["ledger"]:
        db.add(PlanItem(
            id=uuid.uuid4(),
            plan_id=plan_a_db.id,
            intervention_code=item["intervention_code"],
            sequence=item["sequence"],
            level=item["level"],
            capex_inr=item["capex_inr"],
            annual_savings_inr=item["annual_savings_inr"],
            reduction_kgco2e=item["reduction_kgco2e"],
            payback_months=item["payback_months"],
            cost_per_tonne_inr=item["cost_per_tonne_inr"],
        ))

    plan_responses.append(PlanResponse(
        id=str(plan_a_db.id),
        mode="best_value",
        label="Best value",
        feasible=plan_a_raw["feasible"],
        message=plan_a_raw["message"],
        duplicate_of=None,
        is_selected=True,
        totals=plan_a_raw["totals"],
        ledger=[PlanItemResponse(**item) for item in plan_a_raw["ledger"]],
    ))

    # Store Plan B (if target was given)
    if plan_b_raw:
        dup_of_b = "best_value" if (sig_b == sig_a and plan_b_raw["feasible"]) else None
        msg_b = plan_b_raw["message"]
        if dup_of_b:
            msg_b = "Best value and Lowest investment are the same plan"

        plan_b_db = Plan(
            id=uuid.uuid4(),
            factory_id=factory.id,
            calc_run_id=calc_run.id,
            mode="min_capex_for_target",
            inputs=req.model_dump(),
            totals=plan_b_raw["totals"],
            feasible=plan_b_raw["feasible"],
            message=msg_b,
            is_selected=False,
        )
        db.add(plan_b_db)
        db.flush()

        for item in plan_b_raw["ledger"]:
            db.add(PlanItem(
                id=uuid.uuid4(),
                plan_id=plan_b_db.id,
                intervention_code=item["intervention_code"],
                sequence=item["sequence"],
                level=item["level"],
                capex_inr=item["capex_inr"],
                annual_savings_inr=item["annual_savings_inr"],
                reduction_kgco2e=item["reduction_kgco2e"],
                payback_months=item["payback_months"],
                cost_per_tonne_inr=item["cost_per_tonne_inr"],
            ))

        plan_responses.append(PlanResponse(
            id=str(plan_b_db.id),
            mode="min_capex_for_target",
            label="Lowest investment",
            feasible=plan_b_raw["feasible"],
            message=msg_b,
            duplicate_of=dup_of_b,
            is_selected=False,
            totals=plan_b_raw["totals"],
            ledger=[PlanItemResponse(**item) for item in plan_b_raw["ledger"]],
        ))

    # Store Plan C
    dup_of_c = None
    if sig_c == sig_a and plan_c_raw["feasible"]:
        dup_of_c = "best_value"
    elif sig_b and sig_c == sig_b and plan_c_raw["feasible"]:
        dup_of_c = "min_capex_for_target"

    msg_c = plan_c_raw["message"]
    if dup_of_c == "best_value":
        msg_c = "Best value and Biggest cut are the same plan"
    elif dup_of_c == "min_capex_for_target":
        msg_c = "Lowest investment and Biggest cut are the same plan"

    plan_c_db = Plan(
        id=uuid.uuid4(),
        factory_id=factory.id,
        calc_run_id=calc_run.id,
        mode="max_reduction_in_budget",
        inputs=req.model_dump(),
        totals=plan_c_raw["totals"],
        feasible=plan_c_raw["feasible"],
        message=msg_c,
        is_selected=False,
    )
    db.add(plan_c_db)
    db.flush()

    for item in plan_c_raw["ledger"]:
        db.add(PlanItem(
            id=uuid.uuid4(),
            plan_id=plan_c_db.id,
            intervention_code=item["intervention_code"],
            sequence=item["sequence"],
            level=item["level"],
            capex_inr=item["capex_inr"],
            annual_savings_inr=item["annual_savings_inr"],
            reduction_kgco2e=item["reduction_kgco2e"],
            payback_months=item["payback_months"],
            cost_per_tonne_inr=item["cost_per_tonne_inr"],
        ))

    plan_responses.append(PlanResponse(
        id=str(plan_c_db.id),
        mode="max_reduction_in_budget",
        label="Biggest cut",
        feasible=plan_c_raw["feasible"],
        message=msg_c,
        duplicate_of=dup_of_c,
        is_selected=False,
        totals=plan_c_raw["totals"],
        ledger=[PlanItemResponse(**item) for item in plan_c_raw["ledger"]],
    ))

    db.commit()

    # 7. Generate MACC curve highlighting selected plan (Plan A)
    selected_codes = {item["intervention_code"] for item in plan_a_raw["ledger"]}
    macc_bars = generate_macc_curve(
        applicable_interventions=applicable_itvs,
        baseline_state=baseline_state,
        tariff_inr=tariff_inr,
        emission_factors_map=factors_map,
        pool_costs=pool_costs,
        selected_plan_codes=selected_codes,
    )

    return GeneratePlansResponse(
        plans=plan_responses,
        macc=[MaccItemResponse(**b) for b in macc_bars],
    )


@router.get(
    "/{factory_id}/plans",
    response_model=list[dict[str, Any]],
    status_code=status.HTTP_200_OK,
)
def list_plans(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="viewer")),
) -> list[dict[str, Any]]:
    """List plans for a factory."""
    plans = (
        db.query(Plan)
        .filter(Plan.factory_id == factory_id)
        .order_by(Plan.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(p.id),
            "mode": p.mode,
            "totals": p.totals,
            "feasible": p.feasible,
            "message": p.message,
            "is_selected": p.is_selected,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in plans
    ]


@router.get(
    "/{factory_id}/plans/{plan_id}",
    response_model=PlanResponse,
    status_code=status.HTTP_200_OK,
)
def get_plan(
    factory_id: uuid.UUID,
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="viewer")),
) -> PlanResponse:
    """Retrieve full plan with its itemised implementation ledger."""
    plan = (
        db.query(Plan)
        .filter(Plan.id == plan_id, Plan.factory_id == factory_id)
        .first()
    )
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PLAN_NOT_FOUND", "message_key": "errors.plan_not_found"}},
        )

    items = (
        db.query(PlanItem, Intervention)
        .join(Intervention, PlanItem.intervention_code == Intervention.code)
        .filter(PlanItem.plan_id == plan.id)
        .order_by(PlanItem.sequence.asc())
        .all()
    )

    ledger = []
    for pi, itv in items:
        tco2 = float(pi.reduction_kgco2e) / 1000.0
        ledger.append(PlanItemResponse(
            id=str(pi.id),
            sequence=int(pi.sequence),
            intervention_code=pi.intervention_code,
            title_en=itv.title_en,
            category=itv.category,
            pool=itv.pool,
            difficulty=int(itv.difficulty or 1),
            circularity_points=int(itv.circularity_points or 0),
            level=pi.level,
            capex_inr=float(pi.capex_inr),
            annual_savings_inr=float(pi.annual_savings_inr),
            reduction_kgco2e=float(pi.reduction_kgco2e),
            reduction_tco2e=round(tco2, 3),
            payback_months=float(pi.payback_months) if pi.payback_months is not None else None,
            cost_per_tonne_inr=float(pi.cost_per_tonne_inr) if pi.cost_per_tonne_inr is not None else None,
        ))

    mode_label_map = {
        "best_value": "Best value",
        "min_capex_for_target": "Lowest investment",
        "max_reduction_in_budget": "Biggest cut",
    }

    return PlanResponse(
        id=str(plan.id),
        mode=plan.mode,
        label=mode_label_map.get(plan.mode, plan.mode),
        feasible=plan.feasible,
        message=plan.message,
        is_selected=plan.is_selected,
        totals=plan.totals,
        ledger=ledger,
    )


@router.patch(
    "/{factory_id}/plans/{plan_id}/select",
    status_code=status.HTTP_200_OK,
)
def select_plan(
    factory_id: uuid.UUID,
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="editor")),
) -> dict[str, Any]:
    """Mark a plan as selected and unselect others."""
    plan = (
        db.query(Plan)
        .filter(Plan.id == plan_id, Plan.factory_id == factory_id)
        .first()
    )
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PLAN_NOT_FOUND", "message_key": "errors.plan_not_found"}},
        )

    # Unselect all other plans for this factory
    db.query(Plan).filter(Plan.factory_id == factory_id).update({"is_selected": False})
    plan.is_selected = True
    db.commit()

    return {"status": "success", "selected_plan_id": str(plan.id)}


# ---------------------------------------------------------------------------
# Applicable Interventions (What-if levers)
# ---------------------------------------------------------------------------

@router.get(
    "/{factory_id}/interventions/applicable",
    status_code=status.HTTP_200_OK,
)
def get_applicable_interventions(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="viewer")),
) -> list[dict[str, Any]]:
    """Return applicable interventions with effect metadata for What-if UI levers."""
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    records = (
        db.query(ActivityRecord)
        .filter(ActivityRecord.factory_id == factory_id)
        .all()
    )
    factors = db.query(EmissionFactor).all()
    factors_map = {f.activity_type: float(f.kgco2e_per_unit) for f in factors}
    baseline_state, pool_costs = extract_baseline_pools(records)

    calc_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory_id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )
    baseline_summary = calc_run.summary if calc_run else {"total_kgco2e": 100000.0}
    active_activities = {r.activity_type for r in records}

    all_interventions = db.query(Intervention).all()
    applicable_itvs = [
        itv
        for itv in all_interventions
        if is_applicable(itv, baseline_state, baseline_summary, factory, active_activities)
    ]

    baseline_total = _calc_pool_state_emissions(baseline_state, factors_map)

    result = []
    for itv in applicable_itvs:
        effect_params = itv.effect_params
        if isinstance(effect_params, str):
            try:
                effect_params = json.loads(effect_params)
            except Exception:
                effect_params = {}

        # Calculate standalone reduction
        itv_dict = {
            "code": itv.code,
            "effect_type": itv.effect_type,
            "pool": itv.pool,
            "effect_params": dict(effect_params) if effect_params else {},
        }
        after_st, _ = apply_interventions_in_order(baseline_state, [itv_dict])
        standalone_reduction = max(0.0, baseline_total - _calc_pool_state_emissions(after_st, factors_map))

        capex_levels = getattr(itv, "capex_inr_levels", None)
        if isinstance(capex_levels, str):
            try:
                capex_levels = json.loads(capex_levels)
            except Exception:
                capex_levels = None

        result.append({
            "code": itv.code,
            "title_en": itv.title_en,
            "category": itv.category,
            "pool": itv.pool,
            "effect_type": itv.effect_type,
            "difficulty": int(getattr(itv, "difficulty", 1) or 1),
            "capex_inr": float(getattr(itv, "capex_inr", 0) or 0),
            "capex_inr_levels": capex_levels,
            "effect_params": effect_params,
            "standalone_reduction_kgco2e": round(standalone_reduction, 2),
            "standalone_reduction_tco2e": round(standalone_reduction / 1000, 3),
            "circularity_points": int(getattr(itv, "circularity_points", 0) or 0),
        })

    return result


# ---------------------------------------------------------------------------
# Marginal Abatement Cost Curve (MACC) Endpoint
# ---------------------------------------------------------------------------

@router.get(
    "/{factory_id}/macc",
    response_model=list[MaccItemResponse],
    status_code=status.HTTP_200_OK,
)
def get_macc(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="viewer")),
) -> list[MaccItemResponse]:
    """Return Marginal Abatement Cost Curve (MACC) bars for the factory."""
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    records = (
        db.query(ActivityRecord)
        .filter(ActivityRecord.factory_id == factory_id)
        .all()
    )
    factors = db.query(EmissionFactor).all()
    factors_map = {f.activity_type: float(f.kgco2e_per_unit) for f in factors}
    baseline_state, pool_costs = extract_baseline_pools(records)
    tariff_inr = float(factory.electricity_tariff_inr_per_kwh or 7.8)

    calc_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory_id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )
    baseline_summary = calc_run.summary if calc_run else {"total_kgco2e": 100000.0}
    active_activities = {r.activity_type for r in records}

    all_interventions = db.query(Intervention).all()
    applicable_itvs = [
        itv
        for itv in all_interventions
        if is_applicable(itv, baseline_state, baseline_summary, factory, active_activities)
    ]

    # Find currently selected plan codes, if any
    selected_plan = (
        db.query(Plan)
        .filter(Plan.factory_id == factory_id, Plan.is_selected.is_(True))
        .first()
    )
    selected_codes = set()
    if selected_plan:
        selected_items = (
            db.query(PlanItem)
            .filter(PlanItem.plan_id == selected_plan.id)
            .all()
        )
        selected_codes = {item.intervention_code for item in selected_items}

    macc_bars = generate_macc_curve(
        applicable_interventions=applicable_itvs,
        baseline_state=baseline_state,
        tariff_inr=tariff_inr,
        emission_factors_map=factors_map,
        pool_costs=pool_costs,
        selected_plan_codes=selected_codes,
    )

    return [MaccItemResponse(**b) for b in macc_bars]
