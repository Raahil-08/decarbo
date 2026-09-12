"""Vectorised Monte Carlo uncertainty simulation per PRD §13.5."""

import json
from typing import Any

import numpy as np

from app.interventions.effects import PoolState
from app.interventions.matcher import DEFAULT_PRICES, NCV_MAP
from app.models.models import Intervention


def _parse_dict(val: Any) -> dict[str, Any]:
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return {}
    return {}


def _sample_triangular(
    rng: np.random.Generator,
    low: float,
    mode: float,
    high: float,
    size: int,
) -> np.ndarray:
    """Sample from a triangular distribution, handling degenerate/invalid bounds."""
    low_val = float(low)
    mode_val = float(mode)
    high_val = float(high)

    # Reorder if necessary to satisfy low <= mode <= high
    vals = sorted([low_val, mode_val, high_val])
    low_val, high_val = vals[0], vals[2]
    # Keep mode in between
    mode_val = min(max(mode_val, low_val), high_val)

    if np.isclose(low_val, high_val):
        return np.full(size, mode_val, dtype=np.float64)

    return rng.triangular(low_val, mode_val, high_val, size=size)


def run_monte_carlo(
    chosen_items: list[tuple[Intervention, Any]],
    baseline_state: PoolState,
    tariff_inr: float,
    emission_factors_map: dict[str, float],
    pool_costs: dict[str, float],
    baseline_total_kg: float,
    target_reduction_pct: float | None = None,
    n_samples: int = 1000,
    seed: int = 42,
) -> dict[str, Any]:
    """Run vectorised Monte Carlo uncertainty simulation over chosen plan items.

    Draws N samples of uncertain parameters from triangular distributions (low, mode, high).
    Evaluates exact sequential model vectorised.
    Reports P10 / P50 / P90 for reduction, annual savings, capex, payback, and prob_target_met.
    """
    if not chosen_items:
        return {
            "n_samples": n_samples,
            "seed": seed,
            "prob_target_met": 1.0 if (target_reduction_pct or 0) <= 0 else 0.0,
            "tco2_cut": {"p10": 0.0, "p50": 0.0, "p90": 0.0},
            "annual_savings_inr": {"p10": 0.0, "p50": 0.0, "p90": 0.0},
            "capex_inr": {"p10": 0.0, "p50": 0.0, "p90": 0.0},
            "payback_months": {"p10": None, "p50": None, "p90": None},
        }

    rng = np.random.default_rng(seed=seed)

    # Initialise vectorised pool states (N samples)
    N = n_samples
    grid_kwh = np.full(N, baseline_state.grid_kwh, dtype=np.float64)
    melting_fuel_gj = np.full(N, baseline_state.melting_fuel_gj, dtype=np.float64)
    dg_diesel_l = np.full(N, baseline_state.dg_diesel_l, dtype=np.float64)
    brass_input_kg = np.full(N, baseline_state.brass_input_kg, dtype=np.float64)
    secondary_brass_share = np.full(N, baseline_state.secondary_brass_share, dtype=np.float64)
    cutting_oil_kg = np.full(N, baseline_state.cutting_oil_kg, dtype=np.float64)
    hazardous_waste_kg = np.full(N, baseline_state.hazardous_waste_kg, dtype=np.float64)
    packaging_kg = np.full(N, baseline_state.packaging_kg, dtype=np.float64)
    freight_tkm = np.full(N, baseline_state.freight_tkm, dtype=np.float64)

    tot_capex = np.zeros(N, dtype=np.float64)
    tot_savings = np.zeros(N, dtype=np.float64)

    # Baseline emissions vector
    ef_grid = emission_factors_map.get("grid_electricity", 0.716)
    ef_fuel = emission_factors_map.get("furnace_oil", 73.3)  # kg/GJ
    ef_diesel = emission_factors_map.get("diesel", 2.68)
    ef_primary = emission_factors_map.get("brass_primary", 4.5)
    ef_secondary = emission_factors_map.get("brass_secondary", 0.65)
    ef_oil = emission_factors_map.get("cutting_oil", 1.8)
    ef_haz = emission_factors_map.get("hazardous_waste", 2.1)
    ef_pack = emission_factors_map.get("packaging", 1.2)
    ef_freight = emission_factors_map.get("freight", 0.12)

    base_emissions_kg = (
        grid_kwh * ef_grid
        + melting_fuel_gj * ef_fuel
        + dg_diesel_l * ef_diesel
        + brass_input_kg * (1.0 - secondary_brass_share) * ef_primary
        + brass_input_kg * secondary_brass_share * ef_secondary
        + cutting_oil_kg * ef_oil
        + hazardous_waste_kg * ef_haz
        + packaging_kg * ef_pack
        + freight_tkm * ef_freight
    )

    for itv, level in chosen_items:
        eff = itv.effect_type
        params = _parse_dict(itv.effect_params)
        capex_m = _parse_dict(itv.capex_model)
        savings_m = _parse_dict(itv.savings_model)

        # 1. Sample capex
        c_type = capex_m.get("type", "fixed")
        c_mode = float(capex_m.get("mode", 0.0))
        c_low = float(capex_m.get("low", c_mode))
        c_high = float(capex_m.get("high", c_mode))

        if c_type == "per_kwp":
            kwp = float(level) if level is not None else 50.0
            sampled_unit_capex = _sample_triangular(rng, c_low, c_mode, c_high, N)
            item_capex = sampled_unit_capex * kwp
        else:
            item_capex = _sample_triangular(rng, c_low, c_mode, c_high, N)

        tot_capex += item_capex

        # 2. Opex
        if eff == "onsite_generation":
            kwp = float(level) if level is not None else 50.0
            opex_rate = float(params.get("annual_opex_per_kwp_inr", 500.0))
            annual_opex = kwp * opex_rate
        else:
            annual_opex = float(savings_m.get("annual_opex_inr", 0.0))

        # 3. Apply effect sequentially
        if eff == "reduce_fraction":
            red_mode = float(params.get("reduction", 0.0))
            red_low = float(params.get("reduction_low", red_mode))
            red_high = float(params.get("reduction_high", red_mode))
            sampled_red = _sample_triangular(rng, red_low, red_mode, red_high, N)

            sh_mode = float(params.get("share_of_pool", 1.0))
            sh_low = float(params.get("share_low", sh_mode))
            sh_high = float(params.get("share_high", sh_mode))
            sampled_share = _sample_triangular(rng, sh_low, sh_mode, sh_high, N)

            pool = itv.pool
            if pool == "melting_fuel":
                saved_qty = melting_fuel_gj * sampled_share * sampled_red
                melting_fuel_gj = np.maximum(0.0, melting_fuel_gj - saved_qty)
                p_gj = DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"]
                tot_savings += (saved_qty * p_gj) - annual_opex
            elif pool == "dg_diesel":
                saved_qty = dg_diesel_l * sampled_share * sampled_red
                dg_diesel_l = np.maximum(0.0, dg_diesel_l - saved_qty)
                tot_savings += (saved_qty * DEFAULT_PRICES["diesel"]) - annual_opex
                # Check side effects
                side_effects = params.get("side_effects", [])
                for se in side_effects:
                    if se.get("pool") == "grid_kwh":
                        added_kwh = saved_qty * float(se.get("per_unit_removed", 3.0))
                        grid_kwh += added_kwh
                        tot_savings -= (added_kwh * tariff_inr)
            elif pool == "grid_kwh":
                saved_qty = grid_kwh * sampled_share * sampled_red
                grid_kwh = np.maximum(0.0, grid_kwh - saved_qty)
                tot_savings += (saved_qty * tariff_inr) - annual_opex
            elif pool == "cutting_oil":
                saved_qty = cutting_oil_kg * sampled_share * sampled_red
                cutting_oil_kg = np.maximum(0.0, cutting_oil_kg - saved_qty)
                tot_savings += (saved_qty * DEFAULT_PRICES.get("cutting_oil", 180.0)) - annual_opex
            elif pool == "hazardous_waste":
                saved_qty = hazardous_waste_kg * sampled_share * sampled_red
                hazardous_waste_kg = np.maximum(0.0, hazardous_waste_kg - saved_qty)
                tot_savings += (saved_qty * 12.0) - annual_opex
            elif pool == "packaging":
                saved_qty = packaging_kg * sampled_share * sampled_red
                packaging_kg = np.maximum(0.0, packaging_kg - saved_qty)
                tot_savings += (saved_qty * 45.0) - annual_opex
            elif pool == "freight":
                saved_qty = freight_tkm * sampled_share * sampled_red
                freight_tkm = np.maximum(0.0, freight_tkm - saved_qty)
                tot_savings += (saved_qty * 4.5) - annual_opex

        elif eff == "onsite_generation":
            kwp = float(level) if level is not None else 50.0
            y_mode = float(params.get("yield_kwh_per_kwp", 1500.0))
            y_low = float(params.get("yield_low", y_mode))
            y_high = float(params.get("yield_high", y_mode))
            sampled_yield = _sample_triangular(rng, y_low, y_mode, y_high, N)

            gen_kwh = kwp * sampled_yield
            offset_kwh = np.minimum(gen_kwh, grid_kwh)
            grid_kwh = np.maximum(0.0, grid_kwh - offset_kwh)
            tot_savings += (offset_kwh * tariff_inr) - annual_opex

        elif eff == "fuel_to_electric":
            frac = float(params.get("fraction", 1.0))
            f_mode = float(params.get("fuel_efficiency", 0.20))
            f_low = float(params.get("fuel_eff_low", f_mode))
            f_high = float(params.get("fuel_eff_high", f_mode))
            sampled_fuel_eff = _sample_triangular(rng, f_low, f_mode, f_high, N)

            e_mode = float(params.get("electric_efficiency", 0.65))
            e_low = float(params.get("electric_eff_low", e_mode))
            e_high = float(params.get("electric_eff_high", e_mode))
            sampled_elec_eff = _sample_triangular(rng, e_low, e_mode, e_high, N)

            saved_gj = melting_fuel_gj * frac
            added_kwh = (saved_gj * sampled_fuel_eff / np.maximum(1e-6, sampled_elec_eff)) / 0.0036
            melting_fuel_gj = np.maximum(0.0, melting_fuel_gj - saved_gj)
            grid_kwh += added_kwh

            p_gj = DEFAULT_PRICES["furnace_oil"] / NCV_MAP["furnace_oil"]
            tot_savings += (saved_gj * p_gj) - (added_kwh * tariff_inr) - annual_opex

        elif eff == "shift_to_secondary":
            if "levels" in params:
                target_share = float(level) if level is not None else 0.4
                delta = np.maximum(0.0, target_share - secondary_brass_share)
                secondary_brass_share = np.full(N, target_share)
            else:
                d_mode = float(params.get("delta", 0.15))
                d_low = float(params.get("delta_low", d_mode))
                d_high = float(params.get("delta_high", d_mode))
                delta = _sample_triangular(rng, d_low, d_mode, d_high, N)
                secondary_brass_share = np.minimum(1.0, secondary_brass_share + delta)

            kg_shifted = delta * brass_input_kg
            p_mode = float(params.get("price_diff_inr_per_kg", 0.0))
            p_low = float(params.get("price_diff_low", p_mode))
            p_high = float(params.get("price_diff_high", p_mode))
            sampled_p_diff = _sample_triangular(rng, p_low, p_mode, p_high, N)

            s_mode = float(params.get("scrap_value_gain_inr_per_kg", 0.0))
            s_low = float(params.get("scrap_gain_low", s_mode))
            s_high = float(params.get("scrap_gain_high", s_mode))
            sampled_s_gain = _sample_triangular(rng, s_low, s_mode, s_high, N)

            tot_savings += (kg_shifted * sampled_p_diff) + (kg_shifted * sampled_s_gain * 0.95) - annual_opex

    # Final emissions across all samples
    final_emissions_kg = (
        grid_kwh * ef_grid
        + melting_fuel_gj * ef_fuel
        + dg_diesel_l * ef_diesel
        + brass_input_kg * (1.0 - secondary_brass_share) * ef_primary
        + brass_input_kg * secondary_brass_share * ef_secondary
        + cutting_oil_kg * ef_oil
        + hazardous_waste_kg * ef_haz
        + packaging_kg * ef_pack
        + freight_tkm * ef_freight
    )

    tot_reduction_kg = np.maximum(0.0, base_emissions_kg - final_emissions_kg)
    tco2_cut = tot_reduction_kg / 1000.0
    reduction_pct = (
        (tot_reduction_kg / baseline_total_kg * 100.0)
        if baseline_total_kg > 0
        else np.zeros(N)
    )

    payback_months = np.where(
        tot_savings > 0,
        tot_capex / np.maximum(1e-6, tot_savings) * 12.0,
        9999.0,
    )

    # Compute percentiles P10, P50, P90
    p_cut = np.percentile(tco2_cut, [10, 50, 90])
    p_sav = np.percentile(tot_savings, [10, 50, 90])
    p_cap = np.percentile(tot_capex, [10, 50, 90])
    p_pay = np.percentile(payback_months, [10, 50, 90])

    if target_reduction_pct is not None and target_reduction_pct > 0:
        prob_target_met = float(np.mean(reduction_pct >= target_reduction_pct))
    else:
        prob_target_met = 1.0

    return {
        "n_samples": n_samples,
        "seed": seed,
        "prob_target_met": round(prob_target_met, 3),
        "tco2_cut": {
            "p10": round(float(p_cut[0]), 2),
            "p50": round(float(p_cut[1]), 2),
            "p90": round(float(p_cut[2]), 2),
        },
        "annual_savings_inr": {
            "p10": round(float(p_sav[0]), 2),
            "p50": round(float(p_sav[1]), 2),
            "p90": round(float(p_sav[2]), 2),
        },
        "capex_inr": {
            "p10": round(float(p_cap[0]), 2),
            "p50": round(float(p_cap[1]), 2),
            "p90": round(float(p_cap[2]), 2),
        },
        "payback_months": {
            "p10": round(float(p_pay[0]), 1) if p_pay[0] < 9000 else None,
            "p50": round(float(p_pay[1]), 1) if p_pay[1] < 9000 else None,
            "p90": round(float(p_pay[2]), 1) if p_pay[2] < 9000 else None,
        },
    }
