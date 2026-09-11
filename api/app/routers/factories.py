import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, get_current_user, require_factory_access
from app.db import get_db
from app.models.models import Factory, FactoryMember

router = APIRouter(prefix="/factories", tags=["factories"])


class FactoryCreate(BaseModel):
    name: str
    industry: str
    products: str | None = None
    city: str | None = None
    state: str | None = "Gujarat"
    cluster: str | None = None
    grid_region: str | None = "IN"
    output_unit: str | None = "t"
    annual_output: float | None = None
    electricity_tariff_inr_per_kwh: float | None = None


class FactoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    industry: str
    products: str | None = None
    city: str | None = None
    state: str | None = None
    cluster: str | None = None
    grid_region: str
    output_unit: str
    annual_output: float | None = None
    electricity_tariff_inr_per_kwh: float | None = None

    model_config = ConfigDict(from_attributes=True)


@router.post("", response_model=FactoryResponse, status_code=status.HTTP_201_CREATED)
def create_factory(
    data: FactoryCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    factory = Factory(
        name=data.name,
        industry=data.industry,
        products=data.products,
        city=data.city,
        state=data.state or "Gujarat",
        cluster=data.cluster,
        grid_region=data.grid_region or "IN",
        output_unit=data.output_unit or "t",
        annual_output=data.annual_output,
        electricity_tariff_inr_per_kwh=data.electricity_tariff_inr_per_kwh,
        created_by=user.id,
    )
    db.add(factory)
    db.flush()

    member = FactoryMember(
        factory_id=factory.id,
        user_id=user.id,
        role="owner",
    )
    db.add(member)
    db.commit()
    db.refresh(factory)
    return factory


@router.get("", response_model=list[FactoryResponse])
def list_factories(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    factories = (
        db.query(Factory)
        .join(FactoryMember, Factory.id == FactoryMember.factory_id)
        .filter(FactoryMember.user_id == user.id)
        .all()
    )
    return factories


@router.get("/{factory_id}", response_model=FactoryResponse)
def get_factory(
    factory_id: uuid.UUID,
    member: FactoryMember = Depends(require_factory_access(min_role="viewer")),
    db: Session = Depends(get_db),
):
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "FACTORY_NOT_FOUND",
                    "message_key": "errors.factory_not_found",
                    "details": {},
                }
            },
        )
    return factory
