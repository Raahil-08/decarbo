"""Uploads and Ingestion API router per PRD §9."""

import uuid
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user, require_factory_access
from app.db import get_db
from app.ingestion.bill_extractor import extract_bill_document
from app.ingestion.generic_table_parser import (
    apply_confirmed_table_mapping,
    propose_generic_table_mapping,
)
from app.ingestion.llm import TableMappingResult
from app.ingestion.template_parser import parse_template_file
from app.models.models import (
    ActivityRecord,
    ActivityType,
    Factory,
    FactoryMember,
    Upload,
)

router = APIRouter(tags=["uploads & ingestion"])

UPLOAD_STORAGE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "uploads"
UPLOAD_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class UploadRegistrationRequest(BaseModel):
    storage_path: str
    original_filename: str
    kind: str | None = None


class UploadResponse(BaseModel):
    id: uuid.UUID
    factory_id: uuid.UUID
    storage_path: str
    original_filename: str
    kind: str
    status: str
    mapping: dict[str, Any] | None = None
    issues: list[dict[str, Any]] = []
    error: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ActivityRecordResponse(BaseModel):
    id: uuid.UUID
    factory_id: uuid.UUID
    period_month: date
    activity_type: str
    quantity: float
    unit: str
    quantity_canonical: float
    cost_inr: float | None = None
    attributes: dict[str, Any] = {}
    source_note: str | None = None
    status: str

    model_config = ConfigDict(from_attributes=True)


def _detect_kind(filename: str, hint: str | None = None) -> str:
    if hint in ("template_xlsx", "generic_table", "bill_pdf", "bill_image"):
        return hint
    fn = filename.lower()
    if fn.endswith((".pdf",)):
        return "bill_pdf"
    if fn.endswith((".jpg", ".jpeg", ".png", ".heic")):
        return "bill_image"
    if "template" in fn:
        return "template_xlsx"
    return "generic_table"


@router.post("/factories/{factory_id}/uploads", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def register_or_upload_file(
    factory_id: uuid.UUID,
    file: UploadFile | None = File(None),
    kind: str | None = Form(None),
    payload: UploadRegistrationRequest | None = None,
    member: FactoryMember = Depends(require_factory_access(min_role="editor")),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register an uploaded file or handle direct multipart upload."""
    upload_id = uuid.uuid4()

    if file is not None:
        filename = file.filename or "upload.bin"
        detected_kind = _detect_kind(filename, kind)
        save_dir = UPLOAD_STORAGE_DIR / str(factory_id) / str(upload_id)
        save_dir.mkdir(parents=True, exist_ok=True)
        file_path = save_dir / filename

        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        storage_path = str(file_path.relative_to(UPLOAD_STORAGE_DIR.parent.parent))
    elif payload is not None:
        filename = payload.original_filename
        detected_kind = _detect_kind(filename, payload.kind)
        storage_path = payload.storage_path
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "MISSING_UPLOAD", "message_key": "errors.missing_upload_file", "details": {}}},
        )

    upload = Upload(
        id=upload_id,
        factory_id=factory_id,
        storage_path=storage_path,
        original_filename=filename,
        kind=detected_kind,
        status="uploaded",
        created_by=user.id,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)
    return upload


def _resolve_file_bytes(upload: Upload) -> tuple[bytes, str]:
    """Resolve file bytes from storage_path."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    path = base_dir / upload.storage_path
    if not path.exists():
        # check in data/uploads
        path = UPLOAD_STORAGE_DIR / upload.storage_path
    if not path.exists():
        raise FileNotFoundError(f"Uploaded file not found at {upload.storage_path}")

    with open(path, "rb") as f:
        return f.read(), path.name


@router.post("/uploads/{upload_id}/parse", response_model=UploadResponse)
def parse_upload_file(
    upload_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parse file according to its kind and generate reviewable proposals."""
    upload = db.query(Upload).filter(Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "UPLOAD_NOT_FOUND", "message_key": "errors.upload_not_found", "details": {}}},
        )

    # Check factory membership
    member = (
        db.query(FactoryMember)
        .filter(FactoryMember.factory_id == upload.factory_id, FactoryMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found", "details": {}}},
        )

    upload.status = "parsing"
    db.commit()

    activity_types = db.query(ActivityType).all()

    try:
        file_bytes, filename = _resolve_file_bytes(upload)

        if upload.kind == "template_xlsx":
            records, issues = parse_template_file(
                file_bytes=file_bytes,
                filename=upload.original_filename,
                activity_types=activity_types,
            )
            upload.mapping = {"draft_records": records}
            upload.issues = issues
            upload.status = "needs_review"

        elif upload.kind == "generic_table":
            canon_acts = [
                {"key": a.key, "label_en": a.label_en, "synonyms": a.synonyms}
                for a in activity_types
            ]
            mapping_res, _ = propose_generic_table_mapping(
                file_bytes=file_bytes,
                filename=upload.original_filename,
                canonical_activities=canon_acts,
            )
            upload.mapping = mapping_res.model_dump()
            upload.issues = []
            upload.status = "needs_review"

        elif upload.kind in ("bill_pdf", "bill_image"):
            extraction, proposed_rec, issues = extract_bill_document(
                file_bytes=file_bytes,
                filename=upload.original_filename,
            )
            upload.mapping = {
                "extraction": extraction.model_dump(),
                "proposed_record": proposed_rec,
            }
            upload.issues = issues
            upload.status = "needs_review"

            # Update factory electricity tariff if available
            if proposed_rec and "attributes" in proposed_rec:
                var_tariff = proposed_rec["attributes"].get("variable_tariff_inr_per_kwh")
                if var_tariff:
                    factory = db.query(Factory).filter(Factory.id == upload.factory_id).first()
                    if factory and factory.electricity_tariff_inr_per_kwh is None:
                        factory.electricity_tariff_inr_per_kwh = var_tariff
                        db.add(factory)

        db.commit()
        db.refresh(upload)
        return upload

    except Exception as e:
        upload.status = "failed"
        upload.error = str(e)
        db.commit()
        db.refresh(upload)
        return upload


@router.get("/uploads/{upload_id}", response_model=UploadResponse)
def get_upload_details(
    upload_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    upload = db.query(Upload).filter(Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "UPLOAD_NOT_FOUND", "message_key": "errors.upload_not_found", "details": {}}},
        )

    member = (
        db.query(FactoryMember)
        .filter(FactoryMember.factory_id == upload.factory_id, FactoryMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found", "details": {}}},
        )
    return upload


class ConfirmUploadRequest(BaseModel):
    confirmed_records: list[dict[str, Any]] | None = None
    confirmed_mapping: dict[str, Any] | None = None


@router.post("/uploads/{upload_id}/confirm", response_model=dict[str, Any])
def confirm_upload(
    upload_id: uuid.UUID,
    payload: ConfirmUploadRequest | None = None,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm review and persist records into activity_records with status = confirmed."""
    upload = db.query(Upload).filter(Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "UPLOAD_NOT_FOUND", "message_key": "errors.upload_not_found", "details": {}}},
        )

    member = (
        db.query(FactoryMember)
        .filter(FactoryMember.factory_id == upload.factory_id, FactoryMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found", "details": {}}},
        )

    activity_types = db.query(ActivityType).all()
    records_to_create: list[dict[str, Any]] = []

    if payload and payload.confirmed_records:
        records_to_create = payload.confirmed_records

    elif upload.kind == "template_xlsx":
        records_to_create = (upload.mapping or {}).get("draft_records", [])

    elif upload.kind == "generic_table":
        # Apply confirmed or stored mapping
        mapping_data = (payload.confirmed_mapping if payload and payload.confirmed_mapping else upload.mapping) or {}
        mapping_obj = TableMappingResult.model_validate(mapping_data)
        file_bytes, _ = _resolve_file_bytes(upload)
        _, all_rows = propose_generic_table_mapping(
            file_bytes, upload.original_filename, [],
        )
        records_to_create, _ = apply_confirmed_table_mapping(all_rows, mapping_obj, activity_types)

    elif upload.kind in ("bill_pdf", "bill_image"):
        rec = (upload.mapping or {}).get("proposed_record")
        if rec:
            records_to_create = [rec]

    # Aggregate multiple records in same month for same activity (e.g. multiple Tally vouchers)
    aggregated: dict[tuple[date, str], dict[str, Any]] = {}
    for r in records_to_create:
        p_month = r["period_month"]
        if isinstance(p_month, str):
            p_month = date.fromisoformat(p_month if len(p_month) == 10 else f"{p_month}-01")
        act_key = r["activity_type"]
        key = (p_month, act_key)

        qty = float(r["quantity"])
        qty_canon = float(r.get("quantity_canonical", r["quantity"]))
        cost = float(r.get("cost_inr") or 0.0)
        s_note = r.get("source_note", "")

        if key not in aggregated:
            aggregated[key] = {
                "period_month": p_month,
                "activity_type": act_key,
                "quantity": qty,
                "unit": r["unit"],
                "quantity_canonical": qty_canon,
                "cost_inr": cost if cost > 0 else None,
                "attributes": dict(r.get("attributes", {})),
                "source_notes": [s_note] if s_note else [],
                "confidence": float(r.get("confidence", 1.0)),
            }
        else:
            entry = aggregated[key]
            entry["quantity"] += qty
            entry["quantity_canonical"] += qty_canon
            if cost > 0:
                entry["cost_inr"] = (entry["cost_inr"] or 0.0) + cost
            if s_note:
                entry["source_notes"].append(s_note)

    created_records = []
    for (p_month, act_key), item in aggregated.items():
        notes_summary = ", ".join(item["source_notes"][:3])
        if len(item["source_notes"]) > 3:
            notes_summary += f" (+{len(item['source_notes']) - 3} more)"

        # Check if record already exists for factory + month + activity + upload
        existing = (
            db.query(ActivityRecord)
            .filter(
                ActivityRecord.factory_id == upload.factory_id,
                ActivityRecord.period_month == p_month,
                ActivityRecord.activity_type == act_key,
                ActivityRecord.source_upload_id == upload.id,
            )
            .first()
        )

        if existing:
            existing.quantity = item["quantity"]
            existing.quantity_canonical = item["quantity_canonical"]
            existing.cost_inr = item["cost_inr"]
            existing.source_note = notes_summary
            existing.status = "confirmed"
            created_records.append(existing)
        else:
            act_rec = ActivityRecord(
                factory_id=upload.factory_id,
                source_upload_id=upload.id,
                period_month=p_month,
                activity_type=act_key,
                quantity=item["quantity"],
                unit=item["unit"],
                quantity_canonical=item["quantity_canonical"],
                cost_inr=item["cost_inr"],
                attributes=item.get("attributes", {}),
                source_note=notes_summary,
                confidence=item.get("confidence", 1.0),
                status="confirmed",
            )
            db.add(act_rec)
            created_records.append(act_rec)

    upload.status = "confirmed"
    db.commit()


    return {
        "status": "confirmed",
        "upload_id": upload.id,
        "records_created": len(created_records),
    }


@router.get("/factories/{factory_id}/activity-records", response_model=list[ActivityRecordResponse])
def list_activity_records(
    factory_id: uuid.UUID,
    status_filter: str | None = None,
    category_filter: str | None = None,
    member: FactoryMember = Depends(require_factory_access(min_role="viewer")),
    db: Session = Depends(get_db),
):
    query = db.query(ActivityRecord).filter(ActivityRecord.factory_id == factory_id)
    if status_filter:
        query = query.filter(ActivityRecord.status == status_filter)

    records = query.order_by(ActivityRecord.period_month.desc(), ActivityRecord.created_at.desc()).all()
    return records


@router.get("/factories/{factory_id}/activity-records/coverage")
def get_activity_coverage(
    factory_id: uuid.UUID,
    member: FactoryMember = Depends(require_factory_access(min_role="viewer")),
    db: Session = Depends(get_db),
):
    """Compute 12-month activity coverage grid."""
    records = (
        db.query(ActivityRecord)
        .filter(ActivityRecord.factory_id == factory_id, ActivityRecord.status == "confirmed")
        .all()
    )
    activity_types = db.query(ActivityType).all()
    act_meta = {a.key: a for a in activity_types}

    # Determine 12-month span
    months_in_data = sorted(list({r.period_month.strftime("%Y-%m") for r in records if r.period_month}))
    if len(months_in_data) >= 12:
        span_months = months_in_data[-12:]
    elif len(months_in_data) > 0:
        span_months = months_in_data
    else:
        span_months = ["2026-01", "2026-02", "2026-03", "2026-04"]

    # Matrix: activity_type x month
    matrix: dict[str, dict[str, float]] = {}
    for r in records:
        m = r.period_month.strftime("%Y-%m")
        if m in span_months:
            if r.activity_type not in matrix:
                matrix[r.activity_type] = {}
            matrix[r.activity_type][m] = matrix[r.activity_type].get(m, 0.0) + float(r.quantity_canonical)

    activities_coverage = []
    for act_key, m_data in matrix.items():
        meta = act_meta.get(act_key)
        filled_count = sum(1 for m in span_months if m in m_data)
        pct = (filled_count / len(span_months) * 100.0) if span_months else 0.0
        activities_coverage.append({
            "activity_type": act_key,
            "label_en": getattr(meta, "label_en", act_key),
            "label_gu": getattr(meta, "label_gu", None),
            "category": getattr(meta, "category", "material"),
            "canonical_unit": getattr(meta, "canonical_unit", ""),
            "months_filled": filled_count,
            "coverage_pct": round(pct, 1),
            "monthly_data": m_data,
        })

    activities_coverage.sort(key=lambda x: x["months_filled"], reverse=True)

    total_cells = len(activities_coverage) * len(span_months)
    filled_cells = sum(a["months_filled"] for a in activities_coverage)
    overall_pct = (filled_cells / total_cells * 100.0) if total_cells > 0 else 0.0

    return {
        "months": span_months,
        "activities": activities_coverage,
        "total_activities_tracked": len(activities_coverage),
        "overall_coverage_pct": round(overall_pct, 1),
    }
