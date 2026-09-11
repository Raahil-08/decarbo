"""Mixed-Integer Linear Programming (MILP) solver using Google OR-Tools per PRD §13.4 Step 2."""

from typing import Any

from ortools.linear_solver import pywraplp

from app.optimizer.combinations import PoolCombination


class OptimizerSolver:
    """MILP Solver over pre-computed pool combinations."""

    def __init__(
        self,
        pool_combinations: dict[str, list[PoolCombination]],
        cross_conflicts: list[tuple[str, str]] | None = None,
        cross_requires: list[tuple[str, str]] | None = None,
    ):
        self.pools = pool_combinations
        self.cross_conflicts = cross_conflicts or []
        self.cross_requires = cross_requires or []

    def _solve_internal(
        self,
        mode: str,
        budget_inr: float,
        baseline_total_kg: float,
        target_reduction_pct: float | None = None,
        max_payback_months: float | None = None,
        max_difficulty: int | None = None,
        weights: dict[str, float] | None = None,
        excluded_codes: list[str] | None = None,
        forced_codes: list[str] | None = None,
        target_tightening_kg: float = 0.0,
    ) -> tuple[dict[str, PoolCombination] | None, bool]:
        """Low-level MILP formulation and solve without recursion."""
        excluded = set(excluded_codes or [])
        forced = set(forced_codes or [])

        # Create SCIP solver instance (or CBC fallback)
        solver = pywraplp.Solver.CreateSolver("SCIP")
        if not solver:
            solver = pywraplp.Solver.CreateSolver("CBC")
        if not solver:
            raise RuntimeError("OR-Tools MILP solver backend (SCIP/CBC) not available.")

        # 1. Variables: y[pool_name, combo_id]
        y: dict[tuple[str, int], Any] = {}
        for p_name, combos in self.pools.items():
            for c in combos:
                y[(p_name, c.id)] = solver.BoolVar(f"y_{p_name}_{c.id}")

        # 2. Constraint: Exactly one combination per pool
        for p_name, combos in self.pools.items():
            solver.Add(solver.Sum([y[(p_name, c.id)] for c in combos]) == 1)

        # 3. Constraint: Excluded & Forced codes
        for code in excluded:
            matching = [
                y[(p_name, c.id)]
                for p_name, combos in self.pools.items()
                for c in combos
                if code in c.codes
            ]
            if matching:
                solver.Add(solver.Sum(matching) == 0)

        for code in forced:
            matching = [
                y[(p_name, c.id)]
                for p_name, combos in self.pools.items()
                for c in combos
                if code in c.codes
            ]
            if matching:
                solver.Add(solver.Sum(matching) == 1)

        # 4. Constraint: Max difficulty
        if max_difficulty is not None:
            for p_name, combos in self.pools.items():
                for c in combos:
                    if c.max_difficulty > max_difficulty:
                        solver.Add(y[(p_name, c.id)] == 0)

        # 5. Constraint: Cross-pool conflicts
        for a_code, b_code in self.cross_conflicts:
            matching_a = [
                y[(p_name, c.id)]
                for p_name, combos in self.pools.items()
                for c in combos
                if a_code in c.codes
            ]
            matching_b = [
                y[(p_name, c.id)]
                for p_name, combos in self.pools.items()
                for c in combos
                if b_code in c.codes
            ]
            if matching_a and matching_b:
                solver.Add(solver.Sum(matching_a) + solver.Sum(matching_b) <= 1)

        # 6. Constraint: Cross-pool requires
        for a_code, b_code in self.cross_requires:
            matching_a = [
                y[(p_name, c.id)]
                for p_name, combos in self.pools.items()
                for c in combos
                if a_code in c.codes
            ]
            matching_b = [
                y[(p_name, c.id)]
                for p_name, combos in self.pools.items()
                for c in combos
                if b_code in c.codes
            ]
            if matching_a and matching_b:
                solver.Add(solver.Sum(matching_a) <= solver.Sum(matching_b))

        # 7. Constraint: Payback filter (linear form)
        if max_payback_months is not None and max_payback_months > 0:
            payback_years = max_payback_months / 12.0
            total_capex_expr = solver.Sum(
                [c.capex_inr * y[(p_name, c.id)] for p_name, combos in self.pools.items() for c in combos]
            )
            total_savings_expr = solver.Sum(
                [c.annual_savings_inr * y[(p_name, c.id)] for p_name, combos in self.pools.items() for c in combos]
            )
            solver.Add(total_capex_expr <= payback_years * total_savings_expr)

        # 8. Constraints for Mode-specific limits
        target_kg = 0.0
        if target_reduction_pct is not None and target_reduction_pct > 0:
            target_kg = (target_reduction_pct / 100.0) * baseline_total_kg + target_tightening_kg

        # Budget constraint (not applied in min_capex_for_target)
        if mode != "min_capex_for_target" and budget_inr < 1e12:
            solver.Add(
                solver.Sum(
                    [c.capex_inr * y[(p_name, c.id)] for p_name, combos in self.pools.items() for c in combos]
                )
                <= budget_inr
            )

        # Target constraint
        if target_kg > 0:
            solver.Add(
                solver.Sum(
                    [c.reduction_kg * y[(p_name, c.id)] for p_name, combos in self.pools.items() for c in combos]
                )
                >= target_kg
            )

        # 9. Objectives
        if mode == "min_capex_for_target":
            solver.Minimize(
                solver.Sum(
                    [c.capex_inr * y[(p_name, c.id)] for p_name, combos in self.pools.items() for c in combos]
                )
            )

        elif mode == "max_reduction_in_budget":
            solver.Maximize(
                solver.Sum(
                    [c.reduction_kg * y[(p_name, c.id)] for p_name, combos in self.pools.items() for c in combos]
                )
            )

        else:  # "best_value"
            w = weights or {"co2": 0.5, "savings": 0.3, "low_capex": 0.1, "circularity": 0.1}
            w_co2 = float(w.get("co2", 0.5))
            w_sav = float(w.get("savings", 0.3))
            w_capex = float(w.get("low_capex", 0.1))
            w_circ = float(w.get("circularity", 0.1))

            max_red = max(
                1.0,
                sum(
                    max(c.reduction_kg for c in combos)
                    for combos in self.pools.values()
                ),
            )
            max_sav = max(
                1.0,
                sum(
                    max(c.annual_savings_inr for c in combos)
                    for combos in self.pools.values()
                ),
            )
            max_cap = max(1.0, budget_inr if budget_inr < 1e12 else 5000000.0)
            max_circ = max(
                1.0,
                sum(
                    max(c.circularity_points for c in combos)
                    for combos in self.pools.values()
                ),
            )

            obj_terms = []
            for p_name, combos in self.pools.items():
                for c in combos:
                    score = (
                        w_co2 * (c.reduction_kg / max_red)
                        + w_sav * (c.annual_savings_inr / max_sav)
                        - w_capex * (c.capex_inr / max_cap)
                        + w_circ * (c.circularity_points / max_circ)
                    )
                    obj_terms.append(score * y[(p_name, c.id)])

            solver.Maximize(solver.Sum(obj_terms))

        status = solver.Solve()

        if status in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
            chosen = {}
            for p_name, combos in self.pools.items():
                for c in combos:
                    if y[(p_name, c.id)].solution_value() > 0.5:
                        chosen[p_name] = c
                        break
            return chosen, True

        return None, False

    def solve(
        self,
        mode: str,
        budget_inr: float,
        baseline_total_kg: float,
        target_reduction_pct: float | None = None,
        max_payback_months: float | None = None,
        max_difficulty: int | None = None,
        weights: dict[str, float] | None = None,
        excluded_codes: list[str] | None = None,
        forced_codes: list[str] | None = None,
        target_tightening_kg: float = 0.0,
    ) -> tuple[dict[str, PoolCombination] | None, bool, str | None, float | None]:
        """Solve MILP for requested mode with graceful fallback on infeasibility."""
        chosen, feasible = self._solve_internal(
            mode=mode,
            budget_inr=budget_inr,
            baseline_total_kg=baseline_total_kg,
            target_reduction_pct=target_reduction_pct,
            max_payback_months=max_payback_months,
            max_difficulty=max_difficulty,
            weights=weights,
            excluded_codes=excluded_codes,
            forced_codes=forced_codes,
            target_tightening_kg=target_tightening_kg,
        )

        if feasible and chosen:
            return chosen, True, None, None

        # INFEASIBLE HANDLING per PRD §13.4
        # 1. Best achievable reduction within budget
        best_achievable_combos, _ = self._solve_internal(
            mode="max_reduction_in_budget",
            budget_inr=budget_inr,
            baseline_total_kg=baseline_total_kg,
            target_reduction_pct=None,
            max_payback_months=max_payback_months,
            max_difficulty=max_difficulty,
            excluded_codes=excluded_codes,
            forced_codes=forced_codes,
        )

        # 2. Minimum budget needed to reach target (without budget constraint)
        min_budget_needed = None
        if target_reduction_pct and target_reduction_pct > 0:
            min_cap_combos, min_feas = self._solve_internal(
                mode="min_capex_for_target",
                budget_inr=1e13,  # unconstrained budget
                baseline_total_kg=baseline_total_kg,
                target_reduction_pct=target_reduction_pct,
                max_payback_months=max_payback_months,
                max_difficulty=max_difficulty,
                excluded_codes=excluded_codes,
                forced_codes=forced_codes,
            )
            if min_feas and min_cap_combos:
                min_budget_needed = sum(c.capex_inr for c in min_cap_combos.values())

        achievable_cut_pct = 0.0
        if best_achievable_combos and baseline_total_kg > 0:
            ach_kg = sum(c.reduction_kg for c in best_achievable_combos.values())
            achievable_cut_pct = (ach_kg / baseline_total_kg) * 100.0

        target_str = f"{target_reduction_pct:.0f}%" if target_reduction_pct else "target"
        budget_lakh = budget_inr / 100000.0
        min_budget_str = f"₹{min_budget_needed / 100000.0:.1f} L" if min_budget_needed else "a higher budget"
        msg = f"A {target_str} cut needs about {min_budget_str}. With ₹{budget_lakh:.1f} L the biggest cut is {achievable_cut_pct:.1f}%."

        return best_achievable_combos, False, msg, min_budget_needed
