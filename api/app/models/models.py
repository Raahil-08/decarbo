import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship
from sqlalchemy.types import CHAR, TypeDecorator

from app.db import Base


# Cross-dialect GUID type for SQLite and PostgreSQL
class GUID(TypeDecorator):
    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return str(uuid.UUID(str(value)))
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            return uuid.UUID(str(value))
        return value


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(GUID(), primary_key=True)
    full_name = Column(String, nullable=True)
    preferred_locale = Column(String, nullable=False, default="en")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class Factory(Base):
    __tablename__ = "factories"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    industry = Column(String, nullable=False)
    products = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, default="Gujarat")
    cluster = Column(String, nullable=True)
    grid_region = Column(String, nullable=False, default="IN")
    output_unit = Column(String, nullable=False, default="t")
    annual_output = Column(Numeric, nullable=True)
    electricity_tariff_inr_per_kwh = Column(Numeric, nullable=True)
    consent_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(GUID(), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    members = relationship("FactoryMember", back_populates="factory", cascade="all, delete-orphan")


class FactoryMember(Base):
    __tablename__ = "factory_members"

    factory_id = Column(GUID(), ForeignKey("factories.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(GUID(), primary_key=True)
    role = Column(String, nullable=False, default="owner")

    factory = relationship("Factory", back_populates="members")


class ActivityType(Base):
    __tablename__ = "activity_types"

    key = Column(String, primary_key=True)
    category = Column(String, nullable=False)
    canonical_unit = Column(String, nullable=False)
    scope = Column(String, nullable=True)
    label_en = Column(String, nullable=False)
    label_gu = Column(String, nullable=True)
    label_hi = Column(String, nullable=True)
    synonyms = Column(JSON, nullable=False, default=list)


class Upload(Base):
    __tablename__ = "uploads"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    factory_id = Column(GUID(), ForeignKey("factories.id", ondelete="CASCADE"), nullable=False)
    storage_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    kind = Column(String, nullable=False)
    status = Column(String, nullable=False, default="uploaded")
    mapping = Column(JSON, nullable=True)
    issues = Column(JSON, nullable=False, default=list)
    error = Column(String, nullable=True)
    created_by = Column(GUID(), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class ActivityRecord(Base):
    __tablename__ = "activity_records"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    factory_id = Column(GUID(), ForeignKey("factories.id", ondelete="CASCADE"), nullable=False)
    period_month = Column(Date, nullable=False)
    activity_type = Column(String, ForeignKey("activity_types.key"), nullable=False)
    quantity = Column(Numeric, nullable=False)
    unit = Column(String, nullable=False)
    quantity_canonical = Column(Numeric, nullable=False)
    cost_inr = Column(Numeric, nullable=True)
    attributes = Column(JSON, nullable=False, default=dict)
    source_upload_id = Column(GUID(), ForeignKey("uploads.id", ondelete="SET NULL"), nullable=True)
    source_note = Column(String, nullable=True)
    confidence = Column(Numeric, nullable=True)
    status = Column(String, nullable=False, default="draft")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("factory_id", "period_month", "activity_type", "source_upload_id"),
        Index("ix_activity_records_factory_month", "factory_id", "period_month"),
    )


class EmissionFactor(Base):
    __tablename__ = "emission_factors"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    activity_type = Column(String, ForeignKey("activity_types.key"), nullable=False)
    region = Column(String, nullable=False, default="GLOBAL")
    kgco2e_per_unit = Column(Numeric, nullable=False)
    per_unit = Column(String, nullable=False)
    source_name = Column(String, nullable=False)
    source_url = Column(String, nullable=True)
    source_version = Column(String, nullable=True)
    reference_year = Column(String, nullable=True)
    valid_from = Column(Date, nullable=True)
    valid_to = Column(Date, nullable=True)
    verified = Column(Boolean, nullable=False, default=False)
    notes = Column(String, nullable=True)

    __table_args__ = (UniqueConstraint("activity_type", "region", "source_version"),)


class CalcRun(Base):
    __tablename__ = "calc_runs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    factory_id = Column(GUID(), ForeignKey("factories.id", ondelete="CASCADE"), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    total_kgco2e = Column(Numeric, nullable=False)
    output_quantity = Column(Numeric, nullable=True)
    intensity_kgco2e_per_output = Column(Numeric, nullable=True)
    summary = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class EmissionResult(Base):
    __tablename__ = "emission_results"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    calc_run_id = Column(GUID(), ForeignKey("calc_runs.id", ondelete="CASCADE"), nullable=False)
    activity_record_id = Column(
        GUID(), ForeignKey("activity_records.id", ondelete="CASCADE"), nullable=False
    )
    emission_factor_id = Column(GUID(), ForeignKey("emission_factors.id"), nullable=False)
    scope = Column(String, nullable=False)
    kgco2e = Column(Numeric, nullable=False)
    formula = Column(String, nullable=False)


class Intervention(Base):
    __tablename__ = "interventions"

    code = Column(String, primary_key=True)
    title_en = Column(String, nullable=False)
    title_gu = Column(String, nullable=True)
    title_hi = Column(String, nullable=True)
    description_en = Column(String, nullable=False)
    description_gu = Column(String, nullable=True)
    description_hi = Column(String, nullable=True)
    category = Column(String, nullable=False)
    industries = Column(JSON, nullable=False, default=list)
    pool = Column(String, nullable=False)
    effect_type = Column(String, nullable=False)
    effect_params = Column(JSON, nullable=False, default=dict)
    capex_model = Column(JSON, nullable=False, default=dict)
    savings_model = Column(JSON, nullable=False, default=dict)
    lifetime_years = Column(Numeric, nullable=False)
    difficulty = Column(SmallInteger, nullable=False)
    downtime_days = Column(Numeric, nullable=False, default=0)
    circularity_points = Column(SmallInteger, nullable=False, default=0)
    requires = Column(JSON, nullable=False, default=list)
    conflicts = Column(JSON, nullable=False, default=list)
    applicability = Column(JSON, nullable=False, default=dict)
    source_name = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    verified = Column(Boolean, nullable=False, default=False)


class Benchmark(Base):
    __tablename__ = "benchmarks"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    industry = Column(String, nullable=False)
    metric = Column(String, nullable=False)
    value_low = Column(Numeric, nullable=True)
    value_mode = Column(Numeric, nullable=True)
    value_high = Column(Numeric, nullable=True)
    source_name = Column(String, nullable=True)
    verified = Column(Boolean, nullable=False, default=False)


class Plan(Base):
    __tablename__ = "plans"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    factory_id = Column(GUID(), ForeignKey("factories.id", ondelete="CASCADE"), nullable=False)
    calc_run_id = Column(GUID(), ForeignKey("calc_runs.id"), nullable=False)
    mode = Column(String, nullable=False)
    inputs = Column(JSON, nullable=False)
    totals = Column(JSON, nullable=False)
    feasible = Column(Boolean, nullable=False)
    message = Column(String, nullable=True)
    is_selected = Column(Boolean, nullable=False, default=False)
    explanation = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class PlanItem(Base):
    __tablename__ = "plan_items"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    plan_id = Column(GUID(), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    intervention_code = Column(String, ForeignKey("interventions.code"), nullable=False)
    sequence = Column(SmallInteger, nullable=False)
    level = Column(JSON, nullable=True)
    capex_inr = Column(Numeric, nullable=False)
    annual_savings_inr = Column(Numeric, nullable=False)
    reduction_kgco2e = Column(Numeric, nullable=False)
    reduction_p10 = Column(Numeric, nullable=True)
    reduction_p90 = Column(Numeric, nullable=True)
    payback_months = Column(Numeric, nullable=True)
    cost_per_tonne_inr = Column(Numeric, nullable=True)


class Adoption(Base):
    __tablename__ = "adoptions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    factory_id = Column(GUID(), ForeignKey("factories.id", ondelete="CASCADE"), nullable=False)
    plan_item_id = Column(GUID(), ForeignKey("plan_items.id", ondelete="SET NULL"), nullable=True)
    intervention_code = Column(String, ForeignKey("interventions.code"), nullable=False)
    status = Column(String, nullable=False, default="planned")
    started_on = Column(Date, nullable=True)
    completed_on = Column(Date, nullable=True)
    actual_capex_inr = Column(Numeric, nullable=True)
    notes = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class Target(Base):
    __tablename__ = "targets"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    factory_id = Column(GUID(), ForeignKey("factories.id", ondelete="CASCADE"), nullable=False)
    baseline_calc_run_id = Column(GUID(), ForeignKey("calc_runs.id"), nullable=False)
    baseline_intensity = Column(Numeric, nullable=False)
    target_intensity = Column(Numeric, nullable=False)
    target_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class Report(Base):
    __tablename__ = "reports"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    factory_id = Column(GUID(), ForeignKey("factories.id", ondelete="CASCADE"), nullable=False)
    plan_id = Column(GUID(), ForeignKey("plans.id", ondelete="SET NULL"), nullable=True)
    locale = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
