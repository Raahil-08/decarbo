"""Tests for Phase 4 Dashboard API per PRD §17.2, §17.4, and §22."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.models import ActivityRecord


def test_dashboard_empty_factory(client: TestClient, db_session: Session, auth_headers_user_a: dict):
    # 1. Create a factory with no records
    create_res = client.post(
        "/api/v1/factories",
        json={
            "name": "Empty Brass Works",
            "industry": "brass_parts",
            "city": "Jamnagar",
            "state": "Gujarat",
            "annual_output": 1000,
        },
        headers=auth_headers_user_a,
    )
    assert create_res.status_code == 201
    factory_id = create_res.json()["id"]

    # 2. Get dashboard
    dash_res = client.get(f"/api/v1/factories/{factory_id}/dashboard", headers=auth_headers_user_a)
    assert dash_res.status_code == 200
    data = dash_res.json()
    assert data["has_data"] is False
    assert data["annual_tco2e"] == 0.0
    assert len(data["leak_points"]) == 0
    assert len(data["sankey"]["nodes"]) == 0


def test_dashboard_with_activity_records(client: TestClient, db_session: Session, auth_headers_user_a: dict):
    import sys
    from datetime import date
    from pathlib import Path
    base_dir = Path(__file__).resolve().parent.parent.parent
    scripts_dir = base_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from seed import run_seed
    run_seed(session=db_session, seed_dir=base_dir / "data" / "seed")

    # 1. Create factory
    create_res = client.post(
        "/api/v1/factories",
        json={
            "name": "Jamnagar Precision Brass",
            "industry": "brass_parts",
            "city": "Jamnagar",
            "state": "Gujarat",
            "cluster": "Jamnagar Brass",
            "grid_region": "IN-GJ",
            "annual_output": 1200,
            "electricity_tariff_inr_per_kwh": 8.0,
        },
        headers=auth_headers_user_a,
    )
    assert create_res.status_code == 201
    factory_id = create_res.json()["id"]

    # 2. Add realistic activity records
    records_to_add = [
        # Electricity 120,000 kWh
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="grid_electricity",
            quantity=120000.0,
            unit="kWh",
            quantity_canonical=120000.0,
            cost_inr=960000.0,
            status="confirmed",
            confidence=1.0,
        ),
        # Virgin Brass Input 40,000 kg
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
        # Diesel Generator 2,000 L
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="diesel",
            quantity=2000.0,
            unit="L",
            quantity_canonical=2000.0,
            cost_inr=180000.0,
            status="confirmed",
            confidence=1.0,
        ),
        # Road Freight 30,000 t*km
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="road_freight_hgv",
            quantity=30000.0,
            unit="t*km",
            quantity_canonical=30000.0,
            cost_inr=150000.0,
            status="confirmed",
            confidence=1.0,
        ),
    ]
    for r in records_to_add:
        db_session.add(r)
    db_session.commit()

    # 3. Request Dashboard
    dash_res = client.get(f"/api/v1/factories/{factory_id}/dashboard", headers=auth_headers_user_a)
    assert dash_res.status_code == 200
    data = dash_res.json()

    assert data["has_data"] is True
    assert data["annual_tco2e"] > 0
    assert data["scope1_tco2e"] > 0
    assert data["scope2_tco2e"] > 0
    assert data["scope3_tco2e"] > 0

    # Check Sankey
    sankey = data["sankey"]
    assert len(sankey["nodes"]) > 0
    assert len(sankey["links"]) > 0
    node_names = [n["name"] for n in sankey["nodes"]]
    assert "Scope 1 (Direct)" in node_names
    assert "Scope 2 (Electricity)" in node_names
    assert "Scope 3 (Supply Chain)" in node_names

    # Check "View as table" rows
    table_rows = sankey["table_rows"]
    assert len(table_rows) == 4
    total_table_tco2e = sum(r["tco2e"] for r in table_rows)
    assert abs(total_table_tco2e - data["annual_tco2e"]) < 0.5

    # Check Leak Points (Pareto 80% set)
    leak_points = data["leak_points"]
    assert len(leak_points) >= 2
    assert leak_points[0]["rank"] == 1
    # Material input should dominate
    assert leak_points[0]["activity_type"] == "brass_input_primary"
    assert leak_points[0]["best_fix"] is not None
    assert "recycled" in leak_points[0]["best_fix"]["title"].lower()
    assert leak_points[1]["activity_type"] == "grid_electricity"

    # Check Provenance Items
    prov = data["provenance_items"]
    assert len(prov) == 4
    for p in prov:
        assert p["formula"]
        assert "×" in p["formula"]
        assert p["factor_source"]
        assert p["factor_year"] > 2000
