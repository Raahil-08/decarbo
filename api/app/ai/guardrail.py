"""Numeric grounding guardrail per PRD §15.3 and §21."""

import re
from typing import Any

# Unicode digit translation maps
_GUJARATI_DIGITS = "૦૧૨૩૪૫૬૭૮૯"
_DEVANAGARI_DIGITS = "०१२३४५६७८९"
_ASCII_DIGITS = "0123456789"

_DIGIT_TRANS_TABLE = str.maketrans(
    _GUJARATI_DIGITS + _DEVANAGARI_DIGITS,
    _ASCII_DIGITS + _ASCII_DIGITS,
)

# Regex to find numbers: matches integers and decimals with optional Indian/standard grouping commas
_NUMBER_REGEX = re.compile(r"(?<![a-zA-Z_])\b\d+(?:,\d+)*(?:\.\d+)?\b(?![a-zA-Z_])")

# Small ordinals permitted for bullet points / steps (1–10)
_ALLOWED_ORDINALS = {str(i) for i in range(1, 11)}


def normalize_digits(text: str) -> str:
    """Normalize Gujarati and Devanagari numerals to standard ASCII Latin digits."""
    return text.translate(_DIGIT_TRANS_TABLE)


def clean_number_string(num_str: str) -> str:
    """Strip commas and clean formatting for numeric matching."""
    s = num_str.replace(",", "").strip()
    if not s:
        return s
    try:
        val = float(s)
        if val.is_integer():
            return str(int(val))
        # Format to at most 3 decimal places without trailing zeros
        return f"{val:.3f}".rstrip("0").rstrip(".")
    except ValueError:
        return s


def extract_numbers(text: str) -> list[str]:
    """Extract all numbers from text after digit normalization, stripped of commas."""
    norm_text = normalize_digits(text)
    matches = _NUMBER_REGEX.findall(norm_text)
    cleaned = []
    for m in matches:
        c = clean_number_string(m)
        if c:
            cleaned.append(c)
    return cleaned


def build_allowed_numbers_set(
    *,
    plan_totals: dict[str, Any] | None = None,
    ledger_items: list[dict[str, Any]] | None = None,
    hotspots: list[dict[str, Any]] | None = None,
    extra_numbers: list[Any] | None = None,
) -> set[str]:
    """Build a comprehensive set of allowed normalized numbers from engine calculation outputs."""
    allowed: set[str] = set()

    def add_num(val: Any) -> None:
        if val is None:
            return
        if isinstance(val, (int, float)):
            allowed.add(clean_number_string(str(val)))
            if isinstance(val, float):
                # Also allow 1-decimal and integer rounded versions
                allowed.add(clean_number_string(f"{val:.1f}"))
                allowed.add(clean_number_string(f"{round(val)}"))
            # If in INR, allow in Lakhs / Crores
            if val >= 100_000:
                lakhs = val / 100_000
                allowed.add(clean_number_string(f"{lakhs:.1f}"))
                allowed.add(clean_number_string(f"{lakhs:.2f}"))
                allowed.add(clean_number_string(str(int(lakhs))))
            if val >= 10_000_000:
                crores = val / 10_000_000
                allowed.add(clean_number_string(f"{crores:.1f}"))
                allowed.add(clean_number_string(f"{crores:.2f}"))
        elif isinstance(val, str):
            for n in extract_numbers(val):
                allowed.add(n)

    # 1. Plan totals
    if plan_totals:
        for k, v in plan_totals.items():
            if isinstance(v, (int, float)):
                add_num(v)
                # If tCO2e vs kgCO2e
                if "kgco2e" in k.lower() and isinstance(v, (int, float)):
                    add_num(v / 1000.0)
            elif isinstance(v, dict):
                for sub_v in v.values():
                    if isinstance(sub_v, (int, float)):
                        add_num(sub_v)

    # 2. Ledger items
    if ledger_items:
        for item in ledger_items:
            for k in [
                "sequence",
                "capex_inr",
                "annual_savings_inr",
                "reduction_kgco2e",
                "reduction_tco2e",
                "payback_months",
                "cost_per_tonne_inr",
            ]:
                if k in item:
                    add_num(item[k])
            # Check level if dict
            lvl = item.get("level")
            if isinstance(lvl, dict):
                for lv in lvl.values():
                    add_num(lv)
                    if isinstance(lv, float) and 0.0 <= lv <= 1.0:
                        # e.g. 0.85 -> 85 (%)
                        add_num(round(lv * 100))

    # 3. Hotspots
    if hotspots:
        for h in hotspots:
            add_num(h.get("tco2e"))
            add_num(h.get("kgco2e"))
            add_num(h.get("share_pct"))
            if "tco2e" in h and isinstance(h["tco2e"], (int, float)):
                add_num(h["tco2e"] * 1000.0)

    # 4. Extra numbers
    if extra_numbers:
        for x in extra_numbers:
            add_num(x)

    # Add standard ordinals 1–10
    allowed.update(_ALLOWED_ORDINALS)

    return allowed


def validate_numeric_grounding(
    text: str,
    allowed_numbers: set[str],
) -> tuple[bool, list[str]]:
    """Verify that every number appearing in the text belongs to the allowed engine-grounded set.

    Returns:
        (is_valid, ungrounded_numbers)
    """
    extracted = extract_numbers(text)
    ungrounded = []

    for num in extracted:
        if num not in allowed_numbers and num not in _ALLOWED_ORDINALS:
            # Also check if it matches an integer equivalent
            try:
                f = float(num)
                int_str = str(int(f))
                if int_str in allowed_numbers:
                    continue
                # Also check rounded float with 1 decimal
                one_dec = f"{f:.1f}"
                if one_dec in allowed_numbers:
                    continue
            except ValueError:
                pass
            ungrounded.append(num)

    return len(ungrounded) == 0, ungrounded
