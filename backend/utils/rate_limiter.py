"""
utils/rate_limiter.py
Simple DB-backed rate limiting helpers (no external Redis dependency needed
for this scale). slowapi handles general per-IP endpoint throttling; these
functions handle the domain-specific rules (OTP/hour, complaints/day).
"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from config import settings
from models.user import OTPVerification
from models.grievance import Grievance


def otp_requests_last_hour(db: Session, phone: str) -> int:
    since = datetime.utcnow() - timedelta(hours=1)
    return db.query(OTPVerification).filter(
        OTPVerification.phone == phone,
        OTPVerification.created_at >= since,
    ).count()


def can_request_otp(db: Session, phone: str) -> bool:
    return otp_requests_last_hour(db, phone) < settings.OTP_MAX_REQUESTS_PER_HOUR


def complaints_today(db: Session, user_id) -> int:
    since = datetime.utcnow() - timedelta(hours=24)
    return db.query(Grievance).filter(
        Grievance.user_id == user_id,
        Grievance.created_at >= since,
    ).count()


def can_submit_complaint(db: Session, user_id) -> bool:
    return complaints_today(db, user_id) < settings.MAX_COMPLAINTS_PER_DAY


def rejection_rate(db: Session, user_id) -> float:
    total = db.query(func.count(Grievance.id)).filter(Grievance.user_id == user_id).scalar() or 0
    if total == 0:
        return 0.0
    rejected = db.query(func.count(Grievance.id)).filter(
        Grievance.user_id == user_id, Grievance.status == "rejected"
    ).scalar() or 0
    return rejected / total
