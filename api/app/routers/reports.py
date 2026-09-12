"""Reports API router per PRD §14.1, §18, and §22 Phase 9."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user
from app.db import get_db
from app.models.models import FactoryMember, Plan, Report
from app.reports.render import REPORTS_STORAGE_DIR, generate_plan_pdf_report

router = APIRouter(tags=["reports"])
optional_bearer = HTTPBearer(auto_error=False)


class GenerateReportRequest(BaseModel):
    locale: str = "en"


class ReportResponse(BaseModel):
    id: str
    report_id: str
    factory_id: str
    plan_id: str
    locale: str
    storage_path: str
    download_url: str
    created_at: str


@router.post(
    "/plans/{plan_id}/report",
    response_model=ReportResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_report(
    plan_id: uuid.UUID,
    payload: GenerateReportRequest = GenerateReportRequest(),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ReportResponse:
    """Generate a 7-page publication-grade PDF report for a plan."""
    # 1. Fetch Plan
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PLAN_NOT_FOUND", "message_key": "errors.plan_not_found"}},
        )

    # 2. Check factory access for current user (PRD §16.1 -> 404 for non-members)
    member = (
        db.query(FactoryMember)
        .filter(FactoryMember.factory_id == plan.factory_id, FactoryMember.user_id == current_user.id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PLAN_NOT_FOUND", "message_key": "errors.plan_not_found"}},
        )

    # 3. Validate locale
    target_locale = payload.locale.lower() if payload.locale else "en"
    if target_locale not in ["en", "gu", "hi"]:
        target_locale = "en"

    # 4. Generate PDF report
    try:
        report, _ = generate_plan_pdf_report(
            plan_id=plan.id,
            locale=target_locale,
            db=db,
            user_id=str(current_user.id),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "REPORT_GENERATION_FAILED",
                    "message_key": "errors.report_generation_failed",
                    "details": {"reason": str(e)},
                }
            },
        )

    return ReportResponse(
        id=str(report.id),
        report_id=str(report.id),
        factory_id=str(report.factory_id),
        plan_id=str(report.plan_id),
        locale=report.locale,
        storage_path=report.storage_path,
        download_url=f"/api/v1/reports/{report.id}/download",
        created_at=report.created_at.isoformat(),
    )


@router.get(
    "/reports/{report_id}/download",
    response_class=FileResponse,
    status_code=status.HTTP_200_OK,
)
def download_report(
    report_id: uuid.UUID,
    token: str | None = Query(None, description="Auth token for direct browser tab opens"),
    credentials: HTTPAuthorizationCredentials | None = Security(optional_bearer),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Download or view rendered PDF report with authorization and tenant verification."""
    # Resolve token from Bearer or query
    auth_token = credentials.credentials if credentials else token
    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message_key": "errors.unauthorized"}},
        )

    # Validate user identity
    from app.auth import decode_access_token
    user = decode_access_token(auth_token)

    # Fetch report
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "REPORT_NOT_FOUND", "message_key": "errors.report_not_found"}},
        )

    # Check factory membership
    member = (
        db.query(FactoryMember)
        .filter(FactoryMember.factory_id == report.factory_id, FactoryMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "REPORT_NOT_FOUND", "message_key": "errors.report_not_found"}},
        )

    # Locate file on disk
    base_dir = REPORTS_STORAGE_DIR.parent.parent
    file_path = base_dir / report.storage_path
    if not file_path.exists():
        file_path = REPORTS_STORAGE_DIR / str(report.factory_id) / f"{report.id}.pdf"

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "REPORT_FILE_NOT_FOUND", "message_key": "errors.report_file_not_found"}},
        )

    filename = f"decarbo_report_{report.locale}_{str(report.id)[:8]}.pdf"
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=filename,
        content_disposition_type="inline",
    )


@router.get(
    "/factories/{factory_id}/reports",
    response_model=list[ReportResponse],
    status_code=status.HTTP_200_OK,
)
def list_factory_reports(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> list[ReportResponse]:
    """List all generated reports for a factory."""
    member = (
        db.query(FactoryMember)
        .filter(FactoryMember.factory_id == factory_id, FactoryMember.user_id == current_user.id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    reports = (
        db.query(Report)
        .filter(Report.factory_id == factory_id)
        .order_by(Report.created_at.desc())
        .all()
    )

    return [
        ReportResponse(
            id=str(r.id),
            report_id=str(r.id),
            factory_id=str(r.factory_id),
            plan_id=str(r.plan_id),
            locale=r.locale,
            storage_path=r.storage_path,
            download_url=f"/api/v1/reports/{r.id}/download",
            created_at=r.created_at.isoformat(),
        )
        for r in reports
    ]
