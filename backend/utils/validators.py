"""
utils/validators.py
Extra input sanitization beyond Pydantic field validation — defends against
basic XSS/SQL-injection-style payloads in free-text fields. SQLAlchemy's
parameterized queries already prevent SQL injection at the DB layer; this
is a defense-in-depth layer for stored/reflected content.
"""
import re
import bleach

SUSPICIOUS_SQL_PATTERNS = re.compile(
    r"(;|--|/\*|\*/|xp_cmdshell|union\s+select|drop\s+table)", re.IGNORECASE
)


def sanitize_text(raw: str) -> str:
    """Strip HTML tags/scripts and collapse whitespace."""
    cleaned = bleach.clean(raw, tags=[], attributes={}, strip=True)
    return re.sub(r"\s+", " ", cleaned).strip()


def looks_like_injection_attempt(raw: str) -> bool:
    return bool(SUSPICIOUS_SQL_PATTERNS.search(raw))


def validate_image_content_type(content_type: str) -> bool:
    return content_type in {"image/jpeg", "image/png", "image/webp"}


def validate_phone(phone: str) -> bool:
    return bool(re.match(r"^\+?[0-9]{10,15}$", phone))
