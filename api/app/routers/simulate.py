"""What-if simulator API router per PRD §14.2 and §22 Phase 7."""

import json
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, require_factory_access
from app.db import get_db
from app.engine.emissions import calculate_emissions_summary
from app.interventions.effects import PoolState, apply_interventions_in_order
from app.interventions.matcher import (
    DEFAULT_PRICES,
    NCV_MAP,
    evaluate_standalone_impact,
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
)
from app.optimizer.combinations import _calc_pool_state_emissions

router = APIRouter(prefix="/factories", tags=["simulate"])


class SimulateRequest(BaseModel):
    """Lever settings per PRD §14.2.

    Keys are intervention codes; values are either:
      - `true` to enable at default (mode) parameters
      - a dict with overrides, e.g. `{"kwp": 100}` or `{"level": 0.6}`
    """

    levers: dict[str, bool | dict[str, Any]] = {}
    active_levers: dict[str, bool | dict[str, Any]] | None = None

    def get_levers(self) -> dict[str, bool | dict[str, Any]]:
        return self.active_levers if self.active_levers is not None else self.levers


class CategoryBreakdown(BaseModel):
    category: str
    before_kgco2e: float
    after_kgco2e: float


class ApplicableLever(BaseModel):
    """Describes an available lever for the what-if UI."""

    code: str
    title_en: str
    category: str
    pool: str
    effect_type: str
    difficulty: int = 1
    # For level-based interventions, what options exist
    levels: list[float] | None = None
    level_unit: str | None = None  # "kwp", "recycled_share"
    # Standalone impact at mode values (for tooltip)
    standalone_reduction_tco2e: float = 0.0
    standalone_capex_inr: float = 0.0
    standalone_payback_months: float | None = None


class SimulateResponse(BaseModel):
    baseline_kgco2e: float
    after_kgco2e: float
    reduction_kgco2e: float
    reduction_pct: float
    baseline_tco2e: float = 0.0
    after_tco2e: float = 0.0
    reduction_tco2e: float = 0.0
    intensity_before: float | None = None
    intensity_after: float | None = None
    total_capex_inr: float
    annual_savings_inr: float
    payback_months: float | None = None
    by_category: list[CategoryBreakdown]
    available_levers: list[ApplicableLever]
    calc_time_ms: float = 0.0


def _build_intervention_dicts(
    levers: dict[str, bool | dict[str, Any]],
    interventions_by_code: dict[str, Intervention],
    baseline_state: PoolState,
) -> list[dict[str, Any]]:
    """Convert lever settings into the format expected by apply_interventions_in_order."""
    itv_dicts: list[dict[str, Any]] = []

    for code, setting in levers.items():
        itv = interventions_by_code.get(code)
        if not itv:
            continue

        params = itv.effect_params or {}
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except Exception:
                params = {}

        itv_dict: dict[str, Any] = {
            "code": code,
            "effect_type": itv.effect_type,
            "pool": itv.pool,
            "effect_params": dict(params),  # copy
        }

        # Handle level overrides from the lever setting
        if isinstance(setting, dict):
            if "kwp" in setting and itv.effect_type == "onsite_generation":
                itv_dict["chosen_kwp"] = float(setting["kwp"])
            elif "level" in setting and itv.effect_type == "shift_to_secondary":
                # Override the levels list to set the chosen target
                itv_dict["effect_params"]["levels"] = [float(setting["level"])]
            elif "level" in setting and itv.effect_type == "shift_to_secondary":
                itv_dict["effect_params"]["delta"] = float(setting.get("delta", 0.0))

        itv_dicts.append(itv_dict)

    return itv_dicts


def _calc_category_emissions(
    state: PoolState,
    factors: dict[str, float],
) -> dict[str, float]:
    """Break down emissions by category from pool state."""
    cats: dict[str, float] = {}

    grid_f = factors.get("grid_electricity", 0.71)
    cats["electricity"] = state.grid_kwh * grid_f

    fuel_total = 0.0
    if state.melting_fuel_gj > 0:
        fo_factor = factors.get("furnace_oil", 3.1)
        fuel_total += state.melting_fuel_gj * (fo_factor / NCV_MAP.get("furnace_oil", 0.04))
    if state.dg_diesel_l > 0:
        fuel_total += state.dg_diesel_l * factors.get("diesel", 2.68)
    cats["fuel"] = fuel_total

    mat_total = 0.0
    if state.brass_input_kg > 0:
        prim_f = factors.get("brass_input_primary", 4.2)
        sec_f = factors.get("brass_input_secondary", 0.65)
        prim_kg = state.brass_input_kg * (1.0 - state.secondary_brass_share)
        sec_kg = state.brass_input_kg * state.secondary_brass_share
        mat_total += (prim_kg * prim_f) + (sec_kg * sec_f)
    if state.cutting_oil_kg > 0:
        mat_total += state.cutting_oil_kg * factors.get("cutting_oil", 2.8)
    cats["material"] = mat_total

    cats["transport"] = state.freight_tkm * factors.get("road_freight_hgv", 0.12) if state.freight_tkm > 0 else 0.0

    waste_total = 0.0
    if state.hazardous_waste_kg > 0:
        waste_total += state.hazardous_waste_kg * factors.get("waste_hazardous_incineration", 2.1)
    if state.packaging_kg > 0:
        waste_total += state.packaging_kg * factors.get("packaging_corrugated", 1.2)
    cats["waste"] = waste_total

    return cats


def _compute_capex_and_savings(
    levers: dict[str, bool | dict[str, Any]],
    interventions_by_code: dict[str, Intervention],
    baseline_state: PoolState,
    after_state: PoolState,
    tariff_inr: float,
    pool_costs: dict[str, float],
    factors_map: dict[str, float],
) -> tuple[float, float]:
    """Compute total capex and annual savings for the selected levers."""
    total_capex = 0.0
    total_savings = 0.0

    for code, setting in levers.items():
        itv = interventions_by_code.get(code)
        if not itv:
            continue

        # Determine level override
        level_override = None
        if isinstance(setting, dict):
            if "kwp" in setting:
                level_override = float(setting["kwp"])
            elif "level" in setting:
                level_override = float(setting["level"])

        # Capex from model
        capex_m = itv.capex_model or {}
        if isinstance(capex_m, str):
            try:
                capex_m = json.loads(capex_m)
            except Exception:
                capex_m = {}

        c_type = capex_m.get("type", "fixed")
        if c_type == "fixed":
            capex = float(capex_m.get("mode", 0.0))
        elif c_type == "per_kwp":
            kwp = level_override if level_override is not None else 50.0
            capex = float(capex_m.get("mode", 45000.0)) * kwp
        else:
            capex = float(capex_m.get("mode", 0.0))

        total_capex += capex

    # For savings, use the actual emission reduction * tariff approach for accuracy
    # We rely on per-pool savings calculation based on before/after state

    # Electricity savings (biggest driver)
    kwh_saved = max(0.0, baseline_state.grid_kwh - after_state.grid_kwh)
    elec_savings = kwh_saved * tariff_inr

    # Fuel savings
    fuel_saved_gj = max(0.0, baseline_state.melting_fuel_gj - after_state.melting_fuel_gj)
    fuel_price_per_gj = DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"]
    fuel_savings = fuel_saved_gj * fuel_price_per_gj

    diesel_saved = max(0.0, baseline_state.dg_diesel_l - after_state.dg_diesel_l)
    diesel_savings = diesel_saved * DEFAULT_PRICES["diesel"]

    # Material savings (if shifted to secondary, price diff)
    mat_savings = 0.0
    for code, setting in levers.items():
        itv = interventions_by_code.get(code)
        if not itv or itv.effect_type != "shift_to_secondary":
            continue
        params = itv.effect_params or {}
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except Exception:
                params = {}
        price_diff = float(params.get("price_diff_inr_per_kg", 0.0))
        scrap_gain = float(params.get("scrap_value_gain_inr_per_kg", 0.0))
        delta_share = max(0.0, after_state.secondary_brass_share - baseline_state.secondary_brass_share)
        shifted_kg = delta_share * baseline_state.brass_input_kg
        mat_savings += (shifted_kg * price_diff) + (shifted_kg * scrap_gain * 0.95)

    # Pool-based savings for cost_share types
    pool_savings = 0.0
    for code, setting in levers.items():
        itv = interventions_by_code.get(code)
        if not itv or itv.effect_type != "reduce_fraction":
            continue
        savings_m = itv.savings_model or {}
        if isinstance(savings_m, str):
            try:
                savings_m = json.loads(savings_m)
            except Exception:
                savings_m = {}
        if savings_m.get("type") == "cost_share":
            params = itv.effect_params or {}
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except Exception:
                    params = {}
            share = float(params.get("share_of_pool", 1.0))
            red = float(params.get("reduction", 0.0))
            pool_c = pool_costs.get(itv.pool, 0.0)
            pool_savings += pool_c * share * red

    total_savings = elec_savings + fuel_savings + diesel_savings + mat_savings + pool_savings

    return total_capex, total_savings


@router.post(
    "/{factory_id}/simulate",
    response_model=SimulateResponse,
    status_code=status.HTTP_200_OK,
)
def simulate(
    factory_id: uuid.UUID,
    req: SimulateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="viewer")),
) -> SimulateResponse:
    """What-if simulator per PRD §14.2: evaluate lever selections using the same
    effect functions as the optimizer, returning before/after totals."""
    start_time = time.perf_counter()
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    # 1. Load records and baseline
    records = (
        db.query(ActivityRecord)
        .filter(ActivityRecord.factory_id == factory_id)
        .all()
    )
    factors = db.query(EmissionFactor).all()
    factors_map = {f.activity_type: float(f.kgco2e_per_unit) for f in factors}
    activity_types = db.query(ActivityType).all()

    baseline_state, pool_costs = extract_baseline_pools(records)
    tariff_inr = float(factory.electricity_tariff_inr_per_kwh or 7.8)

    # Calc run for baseline total
    calc_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory_id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )

    if not calc_run and records:
        summary, _results = calculate_emissions_summary(
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

    baseline_kgco2e = _calc_pool_state_emissions(baseline_state, factors_map)
    baseline_summary = calc_run.summary if calc_run else {"total_kgco2e": baseline_kgco2e}

    # 2. Get applicable interventions
    all_interventions = db.query(Intervention).all()
    active_activities = {r.activity_type for r in records}
    interventions_by_code: dict[str, Intervention] = {itv.code: itv for itv in all_interventions}

    applicable_itvs = [
        itv
        for itv in all_interventions
        if is_applicable(itv, baseline_state, baseline_summary, factory, active_activities)
    ]
    applicable_codes = {itv.code for itv in applicable_itvs}

    # 3. Build available levers list
    available_levers: list[ApplicableLever] = []
    for itv in applicable_itvs:
        params = itv.effect_params or {}
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except Exception:
                params = {}

        levels = None
        level_unit = None
        if itv.effect_type == "onsite_generation":
            raw_levels = params.get("levels_kwp", [50])
            levels = [float(lvl) for lvl in raw_levels]
            level_unit = "kwp"
        elif itv.effect_type == "shift_to_secondary":
            raw_levels = params.get("levels")
            if raw_levels:
                levels = [float(lvl) for lvl in raw_levels if float(lvl) > baseline_state.secondary_brass_share]
            level_unit = "recycled_share"

        # Standalone impact for tooltip
        impact = evaluate_standalone_impact(
            intervention=itv,
            pool_state=baseline_state,
            tariff_inr=tariff_inr,
            emission_factors_map=factors_map,
            pool_costs=pool_costs,
        )

        available_levers.append(ApplicableLever(
            code=itv.code,
            title_en=itv.title_en,
            category=itv.category,
            pool=itv.pool,
            effect_type=itv.effect_type,
            difficulty=int(itv.difficulty or 1),
            levels=levels,
            level_unit=level_unit,
            standalone_reduction_tco2e=impact["reduction_tco2e"],
            standalone_capex_inr=impact["capex_inr"],
            standalone_payback_months=impact["payback_months"],
        ))

    # 4. Filter levers to only applicable interventions
    input_levers = req.get_levers()
    valid_levers = {
        code: setting
        for code, setting in input_levers.items()
        if code in applicable_codes and setting  # exclude False/null
    }

    # 5. Apply interventions
    if valid_levers:
        itv_dicts = _build_intervention_dicts(valid_levers, interventions_by_code, baseline_state)
        after_state, _results = apply_interventions_in_order(baseline_state, itv_dicts)
    else:
        after_state = baseline_state.copy()

    # 6. Calculate after emissions
    after_kgco2e = _calc_pool_state_emissions(after_state, factors_map)
    reduction_kgco2e = max(0.0, baseline_kgco2e - after_kgco2e)
    reduction_pct = (reduction_kgco2e / baseline_kgco2e * 100.0) if baseline_kgco2e > 0 else 0.0

    # 7. Category breakdown
    cats_before = _calc_category_emissions(baseline_state, factors_map)
    cats_after = _calc_category_emissions(after_state, factors_map)
    by_category = [
        CategoryBreakdown(
            category=cat,
            before_kgco2e=round(cats_before.get(cat, 0.0), 2),
            after_kgco2e=round(cats_after.get(cat, 0.0), 2),
        )
        for cat in ["electricity", "fuel", "material", "transport", "waste"]
    ]

    # 8. Intensity
    output_qty = float(factory.annual_output or 0)
    intensity_before = (baseline_kgco2e / output_qty) if output_qty > 0 else None
    intensity_after = (after_kgco2e / output_qty) if output_qty > 0 else None

    # 9. Capex & savings
    total_capex, annual_savings = _compute_capex_and_savings(
        valid_levers, interventions_by_code, baseline_state, after_state,
        tariff_inr, pool_costs, factors_map,
    )
    payback_months = round((total_capex / annual_savings) * 12.0, 1) if annual_savings > 0 else None
    calc_time_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    return SimulateResponse(
        baseline_kgco2e=round(baseline_kgco2e, 2),
        after_kgco2e=round(after_kgco2e, 2),
        reduction_kgco2e=round(reduction_kgco2e, 2),
        reduction_pct=round(reduction_pct, 1),
        baseline_tco2e=round(baseline_kgco2e / 1000.0, 2),
        after_tco2e=round(after_kgco2e / 1000.0, 2),
        reduction_tco2e=round(reduction_kgco2e / 1000.0, 2),
        intensity_before=round(intensity_before, 2) if intensity_before else None,
        intensity_after=round(intensity_after, 2) if intensity_after else None,
        total_capex_inr=round(total_capex, 2),
        annual_savings_inr=round(annual_savings, 2),
        payback_months=payback_months,
        by_category=by_category,
        available_levers=available_levers,
        calc_time_ms=calc_time_ms,
    )
