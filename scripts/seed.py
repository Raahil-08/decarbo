"""Idempotent seed script for Decarbo canonical data."""

import csv
import json
import os
import sys
from pathlib import Path

# Add api to path so we can import models and db
BASE_DIR = Path(__file__).resolve().parent.parent
API_DIR = BASE_DIR / "api"
sys.path.insert(0, str(API_DIR))

from app.db import SessionLocal, engine, Base
from app.models.models import ActivityType, EmissionFactor, Intervention, Benchmark


def parse_pg_array(val: str) -> list:
    """Parse PostgreSQL style string array like {"foo", "bar"} or CSV text into list."""
    if not val:
        return []
    val = val.strip()
    if val.startswith("{") and val.endswith("}"):
        content = val[1:-1].strip()
        if not content:
            return []
        reader = csv.reader([content], quotechar='"', skipinitialspace=True)
        try:
            return [x.strip() for x in next(reader) if x.strip()]
        except StopIteration:
            return []
    return [x.strip() for x in val.split(",") if x.strip()]


from typing import Any, Optional


def parse_json(val: Any, default=None):
    if not val:
        return default or {}
    try:
        return json.loads(val)
    except Exception:
        return default or {}


def parse_bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("true", "1", "yes", "t")


def parse_float(val: Any) -> Optional[float]:
    if val is None or str(val).strip() == "":
        return None
    try:
        return float(val)
    except ValueError:
        return None


def parse_int(val: Any) -> Optional[int]:
    if val is None or str(val).strip() == "":
        return None
    try:
        return int(val)
    except ValueError:
        return None


def parse_date(val: Any):
    if val is None or str(val).strip() == "":
        return None
    from datetime import date
    try:
        return date.fromisoformat(str(val).strip())
    except Exception:
        return None


def seed_activity_types(session, csv_path: Path):
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = row["key"].strip()
            synonyms = parse_pg_array(row.get("synonyms", "{}"))
            scope = row.get("scope", "").strip() or None
            
            existing = session.query(ActivityType).filter(ActivityType.key == key).first()
            if existing:
                existing.category = row["category"].strip()
                existing.canonical_unit = row["canonical_unit"].strip()
                existing.scope = scope
                existing.label_en = row["label_en"].strip()
                existing.label_gu = row.get("label_gu", "").strip() or None
                existing.label_hi = row.get("label_hi", "").strip() or None
                existing.synonyms = synonyms
            else:
                act = ActivityType(
                    key=key,
                    category=row["category"].strip(),
                    canonical_unit=row["canonical_unit"].strip(),
                    scope=scope,
                    label_en=row["label_en"].strip(),
                    label_gu=row.get("label_gu", "").strip() or None,
                    label_hi=row.get("label_hi", "").strip() or None,
                    synonyms=synonyms,
                )
                session.add(act)
        session.commit()


def seed_emission_factors(session, csv_path: Path):
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            act_type = row["activity_type"].strip()
            region = row["region"].strip()
            source_version = row.get("source_version", "").strip() or None

            existing = (
                session.query(EmissionFactor)
                .filter(
                    EmissionFactor.activity_type == act_type,
                    EmissionFactor.region == region,
                    EmissionFactor.source_version == source_version,
                )
                .first()
            )

            kgco2e = float(row["kgco2e_per_unit"])
            per_unit = row["per_unit"].strip()
            source_name = row["source_name"].strip()
            source_url = row.get("source_url", "").strip() or None
            ref_year = row.get("reference_year", "").strip() or None
            valid_from = parse_date(row.get("valid_from"))
            valid_to = parse_date(row.get("valid_to"))
            verified = parse_bool(row.get("verified", False))
            notes = row.get("notes", "").strip() or None

            if existing:
                existing.kgco2e_per_unit = kgco2e
                existing.per_unit = per_unit
                existing.source_name = source_name
                existing.source_url = source_url
                existing.reference_year = ref_year
                existing.valid_from = valid_from
                existing.valid_to = valid_to
                existing.verified = verified
                existing.notes = notes
            else:
                ef = EmissionFactor(
                    activity_type=act_type,
                    region=region,
                    kgco2e_per_unit=kgco2e,
                    per_unit=per_unit,
                    source_name=source_name,
                    source_url=source_url,
                    source_version=source_version,
                    reference_year=ref_year,
                    valid_from=valid_from,
                    valid_to=valid_to,
                    verified=verified,
                    notes=notes,
                )
                session.add(ef)
        session.commit()


def seed_interventions(session, csv_path: Path):
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row["code"].strip()
            existing = session.query(Intervention).filter(Intervention.code == code).first()

            industries = parse_pg_array(row.get("industries", "{}"))
            effect_params = parse_json(row.get("effect_params"), {})
            capex_model = parse_json(row.get("capex_model"), {})
            savings_model = parse_json(row.get("savings_model"), {})
            requires = parse_pg_array(row.get("requires", "{}"))
            conflicts = parse_pg_array(row.get("conflicts", "{}"))
            applicability = parse_json(row.get("applicability"), {})

            title_en = row["title_en"].strip()
            title_gu = row.get("title_gu", "").strip() or None
            title_hi = row.get("title_hi", "").strip() or None
            desc_en = row.get("description_en", "").strip() or title_en
            desc_gu = row.get("description_gu", "").strip() or None
            desc_hi = row.get("description_hi", "").strip() or None
            category = row["category"].strip()
            pool = row["pool"].strip()
            effect_type = row["effect_type"].strip()
            lifetime_years = parse_float(row["lifetime_years"]) or 10.0
            difficulty = parse_int(row["difficulty"]) or 1
            downtime_days = parse_float(row.get("downtime_days")) or 0.0
            circ_pts = parse_int(row.get("circularity_points")) or 0
            source_name = row.get("source_name", "").strip() or None
            source_url = row.get("source_url", "").strip() or None
            verified = parse_bool(row.get("verified", False))

            if existing:
                existing.title_en = title_en
                existing.title_gu = title_gu
                existing.title_hi = title_hi
                existing.description_en = desc_en
                existing.description_gu = desc_gu
                existing.description_hi = desc_hi
                existing.category = category
                existing.industries = industries
                existing.pool = pool
                existing.effect_type = effect_type
                existing.effect_params = effect_params
                existing.capex_model = capex_model
                existing.savings_model = savings_model
                existing.lifetime_years = lifetime_years
                existing.difficulty = difficulty
                existing.downtime_days = downtime_days
                existing.circularity_points = circ_pts
                existing.requires = requires
                existing.conflicts = conflicts
                existing.applicability = applicability
                existing.source_name = source_name
                existing.source_url = source_url
                existing.verified = verified
            else:
                interv = Intervention(
                    code=code,
                    title_en=title_en,
                    title_gu=title_gu,
                    title_hi=title_hi,
                    description_en=desc_en,
                    description_gu=desc_gu,
                    description_hi=desc_hi,
                    category=category,
                    industries=industries,
                    pool=pool,
                    effect_type=effect_type,
                    effect_params=effect_params,
                    capex_model=capex_model,
                    savings_model=savings_model,
                    lifetime_years=lifetime_years,
                    difficulty=difficulty,
                    downtime_days=downtime_days,
                    circularity_points=circ_pts,
                    requires=requires,
                    conflicts=conflicts,
                    applicability=applicability,
                    source_name=source_name,
                    source_url=source_url,
                    verified=verified,
                )
                session.add(interv)
        session.commit()


def seed_benchmarks(session, csv_path: Path):
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            industry = row["industry"].strip()
            metric = row["metric"].strip()

            existing = (
                session.query(Benchmark)
                .filter(Benchmark.industry == industry, Benchmark.metric == metric)
                .first()
            )

            v_low = parse_float(row.get("value_low"))
            v_mode = parse_float(row.get("value_mode"))
            v_high = parse_float(row.get("value_high"))
            source_name = row.get("source_name", "").strip() or None
            verified = parse_bool(row.get("verified", False))

            if existing:
                existing.value_low = v_low
                existing.value_mode = v_mode
                existing.value_high = v_high
                existing.source_name = source_name
                existing.verified = verified
            else:
                bm = Benchmark(
                    industry=industry,
                    metric=metric,
                    value_low=v_low,
                    value_mode=v_mode,
                    value_high=v_high,
                    source_name=source_name,
                    verified=verified,
                )
                session.add(bm)
        session.commit()


def run_seed(session=None, seed_dir=None):
    if seed_dir is None:
        seed_dir = BASE_DIR / "data" / "seed"
    else:
        seed_dir = Path(seed_dir)

    close_session = False
    if session is None:
        Base.metadata.create_all(bind=engine)
        session = SessionLocal()
        close_session = True

    try:
        print("Seeding activity types...")
        seed_activity_types(session, seed_dir / "activity_types.csv")

        print("Seeding emission factors...")
        seed_emission_factors(session, seed_dir / "emission_factors.csv")

        print("Seeding interventions...")
        seed_interventions(session, seed_dir / "interventions.csv")

        print("Seeding benchmarks...")
        seed_benchmarks(session, seed_dir / "benchmarks.csv")

        counts = {
            "activity_types": session.query(ActivityType).count(),
            "emission_factors": session.query(EmissionFactor).count(),
            "interventions": session.query(Intervention).count(),
            "benchmarks": session.query(Benchmark).count(),
        }
        print(f"Seeding completed successfully! Row counts: {counts}")
        return counts
    finally:
        if close_session:
            session.close()



if __name__ == "__main__":
    run_seed()
