import uuid
from typing import Any

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.models import FactoryMember

security_scheme = HTTPBearer(auto_error=False)
settings = get_settings()

ROLE_HIERARCHY = {
    "viewer": 1,
    "editor": 2,
    "owner": 3,
}


class AuthenticatedUser:
    def __init__(
        self, user_id: uuid.UUID, email: str | None = None, metadata: dict[str, Any] | None = None
    ):
        self.id = user_id
        self.email = email
        self.metadata = metadata or {}


def decode_access_token(token: str) -> AuthenticatedUser:
    """Decode and validate a JWT access token string."""
    try:
        if settings.SUPABASE_JWT_SECRET:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        else:
            payload = jwt.decode(
                token,
                options={"verify_signature": False},
                algorithms=["HS256", "RS256"],
                audience="authenticated",
            )

        user_id_str = payload.get("sub")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": {
                        "code": "INVALID_TOKEN",
                        "message_key": "errors.invalid_token",
                        "details": {},
                    }
                },
            )
        return AuthenticatedUser(
            user_id=uuid.UUID(user_id_str),
            email=payload.get("email"),
            metadata=payload.get("user_metadata"),
        )
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": "INVALID_TOKEN",
                    "message_key": "errors.invalid_token",
                    "details": {"msg": str(e)},
                }
            },
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security_scheme),
) -> AuthenticatedUser:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": "UNAUTHORIZED",
                    "message_key": "errors.unauthorized",
                    "details": {},
                }
            },
        )

    return decode_access_token(credentials.credentials)


def require_factory_access(min_role: str = "viewer"):
    async def _dependency(
        factory_id: uuid.UUID,
        user: AuthenticatedUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> FactoryMember:
        member = (
            db.query(FactoryMember)
            .filter(FactoryMember.factory_id == factory_id, FactoryMember.user_id == user.id)
            .first()
        )
        if not member:
            # PRD §16.1: return 404 (not 403) when user is not a member
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

        user_role_level = ROLE_HIERARCHY.get(member.role, 0)
        required_role_level = ROLE_HIERARCHY.get(min_role, 1)
        if user_role_level < required_role_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": {"code": "FORBIDDEN", "message_key": "errors.forbidden", "details": {}}
                },
            )
        return member

    return _dependency
