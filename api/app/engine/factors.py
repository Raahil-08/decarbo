"""Deterministic emission factor resolution engine per PRD §10.2."""

from datetime import date
from typing import Any, Protocol


class EmissionFactorLike(Protocol):
    id: Any
    activity_type: str
    region: str
    kgco2e_per_unit: float
    per_unit: str
    source_name: str
    source_version: str | None
    reference_year: str | None
    valid_from: date | None
    valid_to: date | None
    verified: bool


def _month_to_str(m: str | date) -> str:
    """Normalize month input to YYYY-MM string."""
    if isinstance(m, date):
        return m.strftime("%Y-%m")
    s = str(m).strip()
    if len(s) >= 7:
        return s[:7]
    return s


def _is_factor_valid_for_month(factor: Any, month_str: str) -> bool:
    """Check if factor validity date range covers the target month YYYY-MM."""
    vf = getattr(factor, "valid_from", None)
    vt = getattr(factor, "valid_to", None)

    if vf is not None:
        vf_str = vf.strftime("%Y-%m") if isinstance(vf, date) else str(vf)[:7]
        if vf_str > month_str:
            return False

    if vt is not None:
        vt_str = vt.strftime("%Y-%m") if isinstance(vt, date) else str(vt)[:7]
        if vt_str < month_str:
            return False

    return True


def get_region_precedence(factory_region: str | None) -> list[str]:
    """Compute region lookup precedence list for a factory."""
    if not factory_region:
        return ["IN", "GLOBAL"]

    reg = factory_region.strip().upper()
    precedence = [reg]

    if reg.startswith("IN-") and "IN" not in precedence:
        precedence.append("IN")

    if "GLOBAL" not in precedence:
        precedence.append("GLOBAL")

    return precedence


def find_emission_factor(
    factors: list[Any],
    activity_type: str,
    month: str | date,
    canonical_unit: str | None = None,
    factory_region: str = "IN-GJ",
) -> Any | None:
    """Find the single deterministic emission factor according to PRD §10.2:

    1. Same activity_type and (if provided) per_unit == canonical_unit.
    2. Region precedence: factory_region -> IN -> GLOBAL.
    3. Within region: valid_from <= month <= valid_to. Latest valid_from wins.
    4. Return None if no factor matches (never guess).
    """
    if not factors or not activity_type:
        return None

    month_str = _month_to_str(month)
    region_order = get_region_precedence(factory_region)

    # Filter by activity_type and canonical_unit
    candidates = [
        f
        for f in factors
        if getattr(f, "activity_type", None) == activity_type
        and (canonical_unit is None or getattr(f, "per_unit", None) == canonical_unit)
    ]

    if not candidates:
        return None

    # Search in order of region precedence
    for target_region in region_order:
        region_matches = [
            f
            for f in candidates
            if str(getattr(f, "region", "")).upper() == target_region
            and _is_factor_valid_for_month(f, month_str)
        ]

        if not region_matches:
            continue

        # Sort by valid_from descending (most recent version first), None last
        def sort_key(f):
            vf = getattr(f, "valid_from", None)
            if vf is None:
                return (0, "")
            vf_str = vf.strftime("%Y-%m-%d") if isinstance(vf, date) else str(vf)
            return (1, vf_str)

        region_matches.sort(key=sort_key, reverse=True)
        return region_matches[0]

    return None
