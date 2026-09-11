"""Tests for Phase 5 Optimizer ("Build my plan") per PRD §12, §13, §14.1, §21, and §22."""

import sys
import time
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.interventions.effects import (
    apply_fuel_to_electric,
    apply_onsite_generation,
    apply_reduce_fraction,
    apply_shift_to_secondary,
)
from app.models.models import ActivityRecord


def test_compounding_on_same_pool():
    """PRD §13.3 & §21: Two 20% reduce_fraction on one pool compound to 36% total, not 40%."""
    initial_qty = 1000.0
    # First 20% cut (share=1.0, reduction=0.20)
    qty_after_1, saved_1 = apply_reduce_fraction(initial_qty, share_of_pool=1.0, reduction=0.20)
    assert qty_after_1 == 800.0
    assert saved_1 == 200.0

    # Second 20% cut on remaining pool
    qty_after_2, saved_2 = apply_reduce_fraction(qty_after_1, share_of_pool=1.0, reduction=0.20)
    assert qty_after_2 == 640.0
    assert saved_2 == 160.0

    total_saved = saved_1 + saved_2
    assert total_saved == 360.0  # 36% cut, not 400.0 (40%)
    assert (total_saved / initial_qty) == pytest.approx(0.36, abs=1e-5)


def test_solar_capped_at_remaining_load():
    """PRD §12.3 & §21: Solar offset capped at remaining load."""
    remaining_load = 5000.0  # kWh
    kwp = 100.0
    yield_kwh = 1500.0  # Total generation = 150,000 kWh

    new_grid, offset, total_gen = apply_onsite_generation(
        remaining_grid_kwh=remaining_load,
        kwp=kwp,
        yield_kwh_per_kwp=yield_kwh,
    )
    assert total_gen == 150000.0
    assert offset == 5000.0  # Capped at remaining load
    assert new_grid == 0.0


def test_induction_furnace_fuel_to_electric():
    """PRD §12.3 & §21: fuel_to_electric energy balance."""
    fuel_gj = 100.0
    fuel_eff = 0.20
    elec_eff = 0.65

    new_fuel, saved_fuel, added_kwh = apply_fuel_to_electric(
        fuel_gj=fuel_gj,
        fraction=1.0,
        fuel_efficiency=fuel_eff,
        electric_efficiency=elec_eff,
    )
    assert new_fuel == 0.0
    assert saved_fuel == 100.0
    # added_kwh = (100 * 0.20 / 0.65) / 0.0036 ≈ 8547.0 kWh
    expected_kwh = (100.0 * (fuel_eff / elec_eff)) / 0.0036
    assert added_kwh == pytest.approx(expected_kwh, rel=1e-3)


def test_shift_to_secondary_cap():
    """PRD §12.3 & §21: Secondary share capped at 0.95."""
    new_share, delta = apply_shift_to_secondary(
        current_share=0.20,
        target_level=0.99,
    )
    assert new_share == 0.95
    assert delta == pytest.approx(0.75, abs=1e-5)


def test_optimizer_three_plans_and_ledger_sum(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """PRD §21 & §22 Acceptance Criteria:
    - Three plans generated in < 3 s
    - Ledger items sum exactly to totals
    - All constraints respected
    """
    base_dir = Path(__file__).resolve().parent.parent.parent
    scripts_dir = base_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from seed import run_seed
    run_seed(session=db_session, seed_dir=base_dir / "data" / "seed")

    # 1. Create factory
    factory_res = client.post(
        "/api/v1/factories",
        json={
            "name": "Jamnagar Brass Precision",
            "industry": "brass_parts",
            "city": "Jamnagar",
            "state": "Gujarat",
            "cluster": "Jamnagar Brass",
            "grid_region": "IN-GJ",
            "annual_output": 1200,
            "roof_area_m2": 2500,
            "electricity_tariff_inr_per_kwh": 7.8,
        },
        headers=auth_headers_user_a,
    )
    assert factory_res.status_code == 201
    factory_id = factory_res.json()["id"]

    # 2. Add realistic records
    records = [
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="grid_electricity",
            quantity=120000.0,
            unit="kWh",
            quantity_canonical=120000.0,
            cost_inr=936000.0,
            status="confirmed",
            confidence=1.0,
        ),
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="brass_input_primary",
            quantity=40000.0,
            unit="kg",
            quantity_canonical=40000.0,
            cost_inr=24000000.0,
            status="confirmed",
            confidence=1.0,
        ),
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="furnace_oil",
            quantity=1100.0,
            unit="kg",
            quantity_canonical=1100.0,
            cost_inr=60500.0,
            status="confirmed",
            confidence=1.0,
        ),
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="diesel",
            quantity=1500.0,
            unit="L",
            quantity_canonical=1500.0,
            cost_inr=135000.0,
            status="confirmed",
            confidence=1.0,
        ),
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="road_freight_hgv",
            quantity=25000.0,
            unit="t*km",
            quantity_canonical=25000.0,
            cost_inr=125000.0,
            status="confirmed",
            confidence=1.0,
        ),
    ]
    for r in records:
        db_session.add(r)
    db_session.commit()

    # 3. Generate plans: ₹10 L budget, 20% target
    t0 = time.time()
    plan_res = client.post(
        f"/api/v1/factories/{factory_id}/plans",
        json={
            "budget_inr": 1000000.0,  # ₹10 Lakhs
            "target_reduction_pct": 20.0,
            "horizon_months": 24,
            "max_payback_months": 36.0,
        },
        headers=auth_headers_user_a,
    )
    elapsed = time.time() - t0

    assert plan_res.status_code == 201, plan_res.text
    data = plan_res.json()

    # ACCEPTANCE CRITERIA 1: Three plans in < 3 s
    assert elapsed < 3.0, f"Plan generation took {elapsed:.2f}s, expected < 3.0s"
    plans = data["plans"]
    assert len(plans) == 3

    plan_modes = [p["mode"] for p in plans]
    assert "best_value" in plan_modes
    assert "min_capex_for_target" in plan_modes
    assert "max_reduction_in_budget" in plan_modes

    # ACCEPTANCE CRITERIA 2: Ledger items sum EXACTLY to plan totals (0.00% gap)
    for p in plans:
        ledger = p["ledger"]
        totals = p["totals"]

        if ledger:
            sum_reduction_kg = sum(item["reduction_kgco2e"] for item in ledger)
            sum_capex = sum(item["capex_inr"] for item in ledger)
            sum_savings = sum(item["annual_savings_inr"] for item in ledger)

            assert sum_reduction_kg == pytest.approx(totals["reduction_kg"], abs=0.05), (
                f"Plan {p['mode']} reduction mismatch: ledger {sum_reduction_kg} vs total {totals['reduction_kg']}"
            )
            assert sum_capex == pytest.approx(totals["capex_inr"], abs=0.05), (
                f"Plan {p['mode']} capex mismatch: ledger {sum_capex} vs total {totals['capex_inr']}"
            )
            assert sum_savings == pytest.approx(totals["annual_savings_inr"], abs=0.05), (
                f"Plan {p['mode']} savings mismatch: ledger {sum_savings} vs total {totals['annual_savings_inr']}"
            )

    # Verify MACC curve returned
    macc = data["macc"]
    assert len(macc) > 0
    # MACC items have cumulative tco2 and cost per tonne
    for bar in macc:
        assert "tco2_cut" in bar
        assert "cost_per_tonne_inr" in bar
        assert "in_selected_plan" in bar


def test_infeasible_target_handling(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """PRD §13.4 & §21: Infeasible target returns best-in-budget and minimum budget needed."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    scripts_dir = base_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from seed import run_seed
    run_seed(session=db_session, seed_dir=base_dir / "data" / "seed")

    # 1. Create factory
    factory_res = client.post(
        "/api/v1/factories",
        json={
            "name": "Jamnagar Extreme",
            "industry": "brass_parts",
            "city": "Jamnagar",
            "state": "Gujarat",
            "cluster": "Jamnagar Brass",
            "grid_region": "IN-GJ",
            "annual_output": 1200,
        },
        headers=auth_headers_user_a,
    )
    factory_id = factory_res.json()["id"]

    # 2. Add records
    db_session.add(
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="grid_electricity",
            quantity=100000.0,
            unit="kWh",
            quantity_canonical=100000.0,
            cost_inr=800000.0,
            status="confirmed",
            confidence=1.0,
        )
    )
    db_session.commit()

    # 3. Request impossible 90% cut with tiny ₹20,000 budget
    plan_res = client.post(
        f"/api/v1/factories/{factory_id}/plans",
        json={
            "budget_inr": 20000.0,
            "target_reduction_pct": 90.0,
            "horizon_months": 24,
        },
        headers=auth_headers_user_a,
    )
    assert plan_res.status_code == 201
    data = plan_res.json()
    plans = data["plans"]

    plan_b = next((p for p in plans if p["mode"] == "min_capex_for_target"), None)
    assert plan_b is not None
    assert plan_b["feasible"] is False
    assert plan_b["message"] is not None
    assert "needs about" in plan_b["message"]


def test_plans_list_and_select(
    client: TestClient, db_session: Session, auth_headers_user_a: dict, auth_headers_user_b: dict
):
    """PRD Non-negotiable 7: RLS and access control; plan selection endpoint."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    scripts_dir = base_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from seed import run_seed
    run_seed(session=db_session, seed_dir=base_dir / "data" / "seed")

    # 1. Create factory
    factory_res = client.post(
        "/api/v1/factories",
        json={
            "name": "Access Test Factory",
            "industry": "brass_parts",
            "city": "Jamnagar",
            "state": "Gujarat",
        },
        headers=auth_headers_user_a,
    )
    factory_id = factory_res.json()["id"]

    db_session.add(
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="grid_electricity",
            quantity=50000.0,
            unit="kWh",
            quantity_canonical=50000.0,
            cost_inr=400000.0,
            status="confirmed",
            confidence=1.0,
        )
    )
    db_session.commit()

    # Generate plans
    plan_res = client.post(
        f"/api/v1/factories/{factory_id}/plans",
        json={"budget_inr": 500000.0, "target_reduction_pct": 10.0},
        headers=auth_headers_user_a,
    )
    assert plan_res.status_code == 201
    created_plans = plan_res.json()["plans"]
    plan_c_id = created_plans[2]["id"]

    # 2. List plans
    list_res = client.get(f"/api/v1/factories/{factory_id}/plans", headers=auth_headers_user_a)
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 3

    # 3. Select Plan C
    select_res = client.patch(
        f"/api/v1/factories/{factory_id}/plans/{plan_c_id}/select",
        headers=auth_headers_user_a,
    )
    assert select_res.status_code == 200
    assert select_res.json()["selected_plan_id"] == plan_c_id

    # 4. Non-member access check (User B cannot access User A's factory)
    b_res = client.get(f"/api/v1/factories/{factory_id}/plans", headers=auth_headers_user_b)
    assert b_res.status_code == 404
