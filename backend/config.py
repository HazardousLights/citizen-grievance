"""
config.py
Centralized configuration loaded from environment variables.
Fails fast on startup if required variables are missing, which avoids
half-configured deployments failing silently at request time.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # --- Database ---
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # --- Auth ---
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    # --- Gemini AI ---
    # TODO: Add your Gemini API key here (https://aistudio.google.com/app/apikey)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    GEMINI_EMBEDDING_MODEL: str = os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004")

    # --- OTP / SMS (placeholder provider, e.g. MSG91 / Twilio) ---
    OTP_PROVIDER_API_KEY: str = os.getenv("OTP_PROVIDER_API_KEY", "")
    OTP_EXPIRY_MINUTES: int = int(os.getenv("OTP_EXPIRY_MINUTES", "5"))
    OTP_MAX_REQUESTS_PER_HOUR: int = int(os.getenv("OTP_MAX_REQUESTS_PER_HOUR", "3"))

    # --- Notifications (placeholder, e.g. SendGrid / Twilio) ---
    NOTIFICATION_PROVIDER_API_KEY: str = os.getenv("NOTIFICATION_PROVIDER_API_KEY", "")

    # --- File storage ---
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    # TODO: swap for S3 bucket config in production
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "")

    # --- App / anti-abuse ---
    CORS_ORIGINS: list = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    MAX_COMPLAINTS_PER_DAY: int = int(os.getenv("MAX_COMPLAINTS_PER_DAY", "3"))
    AUTO_BAN_REJECTION_RATE: float = float(os.getenv("AUTO_BAN_REJECTION_RATE", "0.8"))
    ENV: str = os.getenv("ENV", "development")


REQUIRED_VARS = ["DATABASE_URL", "JWT_SECRET"]


def validate_settings(settings: "Settings") -> None:
    """Fail fast if critical env vars are missing. Warn (don't crash) for
    optional integrations like Gemini/OTP so local dev can run without them."""
    missing = [v for v in REQUIRED_VARS if not getattr(settings, v)]
    if missing:
        sys.stderr.write(
            f"[FATAL] Missing required environment variables: {', '.join(missing)}\n"
            "Copy .env.example to .env and fill these in.\n"
        )
        sys.exit(1)

    if not settings.GEMINI_API_KEY:
        sys.stderr.write(
            "[WARN] GEMINI_API_KEY is not set. AI classification will run in "
            "fallback/mock mode until it is provided.\n"
        )


settings = Settings()
validate_settings(settings)
