"""Tests for Phase 9: PDF Report Generation per PRD §18, §21, and §22."""

import io
import sys
from datetime import date
from pathlib import Path

import pdfplumber
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.models import ActivityRecord
from app.reports.charts import render_emissions_breakdown_svg, render_macc_chart_svg


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
# 1. Chart Generator Unit Tests (PRD §18)
# ---------------------------------------------------------------------------


def test_render_emissions_breakdown_svg():
    """Renders valid SVG stacked bar without browser dependency."""
    svg = render_emissions_breakdown_svg(
        {"scope_1": 15000.0, "scope_2": 71000.0, "scope_3": 140000.0},
        locale="en",
    )
    assert "<svg" in svg
    assert "</svg>" in svg
    svg_lower = svg.lower()
    assert "#b5432c" in svg_lower  # Ember
    assert "#a97a2b" in svg_lower  # Brass
    assert "#1d2a45" in svg_lower  # Ink


def test_render_macc_chart_svg():
    """Renders valid MACC SVG step chart with leaf-green for negative abatement cost."""
    macc_items = [
        {"code": "solar_rooftop_50kwp", "title": "Solar 50 kWp", "cost_per_tonne_inr": -1200.0, "reduction_tco2e": 65.0},
        {"code": "compressed_air_leak_audit", "title": "Air Leak Audit", "cost_per_tonne_inr": -3500.0, "reduction_tco2e": 14.0},
        {"code": "furnace_oil_to_induction", "title": "Induction Retooling", "cost_per_tonne_inr": 2400.0, "reduction_tco2e": 45.0},
    ]
    svg = render_macc_chart_svg(macc_items, selected_codes={"solar_rooftop_50kwp"}, locale="en")
    assert "<svg" in svg
    assert "</svg>" in svg
    svg_lower = svg.lower()
    assert "#2d7a57" in svg_lower  # Leaf green for money saving
    assert "#a97a2b" in svg_lower  # Brass for net cost


# ---------------------------------------------------------------------------
# 2. PDF Report Generation Tests (PRD §18, §22)
# ---------------------------------------------------------------------------


def test_generate_pdf_report_english(client: TestClient, db_session: Session, auth_headers_user_a: dict):
    """Generate English PDF report and verify structure, size, and download URL."""
    _, plan_id = _seed_and_create_plan(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/plans/{plan_id}/report",
        json={"locale": "en"},
        headers=auth_headers_user_a,
    )
    if res.status_code != 201:
        print("REASON:", res.json())
    assert res.status_code == 201
    data = res.json()
    assert data["locale"] == "en"
    assert "download_url" in data
    assert data["report_id"] is not None

    # Test download endpoint
    report_id = data["report_id"]
    dl_res = client.get(f"/api/v1/reports/{report_id}/download", headers=auth_headers_user_a)
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/pdf"
    pdf_bytes = dl_res.content
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 5000


def test_generate_pdf_report_gujarati_conjuncts(client: TestClient, db_session: Session, auth_headers_user_a: dict):
    """Generate Gujarati PDF report and verify text shaping & conjuncts (PRD §18, §22)."""
    _, plan_id = _seed_and_create_plan(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/plans/{plan_id}/report",
        json={"locale": "gu"},
        headers=auth_headers_user_a,
    )
    assert res.status_code == 201
    report_id = res.json()["report_id"]

    dl_res = client.get(f"/api/v1/reports/{report_id}/download", headers=auth_headers_user_a)
    assert dl_res.status_code == 200
    pdf_bytes = dl_res.content

    # Inspect with pdfplumber to verify Gujarati rendering & page count
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        assert len(pdf.pages) >= 7  # 7 pages per PRD §18

        all_text = " ".join(page.extract_text() or "" for page in pdf.pages)
        # Check Gujarati terms & conjuncts per PRD §18 ("ક્ષ, દ્ર, શ્ર")
        assert "ક્ષ" in all_text or "ક્ષમતા" in all_text
        assert "પ્લાન" in all_text or "અબેટમેન્ટ" in all_text

        # Verify page rasterization snapshot succeeds without font/shaping crash
        img = pdf.pages[0].to_image(resolution=100)
        assert img is not None
        assert img.original.size[0] > 0


def test_generate_pdf_report_hindi(client: TestClient, db_session: Session, auth_headers_user_a: dict):
    """Generate Hindi PDF report and verify Devanagari terms."""
    _, plan_id = _seed_and_create_plan(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/plans/{plan_id}/report",
        json={"locale": "hi"},
        headers=auth_headers_user_a,
    )
    assert res.status_code == 201
    report_id = res.json()["report_id"]

    dl_res = client.get(f"/api/v1/reports/{report_id}/download", headers=auth_headers_user_a)
    assert dl_res.status_code == 200
    pdf_bytes = dl_res.content

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        all_text = " ".join(page.extract_text() or "" for page in pdf.pages)
        assert "योजना" in all_text or "उत्सर्जन" in all_text


def test_methodology_lists_factor_sources(client: TestClient, db_session: Session, auth_headers_user_a: dict):
    """Methodology page must list factor sources (CEA, IPCC) per PRD §22 acceptance criteria."""
    _, plan_id = _seed_and_create_plan(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/plans/{plan_id}/report",
        json={"locale": "en"},
        headers=auth_headers_user_a,
    )
    assert res.status_code == 201
    report_id = res.json()["report_id"]

    dl_res = client.get(f"/api/v1/reports/{report_id}/download", headers=auth_headers_user_a)
    pdf_bytes = dl_res.content

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        all_text = " ".join(page.extract_text() or "" for page in pdf.pages)
        # Check presence of CEA and IPCC or calculation methodology
        assert "CEA" in all_text or "Central Electricity Authority" in all_text
        assert "Methodology" in all_text or "Scope 1" in all_text


# ---------------------------------------------------------------------------
# 3. Security & Tenant Isolation Tests (PRD §16.1, Rule 7)
# ---------------------------------------------------------------------------


def test_report_tenant_isolation_404(
    client: TestClient,
    db_session: Session,
    auth_headers_user_a: dict,
    auth_headers_user_b: dict,
):
    """User B cannot generate or download User A's report (returns 404)."""
    _, plan_id = _seed_and_create_plan(client, db_session, auth_headers_user_a)

    # User A generates report
    gen_res = client.post(
        f"/api/v1/plans/{plan_id}/report",
        json={"locale": "en"},
        headers=auth_headers_user_a,
    )
    assert gen_res.status_code == 201
    report_id = gen_res.json()["report_id"]

    # User B tries to generate report for User A's plan -> 404
    forbidden_gen = client.post(
        f"/api/v1/plans/{plan_id}/report",
        json={"locale": "en"},
        headers=auth_headers_user_b,
    )
    assert forbidden_gen.status_code == 404

    # User B tries to download User A's report -> 404
    forbidden_dl = client.get(
        f"/api/v1/reports/{report_id}/download",
        headers=auth_headers_user_b,
    )
    assert forbidden_dl.status_code == 404


def test_download_report_token_query_param(client: TestClient, db_session: Session, auth_headers_user_a: dict):
    """Download report using token query parameter for direct browser tab opens."""
    _, plan_id = _seed_and_create_plan(client, db_session, auth_headers_user_a)

    res = client.post(
        f"/api/v1/plans/{plan_id}/report",
        json={"locale": "en"},
        headers=auth_headers_user_a,
    )
    report_id = res.json()["report_id"]
    token = auth_headers_user_a["Authorization"].split(" ")[1]

    # Query param download
    dl_res = client.get(f"/api/v1/reports/{report_id}/download?token={token}")
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/pdf"
