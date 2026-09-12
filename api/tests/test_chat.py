"""Tests for Phase 10 Ask Decarbo Chat API per PRD §15.2, §15.3, §15.5, and §22."""

import sys
import uuid
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.models import CalcRun


def test_chat_unauthorized(client: TestClient, auth_headers_user_b: dict):
    fake_id = str(uuid.uuid4())
    res = client.post(
        f"/api/v1/factories/{fake_id}/chat",
        json={"message": "What is our carbon footprint?"},
        headers=auth_headers_user_b,
    )
    assert res.status_code == 404


def test_chat_offline_intents_and_grounding(
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
            "name": "Chat Precision Brass",
            "industry": "brass_parts",
            "city": "Jamnagar",
            "state": "Gujarat",
            "annual_output": 1200,
        },
        headers=auth_headers_user_a,
    )
    assert f_res.status_code == 201
    factory_id = f_res.json()["id"]

    # 2. Add CalcRun with summary data
    calc_run = CalcRun(
        id=uuid.uuid4(),
        factory_id=uuid.UUID(factory_id),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
        total_kgco2e=150000.0,
        output_quantity=1200.0,
        intensity_kgco2e_per_output=125.0,
        summary={
            "by_scope": {"scope1": 30000.0, "scope2": 80000.0, "scope3": 40000.0},
            "by_activity": [
                {"activity_type": "electricity_grid", "kgco2e": 80000.0, "share": 0.533},
                {"activity_type": "furnace_oil", "kgco2e": 30000.0, "share": 0.200},
            ],
            "total_kgco2e": 150000.0,
        },
    )
    db_session.add(calc_run)
    db_session.commit()

    # 3. Test non-streaming chat for hotspots
    res_hotspots = client.post(
        f"/api/v1/factories/{factory_id}/chat",
        json={"message": "What are our biggest carbon hotspots?", "stream": False},
        headers=auth_headers_user_a,
    )
    assert res_hotspots.status_code == 200
    data_h = res_hotspots.json()
    assert "leak-points" in data_h["message"].lower() or "hotspots" in data_h["message"].lower()
    assert data_h["grounded"] is True
    assert len(data_h["tool_calls"]) > 0
    assert data_h["tool_calls"][0]["name"] == "get_hotspots"

    # 4. Test non-streaming chat for inventory / footprint
    res_inv = client.post(
        f"/api/v1/factories/{factory_id}/chat",
        json={"message": "What is our total carbon footprint?", "stream": False},
        headers=auth_headers_user_a,
    )
    assert res_inv.status_code == 200
    data_inv = res_inv.json()
    assert "150.0" in data_inv["message"] or "150" in data_inv["message"]
    assert "Scope 1" in data_inv["message"]
    assert data_inv["grounded"] is True

    # 5. Test non-streaming chat for simulation
    res_sim = client.post(
        f"/api/v1/factories/{factory_id}/chat",
        json={"message": "What if we install rooftop solar and improve furnace efficiency?", "stream": False},
        headers=auth_headers_user_a,
    )
    assert res_sim.status_code == 200
    data_sim = res_sim.json()
    assert "simulated" in data_sim["message"].lower()
    assert data_sim["grounded"] is True

    # 6. Test SSE streaming response
    res_stream = client.post(
        f"/api/v1/factories/{factory_id}/chat",
        json={"message": "Where are our carbon leaks?", "stream": True},
        headers=auth_headers_user_a,
    )
    assert res_stream.status_code == 200
    assert "text/event-stream" in res_stream.headers["content-type"]
    content = res_stream.text
    assert "data: " in content
    assert '"type": "text_delta"' in content
    assert '"type": "done"' in content
