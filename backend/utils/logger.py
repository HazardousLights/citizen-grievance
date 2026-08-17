"""
utils/logger.py
Centralized logging configuration. Call setup_logging() once at startup.
"""
import logging
import sys
from config import settings


def setup_logging() -> None:
    level = logging.DEBUG if settings.ENV == "development" else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    # Quiet noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
