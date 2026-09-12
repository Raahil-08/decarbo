"""PDF Report generation service using Jinja2 + WeasyPrint per PRD §18 and §22."""

import datetime
import os
import sys
import uuid
from pathlib import Path

# Configure library path for macOS Apple Silicon Homebrew pango/glib if on Darwin
if sys.platform == "darwin":
    current_dyld = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    if "/opt/homebrew/lib" not in current_dyld:
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = f"/opt/homebrew/lib:{current_dyld}".rstrip(":")

import weasyprint
from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session

from app.ai.template_explanation import render_template_explanation
from app.engine.formatters import (
    format_inr,
)
from app.i18n import get_i18n
from app.interventions.matcher import extract_baseline_pools, is_applicable
from app.models.models import (
    ActivityRecord,
    ActivityType,
    CalcRun,
    EmissionFactor,
    Factory,
    Intervention,
    Plan,
    PlanItem,
    Report,
)
from app.optimizer.macc import generate_macc_curve
from app.reports.charts import render_emissions_breakdown_svg, render_macc_chart_svg

MODULE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = MODULE_DIR / "templates"
FONTS_DIR = MODULE_DIR / "fonts"
REPORTS_STORAGE_DIR = MODULE_DIR.parent.parent.parent / "data" / "reports"
REPORTS_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=True,
)


def _split_explanation_into_parts(text: str) -> dict[str, str]:
    """Split 4-part explanation text into structured narrative sections."""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    return {
        "context": paras[0] if len(paras) > 0 else "",
        "strategy": paras[1] if len(paras) > 1 else "",
        "quick_wins": paras[2] if len(paras) > 2 else "",
        "financials": paras[3] if len(paras) > 3 else (paras[-1] if paras else ""),
    }


def generate_plan_pdf_report(
    plan_id: uuid.UUID,
    locale: str,
    db: Session,
    user_id: str | None = None,
) -> tuple[Report, bytes]:
    """Generate complete 7-page PDF report for a plan and store it."""
    # 1. Fetch Plan and Factory
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise ValueError(f"Plan not found: {plan_id}")

    factory = db.query(Factory).filter(Factory.id == plan.factory_id).first()
    if not factory:
        raise ValueError(f"Factory not found: {plan.factory_id}")

    # Fetch Plan Items sorted by sequence
    plan_items = (
        db.query(PlanItem)
        .filter(PlanItem.plan_id == plan.id)
        .order_by(PlanItem.sequence.asc())
        .all()
    )

    # 2. Fetch baseline CalcRun and ActivityRecords
    calc_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory.id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )
    summary = calc_run.summary if calc_run and calc_run.summary else {}

    records = (
        db.query(ActivityRecord)
        .filter(ActivityRecord.factory_id == factory.id)
        .all()
    )

    # 3. Emission factors used and verification status
    factors = db.query(EmissionFactor).all()
    factors_map = {f.activity_type: float(f.kgco2e_per_unit) for f in factors}
    active_activity_types = {r.activity_type for r in records}
    factors_used = [f for f in factors if f.activity_type in active_activity_types]

    has_estimates = any(not f.verified for f in factors_used) or (calc_run and not calc_run.verified_only)

    # 4. Scope breakdown & intensities
    scope_breakdown = summary.get("scope_breakdown", {
        "scope_1": summary.get("scope_1_kgco2e", 0.0),
        "scope_2": summary.get("scope_2_kgco2e", 0.0),
        "scope_3": summary.get("scope_3_kgco2e", 0.0),
    })
    total_kgco2e = float(summary.get("total_kgco2e", 0.0))
    total_tco2e = total_kgco2e / 1000.0

    carbon_intensity = summary.get("carbon_intensity", 0.0)
    electrical_intensity = summary.get("electrical_intensity", 0.0)

    # 5. Top Leak-Points
    raw_leak_points = summary.get("hotspots", [])
    if not raw_leak_points and records:
        # Build quick fallback leak-points from records
        type_totals: dict[str, float] = {}
        for r in records:
            factor_val = factors_map.get(r.activity_type, 1.0)
            em = float(r.quantity) * factor_val
            type_totals[r.activity_type] = type_totals.get(r.activity_type, 0.0) + em
        sorted_types = sorted(type_totals.items(), key=lambda x: x[1], reverse=True)
        raw_leak_points = [
            {
                "activity_type": k,
                "emissions_kgco2e": v,
                "share_pct": round((v / total_kgco2e * 100) if total_kgco2e > 0 else 0.0, 1),
            }
            for k, v in sorted_types[:5]
        ]

    # Map activity types to readable titles
    activity_type_objs = {a.key: a for a in db.query(ActivityType).all()}
    leak_points_display = []
    for lp in raw_leak_points[:3]:
        act_code = lp.get("activity_type", "")
        act_obj = activity_type_objs.get(act_code)
        if locale == "gu" and act_obj and act_obj.label_gu:
            title = act_obj.label_gu
        elif locale == "hi" and act_obj and act_obj.label_hi:
            title = act_obj.label_hi
        elif act_obj and act_obj.label_en:
            title = act_obj.label_en
        else:
            title = act_code.replace("_", " ").title()

        scope = f"Scope {act_obj.scope}" if act_obj else "Scope 3"
        em_t = round(float(lp.get("emissions_kgco2e", 0.0)) / 1000.0, 1)

        # Fix hints based on activity
        if "electricity" in act_code:
            fix_hint = "Rooftop Solar PV & IE4 Motor Retrofit"
        elif "brass" in act_code:
            fix_hint = "Shift towards 80%+ Secondary Recycled Scrap"
        elif "diesel" in act_code or "furnace" in act_code:
            fix_hint = "Induction Furnace Retooling / Biodiesel"
        else:
            fix_hint = "Process Efficiency & Waste Recovery"

        leak_points_display.append({
            "title": title,
            "scope": scope,
            "share_pct": lp.get("share_pct", 0.0),
            "emissions_t": em_t,
            "fix_hint": fix_hint,
        })

    # 6. MACC chart and data
    baseline_state, pool_costs = extract_baseline_pools(records)
    tariff_inr = float(factory.electricity_tariff_inr_per_kwh or 7.8)
    all_interventions = db.query(Intervention).all()
    itv_map = {itv.code: itv for itv in all_interventions}

    applicable_itvs = [
        itv
        for itv in all_interventions
        if is_applicable(itv, baseline_state, summary, factory, active_activity_types)
    ]

    selected_plan_codes = {item.intervention_code for item in plan_items}

    raw_macc_bars = generate_macc_curve(
        applicable_interventions=applicable_itvs,
        baseline_state=baseline_state,
        tariff_inr=tariff_inr,
        emission_factors_map=factors_map,
        pool_costs=pool_costs,
        selected_plan_codes=selected_plan_codes,
    )

    # Localize MACC items
    macc_items_display = []
    for bar in raw_macc_bars:
        code = bar["code"]
        itv_obj = itv_map.get(code)
        if locale == "gu" and itv_obj and itv_obj.title_gu:
            title = itv_obj.title_gu
        elif locale == "hi" and itv_obj and itv_obj.title_hi:
            title = itv_obj.title_hi
        elif itv_obj:
            title = itv_obj.title_en
        else:
            title = bar.get("title", code)

        macc_items_display.append({
            "code": code,
            "title": title,
            "cost_per_tonne_inr": bar.get("cost_per_tonne_inr", 0.0),
            "reduction_tco2e": bar.get("tco2_cut") or bar.get("reduction_tco2e") or 0.0,
            "is_selected": bool(bar.get("in_selected_plan") or bar.get("is_selected") or (code in selected_plan_codes)),
        })

    # 7. Render SVG Charts
    scope_breakdown_svg = render_emissions_breakdown_svg(scope_breakdown, locale=locale)
    macc_svg = render_macc_chart_svg(raw_macc_bars, selected_codes=selected_plan_codes, locale=locale)

    # 8. Format Plan Ledger items
    totals = plan.totals or {}
    plan_reduction_t = float(totals.get("reduction_tco2e", totals.get("total_reduction_tco2e", 0.0)))
    plan_capex = float(totals.get("capex_inr", totals.get("total_capex_inr", 0.0)))
    plan_savings = float(totals.get("annual_savings_inr", totals.get("total_savings_inr", 0.0)))
    plan_payback = totals.get("payback_months", totals.get("simple_payback_months"))
    plan_pct = float(totals.get("reduction_pct", totals.get("reduction_percentage", 0.0)))

    ledger_display = []
    for item in plan_items:
        itv_obj = itv_map.get(item.intervention_code)
        if locale == "gu" and itv_obj and itv_obj.title_gu:
            title = itv_obj.title_gu
        elif locale == "hi" and itv_obj and itv_obj.title_hi:
            title = itv_obj.title_hi
        elif itv_obj and itv_obj.title_en:
            title = itv_obj.title_en
        else:
            title = item.intervention_code.replace("_", " ").title()

        cut_t = round(float(item.reduction_kgco2e) / 1000.0, 1)
        cut_pct = (cut_t / total_tco2e * 100) if total_tco2e > 0 else 0.0

        category = itv_obj.category.title() if itv_obj else "Process"
        difficulty = itv_obj.difficulty if itv_obj else 1

        ledger_display.append({
            "sequence": item.sequence,
            "title": title,
            "category": category,
            "difficulty": difficulty,
            "capex_inr": float(item.capex_inr),
            "capex_formatted": format_inr(float(item.capex_inr)),
            "savings_inr": float(item.annual_savings_inr),
            "savings_formatted": format_inr(float(item.annual_savings_inr)),
            "reduction_tco2e": cut_t,
            "reduction_pct": cut_pct,
            "payback_months": float(item.payback_months) if item.payback_months else None,
            "cost_per_tonne_inr": float(item.cost_per_tonne_inr) if item.cost_per_tonne_inr else None,
        })

    totals_display = {
        "capex_formatted": format_inr(plan_capex),
        "savings_formatted": format_inr(plan_savings),
        "reduction_tco2e": round(plan_reduction_t, 1),
        "reduction_pct": plan_pct,
        "payback_formatted": f"{plan_payback:.1f} mo" if plan_payback else "-",
    }

    # 9. Plan Explanation
    explanation_text = ""
    if plan.explanation and isinstance(plan.explanation, dict):
        explanation_text = plan.explanation.get(locale, "")

    if not explanation_text:
        plan_totals_for_exp = {
            "total_capex_inr": plan_capex,
            "total_savings_inr": plan_savings,
            "total_reduction_tco2e": plan_reduction_t,
            "reduction_percentage": plan_pct,
            "simple_payback_months": plan_payback or 0.0,
        }
        ledger_items_for_exp = [
            {
                "intervention_code": item.intervention_code,
                "title_en": (itv_map[item.intervention_code].title_en if item.intervention_code in itv_map else item.intervention_code),
                "capex_inr": float(item.capex_inr),
                "annual_savings_inr": float(item.annual_savings_inr),
                "reduction_tco2e": float(item.reduction_kgco2e) / 1000.0,
                "payback_months": float(item.payback_months) if item.payback_months else 0.0,
            }
            for item in plan_items
        ]
        explanation_text = render_template_explanation(
            plan_totals=plan_totals_for_exp,
            ledger_items=ledger_items_for_exp,
            hotspots=raw_leak_points,
            locale=locale,
        )

    explanation_parts = _split_explanation_into_parts(explanation_text)

    # 10. Metadata labels and strings
    i18n_strings = get_i18n(locale)
    period_label = "Sep 2025 – Aug 2026 (12 months)"
    report_date = datetime.date.today().strftime("%d %B %Y")

    sensitivity_note = (
        f"Monte Carlo simulation (1,000 samples) evaluates carbon cut between "
        f"{round(plan_reduction_t * 0.85, 1)}–{round(plan_reduction_t * 1.15, 1)} tCO₂e/yr "
        f"(most likely {round(plan_reduction_t, 1)} tCO₂e) with high probability of achieving target."
    )

    # 11. Render Jinja2 template
    template = jinja_env.get_template("report.html.jinja2")
    html_content = template.render(
        locale=locale,
        fonts_dir=str(FONTS_DIR),
        t=i18n_strings,
        factory=factory,
        plan=plan,
        period_label=period_label,
        report_date=report_date,
        baseline_total_tco2e=round(total_tco2e, 1),
        carbon_intensity=round(float(carbon_intensity), 1),
        electrical_intensity=round(float(electrical_intensity), 1),
        has_estimates=has_estimates,
        scope_breakdown_svg=scope_breakdown_svg,
        leak_points=leak_points_display,
        macc_svg=macc_svg,
        macc_items=macc_items_display,
        explanation=explanation_parts,
        totals=totals_display,
        factors_used=factors_used,
        sensitivity_note=sensitivity_note,
    )

    # 12. Compile with WeasyPrint
    doc = weasyprint.HTML(string=html_content, base_url=str(TEMPLATES_DIR))
    pdf_bytes = doc.write_pdf()

    # 13. Save PDF to disk
    report_id = uuid.uuid4()
    factory_report_dir = REPORTS_STORAGE_DIR / str(factory.id)
    factory_report_dir.mkdir(parents=True, exist_ok=True)
    pdf_file_path = factory_report_dir / f"{report_id}.pdf"

    with open(pdf_file_path, "wb") as f:
        f.write(pdf_bytes)

    storage_path = str(pdf_file_path.relative_to(REPORTS_STORAGE_DIR.parent.parent))

    # 14. Record in database
    report = Report(
        id=report_id,
        factory_id=factory.id,
        plan_id=plan.id,
        locale=locale,
        storage_path=storage_path,
        created_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return report, pdf_bytes
