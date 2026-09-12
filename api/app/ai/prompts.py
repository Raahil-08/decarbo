"""Plan explanation prompts per PRD §15.3 and §15.4."""

from typing import Any

from app.engine.formatters import format_emissions_t, format_inr, format_lakh


def build_plan_explanation_system_prompt(locale: str) -> str:
    """Build system prompt for T3 Plan Explanation with strict numeric grounding."""
    language_map = {
        "gu": "Gujarati (ગુજરાતી)",
        "hi": "Hindi (हिंदी)",
        "en": "English",
    }
    lang = language_map.get(locale.lower(), "English")

    return f"""You are an expert decarbonisation advisor explaining a factory decarbonisation plan to an Indian SME owner in {lang}.

Requirements:
1. Explain the plan in {lang} using respectful, practical, plain language like a trusted consultant.
2. Avoid jargon; if a technical term is used, explain it simply in the same sentence.
3. Strict limit: ≤ 180 words. No hype, no emojis, no markdown tables.
4. Structure:
   - Part 1: Where most CO2 comes from (top hotspot and share %).
   - Part 2: What to do first and why (quick win from the implementation ledger).
   - Part 3: What the whole plan costs (Capex), saves annually, cuts in emissions, and payback.
   - Part 4: One practical caution (e.g. pilot on one line first).

CRITICAL NUMERIC GROUNDING RULE:
Use ONLY the numbers provided in the user prompt below, copied exactly. Never compute, guess, round differently, or introduce new numbers. If a number you need is not provided, say you do not have it.
"""


def build_plan_explanation_user_prompt(
    *,
    factory_name: str,
    industry: str,
    plan_mode_label: str,
    plan_totals: dict[str, Any],
    ledger_items: list[dict[str, Any]],
    hotspots: list[dict[str, Any]] | None = None,
    locale: str = "en",
) -> str:
    """Build user prompt containing pre-formatted, exact numbers."""
    # Top hotspot
    hotspot_str = "Not available"
    if hotspots and len(hotspots) > 0:
        top = hotspots[0]
        h_name = top.get("activity_type", "electricity").replace("_", " ")
        h_pct = f"{float(top.get('share_pct', 0.0)):.1f}%"
        h_tco2 = format_emissions_t(float(top.get("kgco2e", 0.0)))
        hotspot_str = f"{h_name}: {h_tco2} ({h_pct} of emissions)"

    # Quick win
    quick_win_str = "None"
    if ledger_items and len(ledger_items) > 0:
        qw = ledger_items[0]
        title = qw.get("title_en", qw.get("intervention_code", "Quick win"))
        cut = format_emissions_t(float(qw.get("reduction_kgco2e", 0.0)))
        pb = qw.get("payback_months")
        pb_str = f"{pb:.1f} months" if pb is not None else "instant"
        quick_win_str = f"{title} (Cuts: {cut}, Payback: {pb_str})"

    # Totals
    capex = float(plan_totals.get("total_capex_inr", 0.0))
    savings = float(plan_totals.get("annual_gross_savings_inr", 0.0))
    cut_kg = float(plan_totals.get("co2_reduction_kgco2e", 0.0))
    cut_pct = f"{float(plan_totals.get('reduction_pct', 0.0)):.1f}%"
    pb_months = plan_totals.get("payback_months")
    pb_display = f"{pb_months:.1f} months" if pb_months is not None else "instant"

    capex_display = format_lakh(capex) if capex >= 100_000 else format_inr(capex)
    savings_display = format_lakh(savings) if savings >= 100_000 else format_inr(savings)
    cut_display = format_emissions_t(cut_kg)

    return f"""Factory: {factory_name} ({industry})
Selected Plan: {plan_mode_label}

Grounded Data (Use ONLY these exact figures):
- Largest Hotspot: {hotspot_str}
- First Recommended Step: {quick_win_str}
- Total Investment (Capex): {capex_display} ({format_inr(capex)})
- Annual Net Savings: {savings_display} ({format_inr(savings)})
- Total Emissions Cut: {cut_display} ({cut_pct})
- Simple Payback Period: {pb_display}

Explain this plan to the owner in {locale}. Keep under 180 words."""
