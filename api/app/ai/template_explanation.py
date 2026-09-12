"""Deterministic template explanation generator per PRD §15.2 and §15.4."""

from typing import Any

from jinja2 import BaseLoader, Environment

from app.engine.formatters import format_emissions_t, format_inr, format_lakh

# Pre-compiled Jinja templates for each locale adhering to PRD §15.4 structure
_TEMPLATES = {
    "en": """Your factory's largest carbon emission comes from {{ hotspot_name }} ({{ hotspot_share_pct }}% of total emissions).

To achieve your target, the recommended first step is {{ quick_win_name }}, which delivers an immediate reduction of {{ quick_win_cut }} with a quick payback of {{ quick_win_payback }}.

Executing this full plan requires an investment of {{ capex_display }}, delivering annual savings of {{ savings_display }} and cutting emissions by {{ cut_display }} ({{ reduction_pct }}% reduction) with a simple payback of {{ payback_display }}.

Practical caution: {{ caution }}""",
    "gu": """તમારા કારખાનાનું સૌથી મોટું કાર્બન ઉત્સર્જન {{ hotspot_name }} (કુલ ઉત્સર્જનના {{ hotspot_share_pct }}%) માંથી આવે છે.

તમારા લક્ષ્ય સુધી પહોંચવા માટે, પ્રથમ પગલું {{ quick_win_name }} છે, જે {{ quick_win_payback }} ના ઝડપી પેબેક સાથે {{ quick_win_cut }} નો તાત્કાલિક ઘટાડો આપે છે.

આ સમગ્ર યોજના માટે {{ capex_display }} ના રોકાણની જરૂર છે, જે વાર્ષિક {{ savings_display }} ની બચત આપશે અને ઉત્સર્જનમાં {{ cut_display }} ({{ reduction_pct }}% નો ઘટાડો) કરશે, જેનો પેબેક સમય {{ payback_display }} છે.

સાવચેતી: {{ caution }}""",
    "hi": """आपके कारखाने का सबसे बड़ा कार्बन उत्सर्जन {{ hotspot_name }} (कुल उत्सर्जन का {{ hotspot_share_pct }}%) से आता है।

अपने लक्ष्य तक पहुँचने के लिए, पहला अनुशंसित कदम {{ quick_win_name }} है, जो {{ quick_win_payback }} के त्वरित पेबैक के साथ {{ quick_win_cut }} की तत्काल कटौती प्रदान करता है।

इस पूरी योजना को लागू करने के लिए {{ capex_display }} के निवेश की आवश्यकता है, जिससे सालाना {{ savings_display }} की बचत होगी और उत्सर्जन में {{ cut_display }} ({{ reduction_pct }}% कटौती) होगी, जिसका पेबैक समय {{ payback_display }} है।

सावधानी: {{ caution }}""",
}

_HOTSPOT_NAMES = {
    "grid_electricity": {
        "en": "grid electricity consumption",
        "gu": "ગ્રીડ વીજ વપરાશ",
        "hi": "ग्रिड बिजली की खपत",
    },
    "furnace_oil": {
        "en": "furnace oil melting fuel",
        "gu": "ફર્નેસ ઓઈલ બળતણ",
        "hi": "फर्नेस ऑयल ईंधन",
    },
    "diesel": {
        "en": "diesel generator operation",
        "gu": "ડીઝલ જનરેટર કામગીરી",
        "hi": "डीजल जनरेटर संचालन",
    },
    "brass_input_primary": {
        "en": "purchased primary brass raw material",
        "gu": "ખરીદેલી પ્રાઇમરી બ્રાસ સામગ્રી",
        "hi": "खरीदी गई प्राथमिक पीतल सामग्री",
    },
    "brass_input_secondary": {
        "en": "purchased scrap brass material",
        "gu": "ખરીદેલો બ્રાસ ભંગાર",
        "hi": "खरीदी गई स्क्रैप पीतल सामग्री",
    },
}

_CAUTIONS = {
    "en": "Ensure quality testing and tolerance checks on one machine line before scaling material and operational changes.",
    "gu": "સામગ્રી અને પ્રક્રિયાગત ફેરફારો મોટા પાયે લાગુ કરતાં પહેલાં એક પ્રોડક્શન લાઇન પર ગુણવત્તા પરીક્ષણ સુનિશ્ચિત કરો.",
    "hi": "सामग्री और प्रक्रिया परिवर्तनों को बड़े पैमाने पर लागू करने से पहले एक प्रोडक्शन लाइन पर गुणवत्ता परीक्षण सुनिश्चित करें।",
}

_env = Environment(loader=BaseLoader(), autoescape=False)


def _format_money(amount: float) -> str:
    if amount >= 100_000:
        return format_lakh(amount)
    return format_inr(amount)


def _format_payback(months: float | None, locale: str) -> str:
    if months is None or months <= 0:
        return "immediate" if locale == "en" else ("તાત્કાલિક" if locale == "gu" else "तत्काल")
    if months < 12:
        val = f"{months:.1f}"
        if locale == "gu":
            return f"{val} મહિના"
        if locale == "hi":
            return f"{val} महीने"
        return f"{val} months"
    years = months / 12.0
    val = f"{years:.1f}"
    if locale == "gu":
        return f"{val} વર્ષ"
    if locale == "hi":
        return f"{val} वर्ष"
    return f"{val} years"


def render_template_explanation(
    *,
    plan_totals: dict[str, Any],
    ledger_items: list[dict[str, Any]],
    hotspots: list[dict[str, Any]] | None = None,
    locale: str = "en",
) -> str:
    """Render a deterministic, PRD-compliant plan explanation in en, gu, or hi."""
    loc = locale.lower()
    if loc not in _TEMPLATES:
        loc = "en"

    # 1. Hotspot data
    top_hotspot = hotspots[0] if hotspots else {}
    act_type = top_hotspot.get("activity_type", "grid_electricity")
    hotspot_names = _HOTSPOT_NAMES.get(act_type, {
        "en": "energy and material consumption",
        "gu": "ઊર્જા અને સામગ્રી વપરાશ",
        "hi": "ऊर्जा और सामग्री की खपत",
    })
    hotspot_name = hotspot_names.get(loc, hotspot_names["en"])
    hotspot_share_pct = round(float(top_hotspot.get("share_pct", 65.0)), 1)

    # 2. Quick win (first ledger item)
    quick_win = ledger_items[0] if ledger_items else {}
    quick_win_name = quick_win.get("title_en", "Operational efficiency")
    quick_win_cut_kg = float(quick_win.get("reduction_kgco2e", 0.0))
    quick_win_cut = format_emissions_t(quick_win_cut_kg)
    quick_win_pb_months = quick_win.get("payback_months")
    quick_win_payback = _format_payback(quick_win_pb_months, loc)

    # 3. Plan totals
    capex = float(plan_totals.get("total_capex_inr", 0.0))
    savings = float(plan_totals.get("annual_gross_savings_inr", 0.0))
    cut_kg = float(plan_totals.get("co2_reduction_kgco2e", 0.0))
    reduction_pct = round(float(plan_totals.get("reduction_pct", 0.0)), 1)
    payback_months = plan_totals.get("payback_months")

    capex_display = _format_money(capex)
    savings_display = _format_money(savings)
    cut_display = format_emissions_t(cut_kg)
    payback_display = _format_payback(payback_months, loc)

    caution = _CAUTIONS.get(loc, _CAUTIONS["en"])

    context = {
        "hotspot_name": hotspot_name,
        "hotspot_share_pct": f"{hotspot_share_pct:.1f}",
        "quick_win_name": quick_win_name,
        "quick_win_cut": quick_win_cut,
        "quick_win_payback": quick_win_payback,
        "capex_display": capex_display,
        "savings_display": savings_display,
        "cut_display": cut_display,
        "reduction_pct": f"{reduction_pct:.1f}",
        "payback_display": payback_display,
        "caution": caution,
    }

    template_str = _TEMPLATES[loc]
    tpl = _env.from_string(template_str)
    return tpl.render(context)
