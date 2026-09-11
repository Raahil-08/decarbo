"""Calculation router for running emissions calculations, leak-point finder, and provenance."""

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import require_factory_access
from app.db import get_db
from app.engine.emissions import calculate_emissions_summary
from app.engine.hotspots import compute_circularity_score, detect_drift, find_leak_points
from app.models.models import (
    ActivityRecord,
    ActivityType,
    Benchmark,
    CalcRun,
    EmissionFactor,
    EmissionResult,
    Factory,
    FactoryMember,
    Intervention,
)

router = APIRouter(prefix="/factories", tags=["calculations"])


class CalcRunResponse(BaseModel):
    id: uuid.UUID
    factory_id: uuid.UUID
    period_start: date
    period_end: date
    total_kgco2e: float
    output_quantity: float | None
    intensity_kgco2e_per_output: float | None
    summary: dict[str, Any]

    model_config = ConfigDict(from_attributes=True)


class EmissionResultItemResponse(BaseModel):
    id: uuid.UUID
    calc_run_id: uuid.UUID
    activity_record_id: uuid.UUID
    emission_factor_id: uuid.UUID
    scope: str
    kgco2e: float
    formula: str

    model_config = ConfigDict(from_attributes=True)


@router.post(
    "/{factory_id}/calculate", response_model=CalcRunResponse, status_code=status.HTTP_201_CREATED
)
def run_factory_calculation(
    factory_id: uuid.UUID,
    member: FactoryMember = Depends(require_factory_access(min_role="member")),
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

    # Fetch activity records for this factory (prefer confirmed; include draft if no confirmed)
    confirmed_records = (
        db.query(ActivityRecord)
        .filter(ActivityRecord.factory_id == factory_id, ActivityRecord.status == "confirmed")
        .all()
    )
    records = (
        confirmed_records
        if confirmed_records
        else (db.query(ActivityRecord).filter(ActivityRecord.factory_id == factory_id).all())
    )

    factors = db.query(EmissionFactor).all()
    activity_types = db.query(ActivityType).all()
    benchmarks = db.query(Benchmark).filter(Benchmark.industry == factory.industry).all()
    all_interventions = db.query(Intervention).all()

    # Run engine calculations
    summary, results = calculate_emissions_summary(
        records=records,
        factors=factors,
        activity_types=activity_types,
        factory_region=factory.grid_region or "IN-GJ",
        output_unit=factory.output_unit or "t",
    )

    # Leak-points Pareto ranking
    leak_points = find_leak_points(
        summary=summary,
        benchmarks=benchmarks,
        interventions=all_interventions,
        industry=factory.industry,
    )

    # Drift detector
    drift = detect_drift(summary.get("monthly", []))

    # Benchmark typical intensity
    bm_intensity = None
    for b in benchmarks:
        if getattr(b, "metric", "") == "kgco2e_per_t_output":
            bm_intensity = float(getattr(b, "value_mode", 0.0) or 0.0)

    # Circularity score
    circularity = compute_circularity_score(summary, benchmark_intensity=bm_intensity)

    # Enrich summary
    summary["leak_points"] = leak_points
    summary["drift"] = drift
    summary["circularity"] = circularity

    # Determine date range
    if records:
        months = [r.period_month for r in records if getattr(r, "period_month", None)]
        p_start = min(months) if months else date.today()
        p_end = max(months) if months else date.today()
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

    # Save emission_results rows
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
    db.refresh(calc_run)
    return calc_run


@router.get("/{factory_id}/calc-runs/latest", response_model=CalcRunResponse)
def get_latest_calculation(
    factory_id: uuid.UUID,
    member: FactoryMember = Depends(require_factory_access(min_role="viewer")),
    db: Session = Depends(get_db),
):
    calc_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory_id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )
    if not calc_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "NO_CALC_RUNS",
                    "message_key": "errors.no_calc_runs",
                    "details": {},
                }
            },
        )
    return calc_run


@router.get(
    "/{factory_id}/calc-runs/{calc_run_id}/results", response_model=list[EmissionResultItemResponse]
)
def get_calculation_provenance(
    factory_id: uuid.UUID,
    calc_run_id: uuid.UUID,
    member: FactoryMember = Depends(require_factory_access(min_role="viewer")),
    db: Session = Depends(get_db),
):
    calc_run = (
        db.query(CalcRun)
        .filter(CalcRun.id == calc_run_id, CalcRun.factory_id == factory_id)
        .first()
    )
    if not calc_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CALC_RUN_NOT_FOUND",
                    "message_key": "errors.calc_run_not_found",
                    "details": {},
                }
            },
        )

    results = db.query(EmissionResult).filter(EmissionResult.calc_run_id == calc_run_id).all()
    return results
