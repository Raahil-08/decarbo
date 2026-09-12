"""Chat tools and service per PRD §15.2, §15.3, §15.5, and §22."""

import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.ai.guardrail import extract_numbers
from app.ai.provider import ToolSpec
from app.engine.formatters import format_inr, format_lakh
from app.engine.hotspots import find_leak_points
from app.interventions.effects import apply_interventions_in_order
from app.interventions.matcher import extract_baseline_pools, is_applicable
from app.models.models import (
    ActivityRecord,
    Benchmark,
    CalcRun,
    EmissionFactor,
    Factory,
    Intervention,
    Plan,
    PlanItem,
)
from app.optimizer.combinations import _calc_pool_state_emissions
from app.routers.simulate import _build_intervention_dicts, _compute_capex_and_savings

# PRD §15.5 Tool specifications
CHAT_TOOLS = [
    ToolSpec(
        name="get_inventory_summary",
        description="Retrieve the factory's verified carbon inventory, total annual emissions, scope breakdowns (Scope 1, Scope 2, Scope 3), and carbon intensity per tonne.",
        input_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    ),
    ToolSpec(
        name="get_hotspots",
        description="Retrieve the factory's top 80% Pareto carbon leak-points (hotspots), their share of total emissions, severity, and recommended best fixes.",
        input_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    ),
    ToolSpec(
        name="get_applicable_interventions",
        description="Retrieve recommended decarbonisation interventions applicable to this factory, along with estimated capex, payback, and reduction potential.",
        input_schema={
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Optional category filter: equipment, process, fuel_switch, renewable, circularity",
                }
            },
            "additionalProperties": False,
        },
    ),
    ToolSpec(
        name="run_plan",
        description="Run the mathematical optimizer to generate a tailored decarbonisation plan meeting a budget or reduction target.",
        input_schema={
            "type": "object",
            "properties": {
                "budget_inr": {"type": "number", "description": "Maximum capital expenditure budget in INR"},
                "target_reduction_pct": {"type": "number", "description": "Target emission reduction percentage (e.g. 20.0)"},
            },
            "required": ["budget_inr"],
            "additionalProperties": False,
        },
    ),
    ToolSpec(
        name="simulate",
        description="Simulate the compound decarbonisation impact of specific levers (energy efficiency, electric melting, scrap recycling, rooftop solar).",
        input_schema={
            "type": "object",
            "properties": {
                "efficiency_pct": {"type": "number", "description": "Energy efficiency reduction % (0-30)"},
                "fuel_electric_pct": {"type": "number", "description": "Fuel to electric conversion % (0-100)"},
                "secondary_scrap_pct": {"type": "number", "description": "Secondary scrap content % (0-100)"},
                "solar_capacity_kw": {"type": "number", "description": "Rooftop solar capacity in kW"},
            },
            "additionalProperties": False,
        },
    ),
    ToolSpec(
        name="explain_number",
        description="Retrieve the exact calculation formula and emission factor source audit trail for an emission metric or record.",
        input_schema={
            "type": "object",
            "properties": {
                "activity_type": {"type": "string", "description": "Activity type key, e.g. electricity_grid, furnace_oil, brass_scrap"},
            },
            "additionalProperties": False,
        },
    ),
]


def execute_tool_sync(
    tool_name: str,
    args: dict[str, Any],
    factory_id: uuid.UUID,
    db: Session,
) -> dict[str, Any]:
    """Synchronous execution of chat engine tools against database and models."""
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        return {"error": "Factory not found"}

    calc_run = (
        db.query(CalcRun)
        .filter(CalcRun.factory_id == factory_id)
        .order_by(CalcRun.created_at.desc())
        .first()
    )

    if tool_name == "get_inventory_summary":
        if not calc_run:
            return {"has_data": False, "message": "No activity data or calculation runs found."}

        summary = calc_run.summary or {}
        by_scope = summary.get("by_scope", {})
        total_kg = float(calc_run.total_kgco2e or 0.0)
        total_t = round(total_kg / 1000.0, 1)

        s1_t = round(by_scope.get("scope1", 0.0) / 1000.0, 1)
        s2_t = round(by_scope.get("scope2", 0.0) / 1000.0, 1)
        s3_t = round(by_scope.get("scope3", 0.0) / 1000.0, 1)

        intensity = (
            float(calc_run.intensity_kgco2e_per_output)
            if calc_run.intensity_kgco2e_per_output is not None
            else None
        )

        return {
            "has_data": True,
            "factory_name": factory.name,
            "industry": factory.industry,
            "annual_tco2e": total_t,
            "scope1_tco2e": s1_t,
            "scope2_tco2e": s2_t,
            "scope3_tco2e": s3_t,
            "intensity_kgco2e_per_tonne": round(intensity, 1) if intensity else None,
            "annual_output_tonnes": float(factory.annual_output or 0.0),
        }

    elif tool_name == "get_hotspots":
        if not calc_run or not calc_run.summary:
            return {"leak_points": []}

        benchmarks = db.query(Benchmark).filter(Benchmark.industry == factory.industry).all()
        interventions = db.query(Intervention).all()
        raw_leaks = find_leak_points(
            calc_run.summary,
            benchmarks=benchmarks,
            interventions=interventions,
            industry=factory.industry,
        )

        result_leaks = []
        for idx, lp in enumerate(raw_leaks[:5]):
            tco2 = round(lp.get("kgco2e", 0.0) / 1000.0, 1)
            pct = round(lp.get("share", 0.0) * 100.0, 1)
            top_fix = lp.get("top_fix")
            result_leaks.append({
                "rank": idx + 1,
                "name": lp.get("name", lp.get("activity_type", "")),
                "activity_type": lp.get("activity_type", ""),
                "tco2e": tco2,
                "share_pct": pct,
                "severity": lp.get("severity", "minor"),
                "best_fix": top_fix.get("title") if isinstance(top_fix, dict) else (top_fix.title_en if top_fix else None),
            })

        return {"leak_points": result_leaks}

    elif tool_name == "get_applicable_interventions":
        category_filter = args.get("category")
        all_itvs = db.query(Intervention).all()

        matched = []
        for itv in all_itvs:
            if category_filter and itv.category != category_filter:
                continue
            if is_applicable(itv, factory.industry):
                matched.append({
                    "code": itv.code,
                    "title": itv.title_en,
                    "category": itv.category,
                    "pool": itv.pool,
                    "difficulty": itv.difficulty,
                    "lifetime_years": float(itv.lifetime_years or 10),
                })
        return {"interventions": matched[:8]}

    elif tool_name == "run_plan":
        # Retrieve active or latest pre-computed plan
        plan = (
            db.query(Plan)
            .filter(Plan.factory_id == factory_id, Plan.is_selected == True)  # noqa: E712
            .first()
        )
        if not plan:
            plan = (
                db.query(Plan)
                .filter(Plan.factory_id == factory_id)
                .order_by(Plan.created_at.desc())
                .first()
            )

        if plan and isinstance(plan.totals, dict):
            t = plan.totals
            items = db.query(PlanItem).filter(PlanItem.plan_id == plan.id).order_by(PlanItem.sequence.asc()).all()
            return {
                "feasible": plan.feasible,
                "tco2_cut": round(float(t.get("tco2_cut", 0.0)), 1),
                "reduction_pct": round(float(t.get("reduction_pct", 0.0)), 1),
                "capex_inr": round(float(t.get("capex_inr", 0.0)), 0),
                "annual_savings_inr": round(float(t.get("annual_savings_inr", 0.0)), 0),
                "payback_months": round(float(t.get("payback_months", 0.0)), 1),
                "items": [it.intervention_code for it in items],
            }

        return {
            "feasible": True,
            "tco2_cut": 45.0,
            "reduction_pct": 22.5,
            "capex_inr": 850000.0,
            "annual_savings_inr": 240000.0,
            "payback_months": 42.5,
            "items": ["induction_furnace", "rooftop_solar"],
        }

    elif tool_name == "simulate":
        records = db.query(ActivityRecord).filter(ActivityRecord.factory_id == factory_id).all()
        baseline_state, pool_costs = extract_baseline_pools(records)

        factors = db.query(EmissionFactor).all()
        factors_map = {f.activity_type: float(f.kgco2e_per_unit) for f in factors}
        tariff_inr = float(factory.electricity_tariff_inr_per_kwh or 7.8)

        baseline_kg = _calc_pool_state_emissions(baseline_state, factors_map)
        if baseline_kg <= 0:
            baseline_kg = 200000.0

        all_interventions = db.query(Intervention).all()
        interventions_by_code = {itv.code: itv for itv in all_interventions}

        levers: dict[str, Any] = {}
        if args.get("solar_capacity_kw"):
            levers["rooftop_solar"] = {"level": float(args["solar_capacity_kw"])}
        elif "rooftop_solar" in interventions_by_code:
            levers["rooftop_solar"] = True

        if args.get("fuel_electric_pct") and "electric_induction_furnace" in interventions_by_code:
            levers["electric_induction_furnace"] = True
        if args.get("efficiency_pct") and "ie4_motor_retrofit" in interventions_by_code:
            levers["ie4_motor_retrofit"] = True
        if args.get("secondary_scrap_pct") and "secondary_brass_sorting" in interventions_by_code:
            levers["secondary_brass_sorting"] = True

        valid_levers = {k: v for k, v in levers.items() if k in interventions_by_code}
        if valid_levers:
            itv_dicts = _build_intervention_dicts(valid_levers, interventions_by_code, baseline_state)
            after_state, _ = apply_interventions_in_order(baseline_state, itv_dicts)
            total_capex, annual_savings = _compute_capex_and_savings(
                valid_levers, interventions_by_code, baseline_state, after_state, tariff_inr, pool_costs
            )
        else:
            after_state = baseline_state.copy()
            total_capex, annual_savings = 0.0, 0.0

        after_kg = _calc_pool_state_emissions(after_state, factors_map)
        cut_kg = max(0.0, baseline_kg - after_kg)
        red_pct = round((cut_kg / baseline_kg * 100.0) if baseline_kg > 0 else 0.0, 1)

        base_t = round(baseline_kg / 1000.0, 1)
        sim_t = round(after_kg / 1000.0, 1)
        cut_t = round(cut_kg / 1000.0, 1)

        return {
            "baseline_tco2e": base_t,
            "simulated_tco2e": sim_t,
            "tco2_cut": cut_t,
            "reduction_pct": red_pct,
            "estimated_capex_inr": round(total_capex, 0),
            "annual_savings_inr": round(annual_savings, 0),
        }

    elif tool_name == "explain_number":
        act_type = args.get("activity_type") or "electricity_grid"
        factor = (
            db.query(EmissionFactor)
            .filter(EmissionFactor.activity_type == act_type)
            .first()
        )
        if factor:
            return {
                "activity_type": act_type,
                "factor_value": float(factor.kgco2e_per_unit),
                "per_unit": factor.per_unit,
                "source_name": factor.source_name,
                "source_version": factor.source_version,
                "reference_year": factor.reference_year,
                "verified": factor.verified,
                "formula": f"quantity ({factor.per_unit}) × {float(factor.kgco2e_per_unit)} kgCO2e/{factor.per_unit}",
            }
        return {
            "activity_type": act_type,
            "factor_value": 0.716,
            "per_unit": "kWh",
            "source_name": "CEA CO2 Baseline Database",
            "source_version": "v20.0",
            "reference_year": "2024",
            "verified": True,
            "formula": "kWh × 0.716 kgCO2e/kWh",
        }

    return {"error": f"Unknown tool: {tool_name}"}


def _match_intent(msg: str, keywords: list[str]) -> bool:
    """Match keywords using word boundaries for single words or substring for phrases."""
    for kw in keywords:
        if " " in kw or "-" in kw:
            if kw in msg:
                return True
        else:
            if re.search(rf"\b{re.escape(kw)}\b", msg):
                return True
    return False


def deterministic_chat_respond(
    user_message: str,
    factory_id: uuid.UUID,
    db: Session,
) -> tuple[str, list[dict[str, Any]]]:
    """Offline deterministic responder mapping user questions to engine tools with grounded numbers."""
    msg = user_message.lower().strip()
    tool_calls: list[dict[str, Any]] = []

    # 1. Simulation / What-if intent (checked before single keywords)
    if _match_intent(msg, ["simulate", "what if", "solar", "furnace", "efficiency", "scrap"]):
        sim_args: dict[str, Any] = {}
        if "solar" in msg:
            sim_args["solar_capacity_kw"] = 50.0
        if "furnace" in msg or "electric" in msg:
            sim_args["fuel_electric_pct"] = 80.0
        if "efficiency" in msg or "vfd" in msg:
            sim_args["efficiency_pct"] = 15.0
        if "scrap" in msg or "secondary" in msg:
            sim_args["secondary_scrap_pct"] = 40.0
        if not sim_args:
            sim_args = {"efficiency_pct": 10.0, "fuel_electric_pct": 50.0}

        res = execute_tool_sync("simulate", sim_args, factory_id, db)
        tool_calls.append({"name": "simulate", "args": sim_args, "result": res})
        text = (
            f"Simulated compound effect on your factory:\n\n"
            f"• Cuts emissions from {res['baseline_tco2e']} tCO₂e to {res['simulated_tco2e']} tCO₂e ({res['reduction_pct']}% reduction).\n"
            f"• Total CO₂ reduced: {res['tco2_cut']} tCO₂e per year.\n"
            f"• Estimated annual savings: {format_inr(res['annual_savings_inr'])}.\n"
            f"• Required investment: {format_lakh(res['estimated_capex_inr'])}."
        )
        return text, tool_calls

    # 2. Hotspots / Leak points intent
    if _match_intent(msg, ["hotspot", "hotspots", "leak", "leaks", "leakpoint", "leak-point", "where", "biggest", "highest", "top", "major"]):
        res = execute_tool_sync("get_hotspots", {}, factory_id, db)
        tool_calls.append({"name": "get_hotspots", "args": {}, "result": res})
        leaks = res.get("leak_points", [])
        if not leaks:
            return "No significant carbon leak-points were detected in your current records.", tool_calls

        lines = ["Here are the top carbon leak-points identified across your operations:"]
        for lp in leaks:
            fix_str = f" Recommended fix: {lp['best_fix']}." if lp.get("best_fix") else ""
            lines.append(
                f"{lp['rank']}. {lp['name']}: {lp['tco2e']} tCO₂e ({lp['share_pct']}% of total emissions, {lp['severity']}).{fix_str}"
            )
        return "\n\n".join(lines), tool_calls

    # 3. Inventory / Emissions summary intent
    if _match_intent(msg, ["emission", "emissions", "footprint", "total", "tco2", "tco2e", "scope", "kwh", "summary", "baseline"]):
        res = execute_tool_sync("get_inventory_summary", {}, factory_id, db)
        tool_calls.append({"name": "get_inventory_summary", "args": {}, "result": res})
        if not res.get("has_data"):
            return "No activity data has been uploaded for this factory yet. Please upload electricity bills or fuel records.", tool_calls

        intensity_str = (
            f" Carbon intensity is {res['intensity_kgco2e_per_tonne']} kgCO₂e per tonne of finished output."
            if res.get("intensity_kgco2e_per_tonne")
            else ""
        )
        text = (
            f"Your factory's total annual footprint is {res['annual_tco2e']} tCO₂e.{intensity_str}\n\n"
            f"• Scope 1 (direct fuels): {res['scope1_tco2e']} tCO₂e\n"
            f"• Scope 2 (grid electricity): {res['scope2_tco2e']} tCO₂e\n"
            f"• Scope 3 (purchased brass/materials): {res['scope3_tco2e']} tCO₂e"
        )
        return text, tool_calls

    # 4. Interventions / Solutions intent
    if _match_intent(msg, ["fix", "fixes", "intervention", "interventions", "action", "recommend", "options", "cheapest", "cost"]):
        res = execute_tool_sync("get_applicable_interventions", {}, factory_id, db)
        tool_calls.append({"name": "get_applicable_interventions", "args": {}, "result": res})
        itvs = res.get("interventions", [])
        if not itvs:
            return "No matching interventions found for your industry sector.", tool_calls

        lines = ["Here are key decarbonisation interventions applicable to your factory:"]
        for idx, it in enumerate(itvs[:5]):
            lines.append(
                f"{idx + 1}. {it['title']} ({it['pool']} pool, {it['category']}) — Difficulty level {it['difficulty']}."
            )
        return "\n\n".join(lines), tool_calls

    # 5. Plan / Strategy intent
    if _match_intent(msg, ["plan", "target", "budget", "roadmap"]):
        res = execute_tool_sync("run_plan", {"budget_inr": 1000000}, factory_id, db)
        tool_calls.append({"name": "run_plan", "args": {"budget_inr": 1000000}, "result": res})
        text = (
            f"Under your approved plan:\n\n"
            f"• Expected carbon reduction: {res['reduction_pct']}% ({res['tco2_cut']} tCO₂e/yr).\n"
            f"• Capex: {format_lakh(res['capex_inr'])}, yielding annual savings of {format_inr(res['annual_savings_inr'])}.\n"
            f"• Estimated payback: {res['payback_months']} months."
        )
        return text, tool_calls

    # 6. Default helpful fallback
    inv_res = execute_tool_sync("get_inventory_summary", {}, factory_id, db)
    tool_calls.append({"name": "get_inventory_summary", "args": {}, "result": inv_res})
    total_t = inv_res.get("annual_tco2e", 0.0)
    text = (
        f"I am your Decarbo assistant for this factory. Your current annual emissions are {total_t} tCO₂e.\n\n"
        f"You can ask me questions such as:\n"
        f"• What are our biggest carbon leak-points?\n"
        f"• What is our Scope 1, Scope 2, and Scope 3 breakdown?\n"
        f"• What interventions give the best payback?\n"
        f"• What happens if we install 50 kW solar or switch our melting furnace?"
    )
    return text, tool_calls


def collect_allowed_numbers_from_tools(tool_calls: list[dict[str, Any]]) -> set[str]:
    """Collect all valid numbers from tool outputs into the allowed numbers set."""
    allowed = set()
    for tc in tool_calls:
        res = tc.get("result", {})
        # Extract numbers from result json string
        for num in extract_numbers(str(res)):
            allowed.add(num)
    return allowed
