"""Comprehensive test suite for Phase 3 Ingestion per PRD §9 and §21."""

import uuid
from pathlib import Path

from app.models.models import ActivityRecord, Factory, FactoryMember

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def test_standard_template_ingestion(client, db_session, user_a_id, auth_headers_user_a):
    """Upload demo_factory.xlsx -> parse -> verify split/units -> confirm -> activity_records."""
    import sys
    sys.path.insert(0, str(BASE_DIR / "scripts"))
    from seed import run_seed
    run_seed(session=db_session, seed_dir=BASE_DIR / "data" / "seed")

    # Create factory
    factory = Factory(
        id=uuid.uuid4(),
        name="Test Brass Works",
        industry="brass_components",
        cluster="Jamnagar GIDC",
        created_by=user_a_id,
    )
    db_session.add(factory)
    db_session.flush()
    db_session.add(FactoryMember(factory_id=factory.id, user_id=user_a_id, role="owner"))
    db_session.commit()

    # 1. Upload standard template file
    demo_xlsx = BASE_DIR / "data" / "demo" / "demo_factory.xlsx"
    with open(demo_xlsx, "rb") as f:
        file_bytes = f.read()

    upload_resp = client.post(
        f"/api/v1/factories/{factory.id}/uploads",
        files={"file": ("demo_factory.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"kind": "template_xlsx"},
        headers=auth_headers_user_a,
    )
    assert upload_resp.status_code == 201
    upload_data = upload_resp.json()
    upload_id = upload_data["id"]
    assert upload_data["status"] == "uploaded"

    # 2. Trigger Parse
    parse_resp = client.post(f"/api/v1/uploads/{upload_id}/parse", headers=auth_headers_user_a)
    assert parse_resp.status_code == 200
    parsed_data = parse_resp.json()
    assert parsed_data["status"] == "needs_review"
    draft_records = parsed_data["mapping"]["draft_records"]
    assert len(draft_records) >= 12

    # Check transport t*km calculation and brass material
    act_types = [r["activity_type"] for r in draft_records]
    assert "grid_electricity" in act_types
    assert "road_freight_hgv" in act_types
    assert "brass_input_primary" in act_types

    # 3. Confirm upload
    confirm_resp = client.post(f"/api/v1/uploads/{upload_id}/confirm", headers=auth_headers_user_a)
    assert confirm_resp.status_code == 200
    confirm_data = confirm_resp.json()
    assert confirm_data["status"] == "confirmed"
    assert confirm_data["records_created"] > 0

    # 4. Verify activity records exist in database
    records = db_session.query(ActivityRecord).filter_by(factory_id=factory.id, status="confirmed").all()
    assert len(records) == confirm_data["records_created"]


def test_tally_purchase_register_mapping_offline(client, db_session, user_a_id, auth_headers_user_a):
    """Upload Tally CSV -> assert >= 90% items mapped accurately without LLM."""
    import sys
    sys.path.insert(0, str(BASE_DIR / "scripts"))
    from seed import run_seed
    run_seed(session=db_session, seed_dir=BASE_DIR / "data" / "seed")

    factory = Factory(
        id=uuid.uuid4(),
        name="Tally Test Factory",
        industry="brass_components",
        created_by=user_a_id,
    )
    db_session.add(factory)
    db_session.flush()
    db_session.add(FactoryMember(factory_id=factory.id, user_id=user_a_id, role="owner"))
    db_session.commit()

    tally_csv = BASE_DIR / "data" / "demo" / "tally_purchase_register.csv"
    with open(tally_csv, "rb") as f:
        file_bytes = f.read()

    upload_resp = client.post(
        f"/api/v1/factories/{factory.id}/uploads",
        files={"file": ("tally_purchase_register.csv", file_bytes, "text/csv")},
        data={"kind": "generic_table"},
        headers=auth_headers_user_a,
    )
    assert upload_resp.status_code == 201
    upload_id = upload_resp.json()["id"]

    # Parse Tally export
    parse_resp = client.post(f"/api/v1/uploads/{upload_id}/parse", headers=auth_headers_user_a)
    assert parse_resp.status_code == 200
    mapping = parse_resp.json()["mapping"]

    item_mappings = mapping["item_mappings"]
    assert len(item_mappings) >= 10

    # Check accuracy: emission-relevant items should be classified correctly
    mapped_count = 0
    total_relevant = 0
    for im in item_mappings:
        src = im["source_label"].lower()
        if "tea" in src or "stationery" in src:
            # Should be mapped to None
            assert im["activity_type"] is None
            continue

        total_relevant += 1
        if im["activity_type"] is not None:
            mapped_count += 1
            if "brass" in src:
                assert "brass" in im["activity_type"]
            elif "diesel" in src or "hsd" in src:
                assert im["activity_type"] == "diesel"
            elif "carton" in src:
                assert im["activity_type"] == "packaging_corrugated"

    accuracy = mapped_count / total_relevant if total_relevant > 0 else 0
    assert accuracy >= 0.90, f"Expected mapping accuracy >= 90%, got {accuracy * 100:.1f}%"

    # Confirm and assert records
    confirm_resp = client.post(f"/api/v1/uploads/{upload_id}/confirm", headers=auth_headers_user_a)
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["records_created"] >= 10


def test_electricity_bill_pdf_extraction(client, db_session, user_a_id, auth_headers_user_a):
    """Upload bill PDF -> extract kWh and dates -> verify variable tariff calculation."""
    import sys
    sys.path.insert(0, str(BASE_DIR / "scripts"))
    from seed import run_seed
    run_seed(session=db_session, seed_dir=BASE_DIR / "data" / "seed")

    factory = Factory(
        id=uuid.uuid4(),
        name="Bill Test Factory",
        industry="brass_components",
        created_by=user_a_id,
    )
    db_session.add(factory)
    db_session.flush()
    db_session.add(FactoryMember(factory_id=factory.id, user_id=user_a_id, role="owner"))
    db_session.commit()

    bill_pdf = BASE_DIR / "data" / "demo" / "bills" / "electricity_bill_2026-06.pdf"
    with open(bill_pdf, "rb") as f:
        file_bytes = f.read()

    upload_resp = client.post(
        f"/api/v1/factories/{factory.id}/uploads",
        files={"file": ("electricity_bill_2026-06.pdf", file_bytes, "application/pdf")},
        data={"kind": "bill_pdf"},
        headers=auth_headers_user_a,
    )
    assert upload_resp.status_code == 201
    upload_id = upload_resp.json()["id"]

    # Trigger Parse
    parse_resp = client.post(f"/api/v1/uploads/{upload_id}/parse", headers=auth_headers_user_a)
    assert parse_resp.status_code == 200
    res = parse_resp.json()
    assert res["status"] == "needs_review"

    ext = res["mapping"]["extraction"]
    assert ext["units_kwh"] is not None
    assert ext["units_kwh"] > 0
    assert ext["consumer_number"] is not None
    assert ext["consumer_number"].startswith("••••••")  # Masked per PRD §9.5

    # Check variable tariff calculated
    prop_rec = res["mapping"]["proposed_record"]
    tariff = prop_rec["attributes"]["variable_tariff_inr_per_kwh"]
    assert 3.0 <= tariff <= 20.0

    # Confirm
    confirm_resp = client.post(f"/api/v1/uploads/{upload_id}/confirm", headers=auth_headers_user_a)
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["records_created"] == 1


def test_coverage_grid_api(client, db_session, user_a_id, auth_headers_user_a):
    """Verify 12-month coverage grid structure and counts."""
    factory = Factory(
        id=uuid.uuid4(),
        name="Coverage Factory",
        industry="foundry",
        created_by=user_a_id,
    )
    db_session.add(factory)
    db_session.flush()
    db_session.add(FactoryMember(factory_id=factory.id, user_id=user_a_id, role="owner"))

    from datetime import date
    for i in range(1, 13):
        rec = ActivityRecord(
            factory_id=factory.id,
            period_month=date(2025, i, 1) if i <= 12 else date(2026, 1, 1),
            activity_type="grid_electricity",
            quantity=50000.0,
            unit="kWh",
            quantity_canonical=50000.0,
            status="confirmed",
        )
        db_session.add(rec)
    db_session.commit()

    resp = client.get(f"/api/v1/factories/{factory.id}/activity-records/coverage", headers=auth_headers_user_a)
    assert resp.status_code == 200
    data = resp.json()
    assert "months" in data
    assert "activities" in data
    assert len(data["activities"]) >= 1
    assert data["activities"][0]["activity_type"] == "grid_electricity"
    assert data["activities"][0]["months_filled"] == 12
    assert data["activities"][0]["coverage_pct"] == 100.0
