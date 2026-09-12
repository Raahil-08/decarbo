"""Budget frontier generator per PRD §13.6 ("What more budget buys")."""

from typing import Any

from app.interventions.effects import PoolState
from app.optimizer.evaluator import evaluate_plan_exact, order_ledger_items
from app.optimizer.solver import OptimizerSolver


def compute_budget_frontier(
    solver: OptimizerSolver,
    user_budget_inr: float,
    baseline_total_kg: float,
    baseline_state: PoolState,
    tariff_inr: float,
    emission_factors_map: dict[str, float],
    pool_costs: dict[str, float],
    weights: dict[str, float] | None = None,
    excluded_codes: list[str] | None = None,
    forced_codes: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Solve max_reduction_in_budget across 10 budget levels from 0 to 150% of user budget.

    Returns points {budget_inr, reduction_pct, annual_savings_inr, tco2_cut, is_user_budget}
    for the 'What more budget buys' step chart.
    """
    if user_budget_inr <= 0:
        return [
            {
                "budget_inr": 0.0,
                "capex_inr": 0.0,
                "reduction_pct": 0.0,
                "annual_savings_inr": 0.0,
                "tco2_cut": 0.0,
                "is_user_budget": True,
            }
        ]

    # 10 multipliers spanning 0 to 150%, guaranteeing exact user budget at 1.0
    multipliers = [0.0, 0.15, 0.30, 0.50, 0.70, 0.85, 1.0, 1.15, 1.30, 1.50]
    frontier: list[dict[str, Any]] = []

    max_red_seen = 0.0
    max_tco2_seen = 0.0
    max_savings_seen = 0.0

    for m in multipliers:
        b = round(user_budget_inr * m, 2)
        is_user = abs(m - 1.0) < 1e-4

        if b <= 0:
            frontier.append({
                "budget_inr": 0.0,
                "capex_inr": 0.0,
                "reduction_pct": 0.0,
                "annual_savings_inr": 0.0,
                "tco2_cut": 0.0,
                "is_user_budget": is_user,
            })
            continue

        chosen_combos, feas, _, _ = solver.solve(
            mode="max_reduction_in_budget",
            budget_inr=b,
            baseline_total_kg=baseline_total_kg,
            target_reduction_pct=None,
            max_payback_months=None,
            max_difficulty=None,
            weights=weights,
            excluded_codes=excluded_codes,
            forced_codes=forced_codes,
        )

        if feas and chosen_combos:
            raw_items = [
                (itv, level)
                for c in chosen_combos.values()
                for itv, level in c.items
            ]
            ordered = order_ledger_items(
                raw_items, baseline_state, tariff_inr, emission_factors_map, pool_costs
            )
            _, totals = evaluate_plan_exact(
                ordered, baseline_state, tariff_inr, emission_factors_map, pool_costs, baseline_total_kg
            )
            red_pct = max(max_red_seen, float(totals.get("reduction_pct", 0.0)))
            tco2 = max(max_tco2_seen, float(totals.get("reduction_tco2e", 0.0)))
            savings = max(max_savings_seen, float(totals.get("annual_savings_inr", 0.0)))
            capex = float(totals.get("capex_inr", 0.0))

            max_red_seen = red_pct
            max_tco2_seen = tco2
            max_savings_seen = savings

            frontier.append({
                "budget_inr": b,
                "capex_inr": round(capex, 2),
                "reduction_pct": round(red_pct, 1),
                "annual_savings_inr": round(savings, 2),
                "tco2_cut": round(tco2, 2),
                "is_user_budget": is_user,
            })
        else:
            frontier.append({
                "budget_inr": b,
                "capex_inr": 0.0,
                "reduction_pct": round(max_red_seen, 1),
                "annual_savings_inr": round(max_savings_seen, 2),
                "tco2_cut": round(max_tco2_seen, 2),
                "is_user_budget": is_user,
            })

    return frontier
