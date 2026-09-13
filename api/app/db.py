from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.config import get_settings

settings = get_settings()

import re

db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgresql+psycopg2://"):
    db_url = db_url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)

# Render lacks IPv6 outbound routing; rewrite direct Supabase host to IPv4 connection pooler
match = re.search(r"@db\.([a-z0-9]+)\.supabase\.co(?::5432)?", db_url)
if match:
    project_ref = match.group(1)
    db_url = re.sub(r"://postgres:", f"://postgres.{project_ref}:", db_url)
    db_url = db_url.replace(f"db.{project_ref}.supabase.co", "aws-0-ap-south-1.pooler.supabase.com")

connect_args = {}
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
