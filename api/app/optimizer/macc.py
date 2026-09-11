"""Marginal Abatement Cost Curve (MACC) generator per PRD §14.1."""

import json
from typing import Any

from app.interventions.effects import PoolState
from app.interventions.matcher import evaluate_standalone_impact
from app.models.models import Intervention
from app.optimizer.combinations import _calc_pool_state_emissions
from app.optimizer.evaluator import _apply_single_intervention, _get_annual_opex, _get_capex


def generate_macc_curve(
    applicable_interventions: list[Intervention],
    baseline_state: PoolState,
    tariff_inr: float,
    emission_factors_map: dict[str, float],
    pool_costs: dict[str, float],
    selected_plan_codes: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Compute sequential MACC curve per PRD §14.1:
    1. For each intervention, pick level with lowest standalone cost per tonne.
    2. For conflicting pairs, keep cheaper per tonne.
    3. Sort by standalone cost per tonne ascending.
    4. Compute marginal reduction and cost sequentially to avoid double counting.
    """
    selected_codes = selected_plan_codes or set()
    candidates: list[dict[str, Any]] = []

    for itv in applicable_interventions:
        params = itv.effect_params or {}
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except Exception:
                params = {}

        # Determine levels to test
        eff = itv.effect_type
        levels: list[Any] = [None]
        if eff == "shift_to_secondary":
            levels = params.get("levels", [0.4, 0.6, 0.8])
            levels = [lvl for lvl in levels if lvl > baseline_state.secondary_brass_share]
            if not levels:
                levels = [None]
        elif eff == "onsite_generation":
            levels = params.get("levels_kwp", [50, 100, 150, 200])

        best_level = None
        best_cpt = float("inf")
        best_impact = None

        for lvl in levels:
            impact = evaluate_standalone_impact(
                intervention=itv,
                pool_state=baseline_state,
                tariff_inr=tariff_inr,
                emission_factors_map=emission_factors_map,
                pool_costs=pool_costs,
                level_override=lvl,
            )
            cpt = impact.get("cost_per_tonne_inr", float("inf"))
            if cpt < best_cpt:
                best_cpt = cpt
                best_level = lvl
                best_impact = impact

        if best_impact and best_impact.get("reduction_kg", 0) > 0:
            candidates.append({
                "itv": itv,
                "level": best_level,
                "code": itv.code,
                "title_en": itv.title_en,
                "standalone_cpt": best_cpt,
                "conflicts": itv.conflicts or [],
                "lifetime_years": float(getattr(itv, "lifetime_years", 10.0) or 10.0),
            })

    # Conflicting pairs: keep the cheaper per tonne
    # Sort by standalone cpt first
    candidates.sort(key=lambda x: x["standalone_cpt"])

    filtered_candidates: list[dict[str, Any]] = []
    excluded_by_conflict: set[str] = set()

    for cand in candidates:
        code = cand["code"]
        if code in excluded_by_conflict:
            continue

        filtered_candidates.append(cand)

        # Mark its conflicts as excluded
        conflicts = cand["conflicts"]
        if isinstance(conflicts, str):
            try:
                conflicts = json.loads(conflicts)
            except Exception:
                conflicts = []
        for conf_code in conflicts:
            excluded_by_conflict.add(conf_code)

    # Compute marginal reduction and cost sequentially in that order
    curr_state = baseline_state.copy()
    macc_bars: list[dict[str, Any]] = []
    cumulative_tco2 = 0.0

    for cand in filtered_candidates:
        itv = cand["itv"]
        level = cand["level"]

        state_before = curr_state.copy()
        emissions_before = _calc_pool_state_emissions(state_before, emission_factors_map)

        capex = _get_capex(itv, level)
        delta_savings, _ = _apply_single_intervention(
            itv=itv,
            level=level,
            state=curr_state,
            tariff_inr=tariff_inr,
            pool_costs=pool_costs,
        )

        emissions_after = _calc_pool_state_emissions(curr_state, emission_factors_map)
        marginal_reduction_kg = max(0.0, emissions_before - emissions_after)
        tco2_cut = marginal_reduction_kg / 1000.0

        if tco2_cut <= 0.001:
            continue

        lifetime = cand["lifetime_years"]
        annual_opex = _get_annual_opex(itv, level)
        marginal_cpt = ((capex / lifetime) + annual_opex - delta_savings) / tco2_cut

        payback = (capex / delta_savings * 12.0) if delta_savings > 0 else None

        cumulative_tco2 += tco2_cut

        macc_bars.append({
            "code": itv.code,
            "title_en": itv.title_en,
            "tco2_cut": round(tco2_cut, 2),
            "cost_per_tonne_inr": round(marginal_cpt, 1),
            "capex_inr": round(capex, 0),
            "annual_savings_inr": round(delta_savings, 0),
            "payback_months": round(payback, 1) if payback else None,
            "cumulative_tco2": round(cumulative_tco2, 2),
            "in_selected_plan": (itv.code in selected_codes),
        })

    return macc_bars
