"""Comprehensive test suite for Phase 2 Engine per PRD §10, §11, §12, and §21."""

import uuid
from datetime import date
from pathlib import Path

import openpyxl
import pytest

from app.engine.emissions import (
    calculate_record_emission,
)
from app.engine.factors import find_emission_factor
from app.engine.hotspots import detect_drift, find_leak_points
from app.engine.units import (
    UnitDimensionError,
    convert_to_canonical,
)
from app.interventions.effects import (
    PoolState,
    apply_fuel_to_electric,
    apply_interventions_in_order,
    apply_onsite_generation,
    apply_reduce_fraction,
    apply_shift_to_secondary,
)
from app.models.models import (
    ActivityRecord,
    EmissionFactor,
    EmissionResult,
    Factory,
    FactoryMember,
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent


# ==============================================================================
# 1. Units & Quantities Tests (PRD §21)
# ==============================================================================


def test_unit_conversions_and_aliases():
    """Verify standard units and Indian SME aliases."""
    # 1 MWh -> 1,000 kWh
    assert convert_to_canonical(1.0, "MWh", "kWh") == 1000.0
    # 1 qtl -> 100 kg
    assert convert_to_canonical(1.0, "qtl", "kg") == 100.0
    assert convert_to_canonical(2.5, "quintal", "kg") == 250.0
    # 1 KL -> 1,000 L
    assert convert_to_canonical(1.0, "KL", "L") == 1000.0
    assert convert_to_canonical(0.5, "kl", "L") == 500.0
    # units alias -> kWh
    assert convert_to_canonical(2500.0, "units", "kWh") == 2500.0
    # MT -> t
    assert convert_to_canonical(12.0, "MT", "t") == 12.0
    # SCM -> m**3
    assert convert_to_canonical(100.0, "scm", "m**3") == 100.0


def test_unit_dimension_mismatch_raises():
    """Verify incompatible dimensions raise UnitDimensionError."""
    with pytest.raises(UnitDimensionError):
        convert_to_canonical(50.0, "kg", "kWh")

    with pytest.raises(UnitDimensionError):
        convert_to_canonical(100.0, "L", "kg")


# ==============================================================================
# 2. Factor Lookup & Precedence Tests (PRD §10.2, §21)
# ==============================================================================


def test_factor_precedence_and_versioning():
    """Verify region precedence (IN-GJ > IN > GLOBAL) and validity date ranges."""
    f_global = EmissionFactor(
        id=uuid.uuid4(),
        activity_type="grid_electricity",
        region="GLOBAL",
        kgco2e_per_unit=0.850,
        per_unit="kWh",
        source_name="Global Baseline",
        valid_from=None,
        valid_to=None,
        verified=False,
    )
    f_in_v20 = EmissionFactor(
        id=uuid.uuid4(),
        activity_type="grid_electricity",
        region="IN",
        kgco2e_per_unit=0.727,
        per_unit="kWh",
        source_name="CEA Baseline v20.0",
        source_version="v20.0",
        reference_year="FY2023-24",
        valid_from=date(2024, 4, 1),
        valid_to=date(2025, 3, 31),
        verified=False,
    )
    f_in_v21 = EmissionFactor(
        id=uuid.uuid4(),
        activity_type="grid_electricity",
        region="IN",
        kgco2e_per_unit=0.710,
        per_unit="kWh",
        source_name="CEA Baseline v21.0",
        source_version="v21.0",
        reference_year="FY2024-25",
        valid_from=date(2025, 4, 1),
        valid_to=None,
        verified=False,
    )
    f_gj = EmissionFactor(
        id=uuid.uuid4(),
        activity_type="grid_electricity",
        region="IN-GJ",
        kgco2e_per_unit=0.690,
        per_unit="kWh",
        source_name="Gujarat Specific Grid Factor",
        valid_from=None,
        valid_to=None,
        verified=True,
    )

    factors = [f_global, f_in_v20, f_in_v21, f_gj]

    # Factory region IN-GJ matches f_gj first
    chosen = find_emission_factor(
        factors, "grid_electricity", "2025-05", canonical_unit="kWh", factory_region="IN-GJ"
    )
    assert chosen == f_gj

    # Factory region IN (no GJ match) in May 2025 matches CEA v21.0 (0.710)
    factors_no_gj = [f_global, f_in_v20, f_in_v21]
    chosen_v21 = find_emission_factor(
        factors_no_gj, "grid_electricity", "2025-05", canonical_unit="kWh", factory_region="IN-GJ"
    )
    assert chosen_v21 == f_in_v21
    assert float(chosen_v21.kgco2e_per_unit) == 0.710

    # Factory region IN in May 2024 matches CEA v20.0 (0.727)
    chosen_v20 = find_emission_factor(
        factors_no_gj, "grid_electricity", "2024-05", canonical_unit="kWh", factory_region="IN-GJ"
    )
    assert chosen_v20 == f_in_v20
    assert float(chosen_v20.kgco2e_per_unit) == 0.727

    # Missing factor returns None
    missing = find_emission_factor(factors, "unknown_activity", "2025-05")
    assert missing is None


# ==============================================================================
# 3. Calculator Golden Values & Traceability (PRD §10.1, §21)
# ==============================================================================


def test_calculator_golden_values():
    """Verify golden calculations: 1000 kWh * 0.710 = 710, 100 L diesel * 2.68 = 268."""
    f_elec = EmissionFactor(
        id=uuid.uuid4(),
        activity_type="grid_electricity",
        region="IN",
        kgco2e_per_unit=0.710,
        per_unit="kWh",
        source_name="CEA CO2 Baseline Database",
        source_version="v21.0",
        reference_year="FY2024-25",
        verified=False,
    )
    rec_elec = ActivityRecord(
        id=uuid.uuid4(),
        activity_type="grid_electricity",
        quantity_canonical=1000.0,
        unit="kWh",
        cost_inr=7800.0,
    )
    res_elec = calculate_record_emission(rec_elec, f_elec)
    assert res_elec["kgco2e"] == 710.0
    assert "1,000 kWh × 0.71 kgCO2e/kWh" in res_elec["formula"]
    assert "710.0 kgCO2e" in res_elec["formula"]

    f_diesel = EmissionFactor(
        id=uuid.uuid4(),
        activity_type="diesel",
        region="GLOBAL",
        kgco2e_per_unit=2.68,
        per_unit="L",
        source_name="IPCC 2006 Guidelines",
        verified=False,
    )
    rec_diesel = ActivityRecord(
        id=uuid.uuid4(),
        activity_type="diesel",
        quantity_canonical=100.0,
        unit="L",
        cost_inr=9000.0,
    )
    res_diesel = calculate_record_emission(rec_diesel, f_diesel)
    assert res_diesel["kgco2e"] == 268.0
    assert "100 L × 2.68 kgCO2e/L" in res_diesel["formula"]
    assert "268.0 kgCO2e" in res_diesel["formula"]


# ==============================================================================
# 4. Intervention Effects Pure Functions (PRD §12.3, §21)
# ==============================================================================


def test_compounding_reduce_fraction():
    """Verify two 20% reduce_fraction interventions compound to 36% total reduction."""
    initial_qty = 10000.0
    q1, s1 = apply_reduce_fraction(initial_qty, share_of_pool=1.0, reduction=0.20)
    assert q1 == 8000.0
    assert s1 == 2000.0

    q2, s2 = apply_reduce_fraction(q1, share_of_pool=1.0, reduction=0.20)
    assert q2 == 6400.0
    assert s2 == 1600.0

    total_reduction_pct = (initial_qty - q2) / initial_qty
    assert total_reduction_pct == pytest.approx(0.36, 0.0001)


def test_onsite_generation_cap():
    """Verify solar generation offset is strictly capped at remaining grid load."""
    new_grid, offset, total_gen = apply_onsite_generation(
        remaining_grid_kwh=5000.0, kwp=10.0, yield_kwh_per_kwp=1500.0
    )
    # Total generation = 15,000 kWh, remaining load = 5,000 kWh -> offset = 5,000 kWh, remaining = 0
    assert total_gen == 15000.0
    assert offset == 5000.0
    assert new_grid == 0.0


def test_secondary_share_cap():
    """Verify secondary material share is strictly capped at 0.95."""
    share, delta = apply_shift_to_secondary(current_share=0.70, target_level=0.98)
    assert share == 0.95
    assert delta == pytest.approx(0.25, 0.0001)


def test_fuel_to_electric_energy_balance():
    """Verify induction furnace fuel-to-electric conversion using GJ to kWh."""
    # 10 GJ fuel with fuel_eff=0.20, elec_eff=0.65
    fuel_new, fuel_saved, added_kwh = apply_fuel_to_electric(
        fuel_gj=10.0, fraction=1.0, fuel_efficiency=0.20, electric_efficiency=0.65
    )
    assert fuel_new == 0.0
    assert fuel_saved == 10.0
    expected_kwh = (10.0 * 0.20 / 0.65) / 0.0036
    assert added_kwh == pytest.approx(expected_kwh, 0.01)


def test_effects_application_order():
    """Verify strict execution order: reduce_fraction -> fuel_to_electric -> shift_to_secondary -> onsite_generation."""
    initial_state = PoolState(
        grid_kwh=10000.0,
        melting_fuel_gj=10.0,
        secondary_brass_share=0.40,
    )

    interventions = [
        # Entered out of order intentionally
        {
            "code": "SOLAR_ROOFTOP",
            "effect_type": "onsite_generation",
            "effect_params": {"levels_kwp": [5], "yield_kwh_per_kwp": 1500},
        },
        {
            "code": "CA_LEAK_FIX",
            "effect_type": "reduce_fraction",
            "pool": "grid_kwh",
            "effect_params": {"share_of_pool": 1.0, "reduction": 0.20},
        },
        {
            "code": "INDUCTION_FURNACE",
            "effect_type": "fuel_to_electric",
            "effect_params": {
                "fraction": 1.0,
                "fuel_efficiency": 0.20,
                "electric_efficiency": 0.65,
            },
        },
        {
            "code": "RECYCLED_ROD",
            "effect_type": "shift_to_secondary",
            "effect_params": {"levels": [0.80]},
        },
    ]

    final_state, steps = apply_interventions_in_order(initial_state, interventions)

    executed_codes = [s["code"] for s in steps]
    assert executed_codes == ["CA_LEAK_FIX", "INDUCTION_FURNACE", "RECYCLED_ROD", "SOLAR_ROOFTOP"]
    assert final_state.melting_fuel_gj == 0.0
    assert final_state.secondary_brass_share == 0.80


# ==============================================================================
# 5. Hotspot & Drift Tests (PRD §11.1, §11.2)
# ==============================================================================


def test_hotspot_pareto_ranking():
    """Verify 80% Pareto rule caps at 5 leak points."""
    summary = {
        "total_kgco2e": 10000.0,
        "by_activity": [
            {"activity_type": "brass_input_primary", "kgco2e": 5000.0, "share": 0.50},
            {"activity_type": "grid_electricity", "kgco2e": 2500.0, "share": 0.25},
            {"activity_type": "furnace_oil", "kgco2e": 1000.0, "share": 0.10},
            {"activity_type": "diesel", "kgco2e": 800.0, "share": 0.08},
            {"activity_type": "cutting_oil", "kgco2e": 500.0, "share": 0.05},
            {"activity_type": "packaging_corrugated", "kgco2e": 200.0, "share": 0.02},
        ],
    }

    leak_points = find_leak_points(summary)
    # First 3 activities (5000 + 2500 + 1000 = 8500 = 85%) reach >= 80%
    assert len(leak_points) == 3
    assert leak_points[0]["activity_type"] == "brass_input_primary"
    assert leak_points[0]["severity"] == "major"
    assert leak_points[1]["severity"] == "major"
    assert leak_points[2]["severity"] == "significant"


def test_drift_detection_synthetic():
    """Verify drift detector flags >= 10% intensity drift on monthly series."""
    # 9 baseline months @ 2100 kWh/t, 3 drift months @ 2400 kWh/t (+14.3%)
    monthly = []
    for i in range(1, 10):
        monthly.append({"month": f"2025-{i:02d}", "kwh": 210000.0, "output": 100.0})
    for i in range(10, 13):
        monthly.append({"month": f"2025-{i:02d}", "kwh": 240000.0, "output": 100.0})

    res = detect_drift(monthly, threshold=0.10)
    assert res["has_drift"] is True
    assert res["drift_pct"] > 0.14
    assert "up 14" in res["message"] or "is up" in res["message"]


# ==============================================================================
# 6. Full Calculation & API Integration with Demo Data
# ==============================================================================


def test_full_calculation_on_demo_factory(client, db_session, user_a_id, auth_headers_user_a):
    """Seed canonical tables, insert demo factory records, execute calculation API, verify results."""
    # 1. Run seed to populate canonical tables
    import sys

    sys.path.insert(0, str(BASE_DIR / "scripts"))
    from seed import run_seed

    run_seed(session=db_session, seed_dir=BASE_DIR / "data" / "seed")

    # 2. Create factory owned by user A
    factory = Factory(
        id=uuid.uuid4(),
        name="Shree Brass Industries",
        industry="brass_components",
        cluster="Jamnagar GIDC-2",
        grid_region="IN-GJ",
        output_unit="t",
        annual_output=540.0,
        electricity_tariff_inr_per_kwh=7.8,
        created_by=user_a_id,
    )
    db_session.add(factory)
    db_session.flush()

    member = FactoryMember(
        factory_id=factory.id,
        user_id=user_a_id,
        role="owner",
    )
    db_session.add(member)

    # 3. Load demo data from data/demo/demo_factory.xlsx and populate activity_records
    demo_path = BASE_DIR / "data" / "demo" / "demo_factory.xlsx"
    wb = openpyxl.load_workbook(str(demo_path), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]

    month_idx = header.index("month")
    act_idx = header.index("activity")
    qty_idx = header.index("quantity")
    unit_idx = header.index("unit")
    cost_idx = header.index("cost_inr")

    for r in rows[1:]:
        m = r[month_idx]
        act = r[act_idx]
        qty = float(r[qty_idx])
        unit = str(r[unit_idx])
        cost = float(r[cost_idx]) if r[cost_idx] else 0.0

        # Normalise canonical quantity
        qty_canon = convert_to_canonical(qty, unit, "kWh" if unit in ("units", "kWh") else unit)

        rec = ActivityRecord(
            factory_id=factory.id,
            period_month=date.fromisoformat(f"{m}-01"),
            activity_type=act,
            quantity=qty,
            unit=unit,
            quantity_canonical=qty_canon,
            cost_inr=cost,
            status="confirmed",
        )
        db_session.add(rec)

    db_session.commit()

    # 4. Call calculation endpoint
    resp = client.post(f"/api/v1/factories/{factory.id}/calculate", headers=auth_headers_user_a)
    assert resp.status_code == 201
    data = resp.json()

    # Verify calculation output structure
    assert data["total_kgco2e"] > 0
    assert data["output_quantity"] > 0
    summary = data["summary"]

    assert summary["months"] == 12
    assert summary["annualised"] is False
    assert summary["by_scope"]["scope1"] > 0
    assert summary["by_scope"]["scope2"] > 0
    assert summary["by_scope"]["scope3"] > 0

    # Leak points detected
    leak_points = summary["leak_points"]
    assert len(leak_points) >= 1
    top_leak = leak_points[0]
    assert top_leak["severity"] in ("major", "significant")

    # Drift detector caught the +14% electricity drift in demo factory Q4
    drift = summary["drift"]
    assert drift["has_drift"] is True
    assert drift["drift_pct"] > 0.10

    # Circularity score computed
    circularity = summary["circularity"]
    assert 0 <= circularity["overall"] <= 100
    assert len(circularity["sub_scores"]) >= 3

    # Check that emission_results records were persisted with formula strings
    results = db_session.query(EmissionResult).filter_by(calc_run_id=uuid.UUID(data["id"])).all()
    assert len(results) > 0
    for r in results:
        assert r.formula
        assert "kgCO2e" in r.formula
        assert "=" in r.formula
