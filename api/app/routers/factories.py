import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user, require_factory_access
from app.db import get_db
from app.models.models import Factory, FactoryMember

router = APIRouter(prefix="/factories", tags=["factories"])


class FactoryCreate(BaseModel):
    name: str
    industry: str
    products: str | None = None
    city: str | None = None
    state: str | None = "Gujarat"
    cluster: str | None = None
    grid_region: str | None = "IN"
    output_unit: str | None = "t"
    annual_output: float | None = None
    electricity_tariff_inr_per_kwh: float | None = None


class FactoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    industry: str
    products: str | None = None
    city: str | None = None
    state: str | None = None
    cluster: str | None = None
    grid_region: str
    output_unit: str
    annual_output: float | None = None
    electricity_tariff_inr_per_kwh: float | None = None

    model_config = ConfigDict(from_attributes=True)


@router.post("", response_model=FactoryResponse, status_code=status.HTTP_201_CREATED)
def create_factory(
    data: FactoryCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    factory = Factory(
        name=data.name,
        industry=data.industry,
        products=data.products,
        city=data.city,
        state=data.state or "Gujarat",
        cluster=data.cluster,
        grid_region=data.grid_region or "IN",
        output_unit=data.output_unit or "t",
        annual_output=data.annual_output,
        electricity_tariff_inr_per_kwh=data.electricity_tariff_inr_per_kwh,
        created_by=user.id,
    )
    db.add(factory)
    db.flush()

    member = FactoryMember(
        factory_id=factory.id,
        user_id=user.id,
        role="owner",
    )
    db.add(member)
    db.commit()
    db.refresh(factory)
    return factory


@router.get("", response_model=list[FactoryResponse])
def list_factories(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    factories = (
        db.query(Factory)
        .join(FactoryMember, Factory.id == FactoryMember.factory_id)
        .filter(FactoryMember.user_id == user.id)
        .all()
    )
    return factories


@router.get("/{factory_id}", response_model=FactoryResponse)
def get_factory(
    factory_id: uuid.UUID,
    member: FactoryMember = Depends(require_factory_access(min_role="viewer")),
    db: Session = Depends(get_db),
):
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "FACTORY_NOT_FOUND",
                    "message_key": "errors.factory_not_found",
                    "details": {},
                }
            },
        )
    return factory


@router.post("/{factory_id}/demo-seed")
def seed_demo_data_for_factory(
    factory_id: uuid.UUID,
    member: FactoryMember = Depends(require_factory_access(min_role="member")),
    db: Session = Depends(get_db),
):
    from pathlib import Path

    from app.engine.emissions import calculate_emissions_summary
    from app.engine.hotspots import compute_circularity_score, detect_drift, find_leak_points
    from app.ingestion.template_parser import parse_template_xlsx
    from app.models.models import (
        ActivityRecord,
        ActivityType,
        Benchmark,
        CalcRun,
        EmissionFactor,
        EmissionResult,
        Intervention,
    )

    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND"}})

    demo_path = Path(__file__).resolve().parent.parent.parent / "data" / "demo" / "demo_factory.xlsx"
    if not demo_path.exists():
        raise HTTPException(status_code=404, detail={"error": {"code": "DEMO_FILE_NOT_FOUND"}})

    with open(demo_path, "rb") as f:
        file_bytes = f.read()

    canonical_activities = [
        {"key": at.key, "canonical_unit": at.canonical_unit}
        for at in db.query(ActivityType).all()
    ]

    parse_result = parse_template_xlsx(file_bytes, canonical_activities)

    # Clean existing records for this factory
    db.query(EmissionResult).filter(
        EmissionResult.calc_run_id.in_(
            db.query(CalcRun.id).filter(CalcRun.factory_id == factory_id)
        )
    ).delete(synchronize_session=False)
    db.query(CalcRun).filter(CalcRun.factory_id == factory_id).delete(synchronize_session=False)
    db.query(ActivityRecord).filter(ActivityRecord.factory_id == factory_id).delete(synchronize_session=False)

    new_records = []
    for r in parse_result.draft_records:
        rec = ActivityRecord(
            factory_id=factory_id,
            period_month=r["period_month"],
            activity_type=r["activity_type"],
            quantity=r["quantity"],
            unit=r["unit"],
            quantity_canonical=r["quantity_canonical"],
            cost_inr=r.get("cost_inr"),
            attributes=r.get("attributes", {}),
            status="confirmed",
            confidence=1.0,
        )
        db.add(rec)
        new_records.append(rec)

    db.flush()

    # Run emissions calculation
    factors = db.query(EmissionFactor).all()
    activity_types = db.query(ActivityType).all()
    benchmarks = db.query(Benchmark).filter(Benchmark.industry == factory.industry).all()
    all_interventions = db.query(Intervention).all()

    summary, results = calculate_emissions_summary(
        records=new_records,
        factors=factors,
        activity_types=activity_types,
        factory_region=factory.grid_region or "IN-GJ",
        output_unit=factory.output_unit or "t",
    )

    leak_points = find_leak_points(
        summary=summary,
        benchmarks=benchmarks,
        interventions=all_interventions,
        industry=factory.industry,
    )
    drift = detect_drift(summary.get("monthly", []))
    bm_intensity = None
    for b in benchmarks:
        if getattr(b, "metric", "") == "kgco2e_per_t_output":
            bm_intensity = float(getattr(b, "value_mode", 0.0) or 0.0)
    circularity = compute_circularity_score(summary, benchmark_intensity=bm_intensity)

    summary["leak_points"] = leak_points
    summary["drift"] = drift
    summary["circularity"] = circularity

    months = [r.period_month for r in new_records if r.period_month]
    from datetime import date
    p_start = min(months) if months else date.today()
    p_end = max(months) if months else date.today()

    calc_run = CalcRun(
        factory_id=factory_id,
        period_start=p_start,
        period_end=p_end,
        total_kgco2e=summary["total_kgco2e"],
        output_quantity=summary["output_quantity"],
        intensity_kgco2e_per_output=summary["intensity_kgco2e_per_output"],
        summary=summary,
    )
    db.add(calc_run)
    db.flush()

    for r in results:
        if r.get("activity_record_id") and r.get("emission_factor_id"):
            er = EmissionResult(
                calc_run_id=calc_run.id,
                activity_record_id=r["activity_record_id"],
                emission_factor_id=r["emission_factor_id"],
                scope=r["scope"],
                kgco2e=r["kgco2e"],
                formula=r["formula"],
            )
            db.add(er)

    db.commit()
    return {"status": "ok", "records_seeded": len(new_records)}
