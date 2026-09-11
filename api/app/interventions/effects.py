"""Generic pure effect functions for decarbonisation interventions per PRD §12.3."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PoolState:
    """Current state of physical pools in the factory."""

    grid_kwh: float = 0.0
    melting_fuel_gj: float = 0.0
    dg_diesel_l: float = 0.0
    brass_input_kg: float = 0.0
    secondary_brass_share: float = 0.0
    cutting_oil_kg: float = 0.0
    hazardous_waste_kg: float = 0.0
    packaging_kg: float = 0.0
    freight_tkm: float = 0.0
    solar_generation_kwh: float = 0.0
    side_effects: list[dict[str, Any]] = field(default_factory=list)

    def copy(self) -> "PoolState":
        return PoolState(
            grid_kwh=self.grid_kwh,
            melting_fuel_gj=self.melting_fuel_gj,
            dg_diesel_l=self.dg_diesel_l,
            brass_input_kg=self.brass_input_kg,
            secondary_brass_share=self.secondary_brass_share,
            cutting_oil_kg=self.cutting_oil_kg,
            hazardous_waste_kg=self.hazardous_waste_kg,
            packaging_kg=self.packaging_kg,
            freight_tkm=self.freight_tkm,
            solar_generation_kwh=self.solar_generation_kwh,
            side_effects=list(self.side_effects),
        )


def apply_reduce_fraction(
    qty: float,
    share_of_pool: float = 1.0,
    reduction: float = 0.0,
) -> tuple[float, float]:
    """Reduce fraction of a pool.

    Formula: qty_new = qty * (1 - share_of_pool * reduction)
    Returns: (qty_new, qty_saved)
    """
    fraction_saved = min(1.0, max(0.0, share_of_pool * reduction))
    qty_saved = qty * fraction_saved
    qty_new = max(0.0, qty - qty_saved)
    return qty_new, qty_saved


def apply_fuel_to_electric(
    fuel_gj: float,
    fraction: float = 1.0,
    fuel_efficiency: float = 0.20,
    electric_efficiency: float = 0.65,
) -> tuple[float, float, float]:
    """Convert fuel to electric induction melting.

    Removes fraction of fuel.
    Added kWh = GJ_removed * fuel_efficiency / electric_efficiency / 0.0036
    Returns: (fuel_gj_new, fuel_gj_saved, added_grid_kwh)
    """
    frac = min(1.0, max(0.0, fraction))
    fuel_gj_saved = fuel_gj * frac
    fuel_gj_new = max(0.0, fuel_gj - fuel_gj_saved)

    # 1 kWh = 0.0036 GJ
    if electric_efficiency > 0:
        added_grid_kwh = (fuel_gj_saved * fuel_efficiency / electric_efficiency) / 0.0036
    else:
        added_grid_kwh = 0.0

    return fuel_gj_new, fuel_gj_saved, added_grid_kwh


def apply_shift_to_secondary(
    current_share: float,
    target_level: float | None = None,
    delta: float | None = None,
) -> tuple[float, float]:
    """Shift material input towards secondary (recycled) content.

    Capped at 0.95 maximum per PRD §12.3.
    Returns: (new_secondary_share, delta_increase)
    """
    if target_level is not None:
        new_share = min(0.95, max(current_share, float(target_level)))
    elif delta is not None:
        new_share = min(0.95, current_share + float(delta))
    else:
        new_share = current_share

    actual_delta = max(0.0, new_share - current_share)
    return new_share, actual_delta


def apply_onsite_generation(
    remaining_grid_kwh: float,
    kwp: float,
    yield_kwh_per_kwp: float = 1500.0,
) -> tuple[float, float, float]:
    """Rooftop solar onsite generation capped at remaining load.

    Returns: (remaining_grid_kwh_new, offset_kwh, total_generation_kwh)
    """
    total_generation = max(0.0, float(kwp) * float(yield_kwh_per_kwp))
    offset = min(total_generation, remaining_grid_kwh)
    new_grid_kwh = max(0.0, remaining_grid_kwh - offset)
    return new_grid_kwh, offset, total_generation


def apply_interventions_in_order(
    initial_state: PoolState,
    interventions: list[dict[str, Any]],
) -> tuple[PoolState, list[dict[str, Any]]]:
    """Apply interventions strictly following the fixed deterministic order:

    1. reduce_fraction
    2. fuel_to_electric
    3. shift_to_secondary
    4. onsite_generation
    Within each step, sort by intervention code.
    """
    state = initial_state.copy()

    order_map = {
        "reduce_fraction": 1,
        "fuel_to_electric": 2,
        "shift_to_secondary": 3,
        "onsite_generation": 4,
    }

    def sort_key(itv):
        e_type = itv.get("effect_type", "")
        rank = order_map.get(e_type, 99)
        code = itv.get("code", "")
        return (rank, code)

    sorted_itvs = sorted(interventions, key=sort_key)
    results = []

    for itv in sorted_itvs:
        e_type = itv.get("effect_type")
        pool = itv.get("pool")
        params = itv.get("effect_params", {})
        code = itv.get("code", "")

        res_entry = {"code": code, "effect_type": e_type, "pool": pool}

        if e_type == "reduce_fraction":
            share = float(params.get("share_of_pool", 1.0))
            red = float(params.get("reduction", 0.0))

            if pool == "grid_kwh":
                state.grid_kwh, saved = apply_reduce_fraction(state.grid_kwh, share, red)
                res_entry["saved_quantity"] = saved
                res_entry["unit"] = "kWh"
            elif pool == "melting_fuel":
                state.melting_fuel_gj, saved = apply_reduce_fraction(
                    state.melting_fuel_gj, share, red
                )
                res_entry["saved_quantity"] = saved
                res_entry["unit"] = "GJ"
            elif pool == "dg_diesel":
                state.dg_diesel_l, saved = apply_reduce_fraction(state.dg_diesel_l, share, red)
                res_entry["saved_quantity"] = saved
                res_entry["unit"] = "L"
                # Check for side effects e.g. DG_REDUCTION +3.0 kWh grid per L
                side_effects = params.get("side_effects", [])
                for se in side_effects:
                    if se.get("pool") == "grid_kwh":
                        per_unit = float(se.get("per_unit_removed", 0.0))
                        added_kwh = saved * per_unit
                        state.grid_kwh += added_kwh
                        res_entry["added_grid_kwh"] = added_kwh
            elif pool == "cutting_oil":
                state.cutting_oil_kg, saved = apply_reduce_fraction(
                    state.cutting_oil_kg, share, red
                )
                res_entry["saved_quantity"] = saved
                res_entry["unit"] = "kg"
            elif pool == "hazardous_waste":
                state.hazardous_waste_kg, saved = apply_reduce_fraction(
                    state.hazardous_waste_kg, share, red
                )
                res_entry["saved_quantity"] = saved
                res_entry["unit"] = "kg"
            elif pool == "packaging":
                state.packaging_kg, saved = apply_reduce_fraction(state.packaging_kg, share, red)
                res_entry["saved_quantity"] = saved
                res_entry["unit"] = "kg"
            elif pool == "freight":
                state.freight_tkm, saved = apply_reduce_fraction(state.freight_tkm, share, red)
                res_entry["saved_quantity"] = saved
                res_entry["unit"] = "t*km"

        elif e_type == "fuel_to_electric":
            frac = float(params.get("fraction", 1.0))
            f_eff = float(params.get("fuel_efficiency", 0.20))
            e_eff = float(params.get("electric_efficiency", 0.65))

            state.melting_fuel_gj, saved_gj, added_kwh = apply_fuel_to_electric(
                state.melting_fuel_gj, frac, f_eff, e_eff
            )
            state.grid_kwh += added_kwh
            res_entry["saved_gj"] = saved_gj
            res_entry["added_kwh"] = added_kwh

        elif e_type == "shift_to_secondary":
            levels = params.get("levels")
            target = float(levels[-1]) if levels else None
            delta = float(params.get("delta")) if params.get("delta") is not None else None

            state.secondary_brass_share, delta_inc = apply_shift_to_secondary(
                state.secondary_brass_share, target_level=target, delta=delta
            )
            res_entry["new_secondary_share"] = state.secondary_brass_share
            res_entry["delta_increase"] = delta_inc

        elif e_type == "onsite_generation":
            levels_kwp = params.get("levels_kwp", [50])
            kwp = float(itv.get("chosen_kwp", levels_kwp[-1] if levels_kwp else 50))
            yield_kwh = float(params.get("yield_kwh_per_kwp", 1500.0))

            state.grid_kwh, offset, total_gen = apply_onsite_generation(
                state.grid_kwh, kwp, yield_kwh
            )
            state.solar_generation_kwh += offset
            res_entry["offset_kwh"] = offset
            res_entry["total_generation_kwh"] = total_gen
            res_entry["chosen_kwp"] = kwp

        results.append(res_entry)

    return state, results
