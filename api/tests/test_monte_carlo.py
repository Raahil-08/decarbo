"""Tests for Monte Carlo uncertainty and Budget Frontier per PRD §13.5, §13.6, §21, and §22."""

import pytest

from app.interventions.effects import PoolState
from app.models.models import Intervention
from app.optimizer.monte_carlo import run_monte_carlo


def test_monte_carlo_reproducibility():
    """PRD §13.5 & §21: Monte Carlo is deterministic and reproducible with fixed seed."""
    itv = Intervention(
        code="CA_LEAK_FIX",
        title_en="Fix compressed air leaks",
        category="energy_efficiency",
        pool="grid_kwh",
        effect_type="reduce_fraction",
        effect_params={"share_of_pool": 0.15, "reduction": 0.20, "reduction_low": 0.10, "reduction_high": 0.30},
        capex_model={"type": "fixed", "mode": 40000, "low": 20000, "high": 80000},
        savings_model={"type": "energy_kwh"},
        lifetime_years=2,
        difficulty=1,
    )

    baseline = PoolState(grid_kwh=100000.0)
    ef_map = {"grid_electricity": 0.716}
    pool_costs = {}

    res1 = run_monte_carlo(
        chosen_items=[(itv, None)],
        baseline_state=baseline,
        tariff_inr=8.0,
        emission_factors_map=ef_map,
        pool_costs=pool_costs,
        baseline_total_kg=71600.0,
        target_reduction_pct=2.0,
        n_samples=1000,
        seed=42,
    )

    res2 = run_monte_carlo(
        chosen_items=[(itv, None)],
        baseline_state=baseline,
        tariff_inr=8.0,
        emission_factors_map=ef_map,
        pool_costs=pool_costs,
        baseline_total_kg=71600.0,
        target_reduction_pct=2.0,
        n_samples=1000,
        seed=42,
    )

    assert res1 == res2
    assert res1["seed"] == 42
    assert res1["n_samples"] == 1000


def test_monte_carlo_percentile_ordering():
    """PRD §13.5 & §21: P10 <= P50 <= P90 for all metrics."""
    itv = Intervention(
        code="IE3_MOTORS",
        title_en="IE3 Motors",
        category="energy_efficiency",
        pool="grid_kwh",
        effect_type="reduce_fraction",
        effect_params={"share_of_pool": 0.20, "reduction": 0.05, "reduction_low": 0.03, "reduction_high": 0.08},
        capex_model={"type": "fixed", "mode": 300000, "low": 200000, "high": 450000},
        savings_model={"type": "energy_kwh"},
        lifetime_years=15,
        difficulty=2,
    )

    baseline = PoolState(grid_kwh=200000.0)
    ef_map = {"grid_electricity": 0.716}
    pool_costs = {}

    res = run_monte_carlo(
        chosen_items=[(itv, None)],
        baseline_state=baseline,
        tariff_inr=8.0,
        emission_factors_map=ef_map,
        pool_costs=pool_costs,
        baseline_total_kg=143200.0,
        target_reduction_pct=1.0,
        n_samples=1000,
        seed=42,
    )

    # Check P10 <= P50 <= P90
    for metric in ["tco2_cut", "annual_savings_inr", "capex_inr"]:
        p = res[metric]
        assert p["p10"] <= p["p50"] <= p["p90"], f"Ordering failed for {metric}: {p}"

    assert 0.0 <= res["prob_target_met"] <= 1.0


def test_monte_carlo_degenerate_equals_deterministic():
    """PRD §21: If low == mode == high, Monte Carlo equals the deterministic value."""
    itv = Intervention(
        code="FIXED_EFF",
        title_en="Fixed Test",
        category="energy_efficiency",
        pool="grid_kwh",
        effect_type="reduce_fraction",
        effect_params={"share_of_pool": 1.0, "reduction": 0.20, "reduction_low": 0.20, "reduction_high": 0.20},
        capex_model={"type": "fixed", "mode": 50000, "low": 50000, "high": 50000},
        savings_model={"type": "energy_kwh"},
        lifetime_years=5,
        difficulty=1,
    )

    baseline = PoolState(grid_kwh=10000.0)
    ef_map = {"grid_electricity": 0.716}
    pool_costs = {}

    res = run_monte_carlo(
        chosen_items=[(itv, None)],
        baseline_state=baseline,
        tariff_inr=8.0,
        emission_factors_map=ef_map,
        pool_costs=pool_costs,
        baseline_total_kg=7160.0,
        target_reduction_pct=15.0,
        n_samples=500,
        seed=42,
    )

    # 10,000 * 0.20 = 2,000 kWh saved * 0.716 = 1,432 kgCO2 = 1.43 tCO2 cut
    assert res["tco2_cut"]["p10"] == pytest.approx(1.43, abs=0.02)
    assert res["tco2_cut"]["p50"] == pytest.approx(1.43, abs=0.02)
    assert res["tco2_cut"]["p90"] == pytest.approx(1.43, abs=0.02)
    # Capex exactly 50,000
    assert res["capex_inr"]["p10"] == 50000.0
    assert res["capex_inr"]["p50"] == 50000.0
    assert res["capex_inr"]["p90"] == 50000.0
    # Reduction is 20%, target is 15%, so probability target met is 1.0
    assert res["prob_target_met"] == 1.0


def test_budget_frontier_computation():
    """PRD §13.6: Budget frontier produces 10 points with monotonic reduction."""
    from app.optimizer.combinations import PoolCombination
    from app.optimizer.frontier import compute_budget_frontier
    from app.optimizer.solver import OptimizerSolver

    # Mock combinations for 2 pools
    c1 = PoolCombination(id=0, pool="grid_kwh", items=[], reduction_kg=0.0, capex_inr=0.0, annual_savings_inr=0.0)
    c2 = PoolCombination(id=1, pool="grid_kwh", items=[], reduction_kg=5000.0, capex_inr=100000.0, annual_savings_inr=50000.0)
    c3 = PoolCombination(id=2, pool="grid_kwh", items=[], reduction_kg=12000.0, capex_inr=300000.0, annual_savings_inr=120000.0)

    pools = {"grid_kwh": [c1, c2, c3]}
    solver = OptimizerSolver(pool_combinations=pools)
    baseline = PoolState(grid_kwh=50000.0)

    frontier = compute_budget_frontier(
        solver=solver,
        user_budget_inr=200000.0,
        baseline_total_kg=35800.0,
        baseline_state=baseline,
        tariff_inr=8.0,
        emission_factors_map={"grid_electricity": 0.716},
        pool_costs={},
    )

    assert len(frontier) == 10
    # Point 0 is 0 INR
    assert frontier[0]["budget_inr"] == 0.0
    assert frontier[0]["reduction_pct"] == 0.0
    # Has a point corresponding to user budget
    user_points = [p for p in frontier if p["is_user_budget"]]
    assert len(user_points) == 1
    assert user_points[0]["budget_inr"] == 200000.0

    # Non-decreasing reduction_pct
    for i in range(1, len(frontier)):
        assert frontier[i]["reduction_pct"] >= frontier[i - 1]["reduction_pct"]

