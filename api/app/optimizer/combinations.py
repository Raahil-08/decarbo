"""Per-pool combination generator and dominance filtering per PRD §13.4 Step 1."""

import itertools
import json
from dataclasses import dataclass, field
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


@dataclass
class PoolCombination:
    pool: str
    id: int
    items: list[tuple[Intervention, Any]] = field(default_factory=list)  # (Intervention, level)
    reduction_kg: float = 0.0
    capex_inr: float = 0.0
    annual_savings_inr: float = 0.0
    circularity_points: int = 0
    max_difficulty: int = 1
    added_grid_kwh: float = 0.0

    @property
    def codes(self) -> list[str]:
        return [itv.code for itv, _ in self.items]


def generate_pool_combinations(
    pool_name: str,
    applicable_interventions: list[Intervention],
    baseline_state: PoolState,
    tariff_inr: float,
    emission_factors_map: dict[str, float],
    pool_costs: dict[str, float],
    max_kwp: float = 300.0,
) -> list[PoolCombination]:
    """Generate all non-dominated feasible combinations of interventions for a given pool."""
    # Always include the "do nothing" baseline combination
    combos: list[PoolCombination] = [
        PoolCombination(
            pool=pool_name,
            id=0,
            items=[],
            reduction_kg=0.0,
            capex_inr=0.0,
            annual_savings_inr=0.0,
            circularity_points=0,
            max_difficulty=1,
            added_grid_kwh=0.0,
        )
    ]

    if not applicable_interventions:
        return combos

    # Expand discrete levels
    option_units: list[list[tuple[Intervention, Any]]] = []
    for itv in applicable_interventions:
        params = itv.effect_params or {}
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except Exception:
                params = {}

        if itv.effect_type == "shift_to_secondary":
            levels = params.get("levels", [0.4, 0.6, 0.8])
            valid_levels = [lvl for lvl in levels if lvl > baseline_state.secondary_brass_share]
            if valid_levels:
                option_units.append([(itv, lvl) for lvl in valid_levels])
            else:
                option_units.append([(itv, None)])
        elif itv.effect_type == "onsite_generation":
            levels_kwp = params.get("levels_kwp", [25, 50, 75, 100, 150, 200, 300])
            valid_kwp = [kwp for kwp in levels_kwp if kwp <= max_kwp]
            if not valid_kwp and levels_kwp:
                valid_kwp = [levels_kwp[0]]
            option_units.append([(itv, kwp) for kwp in valid_kwp])
        else:
            option_units.append([(itv, None)])

    # Enumerate Cartesian choices (at most one level per intervention, or exclude)
    # Each intervention has choice: None or one of its levels/options
    choice_lists = [[None] + opts for opts in option_units]

    # If combinations count > 2000, limit product depth
    raw_combos_generated = 0
    combo_id = 1

    for choice_tuple in itertools.product(*choice_lists):
        selected = [c for c in choice_tuple if c is not None]
        if not selected:
            continue

        raw_combos_generated += 1
        if raw_combos_generated > 4000:
            break

        # Check conflicts and requirements
        selected_codes = {itv.code for itv, _ in selected}
        conflict_detected = False
        requires_missing = False

        for itv, _ in selected:
            conflicts = itv.conflicts or []
            if isinstance(conflicts, str):
                try:
                    conflicts = json.loads(conflicts)
                except Exception:
                    conflicts = []
            if any(c in selected_codes for c in conflicts):
                conflict_detected = True
                break

            requires = itv.requires or []
            if isinstance(requires, str):
                try:
                    requires = json.loads(requires)
                except Exception:
                    requires = []
            # Check within-pool requires
            for req in requires:
                if req in [i.code for i in applicable_interventions] and req not in selected_codes:
                    requires_missing = True
                    break
            if requires_missing:
                break

        if conflict_detected or requires_missing:
            continue

        # Evaluate exact compounded effect
        evaluated_combo = _evaluate_combination(
            pool_name=pool_name,
            combo_id=combo_id,
            items=selected,
            baseline_state=baseline_state,
            tariff_inr=tariff_inr,
            emission_factors_map=emission_factors_map,
            pool_costs=pool_costs,
        )
        combos.append(evaluated_combo)
        combo_id += 1

    # Filter dominated combinations (PRD §13.4 Step 1)
    filtered = _filter_dominated(combos)
    return filtered


def _evaluate_combination(
    pool_name: str,
    combo_id: int,
    items: list[tuple[Intervention, Any]],
    baseline_state: PoolState,
    tariff_inr: float,
    emission_factors_map: dict[str, float],
    pool_costs: dict[str, float],
) -> PoolCombination:
    """Evaluate combination effects sequentially in fixed order per PRD §12.3."""
    # Order items: 1) reduce_fraction, 2) fuel_to_electric, 3) shift_to_secondary, 4) onsite_generation
    order_map = {
        "reduce_fraction": 1,
        "fuel_to_electric": 2,
        "shift_to_secondary": 3,
        "onsite_generation": 4,
    }
    sorted_items = sorted(
        items,
        key=lambda x: (order_map.get(x[0].effect_type, 99), x[0].code),
    )

    state = baseline_state.copy()
    tot_capex = 0.0
    tot_savings = 0.0
    tot_circ_points = 0
    max_diff = 1
    added_grid_kwh = 0.0

    for itv, level in sorted_items:
        params = itv.effect_params or {}
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except Exception:
                params = {}

        capex_m = itv.capex_model or {}
        if isinstance(capex_m, str):
            try:
                capex_m = json.loads(capex_m)
            except Exception:
                capex_m = {}

        savings_m = itv.savings_model or {}
        if isinstance(savings_m, str):
            try:
                savings_m = json.loads(savings_m)
            except Exception:
                savings_m = {}

        # 1. Capex
        c_type = capex_m.get("type", "fixed")
        if c_type == "fixed":
            tot_capex += float(capex_m.get("mode", 0.0))
        elif c_type == "per_kwp":
            kwp = float(level) if level is not None else 50.0
            tot_capex += float(capex_m.get("mode", 45000.0)) * kwp

        # Difficulty & Circularity
        diff = int(getattr(itv, "difficulty", 1) or 1)
        if diff > max_diff:
            max_diff = diff
        tot_circ_points += int(getattr(itv, "circularity_points", 0) or 0)

        # 2. Sequential physical effect & savings
        eff = itv.effect_type
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
            elif pool == "dg_diesel":
                state.dg_diesel_l = new_qty
            elif pool == "grid_kwh":
                state.grid_kwh = new_qty
            elif pool == "cutting_oil":
                state.cutting_oil_kg = new_qty
            elif pool == "hazardous_waste":
                state.hazardous_waste_kg = new_qty
            elif pool == "packaging":
                state.packaging_kg = new_qty
            elif pool == "freight":
                state.freight_tkm = new_qty

            # Savings
            sav_t = savings_m.get("type")
            if sav_t == "energy_kwh":
                tot_savings += (saved_qty * tariff_inr) - float(savings_m.get("annual_opex_inr", 0))
            elif sav_t == "fuel":
                p_gj = DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"]
                tot_savings += saved_qty * p_gj
            elif sav_t == "cost_share":
                pool_c = pool_costs.get(pool, 0.0)
                tot_savings += pool_c * (share * red)

            # Side effects
            for se in params.get("side_effects", []):
                if se.get("pool") == "grid_kwh":
                    add_k = saved_qty * float(se.get("per_unit_removed", 0.0))
                    state.grid_kwh += add_k
                    added_grid_kwh += add_k
                    tot_savings -= add_k * tariff_inr

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

            fuel_cost_saved = pool_costs.get("melting_fuel", saved_gj * (DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"]))
            tot_savings += fuel_cost_saved - (add_kwh * tariff_inr) - float(savings_m.get("annual_opex_inr", 0))

        elif eff == "shift_to_secondary":
            delta = float(params.get("delta", 0.0)) if level is None else 0.0
            _, old_sec, new_sec = apply_shift_to_secondary(
                state.brass_input_kg, state.secondary_brass_share, level=level, delta=delta
            )
            state.secondary_brass_share = new_sec
            shifted_kg = (new_sec - old_sec) * state.brass_input_kg

            p_diff = float(params.get("price_diff_inr_per_kg", 0.0))
            s_gain = float(params.get("scrap_value_gain_inr_per_kg", 0.0))
            tot_savings += (shifted_kg * p_diff) + (shifted_kg * s_gain * 0.95)

        elif eff == "onsite_generation":
            kwp = float(level) if level is not None else 50.0
            yield_k = float(params.get("yield_kwh_per_kwp", 1500.0))
            new_grid, solar_gen, offset_kwh = apply_onsite_generation(
                state.grid_kwh, kwp, yield_k
            )
            state.grid_kwh = new_grid
            state.solar_generation_kwh += solar_gen
            opex = float(params.get("annual_opex_per_kwp_inr", 500.0))
            tot_savings += (offset_kwh * tariff_inr) - (kwp * opex)

    # 3. Calculate baseline vs new emissions
    base_emissions = _calc_pool_state_emissions(baseline_state, emission_factors_map)
    new_emissions = _calc_pool_state_emissions(state, emission_factors_map)
    reduction_kg = max(0.0, base_emissions - new_emissions)

    return PoolCombination(
        pool=pool_name,
        id=combo_id,
        items=items,
        reduction_kg=round(reduction_kg, 2),
        capex_inr=round(tot_capex, 0),
        annual_savings_inr=round(tot_savings, 0),
        circularity_points=tot_circ_points,
        max_difficulty=max_diff,
        added_grid_kwh=round(added_grid_kwh, 2),
    )


def _calc_pool_state_emissions(state: PoolState, factors: dict[str, float]) -> float:
    """Evaluate total kgCO2e across physical pools."""
    total = 0.0
    grid_f = factors.get("grid_electricity", 0.71)
    total += state.grid_kwh * grid_f

    if state.melting_fuel_gj > 0:
        fo_factor = factors.get("furnace_oil", 3.1)
        total += state.melting_fuel_gj * (fo_factor / NCV_MAP["furnace_oil"])

    if state.dg_diesel_l > 0:
        total += state.dg_diesel_l * factors.get("diesel", 2.68)

    if state.brass_input_kg > 0:
        prim_f = factors.get("brass_input_primary", 4.2)
        sec_f = factors.get("brass_input_secondary", 0.65)
        prim_kg = state.brass_input_kg * (1.0 - state.secondary_brass_share)
        sec_kg = state.brass_input_kg * state.secondary_brass_share
        total += (prim_kg * prim_f) + (sec_kg * sec_f)

    if state.cutting_oil_kg > 0:
        total += state.cutting_oil_kg * factors.get("cutting_oil", 2.8)

    if state.hazardous_waste_kg > 0:
        total += state.hazardous_waste_kg * factors.get("waste_hazardous_incineration", 2.1)

    if state.packaging_kg > 0:
        total += state.packaging_kg * factors.get("packaging_corrugated", 1.2)

    if state.freight_tkm > 0:
        total += state.freight_tkm * factors.get("road_freight_hgv", 0.12)

    return total


def _filter_dominated(combos: list[PoolCombination]) -> list[PoolCombination]:
    """Remove combinations that are strictly dominated across reduction, savings, and capex."""
    if len(combos) <= 1:
        return combos

    # Always keep the baseline 0 combination
    baseline = combos[0]
    others = combos[1:]

    non_dominated: list[PoolCombination] = [baseline]

    for c in others:
        dominated = False
        for other in others:
            if other.id == c.id:
                continue
            # other dominates c if other has >= reduction, >= savings, <= capex, and strictly better in at least one
            if (
                other.reduction_kg >= c.reduction_kg
                and other.annual_savings_inr >= c.annual_savings_inr
                and other.capex_inr <= c.capex_inr
                and (
                    other.reduction_kg > c.reduction_kg
                    or other.annual_savings_inr > c.annual_savings_inr
                    or other.capex_inr < c.capex_inr
                )
            ):
                dominated = True
                break
        if not dominated:
            non_dominated.append(c)

    return non_dominated[:2000]
