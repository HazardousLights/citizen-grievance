"""
routes/auth.py
Registration, OTP send/verify, and login endpoints.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, OTPVerification, UserRole
from schemas.user import (
    RegisterRequest, SendOTPRequest, VerifyOTPRequest,
    LoginRequest, TokenResponse, UserOut,
)
from schemas.response import MessageResponse
from auth import (
    hash_password, verify_password, generate_otp, hash_otp,
    verify_otp_hash, otp_expiry, send_otp_sms, create_access_token, get_current_user,
)
from utils.rate_limiter import can_request_otp
from utils.validators import validate_phone

logger = logging.getLogger("grievance_app.routes.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/send-otp", response_model=MessageResponse)
def send_otp(payload: SendOTPRequest, db: Session = Depends(get_db)):
    if not validate_phone(payload.phone):
        raise HTTPException(status_code=400, detail="Invalid phone number format")

    if not can_request_otp(db, payload.phone):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many OTP requests. Please try again after an hour.",
        )

    otp = generate_otp()
    record = OTPVerification(
        phone=payload.phone,
        otp_hash=hash_otp(otp),
        expires_at=otp_expiry(),
    )
    db.add(record)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to persist OTP record: {exc}")
        raise HTTPException(status_code=500, detail="Could not process OTP request")

    if not send_otp_sms(payload.phone, otp):
        raise HTTPException(status_code=502, detail="Failed to send OTP. Please try again.")

    return MessageResponse(message="OTP sent successfully")


@router.post("/verify-otp", response_model=MessageResponse)
def verify_otp(payload: VerifyOTPRequest, db: Session = Depends(get_db)):
    record = (
        db.query(OTPVerification)
        .filter(OTPVerification.phone == payload.phone, OTPVerification.verified.is_(False))
        .order_by(OTPVerification.created_at.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=400, detail="No pending OTP for this phone number")

    from datetime import datetime
    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    record.attempt_count += 1
    if record.attempt_count > 5:
        db.commit()
        raise HTTPException(status_code=429, detail="Too many failed attempts. Request a new OTP.")

    if not verify_otp_hash(payload.otp, record.otp_hash):
        db.commit()
        raise HTTPException(status_code=400, detail="Incorrect OTP")

    record.verified = True
    db.commit()

    user = db.query(User).filter(User.phone == payload.phone).first()
    if user:
        user.is_phone_verified = True
        db.commit()

    return MessageResponse(message="Phone number verified successfully")


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.phone == payload.phone).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this phone number already exists")

    verified_otp = (
        db.query(OTPVerification)
        .filter(OTPVerification.phone == payload.phone, OTPVerification.verified.is_(True))
        .first()
    )
    if not verified_otp:
        raise HTTPException(status_code=400, detail="Phone number must be OTP-verified before registering")

    user = User(
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=UserRole.citizen,
        is_phone_verified=True,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to create user: {exc}")
        raise HTTPException(status_code=500, detail="Could not create account")

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token, role=user.role.value)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone == payload.phone).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid phone number or password")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Account banned due to abuse policy")

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token, role=user.role.value)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=str(current_user.id),
        phone=current_user.phone,
        role=current_user.role.value,
        reputation_score=current_user.reputation_score,
        is_phone_verified=current_user.is_phone_verified,
    )
