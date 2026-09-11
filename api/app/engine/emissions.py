"""Emissions calculation engine with formula traceability and summary aggregation."""

from collections import defaultdict
from typing import Any

from app.engine.factors import find_emission_factor
from app.engine.formatters import format_indian_number


def format_emission_formula(
    quantity: float,
    unit: str,
    factor: Any,
    kgco2e: float,
) -> str:
    """Format human-readable formula string with Indian number grouping."""
    qty_str = format_indian_number(quantity)
    rate = float(getattr(factor, "kgco2e_per_unit", 0.0))
    rate_str = format_indian_number(rate)
    unit_str = getattr(factor, "per_unit", unit)

    src_parts = []
    src_name = getattr(factor, "source_name", None)
    src_ver = getattr(factor, "source_version", None)
    ref_yr = getattr(factor, "reference_year", None)

    if src_name:
        src_parts.append(str(src_name))
    if src_ver:
        src_parts.append(str(src_ver))
    if ref_yr:
        src_parts.append(str(ref_yr))

    provenance = f" ({', '.join(src_parts)})" if src_parts else ""
    res_str = format_indian_number(round(kgco2e, 1), decimals=1)

    return f"{qty_str} {unit_str} × {rate_str} kgCO2e/{unit_str}{provenance} = {res_str} kgCO2e"


def calculate_record_emission(
    record: Any,
    factor: Any,
    activity_type_meta: Any | None = None,
) -> dict[str, Any]:
    """Calculate kgCO2e for a single confirmed record with deterministic factor."""
    qty = float(getattr(record, "quantity_canonical", getattr(record, "quantity", 0.0)))
    rate = float(getattr(factor, "kgco2e_per_unit", 0.0))
    kgco2e = qty * rate

    canonical_unit = getattr(factor, "per_unit", getattr(record, "unit", ""))
    formula = format_emission_formula(qty, canonical_unit, factor, kgco2e)

    scope = getattr(activity_type_meta, "scope", None) or "scope3"

    return {
        "activity_record_id": getattr(record, "id", None),
        "emission_factor_id": getattr(factor, "id", None),
        "activity_type": getattr(record, "activity_type", None),
        "period_month": getattr(record, "period_month", None),
        "scope": scope,
        "kgco2e": round(kgco2e, 4),
        "formula": formula,
        "verified": bool(getattr(factor, "verified", False)),
        "quantity_canonical": qty,
        "canonical_unit": canonical_unit,
        "cost_inr": float(getattr(record, "cost_inr", 0.0) or 0.0),
    }


def calculate_emissions_summary(
    records: list[Any],
    factors: list[Any],
    activity_types: list[Any],
    factory_region: str = "IN-GJ",
    output_unit: str = "t",
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Execute full emissions aggregation over records per PRD §10.3 and §10.4.

    Returns:
        (summary_dict, list_of_emission_results)
    """
    act_map = {getattr(a, "key", ""): a for a in activity_types}

    results: list[dict[str, Any]] = []
    missing_factors: list[dict[str, Any]] = []

    # Distinct months in data
    month_set = set()
    monthly_data = defaultdict(
        lambda: {
            "kgco2e": 0.0,
            "output": 0.0,
            "kwh": 0.0,
            "diesel_l": 0.0,
            "cost_inr": 0.0,
        }
    )

    total_output_qty = 0.0
    total_renewable_kwh = 0.0
    total_grid_kwh = 0.0

    for rec in records:
        act_key = getattr(rec, "activity_type", None)
        period_m = str(getattr(rec, "period_month", ""))[:7]
        if period_m:
            month_set.add(period_m)

        qty_canonical = float(getattr(rec, "quantity_canonical", getattr(rec, "quantity", 0.0)))
        cost = float(getattr(rec, "cost_inr", 0.0) or 0.0)
        act_meta = act_map.get(act_key)

        # Track production output separately (does not produce direct emission result itself)
        if act_key == "production_output":
            total_output_qty += qty_canonical
            if period_m:
                monthly_data[period_m]["output"] += qty_canonical
            continue

        if act_key == "solar_onsite_generation":
            total_renewable_kwh += qty_canonical

        if act_key == "grid_electricity":
            total_grid_kwh += qty_canonical
            if period_m:
                monthly_data[period_m]["kwh"] += qty_canonical

        if act_key == "diesel":
            if period_m:
                monthly_data[period_m]["diesel_l"] += qty_canonical

        # Lookup factor
        canonical_unit = getattr(act_meta, "canonical_unit", getattr(rec, "unit", None))
        factor = find_emission_factor(
            factors=factors,
            activity_type=act_key,
            month=period_m,
            canonical_unit=canonical_unit,
            factory_region=factory_region,
        )

        if factor is None:
            missing_factors.append(
                {
                    "activity_record_id": getattr(rec, "id", None),
                    "activity_type": act_key,
                    "month": period_m,
                }
            )
            continue

        res = calculate_record_emission(rec, factor, act_meta)
        results.append(res)

        if period_m:
            monthly_data[period_m]["kgco2e"] += res["kgco2e"]
            monthly_data[period_m]["cost_inr"] += cost

    months_count = len(month_set) or 1
    annualised = months_count < 12
    annual_mult = (12.0 / months_count) if annualised else 1.0

    # Aggregations
    by_scope: dict[str, float] = {"scope1": 0.0, "scope2": 0.0, "scope3": 0.0}
    by_category: dict[str, float] = {
        "electricity": 0.0,
        "fuel": 0.0,
        "material": 0.0,
        "transport": 0.0,
        "waste": 0.0,
        "water": 0.0,
    }
    by_activity_dict: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "kgco2e": 0.0,
            "quantity": 0.0,
            "unit": "",
            "cost_inr": 0.0,
            "verified": True,
        }
    )

    raw_total_kgco2e = sum(r["kgco2e"] for r in results)
    unverified_kgco2e = sum(r["kgco2e"] for r in results if not r["verified"])

    for r in results:
        sc = r["scope"]
        if sc in by_scope:
            by_scope[sc] += r["kgco2e"]

        act_key = r["activity_type"]
        act_meta = act_map.get(act_key)
        cat = getattr(act_meta, "category", "material")
        if cat in by_category:
            by_category[cat] += r["kgco2e"]

        entry = by_activity_dict[act_key]
        entry["kgco2e"] += r["kgco2e"]
        entry["quantity"] += r["quantity_canonical"]
        entry["unit"] = r["canonical_unit"]
        entry["cost_inr"] += r["cost_inr"]
        if not r["verified"]:
            entry["verified"] = False

    # Apply annualisation to figures if fewer than 12 months
    total_kgco2e = raw_total_kgco2e * annual_mult
    ann_output = total_output_qty * annual_mult
    ann_energy_kwh = (total_grid_kwh + total_renewable_kwh) * annual_mult

    for sc in by_scope:
        by_scope[sc] *= annual_mult

    for cat in by_category:
        by_category[cat] *= annual_mult

    # Build by_activity list with share
    by_activity_list = []
    for act_key, d in by_activity_dict.items():
        ann_kg = d["kgco2e"] * annual_mult
        share = (ann_kg / total_kgco2e) if total_kgco2e > 0 else 0.0
        by_activity_list.append(
            {
                "activity_type": act_key,
                "kgco2e": round(ann_kg, 2),
                "share": round(share, 4),
                "quantity": round(d["quantity"] * annual_mult, 2),
                "unit": d["unit"],
                "cost_inr": round(d["cost_inr"] * annual_mult, 2),
                "verified": d["verified"],
            }
        )
    by_activity_list.sort(key=lambda x: x["kgco2e"], reverse=True)

    # Intensity
    intensity = (total_kgco2e / ann_output) if ann_output > 0 else 0.0
    kwh_per_output = (total_grid_kwh * annual_mult / ann_output) if ann_output > 0 else 0.0

    # Unverified factor share
    unverified_share = (unverified_kgco2e / raw_total_kgco2e) if raw_total_kgco2e > 0 else 0.0

    # Monthly list sorted by month
    monthly_list = []
    for m in sorted(month_set):
        md = monthly_data[m]
        monthly_list.append(
            {
                "month": m,
                "kgco2e": round(md["kgco2e"], 2),
                "output": round(md["output"], 2),
                "kwh": round(md["kwh"], 2),
                "diesel_l": round(md["diesel_l"], 2),
                "cost_inr": round(md["cost_inr"], 2),
            }
        )

    # Sankey diagram nodes & links
    nodes = [
        {"name": "Scope 1"},
        {"name": "Scope 2"},
        {"name": "Scope 3"},
    ]
    node_names = {"Scope 1", "Scope 2", "Scope 3"}
    links = []

    # Map category to primary scope
    cat_to_scope = {
        "electricity": "Scope 2",
        "fuel": "Scope 1",
        "material": "Scope 3",
        "transport": "Scope 3",
        "waste": "Scope 3",
        "water": "Scope 3",
    }

    # Add active categories
    for cat, kg in by_category.items():
        if kg > 0:
            c_name = cat.capitalize()
            if c_name not in node_names:
                nodes.append({"name": c_name})
                node_names.add(c_name)
            sc_name = cat_to_scope.get(cat, "Scope 3")
            links.append(
                {
                    "source": sc_name,
                    "target": c_name,
                    "value": round(kg, 1),
                }
            )

    # Add top activities to category links
    for act in by_activity_list[:8]:
        if act["kgco2e"] > 0:
            act_meta = act_map.get(act["activity_type"])
            cat = getattr(act_meta, "category", "material").capitalize()
            act_label = getattr(act_meta, "label_en", act["activity_type"])
            if act_label not in node_names:
                nodes.append({"name": act_label})
                node_names.add(act_label)
            links.append(
                {
                    "source": cat,
                    "target": act_label,
                    "value": round(act["kgco2e"], 1),
                }
            )

    summary = {
        "total_kgco2e": round(total_kgco2e, 2),
        "annualised": annualised,
        "months": months_count,
        "by_scope": {k: round(v, 2) for k, v in by_scope.items()},
        "by_category": {k: round(v, 2) for k, v in by_category.items()},
        "by_activity": by_activity_list,
        "output_quantity": round(ann_output, 2),
        "output_unit": output_unit,
        "intensity_kgco2e_per_output": round(intensity, 2),
        "energy_kwh_total": round(ann_energy_kwh, 2),
        "kwh_per_output": round(kwh_per_output, 2),
        "renewable_kwh": round(total_renewable_kwh * annual_mult, 2),
        "sankey": {"nodes": nodes, "links": links},
        "monthly": monthly_list,
        "unverified_factor_share": round(unverified_share, 4),
        "missing_factors_count": len(missing_factors),
    }

    return summary, results
