"""Hotspot (leak-point) ranking, drift detector, and circularity scoring per PRD §11."""

from typing import Any

import numpy as np


def find_leak_points(
    summary: dict[str, Any],
    benchmarks: list[Any] | None = None,
    interventions: list[Any] | None = None,
    industry: str = "brass_components",
) -> list[dict[str, Any]]:
    """Identify carbon leak-points (hotspots) using 80% Pareto rule capped at 5 per PRD §11.1."""
    by_activity = summary.get("by_activity", [])
    total_kg = summary.get("total_kgco2e", 0.0)

    if not by_activity or total_kg <= 0:
        return []

    # Sort descending by kgco2e
    sorted_activities = sorted(by_activity, key=lambda x: x["kgco2e"], reverse=True)

    leak_points = []
    cumulative_kg = 0.0

    # Match benchmark for industry if available
    benchmark_map = {}
    if benchmarks:
        for b in benchmarks:
            if getattr(b, "industry", None) == industry:
                benchmark_map[getattr(b, "metric", "")] = b

    for act in sorted_activities:
        act_kg = act["kgco2e"]
        if act_kg <= 0:
            continue

        cumulative_kg += act_kg
        cum_share = cumulative_kg / total_kg
        share = act.get("share", act_kg / total_kg)

        if share >= 0.25:
            severity = "major"
        elif share >= 0.10:
            severity = "significant"
        else:
            severity = "minor"

        # Count applicable interventions for this activity's pool
        act_key = act["activity_type"]
        matched_interventions = []
        if interventions:
            for itv in interventions:
                p = getattr(itv, "pool", "")
                if _activity_matches_pool(act_key, p):
                    matched_interventions.append(itv)

        top_fix = None
        if matched_interventions:
            # Sort by circularity points desc, difficulty asc
            matched_interventions.sort(
                key=lambda x: (getattr(x, "circularity_points", 0), -getattr(x, "difficulty", 3)),
                reverse=True,
            )
            best = matched_interventions[0]
            top_fix = {
                "code": getattr(best, "code", ""),
                "title_en": getattr(best, "title_en", ""),
                "title_gu": getattr(best, "title_gu", None),
                "title_hi": getattr(best, "title_hi", None),
            }

        leak_points.append(
            {
                "activity_type": act_key,
                "kgco2e": act_kg,
                "share": round(share, 4),
                "cumulative_share": round(cum_share, 4),
                "severity": severity,
                "quantity": act.get("quantity", 0.0),
                "unit": act.get("unit", ""),
                "cost_inr": act.get("cost_inr", 0.0),
                "verified": act.get("verified", True),
                "fixes_available": len(matched_interventions),
                "top_fix": top_fix,
            }
        )

        # Pareto condition: stop when cumulative reaches >= 80% or capped at 5
        if cum_share >= 0.80 or len(leak_points) >= 5:
            break

    return leak_points


def _activity_matches_pool(activity_type: str, pool: str) -> bool:
    """Check if activity type corresponds to an intervention pool."""
    mapping = {
        "grid_kwh": ["grid_electricity"],
        "melting_fuel": ["furnace_oil", "lpg", "natural_gas", "coal"],
        "dg_diesel": ["diesel"],
        "brass_input": ["brass_input_primary", "brass_input_secondary"],
        "cutting_oil": ["cutting_oil"],
        "hazardous_waste": ["waste_hazardous_incineration"],
        "packaging": ["packaging_corrugated", "packaging_plastic"],
        "freight": ["road_freight_hgv", "road_freight_lcv"],
    }
    return activity_type in mapping.get(pool, [])


def detect_drift(monthly_records: list[dict[str, Any]], threshold: float = 0.10) -> dict[str, Any]:
    """Energy-intensity drift detector and anomaly detection per PRD §11.2."""
    if len(monthly_records) < 4:
        return {
            "has_drift": False,
            "drift_pct": 0.0,
            "message": "Insufficient data to detect drift (minimum 4 months required).",
            "anomalies": [],
        }

    # Extract intensity series: monthly kwh / output
    intensities = []
    valid_records = []
    for r in monthly_records:
        kwh = r.get("kwh", 0.0)
        output = r.get("output", 0.0)
        if output > 0 and kwh > 0:
            intensities.append(kwh / output)
            valid_records.append(r)

    if len(intensities) < 4:
        return {
            "has_drift": False,
            "drift_pct": 0.0,
            "message": "Insufficient monthly output/kwh records to evaluate drift.",
            "anomalies": [],
        }

    # Drift: mean of last 3 months vs mean of prior months (up to 9 prior months)
    recent_window = min(3, len(intensities) // 2)
    last_months = intensities[-recent_window:]
    prior_months = intensities[:-recent_window]

    mean_last = float(np.mean(last_months))
    mean_prior = float(np.mean(prior_months))

    drift_pct = (mean_last - mean_prior) / mean_prior if mean_prior > 0 else 0.0
    has_drift = drift_pct >= threshold

    # Anomaly detection: robust z-score = 0.6745 * (x - median) / MAD
    arr = np.array(intensities)
    med = np.median(arr)
    mad = np.median(np.abs(arr - med))
    anomalies = []

    if mad > 1e-6:
        for idx, val in enumerate(intensities):
            z = 0.6745 * (val - med) / mad
            if abs(z) > 3.5:
                rec = valid_records[idx]
                anomalies.append(
                    {
                        "month": rec.get("month"),
                        "intensity": round(float(val), 2),
                        "z_score": round(float(z), 2),
                    }
                )

    msg = ""
    if has_drift:
        msg = (
            f"Electricity per tonne is up {drift_pct * 100:.1f}% in the last {recent_window} months. "
            "Common causes: compressed-air leaks, idle machines left running, worn tooling."
        )

    return {
        "has_drift": has_drift,
        "drift_pct": round(drift_pct, 4),
        "mean_last_intensity": round(mean_last, 2),
        "mean_prior_intensity": round(mean_prior, 2),
        "message": msg,
        "anomalies": anomalies,
    }


def compute_circularity_score(
    summary: dict[str, Any],
    benchmark_intensity: float | None = None,
) -> dict[str, Any]:
    """Circularity score per PRD §11.3 across 4 weighted sub-scores."""
    by_activity = {a["activity_type"]: a for a in summary.get("by_activity", [])}

    # 1. Material circularity (Weight 35)
    primary_brass = by_activity.get("brass_input_primary", {}).get("quantity", 0.0)
    secondary_brass = by_activity.get("brass_input_secondary", {}).get("quantity", 0.0)
    total_metal = primary_brass + secondary_brass
    if total_metal > 0:
        material_score = min(100.0, max(0.0, 100.0 * (secondary_brass / total_metal)))
    else:
        material_score = 0.0

    # 2. Waste recovery (Weight 20)
    recycled_waste = by_activity.get("waste_metal_scrap_recycled", {}).get(
        "quantity", 0.0
    ) + by_activity.get("waste_paper_recycled", {}).get("quantity", 0.0)
    landfill_waste = by_activity.get("waste_general_landfill", {}).get("quantity", 0.0)
    haz_waste = by_activity.get("waste_hazardous_incineration", {}).get("quantity", 0.0)
    total_waste = recycled_waste + landfill_waste + haz_waste
    if total_waste > 0:
        waste_score = min(100.0, max(0.0, 100.0 * (recycled_waste / total_waste)))
    else:
        waste_score = 0.0

    # 3. Renewable energy (Weight 25)
    renewable_kwh = summary.get("renewable_kwh", 0.0)
    total_kwh = summary.get("energy_kwh_total", 0.0)
    if total_kwh > 0:
        renewable_score = min(100.0, max(0.0, 100.0 * (renewable_kwh / total_kwh)))
    else:
        renewable_score = 0.0

    # 4. Carbon intensity (Weight 20, skipped if no benchmark)
    has_benchmark = benchmark_intensity is not None and benchmark_intensity > 0
    factory_intensity = summary.get("intensity_kgco2e_per_output", 0.0)
    if has_benchmark and factory_intensity > 0:
        intensity_score = min(100.0, max(0.0, 100.0 * (benchmark_intensity / factory_intensity)))
    else:
        intensity_score = 0.0

    sub_scores = [
        {
            "key": "material_circularity",
            "name": "Material Circularity",
            "score": round(material_score, 1),
            "weight": 35,
            "formula": "100 × (Secondary metal input) ÷ (Total metal input)",
        },
        {
            "key": "waste_recovery",
            "name": "Waste Recovery",
            "score": round(waste_score, 1),
            "weight": 20,
            "formula": "100 × (Recycled waste) ÷ (Total waste)",
        },
        {
            "key": "renewable_energy",
            "name": "Renewable Energy",
            "score": round(renewable_score, 1),
            "weight": 25,
            "formula": "100 × (Solar / renewable kWh) ÷ (Total kWh used)",
        },
    ]

    if has_benchmark:
        sub_scores.append(
            {
                "key": "carbon_intensity",
                "name": "Carbon Intensity",
                "score": round(intensity_score, 1),
                "weight": 20,
                "formula": "min(100, 100 × Benchmark intensity ÷ Factory intensity)",
            }
        )

    # Weighted overall
    total_weight = sum(s["weight"] for s in sub_scores)
    overall = (
        sum(s["score"] * s["weight"] for s in sub_scores) / total_weight
        if total_weight > 0
        else 0.0
    )

    # Biggest opportunity: max(weight * (100 - score))
    biggest_opp = max(sub_scores, key=lambda s: s["weight"] * (100.0 - s["score"]))

    return {
        "overall": round(overall, 1),
        "sub_scores": sub_scores,
        "biggest_opportunity": {
            "key": biggest_opp["key"],
            "name": biggest_opp["name"],
            "current_score": biggest_opp["score"],
            "potential_gain": round(
                (100.0 - biggest_opp["score"]) * (biggest_opp["weight"] / total_weight), 1
            ),
        },
    }
