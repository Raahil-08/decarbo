"""Dashboard aggregation and analysis API router per PRD §17.2, §17.4, and §22."""

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, require_factory_access
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
    Intervention,
)

router = APIRouter(prefix="/factories", tags=["dashboard"])


class SankeyNode(BaseModel):
    name: str
    itemStyle: dict[str, str] | None = None


class SankeyLink(BaseModel):
    source: str
    target: str
    value: float


class SankeyData(BaseModel):
    nodes: list[SankeyNode]
    links: list[SankeyLink]
    table_rows: list[dict[str, Any]]


class LeakPointItem(BaseModel):
    rank: int
    activity_type: str
    name: str
    scope: str
    category: str
    tco2e: float
    pct_of_total: float
    cumulative_pct: float
    is_pareto_leakpoint: bool = True
    best_fix: dict[str, Any] | None = None


class DriftAlertItem(BaseModel):
    activity_type: str
    percentage_change: float
    period_start: str
    period_end: str
    severity: str
    message: str
    recommendation: str


class ProvenanceItem(BaseModel):
    id: uuid.UUID
    activity_type: str
    activity_name: str
    period: str
    scope: str
    quantity: float
    unit: str
    quantity_canonical: float
    canonical_unit: str
    factor_name: str
    factor_source: str
    factor_version: str
    factor_year: int
    factor_value: float
    factor_unit: str
    formula: str
    kgco2e: float
    tco2e: float
    verified: bool

    model_config = ConfigDict(from_attributes=True)


class DashboardResponse(BaseModel):
    factory_id: uuid.UUID
    factory_name: str
    industry: str
    city: str | None = None
    state: str | None = None
    cluster: str | None = None
    has_data: bool
    period_start: date | None = None
    period_end: date | None = None

    # Top Strip
    annual_tco2e: float
    intensity_tco2e_per_tonne_output: float | None = None
    kwh_per_tonne_output: float | None = None
    estimated_factor_pct: float
    data_quality_label: str

    # Scope totals in tonnes
    scope1_tco2e: float
    scope2_tco2e: float
    scope3_tco2e: float

    # Visualizations & lists
    sankey: SankeyData
    leak_points: list[LeakPointItem]
    drift_alerts: list[DriftAlertItem]
    provenance_items: list[ProvenanceItem]
    circularity: dict[str, Any] | None = None


CATEGORY_LABELS: dict[str, str] = {
    "material": "Raw Materials",
    "electricity": "Grid Electricity",
    "fuel": "Thermal Fuels",
    "transport": "Freight & Logistics",
    "waste": "Waste & Scrap",
    "water": "Water",
    "production": "Production",
}

SCOPE_LABELS: dict[str, str] = {
    "scope1": "Scope 1 (Direct)",
    "scope2": "Scope 2 (Electricity)",
    "scope3": "Scope 3 (Supply Chain)",
}

BEST_FIX_DEFAULTS: dict[str, dict[str, Any]] = {
    "grid_electricity": {
        "title": "Compressed-air leak audit & repair",
        "description": "Ultrasonic leak detection and header pressure reduction",
        "capex_inr": 40000,
        "annual_savings_inr": 180000,
        "payback_str": "~2 to 3 months",
        "cuts_pct": 5.0,
    },
    "brass_input_primary": {
        "title": "Increase recycled scrap share in melt",
        "description": "Shift raw material purchases towards certified secondary brass rod (80% scrap)",
        "capex_inr": 50000,
        "annual_savings_inr": 450000,
        "payback_str": "~1 month",
        "cuts_pct": 35.0,
    },
    "diesel": {
        "title": "Lithium-ion BESS to reduce DG idle hours",
        "description": "Battery backup for control loads during brief grid outages",
        "capex_inr": 600000,
        "annual_savings_inr": 280000,
        "payback_str": "~2.1 years",
        "cuts_pct": 50.0,
    },
    "furnace_oil": {
        "title": "Insulate furnace lids & ceramic lining",
        "description": "Upgrade furnace lining with ceramic fiber blanket and insulated lids",
        "capex_inr": 150000,
        "annual_savings_inr": 220000,
        "payback_str": "~8 months",
        "cuts_pct": 12.0,
    },
    "road_freight_hgv": {
        "title": "Consolidate freight dispatches",
        "description": "Consignment consolidation and route scheduling to maximize truck load factor",
        "capex_inr": 20000,
        "annual_savings_inr": 95000,
        "payback_str": "~2.5 months",
        "cuts_pct": 12.0,
    },
    "cutting_oil": {
        "title": "Centrifugal swarf chip wringer",
        "description": "Centrifuge swarf to recover 90% of adhering neat cutting oil",
        "capex_inr": 250000,
        "annual_savings_inr": 140000,
        "payback_str": "~1.8 years",
        "cuts_pct": 30.0,
    },
}


@router.get("/{factory_id}/dashboard", response_model=DashboardResponse)
def get_factory_dashboard(
    factory_id: uuid.UUID,
    member: AuthenticatedUser = Depends(require_factory_access(min_role="viewer")),
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

    # 1. Fetch latest CalcRun or compute on-the-fly
    calc_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory_id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )

    records = (
        db.query(ActivityRecord)
        .filter(ActivityRecord.factory_id == factory_id)
        .order_by(ActivityRecord.period_month.asc())
        .all()
    )

    if not calc_run and records:
        # Automatically compute and store calculation run
        factors = db.query(EmissionFactor).all()
        activity_types = db.query(ActivityType).all()
        benchmarks = db.query(Benchmark).filter(Benchmark.industry == factory.industry).all()
        all_interventions = db.query(Intervention).all()

        summary, results = calculate_emissions_summary(
            records=records,
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

        months = [r.period_month for r in records if r.period_month]
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
        db.refresh(calc_run)

    if not calc_run or not records:
        # Empty state
        return DashboardResponse(
            factory_id=factory.id,
            factory_name=factory.name,
            industry=factory.industry,
            city=factory.city,
            state=factory.state,
            cluster=factory.cluster,
            has_data=False,
            annual_tco2e=0.0,
            estimated_factor_pct=0.0,
            data_quality_label="No Data",
            scope1_tco2e=0.0,
            scope2_tco2e=0.0,
            scope3_tco2e=0.0,
            sankey=SankeyData(nodes=[], links=[], table_rows=[]),
            leak_points=[],
            drift_alerts=[],
            provenance_items=[],
        )

    # Build Top Strip metrics
    total_kgco2e = float(calc_run.total_kgco2e)
    annual_tco2e = round(total_kgco2e / 1000.0, 1)

    summary_data = calc_run.summary or {}
    by_sc = summary_data.get("by_scope", {})
    scope1_tco2e = round(float(by_sc.get("scope1", summary_data.get("scope1_kgco2e", 0.0))) / 1000.0, 1)
    scope2_tco2e = round(float(by_sc.get("scope2", summary_data.get("scope2_kgco2e", 0.0))) / 1000.0, 1)
    scope3_tco2e = round(float(by_sc.get("scope3", summary_data.get("scope3_kgco2e", 0.0))) / 1000.0, 1)

    intensity_tco2e = None
    if calc_run.intensity_kgco2e_per_output:
        intensity_tco2e = round(float(calc_run.intensity_kgco2e_per_output) / 1000.0, 2)

    # Calculate kWh per tonne output
    grid_records = [r for r in records if r.activity_type == "grid_electricity"]
    total_kwh = sum(float(r.quantity_canonical) for r in grid_records)
    kwh_per_tonne = None
    out_qty = float(calc_run.output_quantity) if calc_run.output_quantity else (float(factory.annual_output) if factory.annual_output else None)
    if out_qty and out_qty > 0:
        kwh_per_tonne = round(total_kwh / out_qty, 0)

    # 2. Fetch EmissionResults for Provenance & Estimated Factor Share
    results_rows = (
        db.query(EmissionResult, ActivityRecord, EmissionFactor, ActivityType)
        .join(ActivityRecord, EmissionResult.activity_record_id == ActivityRecord.id)
        .join(EmissionFactor, EmissionResult.emission_factor_id == EmissionFactor.id)
        .outerjoin(ActivityType, ActivityRecord.activity_type == ActivityType.key)
        .filter(EmissionResult.calc_run_id == calc_run.id)
        .all()
    )

    unverified_emissions_kg = 0.0
    provenance_items: list[ProvenanceItem] = []

    for er, rec, fac, atype in results_rows:
        is_verified = bool(fac.verified and (rec.status == "confirmed" or rec.confidence == 1.0))
        if not is_verified:
            unverified_emissions_kg += float(er.kgco2e)

        act_name = atype.label_en if atype else rec.activity_type.replace("_", " ").title()
        ref_year = 2025
        if fac.reference_year:
            try:
                ref_year = int(str(fac.reference_year)[:4])
            except ValueError:
                ref_year = 2025
        elif fac.valid_to:
            ref_year = fac.valid_to.year

        canonical_u = atype.canonical_unit if atype else rec.unit
        period_str = rec.period_month.strftime("%Y-%m") if hasattr(rec.period_month, "strftime") else str(rec.period_month)

        provenance_items.append(
            ProvenanceItem(
                id=er.id,
                activity_type=rec.activity_type,
                activity_name=act_name,
                period=period_str,
                scope=er.scope,
                quantity=float(rec.quantity),
                unit=rec.unit,
                quantity_canonical=float(rec.quantity_canonical),
                canonical_unit=canonical_u,
                factor_name=fac.source_name,
                factor_source=fac.source_name,
                factor_version=fac.source_version or "v1.0",
                factor_year=ref_year,
                factor_value=float(fac.kgco2e_per_unit),
                factor_unit=fac.per_unit,
                formula=er.formula,
                kgco2e=float(er.kgco2e),
                tco2e=round(float(er.kgco2e) / 1000.0, 2),
                verified=is_verified,
            )
        )

    estimated_pct = (
        round((unverified_emissions_kg / total_kgco2e) * 100.0, 1) if total_kgco2e > 0 else 0.0
    )
    data_quality_label = (
        "100% Invoices & Discom Bills"
        if estimated_pct == 0
        else f"{estimated_pct}% Estimated Factors"
    )

    # 3. Build Sankey Graph (Scope -> Category -> Activity)
    activity_type_map = {
        at.key: at
        for at in db.query(ActivityType).all()
    }

    # Aggregate by Scope -> Category -> Activity
    scope_cat_totals: dict[tuple[str, str], float] = {}
    cat_act_totals: dict[tuple[str, str], float] = {}
    act_scope_map: dict[str, str] = {}
    act_cat_map: dict[str, str] = {}
    act_totals: dict[str, float] = {}

    annual_mult = (
        (12.0 / float(summary_data["months"]))
        if summary_data.get("annualised") and summary_data.get("months")
        else 1.0
    )

    for er, rec, _, atype in results_rows:
        sc = SCOPE_LABELS.get(er.scope, er.scope)
        cat_key = atype.category if atype else "material"
        cat_label = CATEGORY_LABELS.get(cat_key, cat_key.title())
        act_label = atype.label_en if atype else rec.activity_type.replace("_", " ").title()

        er_val_t = (float(er.kgco2e) * annual_mult) / 1000.0
        scope_cat_totals[(sc, cat_label)] = (
            scope_cat_totals.get((sc, cat_label), 0.0) + er_val_t
        )
        cat_act_totals[(cat_label, act_label)] = (
            cat_act_totals.get((cat_label, act_label), 0.0) + er_val_t
        )
        act_scope_map[act_label] = sc
        act_cat_map[act_label] = cat_label
        act_totals[act_label] = act_totals.get(act_label, 0.0) + er_val_t

    nodes: list[SankeyNode] = []
    links: list[SankeyLink] = []
    table_rows: list[dict[str, Any]] = []

    # Node styling colors according to brand tokens
    node_colors = {
        "Scope 1 (Direct)": "#B5432C",       # ember
        "Scope 2 (Electricity)": "#1D2A45",  # ink
        "Scope 3 (Supply Chain)": "#A97A2B", # brass
        "Raw Materials": "#2D7A57",          # leaf
        "Grid Electricity": "#1D2A45",
        "Thermal Fuels": "#B5432C",
        "Freight & Logistics": "#5A6478",    # muted
        "Waste & Scrap": "#8C96A8",
    }

    seen_nodes = set()

    def add_node(name: str):
        if name not in seen_nodes:
            seen_nodes.add(name)
            color = node_colors.get(name, "#5A6478")
            nodes.append(SankeyNode(name=name, itemStyle={"color": color}))

    for (sc, cat), val in scope_cat_totals.items():
        if val > 0.01:
            add_node(sc)
            add_node(cat)
            links.append(SankeyLink(source=sc, target=cat, value=round(val, 2)))

    for (cat, act), val in cat_act_totals.items():
        if val > 0.01:
            add_node(cat)
            add_node(act)
            links.append(SankeyLink(source=cat, target=act, value=round(val, 2)))

    # Table rows for "View as table"
    for act, val in sorted(act_totals.items(), key=lambda x: x[1], reverse=True):
        share_pct = round((val / annual_tco2e) * 100.0, 1) if annual_tco2e > 0 else 0.0
        table_rows.append(
            {
                "scope": act_scope_map.get(act, "Scope 3"),
                "category": act_cat_map.get(act, "Raw Materials"),
                "activity": act,
                "tco2e": round(val, 1),
                "share_pct": share_pct,
            }
        )

    sankey_data = SankeyData(nodes=nodes, links=links, table_rows=table_rows)

    # 4. Leak-Points List
    raw_leak_points = summary_data.get("leak_points") or summary_data.get("by_activity", [])
    leak_points_res: list[LeakPointItem] = []

    cum_pct = 0.0
    for idx, h in enumerate(raw_leak_points, start=1):
        act_key = h["activity_type"]
        atype = activity_type_map.get(act_key)
        name = atype.label_en if atype else act_key.replace("_", " ").title()
        scope = atype.scope if atype else "scope3"
        category = atype.category if atype else "material"

        fix_info = BEST_FIX_DEFAULTS.get(act_key)
        if not fix_info and h.get("top_fix"):
            tf = h["top_fix"]
            fix_info = {
                "title": tf.get("title_en", ""),
                "description": tf.get("code", ""),
                "capex_inr": 0,
                "annual_savings_inr": 0,
                "payback_str": "Standard",
                "cuts_pct": 5.0,
            }

        share_val = float(h.get("share") or (h.get("pct_of_total", 0.0) / 100.0))
        pct_of_total = share_val * 100.0 if share_val <= 1.0 else share_val
        if "cumulative_share" in h:
            cum_share = float(h["cumulative_share"])
            cumulative_pct = cum_share * 100.0 if cum_share <= 1.0 else cum_share
        else:
            cum_pct += pct_of_total
            cumulative_pct = cum_pct

        is_pareto = h.get("is_pareto_leakpoint", cumulative_pct <= 85.0 or idx <= 3)

        leak_points_res.append(
            LeakPointItem(
                rank=idx,
                activity_type=act_key,
                name=name,
                scope=SCOPE_LABELS.get(scope, scope),
                category=CATEGORY_LABELS.get(category, category.title()),
                tco2e=round(float(h["kgco2e"]) / 1000.0, 1),
                pct_of_total=round(pct_of_total, 1),
                cumulative_pct=round(min(cumulative_pct, 100.0), 1),
                is_pareto_leakpoint=is_pareto,
                best_fix=fix_info,
            )
        )

    # 5. Drift Alerts
    raw_drift = summary_data.get("drift", {}) or {}
    drift_alerts_res: list[DriftAlertItem] = []

    if raw_drift.get("drift_detected"):
        drift_alerts_res.append(
            DriftAlertItem(
                activity_type=raw_drift.get("metric", "grid_electricity"),
                percentage_change=raw_drift.get("percentage_change", 14.0),
                period_start=raw_drift.get("recent_window_start", "2026-06"),
                period_end=raw_drift.get("recent_window_end", "2026-08"),
                severity="high" if raw_drift.get("percentage_change", 0) > 10 else "medium",
                message=f"Electricity consumption intensity increased by +{raw_drift.get('percentage_change', 14.0):.1f}% over the last quarter.",
                recommendation="Investigate compressed-air distribution line leaks, idling motor losses, or unmetered holding furnaces.",
            )
        )

    return DashboardResponse(
        factory_id=factory.id,
        factory_name=factory.name,
        industry=factory.industry,
        city=factory.city,
        state=factory.state,
        cluster=factory.cluster,
        has_data=True,
        period_start=calc_run.period_start,
        period_end=calc_run.period_end,
        annual_tco2e=annual_tco2e,
        intensity_tco2e_per_tonne_output=intensity_tco2e,
        kwh_per_tonne_output=kwh_per_tonne,
        estimated_factor_pct=estimated_pct,
        data_quality_label=data_quality_label,
        scope1_tco2e=scope1_tco2e,
        scope2_tco2e=scope2_tco2e,
        scope3_tco2e=scope3_tco2e,
        sankey=sankey_data,
        leak_points=leak_points_res,
        drift_alerts=drift_alerts_res,
        provenance_items=provenance_items,
        circularity=summary_data.get("circularity"),
    )
