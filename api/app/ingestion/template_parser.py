"""Standard upload template parser (decarbo_template.xlsx or CSV) per PRD §9.2 and §9.6."""

import csv
from datetime import date
from io import BytesIO
from typing import Any

import numpy as np
import openpyxl

from app.engine.units import (
    UnitDimensionError,
    UnitParseError,
    convert_to_canonical,
    normalize_unit_string,
)


def _parse_month(val: Any) -> str:
    """Normalize month value to YYYY-MM."""
    if val is None:
        return ""
    if isinstance(val, date):
        return val.strftime("%Y-%m")
    s = str(val).strip()
    if len(s) >= 7 and s[4] in ("-", "/"):
        return s[:7].replace("/", "-")
    return s


def parse_template_file(
    file_bytes: bytes,
    filename: str,
    activity_types: list[Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Parse standard template spreadsheet or CSV and return (records, issues)."""
    # 1. Read rows from XLSX or CSV
    raw_rows = []
    if filename.lower().endswith(".csv"):
        text = file_bytes.decode("utf-8", errors="replace")
        reader = csv.reader(text.splitlines())
        raw_rows = list(reader)
    else:
        wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)
        ws = wb["Template"] if "Template" in wb.sheetnames else wb.active
        raw_rows = list(ws.iter_rows(values_only=True))

    if not raw_rows:
        return [], [{"row": 0, "field": "file", "code": "EMPTY_FILE", "message_key": "errors.empty_file", "severity": "block"}]

    # 2. Match header row
    header_row = [str(c).strip().lower() if c is not None else "" for c in raw_rows[0]]
    col_map = {}
    for idx, h in enumerate(header_row):
        col_map[h] = idx

    req_cols = ["month", "activity", "quantity", "unit"]
    for rc in req_cols:
        if rc not in col_map:
            return [], [{
                "row": 1,
                "field": rc,
                "code": "MISSING_COLUMN",
                "message_key": f"errors.missing_column_{rc}",
                "severity": "block",
            }]

    # 3. Canonical activity synonyms map
    act_type_map = {}
    synonym_map = {}
    for act in activity_types:
        k = getattr(act, "key", "")
        act_type_map[k] = act
        synonym_map[k.lower()] = k
        synonym_map[getattr(act, "label_en", "").lower()] = k
        for s in getattr(act, "synonyms", []):
            synonym_map[str(s).strip().lower()] = k

    draft_records: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []

    # Keep track of activity values for outlier detection
    activity_values: dict[str, list[float]] = {}

    for row_num, row in enumerate(raw_rows[1:], start=2):
        if not any(row):
            continue

        raw_m = row[col_map["month"]] if col_map["month"] < len(row) else None
        raw_act = row[col_map["activity"]] if col_map["activity"] < len(row) else None
        raw_qty = row[col_map["quantity"]] if col_map["quantity"] < len(row) else None
        raw_unit = row[col_map["unit"]] if col_map["unit"] < len(row) else None

        raw_cost = row[col_map["cost_inr"]] if "cost_inr" in col_map and col_map["cost_inr"] < len(row) else None
        raw_rec_share = row[col_map["recycled_share"]] if "recycled_share" in col_map and col_map["recycled_share"] < len(row) else None
        raw_dist = row[col_map["distance_km"]] if "distance_km" in col_map and col_map["distance_km"] < len(row) else None
        raw_veh = row[col_map["vehicle"]] if "vehicle" in col_map and col_map["vehicle"] < len(row) else None
        raw_notes = row[col_map["notes"]] if "notes" in col_map and col_map["notes"] < len(row) else None

        # Validate Month
        month_str = _parse_month(raw_m)
        if not month_str or len(month_str) != 7 or month_str[4] != "-":
            issues.append({
                "row": row_num,
                "field": "month",
                "code": "INVALID_MONTH",
                "message_key": "errors.invalid_month_format",
                "severity": "block",
            })
            continue

        # Validate Activity
        if not raw_act:
            issues.append({
                "row": row_num,
                "field": "activity",
                "code": "MISSING_ACTIVITY",
                "message_key": "errors.missing_activity",
                "severity": "block",
            })
            continue

        act_clean = str(raw_act).strip().lower()
        canon_act_key = synonym_map.get(act_clean, act_clean)
        act_meta = act_type_map.get(canon_act_key)

        if not act_meta:
            issues.append({
                "row": row_num,
                "field": "activity",
                "code": "UNKNOWN_ACTIVITY",
                "message_key": "errors.unknown_activity",
                "severity": "block",
            })
            continue

        # Validate Quantity
        try:
            qty_float = float(raw_qty)
            if qty_float <= 0:
                issues.append({
                    "row": row_num,
                    "field": "quantity",
                    "code": "NON_POSITIVE_QUANTITY",
                    "message_key": "errors.quantity_must_be_positive",
                    "severity": "flag",
                })
        except (ValueError, TypeError):
            issues.append({
                "row": row_num,
                "field": "quantity",
                "code": "INVALID_QUANTITY",
                "message_key": "errors.invalid_number",
                "severity": "block",
            })
            continue

        # Validate & Convert Unit
        if not raw_unit:
            issues.append({
                "row": row_num,
                "field": "unit",
                "code": "MISSING_UNIT",
                "message_key": "errors.missing_unit",
                "severity": "block",
            })
            continue

        unit_str = str(raw_unit).strip()
        canon_unit = getattr(act_meta, "canonical_unit", unit_str)

        try:
            norm_u = normalize_unit_string(unit_str)
            qty_canonical = convert_to_canonical(qty_float, norm_u, canon_unit)
        except UnitDimensionError:
            issues.append({
                "row": row_num,
                "field": "unit",
                "code": "DIMENSION_MISMATCH",
                "message_key": "errors.unit_dimension_mismatch",
                "severity": "block",
            })
            continue
        except (UnitParseError, Exception):
            issues.append({
                "row": row_num,
                "field": "unit",
                "code": "UNPARSABLE_UNIT",
                "message_key": "errors.unparsable_unit",
                "severity": "block",
            })
            continue

        # Parse cost
        cost_inr = None
        if raw_cost is not None and str(raw_cost).strip():
            try:
                cost_inr = float(raw_cost)
            except ValueError:
                pass

        # Handle material splitting by recycled_share
        recycled_share = None
        if raw_rec_share is not None and str(raw_rec_share).strip():
            try:
                recycled_share = max(0.0, min(1.0, float(raw_rec_share)))
            except ValueError:
                pass

        # Handle Transport (quantity in tonnes + distance_km -> t*km)
        distance_km = None
        if raw_dist is not None and str(raw_dist).strip():
            try:
                distance_km = float(raw_dist)
            except ValueError:
                pass

        vehicle = str(raw_veh).strip().lower() if raw_veh else None

        # Check if row is transport with distance
        if distance_km and distance_km > 0:
            # Convert quantity to tonnes if mass
            try:
                tonnes = convert_to_canonical(qty_float, unit_str, "t")
                tkm = tonnes * distance_km
                target_transport_key = "road_freight_hgv" if vehicle == "hgv" else "road_freight_lcv"
                draft_records.append({
                    "period_month": f"{month_str}-01",
                    "activity_type": target_transport_key,
                    "quantity": tkm,
                    "unit": "t*km",
                    "quantity_canonical": tkm,
                    "cost_inr": cost_inr,
                    "source_note": f"row {row_num}: {qty_float} {unit_str} × {distance_km} km",
                    "attributes": {"distance_km": distance_km, "vehicle": vehicle},
                })
                continue
            except Exception:
                pass

        # Split brass or aluminium input if recycled_share provided
        if recycled_share is not None and canon_act_key in ("brass_input_primary", "brass_input_secondary", "brass_input"):
            primary_qty = qty_canonical * (1.0 - recycled_share)
            sec_qty = qty_canonical * recycled_share
            prim_cost = (cost_inr * (1.0 - recycled_share)) if cost_inr else None
            sec_cost = (cost_inr * recycled_share) if cost_inr else None

            if primary_qty > 0:
                draft_records.append({
                    "period_month": f"{month_str}-01",
                    "activity_type": "brass_input_primary",
                    "quantity": primary_qty,
                    "unit": canon_unit,
                    "quantity_canonical": primary_qty,
                    "cost_inr": prim_cost,
                    "source_note": f"row {row_num} (primary share {1.0 - recycled_share:.2f})",
                    "attributes": {"recycled_share": recycled_share},
                })
            if sec_qty > 0:
                draft_records.append({
                    "period_month": f"{month_str}-01",
                    "activity_type": "brass_input_secondary",
                    "quantity": sec_qty,
                    "unit": canon_unit,
                    "quantity_canonical": sec_qty,
                    "cost_inr": sec_cost,
                    "source_note": f"row {row_num} (secondary share {recycled_share:.2f})",
                    "attributes": {"recycled_share": recycled_share},
                })
            continue

        # Standard record
        draft_records.append({
            "period_month": f"{month_str}-01",
            "activity_type": canon_act_key,
            "quantity": qty_float,
            "unit": unit_str,
            "quantity_canonical": qty_canonical,
            "cost_inr": cost_inr,
            "source_note": f"row {row_num}",
            "attributes": {"notes": raw_notes} if raw_notes else {},
        })

        if canon_act_key not in activity_values:
            activity_values[canon_act_key] = []
        activity_values[canon_act_key].append(qty_canonical)

    # 4. Outlier detection (> 3x or < 1/3x median of same activity)
    for rec in draft_records:
        act_key = rec["activity_type"]
        vals = activity_values.get(act_key, [])
        if len(vals) >= 4:
            med = float(np.median(vals))
            if med > 0:
                q = rec["quantity_canonical"]
                if q > 3.0 * med or q < (med / 3.0):
                    issues.append({
                        "row": rec.get("source_note", ""),
                        "field": "quantity",
                        "code": "OUTLIER_VALUE",
                        "message_key": "warnings.outlier_detected",
                        "severity": "flag",
                        "details": {"quantity": q, "median": round(med, 2)},
                    })

    return draft_records, issues
