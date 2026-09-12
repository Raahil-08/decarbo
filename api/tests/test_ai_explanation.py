"""Tests for Phase 8: AI Explanation per PRD §15, §21, and §22."""

import sys
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.guardrail import (
    extract_numbers,
    normalize_digits,
    validate_numeric_grounding,
)
from app.ai.template_explanation import render_template_explanation
from app.models.models import ActivityRecord


def _seed_and_create_plan(client: TestClient, db_session: Session, auth_headers: dict) -> tuple[str, str]:
    """Helper: seed data, create factory, activity records, and generate plans."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    scripts_dir = base_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from seed import run_seed

    run_seed(session=db_session, seed_dir=base_dir / "data" / "seed")

    factory_res = client.post(
        "/api/v1/factories",
        json={
            "name": "Jamnagar Precision Extrusions",
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

    # Add records
    records = [
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="grid_electricity",
            quantity=100000.0,
            unit="kWh",
            quantity_canonical=100000.0,
            cost_inr=780000.0,
            status="confirmed",
            confidence=1.0,
        ),
        ActivityRecord(
            factory_id=factory_id,
            period_month=date(2025, 9, 1),
            activity_type="brass_input_primary",
            quantity=35000.0,
            unit="kg",
            quantity_canonical=35000.0,
            cost_inr=21000000.0,
            status="confirmed",
            confidence=1.0,
        ),
    ]
    for r in records:
        db_session.add(r)
    db_session.commit()

    # Generate plans
    plan_res = client.post(
        f"/api/v1/factories/{factory_id}/plans",
        json={"budget_inr": 1000000.0, "target_reduction_pct": 15.0},
        headers=auth_headers,
    )
    assert plan_res.status_code == 201
    plans = plan_res.json()["plans"]
    assert len(plans) > 0
    return factory_id, plans[0]["id"]


# ---------------------------------------------------------------------------
# 1. Guardrail Unit Tests (PRD §15.3, §21)
# ---------------------------------------------------------------------------


def test_normalize_digits():
    """Gujarati and Devanagari digits normalized to standard ASCII."""
    gujarati = "રોકાણ ૧૨.૫ લાખ અને બચત ૫૦%"
    devanagari = "निवेश १२.५ लाख और बचत ५०%"

    norm_gu = normalize_digits(gujarati)
    norm_hi = normalize_digits(devanagari)

    assert "12.5" in norm_gu
    assert "50%" in norm_gu
    assert "12.5" in norm_hi
    assert "50%" in norm_hi


def test_extract_numbers():
    """Extracts integers, decimals, and Indian grouped numbers."""
    text = "Investment of ₹12,34,567 with annual savings ₹4.5 L cutting 120.5 tCO2e."
    nums = extract_numbers(text)
    assert "1234567" in nums
    assert "4.5" in nums
    assert "120.5" in nums


def test_guardrail_accepted():
    """Text containing only allowed engine-grounded numbers and ordinals is accepted."""
    allowed = {"1000000", "10", "450000", "4.5", "120.5", "15", "14.2"}

    valid_text = (
        "1. Step 1 cuts emissions by 120.5 tCO2e. "
        "2. The investment is ₹10 L with annual savings of ₹4.5 L. "
        "Payback period is 14.2 months."
    )
    is_valid, ungrounded = validate_numeric_grounding(valid_text, allowed)
    assert is_valid is True
    assert len(ungrounded) == 0


def test_guardrail_rejected():
    """Text containing hallucinated or unlisted numbers is rejected."""
    allowed = {"1000000", "10", "450000", "4.5"}

    # 42.8 is not in the allowed set
    invalid_text = "This plan delivers 42.8% carbon reduction with ₹10 L investment."
    is_valid, ungrounded = validate_numeric_grounding(invalid_text, allowed)
    assert is_valid is False
    assert "42.8" in ungrounded


def test_guardrail_gujarati_digits():
    """Gujarati digits in output are checked against allowed numbers."""
    allowed = {"10", "4.5", "15"}
    # ૧૦ -> 10, ૪.૫ -> 4.5
    valid_gu = "આ યોજના માટે ૧૦ લાખનું રોકાણ છે અને ૪.૫ લાખની બચત છે."
    is_valid, ungrounded = validate_numeric_grounding(valid_gu, allowed)
    assert is_valid is True
    assert len(ungrounded) == 0

    # ૭૫ -> 75 (not allowed)
    invalid_gu = "આ યોજના ૭૫% ઉત્સર્જન ઘટાડશે."
    is_valid, ungrounded = validate_numeric_grounding(invalid_gu, allowed)
    assert is_valid is False
    assert "75" in ungrounded


# ---------------------------------------------------------------------------
# 2. Deterministic Template Fallback Tests (PRD §15.2, Non-negotiable 11)
# ---------------------------------------------------------------------------


def test_template_explanation_multilingual():
    """Template explanations render in en, gu, hi with full engine grounding."""
    totals = {
        "total_capex_inr": 780000.0,
        "annual_gross_savings_inr": 410000.0,
        "co2_reduction_kgco2e": 54200.0,
        "reduction_pct": 22.5,
        "payback_months": 22.8,
    }
    ledger = [
        {
            "sequence": 1,
            "title_en": "Compressed Air Leak Detection & Repair",
            "reduction_kgco2e": 14200.0,
            "payback_months": 3.2,
        }
    ]
    hotspots = [
        {"activity_type": "grid_electricity", "share_pct": 68.4, "kgco2e": 71000.0}
    ]

    for loc in ["en", "gu", "hi"]:
        text = render_template_explanation(
            plan_totals=totals,
            ledger_items=ledger,
            hotspots=hotspots,
            locale=loc,
        )
        assert len(text) > 50
        assert "7.8 L" in text or "7,80,000" in text or "૭.૮" in text or "७.८" in text or "7.8" in text
        assert "22.5" in text
        # Verify structure: quick win mention
        if loc == "en":
            assert "Compressed Air Leak Detection & Repair" in text
            assert "Practical caution" in text
        elif loc == "gu":
            assert "સાવચેતી" in text
        elif loc == "hi":
            assert "सावधानी" in text


# ---------------------------------------------------------------------------
# 3. Endpoint Integration & Caching Tests (PRD §16.2, §22)
# ---------------------------------------------------------------------------


def test_explanation_endpoint_offline(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """PRD Non-negotiable 11: app works with LLM_ENABLED=false (template explanation)."""
    factory_id, plan_id = _seed_and_create_plan(client, db_session, auth_headers_user_a)

    # 1. Fetch English explanation
    res_en = client.get(
        f"/api/v1/plans/{plan_id}/explanation?locale=en&stream=false",
        headers=auth_headers_user_a,
    )
    assert res_en.status_code == 200
    data_en = res_en.json()
    assert data_en["locale"] == "en"
    assert data_en["source"] in ("template", "ai")
    assert len(data_en["text"]) > 40

    # 2. Fetch Gujarati explanation
    res_gu = client.get(
        f"/api/v1/plans/{plan_id}/explanation?locale=gu&stream=false",
        headers=auth_headers_user_a,
    )
    assert res_gu.status_code == 200
    data_gu = res_gu.json()
    assert data_gu["locale"] == "gu"
    assert "સાવચેતી" in data_gu["text"]

    # 3. Verify caching: second request returns source="cached"
    res_gu_cached = client.get(
        f"/api/v1/plans/{plan_id}/explanation?locale=gu&stream=false",
        headers=auth_headers_user_a,
    )
    assert res_gu_cached.status_code == 200
    data_cached = res_gu_cached.json()
    assert data_cached["cached"] is True
    assert data_cached["source"] == "cached"
    assert data_cached["text"] == data_gu["text"]


def test_explanation_streaming_sse(
    client: TestClient, db_session: Session, auth_headers_user_a: dict
):
    """PRD §22: explanation streams in real-time."""
    factory_id, plan_id = _seed_and_create_plan(client, db_session, auth_headers_user_a)

    res = client.get(
        f"/api/v1/plans/{plan_id}/explanation?locale=gu&stream=true",
        headers=auth_headers_user_a,
    )
    assert res.status_code == 200
    assert "text/event-stream" in res.headers["content-type"]
    body = res.text
    assert "data: {" in body
    assert '"done": true' in body


def test_explanation_tenant_isolation(
    client: TestClient, db_session: Session, auth_headers_user_a: dict, auth_headers_user_b: dict
):
    """PRD Non-negotiable 7: User B cannot access User A's plan explanation (404)."""
    factory_id, plan_id = _seed_and_create_plan(client, db_session, auth_headers_user_a)

    # User B request
    res = client.get(
        f"/api/v1/plans/{plan_id}/explanation?locale=en&stream=false",
        headers=auth_headers_user_b,
    )
    assert res.status_code == 404
