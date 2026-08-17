"""
database.py
SQLAlchemy engine/session setup + declarative base.
pgvector is enabled via a raw SQL statement (CREATE EXTENSION) so grievance
text embeddings can be stored and compared for duplicate detection.
"""
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

from config import settings

logger = logging.getLogger("grievance_app.database")

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a DB session and guarantees it closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Enable pgvector extension and create all tables.
    Called once at application startup. For real migrations beyond initial
    setup, use Alembic instead of relying on create_all.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
        # Import models so they're registered on Base.metadata before create_all
        import models.user  # noqa: F401
        import models.grievance  # noqa: F401
        import models.notification  # noqa: F401

        Base.metadata.create_all(bind=engine)
        logger.info("Database initialized (pgvector enabled, tables created).")
    except Exception as exc:
        logger.error(f"Database initialization failed: {exc}")
        raise
