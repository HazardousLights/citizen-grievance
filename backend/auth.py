"""
auth.py
Password hashing (bcrypt), JWT issuance/verification, and OTP generation
with hashed storage + expiry. Kept framework-agnostic so it can be unit
tested without spinning up FastAPI.
"""
import random
import logging
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User

logger = logging.getLogger("grievance_app.auth")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


# ---------- Passwords ----------

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ---------- OTP ----------

def generate_otp() -> str:
    """6-digit numeric OTP. Not cryptographically sensitive by itself since
    it's short-lived and rate-limited, but we still hash it before storing."""
    return f"{random.randint(0, 999999):06d}"


def hash_otp(otp: str) -> str:
    return pwd_context.hash(otp)


def verify_otp_hash(otp: str, otp_hash: str) -> bool:
    return pwd_context.verify(otp, otp_hash)


def otp_expiry() -> datetime:
    return datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)


def send_otp_sms(phone: str, otp: str) -> bool:
    """
    Placeholder for an SMS provider (Twilio / MSG91).
    TODO: Replace with a real API call using settings.OTP_PROVIDER_API_KEY.
    Returns True on (simulated) success.
    """
    if not settings.OTP_PROVIDER_API_KEY:
        logger.warning(f"[MOCK SMS] OTP for {phone}: {otp} (no OTP provider key configured)")
        return True
    try:
        # Example real integration:
        # response = requests.post("https://api.msg91.com/api/v5/otp", ...)
        # response.raise_for_status()
        logger.info(f"OTP sent to {phone} via provider.")
        return True
    except Exception as exc:
        logger.error(f"Failed to send OTP to {phone}: {exc}")
        return False


# ---------- JWT ----------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ---------- FastAPI dependencies ----------

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account banned due to abuse policy")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
