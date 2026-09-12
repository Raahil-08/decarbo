"""Tests for Phase 10 Tracking API per PRD §14.3, §16, and §22."""

import sys
import uuid
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.models import CalcRun, Intervention, Plan, PlanItem


def test_tracking_unauthorized(client: TestClient, auth_headers_user_b: dict):
    fake_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/factories/{fake_id}/tracking", headers=auth_headers_user_b)
    assert res.status_code == 404


def test_tracking_lifecycle_and_progress(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    base_dir = Path(__file__).resolve().parent.parent.parent
    scripts_dir = base_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from seed import run_seed

    run_seed(session=db_session, seed_dir=base_dir / "data" / "seed")

    # 1. Create factory
    f_res = client.post(
        "/api/v1/factories",
        json={
            "name": "Progress Brass Ltd",
            "industry": "brass_parts",
            "city": "Jamnagar",
            "state": "Gujarat",
            "annual_output": 1000,
        },
        headers=auth_headers_user_a,
    )
    assert f_res.status_code == 201
    factory_id = f_res.json()["id"]

    # 2. Add sample calc run & plan & items
    calc_run_id = uuid.uuid4()
    calc_run = CalcRun(
        id=calc_run_id,
        factory_id=uuid.UUID(factory_id),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
        total_kgco2e=200000.0,
        output_quantity=1000.0,
        intensity_kgco2e_per_output=200.0,
        summary={"monthly": []},
    )
    db_session.add(calc_run)
    db_session.commit()

    plan_id = uuid.uuid4()
    plan = Plan(
        id=plan_id,
        factory_id=uuid.UUID(factory_id),
        calc_run_id=calc_run_id,
        mode="target",
        is_selected=True,
        feasible=True,
        inputs={"target_reduction_pct": 25.0, "budget_inr": 1500000},
        totals={"capex_inr": 800000, "annual_savings_inr": 200000, "tco2_cut": 50.0},
    )
    db_session.add(plan)
    db_session.commit()

    # Pick an existing intervention from seed
    itv = db_session.query(Intervention).first()
    assert itv is not None

    pi = PlanItem(
        id=uuid.uuid4(),
        plan_id=plan_id,
        intervention_code=itv.code,
        sequence=1,
        capex_inr=500000,
        annual_savings_inr=150000,
        reduction_kgco2e=30000,  # 30 tCO2e
    )
    db_session.add(pi)
    db_session.commit()

    # 3. GET tracking (should auto-init adoption from active plan)
    trk_res = client.get(
        f"/api/v1/factories/{factory_id}/tracking",
        headers=auth_headers_user_a,
    )
    assert trk_res.status_code == 200
    trk_data = trk_res.json()

    assert trk_data["factory_id"] == factory_id
    assert trk_data["active_plan_id"] == str(plan_id)
    assert len(trk_data["adoptions"]) == 1
    adoption = trk_data["adoptions"][0]
    assert adoption["intervention_code"] == itv.code
    assert adoption["status"] == "planned"
    assert adoption["estimated_reduction_tco2e"] == 30.0

    adoption_id = adoption["id"]

    # Initially, progress_pct is 0% because nothing is done
    assert trk_data["progress_pct"] == 0.0

    # 4. PATCH adoption to in_progress
    patch_res = client.patch(
        f"/api/v1/factories/{factory_id}/tracking/adoptions/{adoption_id}",
        json={
            "status": "in_progress",
            "notes": "Contractor quoted ₹4.8 Lakhs",
        },
        headers=auth_headers_user_a,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["adoption_status"] == "in_progress"

    # 5. PATCH adoption to done with actual capex
    done_res = client.patch(
        f"/api/v1/factories/{factory_id}/tracking/adoptions/{adoption_id}",
        json={
            "status": "done",
            "actual_capex_inr": 480000,
            "completed_on": "2026-06-15",
            "notes": "Commissioned on schedule",
        },
        headers=auth_headers_user_a,
    )
    assert done_res.status_code == 200
    assert done_res.json()["adoption_status"] == "done"

    # 6. Check updated tracking progress
    trk_res2 = client.get(
        f"/api/v1/factories/{factory_id}/tracking",
        headers=auth_headers_user_a,
    )
    assert trk_res2.status_code == 200
    trk_data2 = trk_res2.json()
    # Now completed reduction is 30 tCO2e, so progress_pct should be > 0
    assert trk_data2["progress_pct"] > 0.0
    ad2 = trk_data2["adoptions"][0]
    assert ad2["status"] == "done"
    assert ad2["actual_capex_inr"] == 480000


def test_tracking_production_drift_alert(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    f_res = client.post(
        "/api/v1/factories",
        json={
            "name": "Drifting Brass",
            "industry": "brass_parts",
            "city": "Jamnagar",
            "state": "Gujarat",
            "annual_output": 1000,
        },
        headers=auth_headers_user_a,
    )
    assert f_res.status_code == 201
    factory_id = f_res.json()["id"]

    # Monthly records with >20% production drop in recent window
    calc_run = CalcRun(
        id=uuid.uuid4(),
        factory_id=uuid.UUID(factory_id),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
        total_kgco2e=200000.0,
        output_quantity=1000.0,
        intensity_kgco2e_per_output=200.0,
        summary={
            "monthly": [
                {"month": "2025-01", "kwh": 10000, "output": 100},
                {"month": "2025-02", "kwh": 10000, "output": 100},
                {"month": "2025-03", "kwh": 10000, "output": 100},
                {"month": "2025-04", "kwh": 10000, "output": 100},
                {"month": "2025-05", "kwh": 6000, "output": 50},  # 50% drop
                {"month": "2025-06", "kwh": 6000, "output": 50},
            ]
        },
    )
    db_session.add(calc_run)
    db_session.commit()

    res = client.get(f"/api/v1/factories/{factory_id}/tracking", headers=auth_headers_user_a)
    assert res.status_code == 200
    data = res.json()
    assert data["production_change_alert"] is True
    assert data["production_change_pct"] < -0.20
    assert len(data["trend"]) == 6

