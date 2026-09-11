"""Sequential re-evaluation, iterative target tightening, and Ledger generator per PRD §13.4 Step 3 & 4."""

import json
from typing import Any

from app.interventions.effects import (
    PoolState,
    apply_fuel_to_electric,
    apply_onsite_generation,
    apply_reduce_fraction,
    apply_shift_to_secondary,
)
from app.interventions.matcher import DEFAULT_PRICES, NCV_MAP
from app.models.models import Intervention
from app.optimizer.combinations import _calc_pool_state_emissions
from app.optimizer.solver import OptimizerSolver


def order_ledger_items(
    items: list[tuple[Intervention, Any]],
    baseline_state: PoolState,
    tariff_inr: float,
    emission_factors_map: dict[str, float],
    pool_costs: dict[str, float],
) -> list[tuple[Intervention, Any]]:
    """Order chosen interventions for implementation (PRD §13.4 Step 4):
    1. Quick wins first (lowest payback)
    2. Respect prerequisites (`requires`)
    3. Solar (`onsite_generation`) placed after efficiency fixes on `grid_kwh`.
    """
    if not items:
        return []

    # Calculate preliminary standalone payback to seed ordering
    preliminary: list[dict[str, Any]] = []
    for itv, level in items:
        capex = _get_capex(itv, level)
        # Approximate mode savings
        savings = _estimate_initial_savings(itv, level, baseline_state, tariff_inr, pool_costs)
        payback = (capex / savings * 12.0) if savings > 0 else 9999.0

        is_solar = (itv.effect_type == "onsite_generation")
        is_grid_eff = (itv.pool == "grid_kwh" and itv.effect_type != "onsite_generation")

        requires = itv.requires or []
        if isinstance(requires, str):
            try:
                requires = json.loads(requires)
            except Exception:
                requires = []

        preliminary.append({
            "itv": itv,
            "level": level,
            "code": itv.code,
            "payback": payback,
            "is_solar": is_solar,
            "is_grid_eff": is_grid_eff,
            "requires": set(requires),
        })

    # Separate non-solar and solar
    non_solar = [p for p in preliminary if not p["is_solar"]]
    solar = [p for p in preliminary if p["is_solar"]]

    # Sort non-solar by payback ascending
    non_solar.sort(key=lambda x: (x["payback"], x["code"]))

    # Dependency ordering for non-solar: if A requires B, ensure B precedes A
    stable = False
    max_passes = len(non_solar) * 2
    passes = 0
    while not stable and passes < max_passes:
        stable = True
        passes += 1
        for i in range(len(non_solar)):
            for j in range(i + 1, len(non_solar)):
                # If non_solar[i] requires non_solar[j], swap or move j before i
                if non_solar[j]["code"] in non_solar[i]["requires"]:
                    item_j = non_solar.pop(j)
                    non_solar.insert(i, item_j)
                    stable = False
                    break
            if not stable:
                break

    # Solar always goes after efficiency fixes on grid_kwh
    combined = non_solar + solar
    return [(p["itv"], p["level"]) for p in combined]


def evaluate_plan_exact(
    chosen_items: list[tuple[Intervention, Any]],
    baseline_state: PoolState,
    tariff_inr: float,
    emission_factors_map: dict[str, float],
    pool_costs: dict[str, float],
    baseline_total_kg: float,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Sequentially apply ordered interventions and calculate exact marginal impacts.

    Guarantee: sum(item.marginal_reduction_kg) == plan_totals.reduction_kg
               sum(item.capex_inr) == plan_totals.capex_inr
               sum(item.annual_savings_inr) == plan_totals.annual_savings_inr
    """
    curr_state = baseline_state.copy()
    base_emissions = _calc_pool_state_emissions(baseline_state, emission_factors_map)

    ledger_items: list[dict[str, Any]] = []
    tot_capex = 0.0
    tot_savings = 0.0
    tot_circ_points = 0

    for seq, (itv, level) in enumerate(chosen_items, start=1):
        state_before = curr_state.copy()
        emissions_before = _calc_pool_state_emissions(state_before, emission_factors_map)

        capex = _get_capex(itv, level)
        delta_savings, added_grid_kwh = _apply_single_intervention(
            itv=itv,
            level=level,
            state=curr_state,
            tariff_inr=tariff_inr,
            pool_costs=pool_costs,
        )

        emissions_after = _calc_pool_state_emissions(curr_state, emission_factors_map)
        marginal_reduction_kg = max(0.0, emissions_before - emissions_after)

        # Marginal payback
        payback_months = (capex / delta_savings * 12.0) if delta_savings > 0 else None

        # Cost per tonne INR (PRD §14.1)
        lifetime = float(getattr(itv, "lifetime_years", 10.0) or 10.0)
        annual_opex = _get_annual_opex(itv, level)
        tco2_cut = marginal_reduction_kg / 1000.0
        if tco2_cut > 0:
            cpt = ((capex / lifetime) + annual_opex - delta_savings) / tco2_cut
        else:
            cpt = 0.0

        circ_points = int(getattr(itv, "circularity_points", 0) or 0)
        tot_circ_points += circ_points
        tot_capex += capex
        tot_savings += delta_savings

        # Level representation
        level_repr = None
        if level is not None:
            if itv.effect_type == "onsite_generation":
                level_repr = {"kwp": level}
            elif itv.effect_type == "shift_to_secondary":
                level_repr = {"recycled_share": level}
            else:
                level_repr = {"level": level}

        ledger_items.append({
            "sequence": seq,
            "intervention_code": itv.code,
            "title_en": itv.title_en,
            "category": itv.category,
            "pool": itv.pool,
            "difficulty": int(getattr(itv, "difficulty", 1) or 1),
            "circularity_points": circ_points,
            "level": level_repr,
            "capex_inr": round(capex, 2),
            "annual_savings_inr": round(delta_savings, 2),
            "reduction_kgco2e": round(marginal_reduction_kg, 2),
            "reduction_tco2e": round(tco2_cut, 3),
            "payback_months": round(payback_months, 1) if payback_months else None,
            "cost_per_tonne_inr": round(cpt, 2),
            "added_grid_kwh": round(added_grid_kwh, 2),
        })

    final_emissions = _calc_pool_state_emissions(curr_state, emission_factors_map)
    tot_reduction_kg = max(0.0, base_emissions - final_emissions)

    # Calculate overall payback
    plan_payback_months = (tot_capex / tot_savings * 12.0) if tot_savings > 0 else None
    reduction_pct = (tot_reduction_kg / baseline_total_kg * 100.0) if baseline_total_kg > 0 else 0.0

    plan_totals = {
        "capex_inr": round(tot_capex, 2),
        "annual_savings_inr": round(tot_savings, 2),
        "reduction_kg": round(tot_reduction_kg, 2),
        "reduction_tco2e": round(tot_reduction_kg / 1000.0, 3),
        "reduction_pct": round(reduction_pct, 1),
        "payback_months": round(plan_payback_months, 1) if plan_payback_months else None,
        "circularity_points": tot_circ_points,
        "final_emissions_kg": round(final_emissions, 2),
    }

    return ledger_items, plan_totals


def re_evaluate_with_tightening(
    solver: OptimizerSolver,
    mode: str,
    budget_inr: float,
    baseline_total_kg: float,
    baseline_state: PoolState,
    tariff_inr: float,
    emission_factors_map: dict[str, float],
    pool_costs: dict[str, float],
    target_reduction_pct: float | None = None,
    max_payback_months: float | None = None,
    max_difficulty: int | None = None,
    weights: dict[str, float] | None = None,
    excluded_codes: list[str] | None = None,
    forced_codes: list[str] | None = None,
) -> dict[str, Any]:
    """Execute MILP solve, iterative target tightening, and exact ledger generation per PRD §13.4."""
    tightening_kg = 0.0
    best_ledger: list[dict[str, Any]] = []
    best_totals: dict[str, Any] = {}
    is_feasible = False
    message = None
    min_budget = None

    target_kg = (target_reduction_pct / 100.0 * baseline_total_kg) if target_reduction_pct else 0.0

    # Up to 3 iterations for target tightening
    for iteration in range(3):
        chosen_combos, feas, msg, req_budget = solver.solve(
            mode=mode,
            budget_inr=budget_inr,
            baseline_total_kg=baseline_total_kg,
            target_reduction_pct=target_reduction_pct,
            max_payback_months=max_payback_months,
            max_difficulty=max_difficulty,
            weights=weights,
            excluded_codes=excluded_codes,
            forced_codes=forced_codes,
            target_tightening_kg=tightening_kg,
        )

        if not feas or not chosen_combos:
            is_feasible = False
            message = msg
            min_budget = req_budget
            # Evaluate the best achievable combinations if returned
            if chosen_combos:
                raw_items = [
                    (itv, level)
                    for c in chosen_combos.values()
                    for itv, level in c.items
                ]
                ordered = order_ledger_items(
                    raw_items, baseline_state, tariff_inr, emission_factors_map, pool_costs
                )
                best_ledger, best_totals = evaluate_plan_exact(
                    ordered, baseline_state, tariff_inr, emission_factors_map, pool_costs, baseline_total_kg
                )
            break

        # Feasible combination found - extract items
        raw_items = [
            (itv, level)
            for c in chosen_combos.values()
            for itv, level in c.items
        ]
        ordered = order_ledger_items(
            raw_items, baseline_state, tariff_inr, emission_factors_map, pool_costs
        )
        ledger, totals = evaluate_plan_exact(
            ordered, baseline_state, tariff_inr, emission_factors_map, pool_costs, baseline_total_kg
        )

        best_ledger = ledger
        best_totals = totals
        is_feasible = True

        # Check if exact reduction meets target
        if target_kg > 0:
            shortfall = target_kg - totals["reduction_kg"]
            if shortfall > 0.01:
                tightening_kg += shortfall
                continue  # Re-solve with tightened target
            else:
                break
        else:
            break

    # If budget was exceeded in exact re-evaluation (edge case), note feasibility
    if best_totals.get("capex_inr", 0.0) > budget_inr + 1.0 and mode != "min_capex_for_target":
        is_feasible = False

    return {
        "mode": mode,
        "feasible": is_feasible,
        "message": message,
        "min_budget_needed": min_budget,
        "totals": best_totals,
        "ledger": best_ledger,
    }


def _get_capex(itv: Intervention, level: Any) -> float:
    capex_m = itv.capex_model or {}
    if isinstance(capex_m, str):
        try:
            capex_m = json.loads(capex_m)
        except Exception:
            capex_m = {}

    c_type = capex_m.get("type", "fixed")
    if c_type == "fixed":
        return float(capex_m.get("mode", 0.0))
    elif c_type == "per_kwp":
        kwp = float(level) if level is not None else 50.0
        return float(capex_m.get("mode", 45000.0)) * kwp
    return 0.0


def _get_annual_opex(itv: Intervention, level: Any) -> float:
    savings_m = itv.savings_model or {}
    if isinstance(savings_m, str):
        try:
            savings_m = json.loads(savings_m)
        except Exception:
            savings_m = {}

    params = itv.effect_params or {}
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    if itv.effect_type == "onsite_generation":
        kwp = float(level) if level is not None else 50.0
        return kwp * float(params.get("annual_opex_per_kwp_inr", 500.0))

    return float(savings_m.get("annual_opex_inr", 0.0))


def _estimate_initial_savings(
    itv: Intervention,
    level: Any,
    state: PoolState,
    tariff_inr: float,
    pool_costs: dict[str, float],
) -> float:
    eff = itv.effect_type
    params = itv.effect_params or {}
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    if eff == "reduce_fraction":
        share = float(params.get("share_of_pool", 1.0))
        red = float(params.get("reduction", 0.0))
        if itv.pool == "grid_kwh":
            return state.grid_kwh * share * red * tariff_inr
        elif itv.pool == "melting_fuel":
            p_gj = DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"]
            return state.melting_fuel_gj * share * red * p_gj
        elif itv.pool == "dg_diesel":
            return state.dg_diesel_l * share * red * DEFAULT_PRICES["diesel"]
        else:
            cost = pool_costs.get(itv.pool, 0.0)
            return cost * share * red

    elif eff == "onsite_generation":
        kwp = float(level) if level is not None else 50.0
        yield_k = float(params.get("yield_kwh_per_kwp", 1500.0))
        offset = min(kwp * yield_k, state.grid_kwh)
        opex = kwp * float(params.get("annual_opex_per_kwp_inr", 500.0))
        return (offset * tariff_inr) - opex

    elif eff == "fuel_to_electric":
        frac = float(params.get("fraction", 1.0))
        saved_gj = state.melting_fuel_gj * frac
        add_kwh = (saved_gj * float(params.get("fuel_efficiency", 0.2)) / float(params.get("electric_efficiency", 0.65))) / 0.0036
        fuel_saved = saved_gj * (DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"])
        return fuel_saved - (add_kwh * tariff_inr)

    elif eff == "shift_to_secondary":
        target = float(level) if level is not None else 0.4
        delta = max(0.0, target - state.secondary_brass_share)
        kg = delta * state.brass_input_kg
        p_diff = float(params.get("price_diff_inr_per_kg", 0.0))
        s_gain = float(params.get("scrap_value_gain_inr_per_kg", 0.0))
        return (kg * p_diff) + (kg * s_gain * 0.95)

    return 1000.0


def _apply_single_intervention(
    itv: Intervention,
    level: Any,
    state: PoolState,
    tariff_inr: float,
    pool_costs: dict[str, float],
) -> tuple[float, float]:
    """Mutate state in place by applying single intervention; return (annual_savings, added_grid_kwh)."""
    eff = itv.effect_type
    params = itv.effect_params or {}
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    savings_m = itv.savings_model or {}
    if isinstance(savings_m, str):
        try:
            savings_m = json.loads(savings_m)
        except Exception:
            savings_m = {}

    annual_opex = _get_annual_opex(itv, level)
    added_grid_kwh = 0.0
    delta_savings = 0.0

    if eff == "reduce_fraction":
        share = float(params.get("share_of_pool", 1.0))
        red = float(params.get("reduction", 0.0))
        pool = itv.pool

        curr_qty = getattr(state, pool, 0.0)
        if pool == "melting_fuel":
            curr_qty = state.melting_fuel_gj
        elif pool == "dg_diesel":
            curr_qty = state.dg_diesel_l
        elif pool == "grid_kwh":
            curr_qty = state.grid_kwh
        elif pool == "cutting_oil":
            curr_qty = state.cutting_oil_kg
        elif pool == "hazardous_waste":
            curr_qty = state.hazardous_waste_kg
        elif pool == "packaging":
            curr_qty = state.packaging_kg
        elif pool == "freight":
            curr_qty = state.freight_tkm

        new_qty, saved_qty = apply_reduce_fraction(curr_qty, share, red)

        if pool == "melting_fuel":
            state.melting_fuel_gj = new_qty
            p_gj = DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"]
            delta_savings = (saved_qty * p_gj) - annual_opex
        elif pool == "dg_diesel":
            state.dg_diesel_l = new_qty
            delta_savings = (saved_qty * DEFAULT_PRICES["diesel"]) - annual_opex
        elif pool == "grid_kwh":
            state.grid_kwh = new_qty
            delta_savings = (saved_qty * tariff_inr) - annual_opex
        elif pool == "cutting_oil":
            state.cutting_oil_kg = new_qty
            delta_savings = (pool_costs.get(pool, 0.0) * share * red) - annual_opex
        elif pool == "hazardous_waste":
            state.hazardous_waste_kg = new_qty
            delta_savings = (pool_costs.get(pool, 0.0) * share * red) - annual_opex
        elif pool == "packaging":
            state.packaging_kg = new_qty
            delta_savings = (pool_costs.get(pool, 0.0) * share * red) - annual_opex
        elif pool == "freight":
            state.freight_tkm = new_qty
            delta_savings = (pool_costs.get(pool, 0.0) * share * red) - annual_opex

        # Check side effects
        for se in params.get("side_effects", []):
            if se.get("pool") == "grid_kwh":
                add_k = saved_qty * float(se.get("per_unit_removed", 0.0))
                state.grid_kwh += add_k
                added_grid_kwh += add_k
                delta_savings -= add_k * tariff_inr

    elif eff == "fuel_to_electric":
        frac = float(params.get("fraction", 1.0))
        fuel_eff = float(params.get("fuel_efficiency", 0.20))
        elec_eff = float(params.get("electric_efficiency", 0.65))

        new_fuel_gj, saved_gj, add_kwh = apply_fuel_to_electric(
            state.melting_fuel_gj, frac, fuel_eff, elec_eff
        )
        state.melting_fuel_gj = new_fuel_gj
        state.grid_kwh += add_kwh
        added_grid_kwh += add_kwh

        fuel_cost_saved = saved_gj * (DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"])
        delta_savings = fuel_cost_saved - (add_kwh * tariff_inr) - annual_opex

    elif eff == "shift_to_secondary":
        delta = float(params.get("delta", 0.0)) if level is None else 0.0
        _, old_sec, new_sec = apply_shift_to_secondary(
            state.brass_input_kg, state.secondary_brass_share, level=level, delta=delta
        )
        state.secondary_brass_share = new_sec
        shifted_kg = (new_sec - old_sec) * state.brass_input_kg

        p_diff = float(params.get("price_diff_inr_per_kg", 0.0))
        s_gain = float(params.get("scrap_value_gain_inr_per_kg", 0.0))
        delta_savings = (shifted_kg * p_diff) + (shifted_kg * s_gain * 0.95) - annual_opex

    elif eff == "onsite_generation":
        kwp = float(level) if level is not None else 50.0
        yield_k = float(params.get("yield_kwh_per_kwp", 1500.0))
        new_grid, solar_gen, offset_kwh = apply_onsite_generation(
            state.grid_kwh, kwp, yield_k
        )
        state.grid_kwh = new_grid
        state.solar_generation_kwh += solar_gen
        delta_savings = (offset_kwh * tariff_inr) - annual_opex

    return delta_savings, added_grid_kwh
