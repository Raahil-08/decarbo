import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user, require_factory_access
from app.db import get_db
from app.models.models import ActivityRecord, CalcRun, EmissionResult, Factory, FactoryMember

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
    from datetime import date
    from pathlib import Path

    from app.engine.emissions import calculate_emissions_summary
    from app.engine.hotspots import compute_circularity_score, detect_drift, find_leak_points
    from app.ingestion.template_parser import parse_template_file
    from app.models.models import (
        ActivityRecord,
        ActivityType,
        Benchmark,
        CalcRun,
        EmissionFactor,
        Intervention,
    )

    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND"}})

    demo_path = Path(__file__).resolve().parent.parent.parent.parent / "data" / "demo" / "demo_factory.xlsx"
    if not demo_path.exists():
        demo_path = Path(__file__).resolve().parent.parent.parent / "data" / "demo" / "demo_factory.xlsx"
    if not demo_path.exists():
        demo_path = Path.cwd() / "data" / "demo" / "demo_factory.xlsx"
    if not demo_path.exists():
        raise HTTPException(status_code=404, detail={"error": {"code": "DEMO_FILE_NOT_FOUND"}})

    with open(demo_path, "rb") as f:
        file_bytes = f.read()

    activity_types = db.query(ActivityType).all()
    draft_records, _ = parse_template_file(
        file_bytes=file_bytes,
        filename="demo_factory.xlsx",
        activity_types=activity_types,
    )

    # Clean existing records for this factory
    db.query(EmissionResult).filter(
        EmissionResult.calc_run_id.in_(
            db.query(CalcRun.id).filter(CalcRun.factory_id == factory_id)
        )
    ).delete(synchronize_session=False)
    db.query(CalcRun).filter(CalcRun.factory_id == factory_id).delete(synchronize_session=False)
    db.query(ActivityRecord).filter(ActivityRecord.factory_id == factory_id).delete(synchronize_session=False)

    new_records = []
    for r in draft_records:
        pm_val = r["period_month"]
        if isinstance(pm_val, str):
            try:
                pm_date = date.fromisoformat(pm_val) if len(pm_val) == 10 else date.fromisoformat(f"{pm_val}-01")
            except Exception:
                pm_date = date.today()
        else:
            pm_date = pm_val

        rec = ActivityRecord(
            factory_id=factory_id,
            period_month=pm_date,
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
    if months:
        try:
            p_start = date.fromisoformat(f"{min(months)}-01")
            p_end = date.fromisoformat(f"{max(months)}-01")
        except Exception:
            p_start = date.today()
            p_end = date.today()
    else:
        p_start = date.today()
        p_end = date.today()

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


@router.get(
    "/{factory_id}/drift",
    response_model=dict[str, Any],
    status_code=status.HTTP_200_OK,
)
def get_factory_drift(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="viewer")),
) -> dict[str, Any]:
    """Retrieve intensity series, drift metrics, and anomaly flags per PRD §11.2 & §16."""
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    # 1. Look in latest calc_run summary
    latest_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory_id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )

    if latest_run and isinstance(latest_run.summary, dict) and "drift" in latest_run.summary:
        drift_data = latest_run.summary["drift"]
        if "series" in drift_data and len(drift_data.get("series", [])) > 0:
            return {
                "factory_id": str(factory_id),
                **drift_data,
            }

        monthly_recs = latest_run.summary.get("monthly", [])
        if monthly_recs:
            from app.engine.hotspots import detect_drift
            recomputed = detect_drift(monthly_recs)
            return {
                "factory_id": str(factory_id),
                **recomputed,
            }

    # 2. Fallback: Aggregate from confirmed activity records directly
    from app.engine.hotspots import detect_drift
    records = (
        db.query(ActivityRecord)
        .filter(ActivityRecord.factory_id == factory_id, ActivityRecord.confirmed.is_(True))
        .all()
    )

    monthly_dict: dict[str, dict[str, Any]] = {}
    for r in records:
        m = r.period_month
        if not m:
            continue
        if m not in monthly_dict:
            monthly_dict[m] = {"month": m, "kwh": 0.0, "output": 0.0}
        if r.activity_type_code == "grid_electricity":
            monthly_dict[m]["kwh"] += float(r.quantity or 0.0)
        elif r.activity_type_code == "production_output":
            monthly_dict[m]["output"] += float(r.quantity or 0.0)

    sorted_monthly = [monthly_dict[k] for k in sorted(monthly_dict.keys())]
    drift_result = detect_drift(sorted_monthly)
    return {
        "factory_id": str(factory_id),
        **drift_result,
    }

