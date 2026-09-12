"""Tests for Phase 7 What-if Simulator per PRD §14.2 and §22."""

import sys
import time
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.models import ActivityRecord


def _seed_and_create_factory(client, db_session, auth_headers):
    """Helper: seed the DB and create a factory with realistic activity records."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    scripts_dir = base_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from seed import run_seed
    run_seed(session=db_session, seed_dir=base_dir / "data" / "seed")

    factory_res = client.post(
        "/api/v1/factories",
        json={
            "name": "Test Brass Works",
            "industry": "brass_components",
            "city": "Jamnagar",
            "state": "Gujarat",
            "cluster": "Jamnagar Brass",
            "grid_region": "IN-GJ",
            "annual_output": 1200,
            "roof_area_m2": 2500,
            "electricity_tariff_inr_per_kwh": 7.8,
        },
        headers=auth_headers,
    )
    assert factory_res.status_code == 201
    factory_id = factory_res.json()["id"]

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

    return factory_id


def test_simulate_empty_levers(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """Empty levers → no reduction, before == after."""
    factory_id = _seed_and_create_factory(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {}},
        headers=auth_headers_user_a,
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["reduction_kgco2e"] == 0.0
    assert data["reduction_pct"] == 0.0
    assert data["baseline_kgco2e"] == data["after_kgco2e"]
    assert data["baseline_kgco2e"] > 0
    assert len(data["available_levers"]) > 0


def test_simulate_single_lever(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """Single lever (CA_LEAK_FIX) → reduction > 0."""
    factory_id = _seed_and_create_factory(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {"CA_LEAK_FIX": True}},
        headers=auth_headers_user_a,
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["reduction_kgco2e"] > 0
    assert data["reduction_pct"] > 0
    assert data["after_kgco2e"] < data["baseline_kgco2e"]
    assert data["total_capex_inr"] > 0


def test_simulate_compounding_two_reduce_fraction(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """Two reduce_fraction on grid_kwh compound, not add (PRD §13.3)."""
    factory_id = _seed_and_create_factory(client, db_session, auth_headers_user_a)

    # Single lever
    res_single = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {"CA_LEAK_FIX": True}},
        headers=auth_headers_user_a,
    )
    single_data = res_single.json()

    # Both levers
    res_both = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {"CA_LEAK_FIX": True, "LED_LIGHTING": True}},
        headers=auth_headers_user_a,
    )
    both_data = res_both.json()

    # Both should reduce more than single, but not double
    assert both_data["reduction_kgco2e"] > single_data["reduction_kgco2e"]

    # Sum of standalone reductions would be naive addition;
    # combined must be less than naive sum (compounding effect)
    res_led = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {"LED_LIGHTING": True}},
        headers=auth_headers_user_a,
    )
    led_data = res_led.json()

    naive_sum = single_data["reduction_kgco2e"] + led_data["reduction_kgco2e"]
    # The combined reduction should be slightly less than naive sum due to compounding
    assert both_data["reduction_kgco2e"] <= naive_sum


def test_simulate_solar_after_efficiency(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """Solar + efficiency: combined reduction exceeds solar-only."""
    factory_id = _seed_and_create_factory(client, db_session, auth_headers_user_a)

    # Solar alone (25 kWp = 37,500 kWh generation, well below 120k kWh load)
    res_solar = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {"SOLAR_ROOFTOP": {"kwp": 25}}},
        headers=auth_headers_user_a,
    )
    solar_data = res_solar.json()

    # Solar + efficiency fix
    res_combined = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={
            "levers": {
                "CA_LEAK_FIX": True,
                "SOLAR_ROOFTOP": {"kwp": 25},
            }
        },
        headers=auth_headers_user_a,
    )
    combined_data = res_combined.json()

    # Combined should have more total reduction than solar alone
    assert combined_data["reduction_kgco2e"] > solar_data["reduction_kgco2e"]


def test_simulate_level_override(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """Level override for RECYCLED_BRASS_ROD at 0.6."""
    factory_id = _seed_and_create_factory(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {"RECYCLED_BRASS_ROD": {"level": 0.6}}},
        headers=auth_headers_user_a,
    )
    assert res.status_code == 200, res.text
    data = res.json()

    # Should reduce material emissions
    assert data["reduction_kgco2e"] > 0
    # Check category breakdown
    mat_cat = next((c for c in data["by_category"] if c["category"] == "material"), None)
    assert mat_cat is not None
    assert mat_cat["after_kgco2e"] < mat_cat["before_kgco2e"]


def test_simulate_response_speed(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """PRD §22 acceptance: lever changes update in < 500 ms."""
    factory_id = _seed_and_create_factory(client, db_session, auth_headers_user_a)

    t0 = time.time()
    res = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {"CA_LEAK_FIX": True, "SOLAR_ROOFTOP": {"kwp": 100}}},
        headers=auth_headers_user_a,
    )
    elapsed = time.time() - t0

    assert res.status_code == 200
    assert elapsed < 0.5, f"Simulation took {elapsed:.3f}s, expected < 0.5s"


def test_simulate_auth_user_b_gets_404(
    client: TestClient, db_session: Session, auth_headers_user_a: dict, auth_headers_user_b: dict
):
    """PRD §16.1: user B gets 404 on user A's factory."""
    factory_id = _seed_and_create_factory(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {}},
        headers=auth_headers_user_b,
    )
    assert res.status_code == 404


def test_simulate_deterministic(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """Same selection gives the same numbers every time (deterministic)."""
    factory_id = _seed_and_create_factory(client, db_session, auth_headers_user_a)

    levers = {"CA_LEAK_FIX": True, "SOLAR_ROOFTOP": {"kwp": 75}}

    res1 = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": levers},
        headers=auth_headers_user_a,
    )
    res2 = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": levers},
        headers=auth_headers_user_a,
    )

    data1 = res1.json()
    data2 = res2.json()

    assert data1["baseline_kgco2e"] == data2["baseline_kgco2e"]
    assert data1["after_kgco2e"] == data2["after_kgco2e"]
    assert data1["reduction_kgco2e"] == data2["reduction_kgco2e"]
    assert data1["reduction_pct"] == data2["reduction_pct"]
    assert data1["total_capex_inr"] == data2["total_capex_inr"]


def test_simulate_available_levers_returned(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """Available levers are returned with standalone impact data."""
    factory_id = _seed_and_create_factory(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/factories/{factory_id}/simulate",
        json={"levers": {}},
        headers=auth_headers_user_a,
    )
    assert res.status_code == 200
    data = res.json()

    levers = data["available_levers"]
    assert len(levers) > 0

    # Check structure of lever objects
    for lever in levers:
        assert "code" in lever
        assert "title_en" in lever
        assert "effect_type" in lever
        assert "standalone_reduction_tco2e" in lever

    # Solar should have levels
    solar = next((lev for lev in levers if lev["code"] == "SOLAR_ROOFTOP"), None)
    if solar:
        assert solar["levels"] is not None
        assert solar["level_unit"] == "kwp"

    # Recycled brass should have levels
    brass = next((lev for lev in levers if lev["code"] == "RECYCLED_BRASS_ROD"), None)
    if brass:
        assert brass["levels"] is not None
        assert brass["level_unit"] == "recycled_share"
