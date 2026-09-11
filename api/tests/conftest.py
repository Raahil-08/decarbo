import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app

# In-memory SQLite database for deterministic testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def user_a_id():
    return uuid.UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
def user_b_id():
    return uuid.UUID("22222222-2222-2222-2222-222222222222")


def create_token(user_id: uuid.UUID) -> str:
    # Unsigned / mock token compatible with pyjwt decode when no secret configured
    payload = {
        "sub": str(user_id),
        "aud": "authenticated",
        "email": f"user_{user_id}@example.com",
    }
    return jwt.encode(payload, "secret_key_at_least_32_bytes_long_for_sha256!", algorithm="HS256")


@pytest.fixture
def auth_headers_user_a(user_a_id):
    token = create_token(user_a_id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_user_b(user_b_id):
    token = create_token(user_b_id)
    return {"Authorization": f"Bearer {token}"}
