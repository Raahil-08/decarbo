"""Intervention applicability matcher and standalone impact evaluator per PRD §12.4 and §12.5."""

import json
from typing import Any

from app.interventions.effects import (
    PoolState,
    apply_fuel_to_electric,
    apply_onsite_generation,
    apply_reduce_fraction,
    apply_shift_to_secondary,
)
from app.models.models import Factory, Intervention

# Default fuel prices in INR per unit (PRD §12.5)
DEFAULT_PRICES: dict[str, float] = {
    "diesel": 90.0,         # ₹/L
    "furnace_oil": 55.0,    # ₹/kg
    "lpg": 75.0,            # ₹/kg
    "natural_gas": 50.0,    # ₹/m3
    "coal": 8.0,            # ₹/kg
}

# Net Calorific Values (NCV) in GJ per canonical unit (PRD §12.2)
NCV_MAP: dict[str, float] = {
    "furnace_oil": 0.0402,      # 40.2 GJ/tonne -> 0.0402 GJ/kg
    "lpg": 0.0461,              # 46.1 GJ/tonne -> 0.0461 GJ/kg
    "natural_gas": 0.038,       # 38 MJ/m3 -> 0.038 GJ/m3
    "coal": 0.018,              # 18 GJ/tonne -> 0.018 GJ/kg
}


def extract_baseline_pools(records: list[Any]) -> tuple[PoolState, dict[str, float]]:
    """Build PoolState and record pool cost/quantity from baseline activity records."""
    state = PoolState()
    pool_costs: dict[str, float] = {}

    primary_brass = 0.0
    secondary_brass = 0.0

    for r in records:
        act = getattr(r, "activity_type", "")
        qty = float(getattr(r, "quantity_canonical", getattr(r, "quantity", 0.0)))
        cost = float(getattr(r, "cost_inr", 0.0) or 0.0)

        if act == "grid_electricity":
            state.grid_kwh += qty
            pool_costs["grid_kwh"] = pool_costs.get("grid_kwh", 0.0) + cost
        elif act in ("furnace_oil", "lpg", "natural_gas", "coal"):
            gj = qty * NCV_MAP.get(act, 0.04)
            state.melting_fuel_gj += gj
            pool_costs["melting_fuel"] = pool_costs.get("melting_fuel", 0.0) + cost
        elif act == "diesel":
            state.dg_diesel_l += qty
            pool_costs["dg_diesel"] = pool_costs.get("dg_diesel", 0.0) + cost
        elif act in ("brass_input_primary", "brass_ingot_virgin", "brass_rod_virgin"):
            primary_brass += qty
            pool_costs["brass_input"] = pool_costs.get("brass_input", 0.0) + cost
        elif act in ("brass_input_secondary", "brass_scrap_local"):
            secondary_brass += qty
            pool_costs["brass_input"] = pool_costs.get("brass_input", 0.0) + cost
        elif act == "cutting_oil":
            state.cutting_oil_kg += qty
            pool_costs["cutting_oil"] = pool_costs.get("cutting_oil", 0.0) + cost
        elif act in ("waste_hazardous_incineration", "coolant_sludge"):
            state.hazardous_waste_kg += qty
            pool_costs["hazardous_waste"] = pool_costs.get("hazardous_waste", 0.0) + cost
        elif act in ("packaging_corrugated", "packaging_plastic"):
            state.packaging_kg += qty
            pool_costs["packaging"] = pool_costs.get("packaging", 0.0) + cost
        elif act in ("road_freight_hgv", "road_freight_lcv"):
            state.freight_tkm += qty
            pool_costs["freight"] = pool_costs.get("freight", 0.0) + cost

    state.brass_input_kg = primary_brass + secondary_brass
    if state.brass_input_kg > 0:
        state.secondary_brass_share = secondary_brass / state.brass_input_kg
    else:
        state.secondary_brass_share = 0.0

    return state, pool_costs


def is_applicable(
    intervention: Intervention,
    pool_state: PoolState,
    baseline_summary: dict[str, Any],
    factory: Factory,
    active_activities: set[str],
) -> bool:
    """Check applicability rules per PRD §12.4."""
    # 1. Industry check
    industries = intervention.industries
    if isinstance(industries, str):
        try:
            industries = json.loads(industries)
        except Exception:
            industries = [industries]
    if "*" not in industries and factory.industry not in industries:
        return False

    # 2. Pool quantity > 0
    pool = intervention.pool
    pool_qty = getattr(pool_state, pool, None)
    if pool == "melting_fuel":
        pool_qty = pool_state.melting_fuel_gj
    elif pool == "dg_diesel":
        pool_qty = pool_state.dg_diesel_l
    elif pool == "brass_input":
        pool_qty = pool_state.brass_input_kg
    elif pool == "cutting_oil":
        pool_qty = pool_state.cutting_oil_kg
    elif pool == "hazardous_waste":
        pool_qty = pool_state.hazardous_waste_kg
    elif pool == "packaging":
        pool_qty = pool_state.packaging_kg
    elif pool == "freight":
        pool_qty = pool_state.freight_tkm
    elif pool == "grid_kwh":
        pool_qty = pool_state.grid_kwh

    if pool_qty is None or pool_qty <= 0:
        return False

    # 3. Minimum pool share of emissions
    applicability = intervention.applicability or {}
    if isinstance(applicability, str):
        try:
            applicability = json.loads(applicability)
        except Exception:
            applicability = {}

    min_share = float(applicability.get("min_pool_share", 0.01))
    total_emissions = float(baseline_summary.get("total_kgco2e", 0.0))

    # Pool emissions check
    by_activity = baseline_summary.get("by_activity", [])
    pool_emissions = sum(
        float(a.get("kgco2e", 0.0))
        for a in by_activity
        if _activity_belongs_to_pool(a.get("activity_type", ""), pool)
    )
    if total_emissions > 0 and (pool_emissions / total_emissions) < min_share:
        return False

    # 4. Required activities
    required = applicability.get("requires_activity", [])
    if required and not any(r in active_activities for r in required):
        return False

    # 5. Level check: for level-based, ensure at least one level is feasible
    params = intervention.effect_params or {}
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    if intervention.effect_type == "shift_to_secondary":
        levels = params.get("levels")
        if levels:
            valid_levels = [lvl for lvl in levels if lvl > pool_state.secondary_brass_share]
            if not valid_levels:
                return False

    return True


def _activity_belongs_to_pool(act: str, pool: str) -> bool:
    if pool == "grid_kwh":
        return act == "grid_electricity"
    if pool == "melting_fuel":
        return act in ("furnace_oil", "lpg", "natural_gas", "coal")
    if pool == "dg_diesel":
        return act == "diesel"
    if pool == "brass_input":
        return "brass" in act or "copper" in act or "zinc" in act
    if pool == "cutting_oil":
        return act == "cutting_oil"
    if pool == "hazardous_waste":
        return act in ("waste_hazardous_incineration", "coolant_sludge")
    if pool == "packaging":
        return "packaging" in act or "boxes" in act or "carton" in act
    if pool == "freight":
        return "freight" in act or "truck" in act or "transport" in act
    return False


def evaluate_standalone_impact(
    intervention: Intervention,
    pool_state: PoolState,
    tariff_inr: float,
    emission_factors_map: dict[str, float],
    pool_costs: dict[str, float],
    level_override: Any | None = None,
) -> dict[str, Any]:
    """Compute standalone mode effects: reduction_kg, capex_inr, annual_savings_inr, payback."""
    eff_type = intervention.effect_type
    params = intervention.effect_params or {}
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    capex_m = intervention.capex_model or {}
    if isinstance(capex_m, str):
        try:
            capex_m = json.loads(capex_m)
        except Exception:
            capex_m = {}

    savings_m = intervention.savings_model or {}
    if isinstance(savings_m, str):
        try:
            savings_m = json.loads(savings_m)
        except Exception:
            savings_m = {}

    grid_factor = emission_factors_map.get("grid_electricity", 0.71)

    reduction_kg = 0.0
    capex_inr = 0.0
    annual_savings_inr = 0.0

    # 1. Calculate reduction & physical shifts
    if eff_type == "reduce_fraction":
        share = float(params.get("share_of_pool", 1.0))
        red = float(params.get("reduction", 0.0))
        pool = intervention.pool

        base_qty = getattr(pool_state, pool, 0.0)
        if pool == "melting_fuel":
            base_qty = pool_state.melting_fuel_gj
            factor_per_unit = emission_factors_map.get("furnace_oil", 3.1) / NCV_MAP.get("furnace_oil", 0.04)
        elif pool == "dg_diesel":
            base_qty = pool_state.dg_diesel_l
            factor_per_unit = emission_factors_map.get("diesel", 2.68)
        elif pool == "grid_kwh":
            base_qty = pool_state.grid_kwh
            factor_per_unit = grid_factor
        elif pool == "cutting_oil":
            base_qty = pool_state.cutting_oil_kg
            factor_per_unit = emission_factors_map.get("cutting_oil", 2.8)
        elif pool == "hazardous_waste":
            base_qty = pool_state.hazardous_waste_kg
            factor_per_unit = emission_factors_map.get("waste_hazardous_incineration", 2.1)
        elif pool == "packaging":
            base_qty = pool_state.packaging_kg
            factor_per_unit = emission_factors_map.get("packaging_corrugated", 1.2)
        elif pool == "freight":
            base_qty = pool_state.freight_tkm
            factor_per_unit = emission_factors_map.get("road_freight_hgv", 0.12)
        else:
            base_qty = 0.0
            factor_per_unit = 1.0

        _, qty_saved = apply_reduce_fraction(base_qty, share, red)
        reduction_kg = qty_saved * factor_per_unit

        # Cost savings calculation
        sav_type = savings_m.get("type")
        if sav_type == "energy_kwh":
            annual_savings_inr = qty_saved * tariff_inr - float(savings_m.get("annual_opex_inr", 0))
        elif sav_type == "fuel":
            price_per_gj = DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"]
            annual_savings_inr = qty_saved * price_per_gj
        elif sav_type == "cost_share":
            pool_c = pool_costs.get(pool, 0.0)
            annual_savings_inr = pool_c * (share * red)
        else:
            annual_savings_inr = 0.0

        # Handle side-effects (e.g. DG battery backup adds grid_kwh)
        side_effects = params.get("side_effects", [])
        for se in side_effects:
            if se.get("pool") == "grid_kwh":
                added_kwh = qty_saved * float(se.get("per_unit_removed", 0.0))
                reduction_kg -= added_kwh * grid_factor
                annual_savings_inr -= added_kwh * tariff_inr

    elif eff_type == "fuel_to_electric":
        fraction = float(params.get("fraction", 1.0))
        fuel_eff = float(params.get("fuel_efficiency", 0.20))
        elec_eff = float(params.get("electric_efficiency", 0.65))

        _, fuel_saved_gj, added_kwh = apply_fuel_to_electric(
            pool_state.melting_fuel_gj, fraction, fuel_eff, elec_eff
        )
        fuel_factor_per_gj = emission_factors_map.get("furnace_oil", 3.1) / NCV_MAP.get("furnace_oil", 0.04)
        saved_kg = fuel_saved_gj * fuel_factor_per_gj
        added_kg = added_kwh * grid_factor
        reduction_kg = max(0.0, saved_kg - added_kg)

        fuel_cost_saved = pool_costs.get("melting_fuel", fuel_saved_gj * (DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"]))
        elec_cost_added = added_kwh * tariff_inr
        annual_savings_inr = fuel_cost_saved - elec_cost_added - float(savings_m.get("annual_opex_inr", 0))

    elif eff_type == "shift_to_secondary":
        levels = params.get("levels")
        chosen_lvl = level_override
        if chosen_lvl is None:
            if levels:
                chosen_lvl = max(levels)
            else:
                chosen_lvl = None

        delta = float(params.get("delta", 0.0)) if chosen_lvl is None else 0.0
        new_sec, delta_inc = apply_shift_to_secondary(
            pool_state.secondary_brass_share,
            target_level=chosen_lvl,
            delta=delta,
        )
        old_sec = pool_state.secondary_brass_share
        shifted_kg = (new_sec - old_sec) * pool_state.brass_input_kg
        # Primary factor - secondary factor delta
        prim_f = emission_factors_map.get("brass_input_primary", 4.2)
        sec_f = emission_factors_map.get("brass_input_secondary", 0.65)
        factor_diff = max(0.1, prim_f - sec_f)
        reduction_kg = shifted_kg * factor_diff

        # Savings
        price_diff = float(params.get("price_diff_inr_per_kg", 0.0))
        scrap_gain = float(params.get("scrap_value_gain_inr_per_kg", 0.0))
        annual_savings_inr = (shifted_kg * price_diff) + (shifted_kg * scrap_gain * 0.95)

    elif eff_type == "onsite_generation":
        levels_kwp = params.get("levels_kwp", [50])
        chosen_kwp = level_override if level_override is not None else (levels_kwp[-1] if levels_kwp else 50)
        yield_kwh = float(params.get("yield_kwh_per_kwp", 1500.0))

        _, solar_kwh, offset_kwh = apply_onsite_generation(
            pool_state.grid_kwh, chosen_kwp, yield_kwh
        )
        reduction_kg = offset_kwh * grid_factor
        opex_per_kwp = float(params.get("annual_opex_per_kwp_inr", 500.0))
        annual_savings_inr = (offset_kwh * tariff_inr) - (chosen_kwp * opex_per_kwp)

    # 2. Calculate Capex
    capex_type = capex_m.get("type", "fixed")
    if capex_type == "fixed":
        capex_inr = float(capex_m.get("mode", 0.0))
    elif capex_type == "per_kwp":
        rate = float(capex_m.get("mode", 45000.0))
        chosen_kwp = level_override if level_override is not None else 50
        capex_inr = rate * float(chosen_kwp)
    else:
        capex_inr = float(capex_m.get("mode", 0.0))

    # Payback & Cost per tonne
    payback_months = None
    if annual_savings_inr > 0:
        payback_months = round((capex_inr / annual_savings_inr) * 12.0, 1)

    lifetime = float(getattr(intervention, "lifetime_years", 5.0) or 5.0)
    annual_cut_t = reduction_kg / 1000.0
    cost_per_tonne = None
    if annual_cut_t > 0:
        annualized_capex = capex_inr / lifetime
        net_annual_cost = annualized_capex - annual_savings_inr
        cost_per_tonne = round(net_annual_cost / annual_cut_t, 1)

    return {
        "intervention_code": intervention.code,
        "reduction_kg": max(0.0, reduction_kg),
        "reduction_tco2e": round(reduction_kg / 1000.0, 2),
        "capex_inr": round(capex_inr, 0),
        "annual_savings_inr": round(annual_savings_inr, 0),
        "payback_months": payback_months,
        "cost_per_tonne_inr": cost_per_tonne,
    }
