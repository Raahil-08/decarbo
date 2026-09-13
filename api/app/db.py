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

# Render containers only support IPv4. Direct Supabase (db.<ref>.supabase.co) resolves to IPv6 only.
# Automatically rewrite to Supabase's IPv4 Connection Pooler (Supavisor) on port 5432.
supabase_direct_match = re.search(r"@db\.([a-z0-9]+)\.supabase\.co(?::\d+)?", db_url)
if supabase_direct_match:
    project_ref = supabase_direct_match.group(1)
    # The pooler requires username format: postgres.<project_ref>
    if not re.search(rf"://[^:]+\.{project_ref}:", db_url):
        db_url = re.sub(r"://([^:]+):", rf"://\1.{project_ref}:", db_url, count=1)
    db_url = re.sub(
        rf"@db\.{project_ref}\.supabase\.co(?::\d+)?",
        r"@aws-0-ap-northeast-2.pooler.supabase.com:5432",
        db_url,
    )

connect_args = {}
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    connect_args = {"connect_timeout": 10}

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
