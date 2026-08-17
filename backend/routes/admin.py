"""
routes/admin.py
Admin dashboard endpoints: list/filter grievances, update status,
reclassify (override AI), and view analytics.
"""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models.user import User
from models.grievance import Grievance, ComplaintUpdate, Category, Status
from schemas.grievance import GrievanceOut, StatusUpdateRequest, ReclassifyRequest
from schemas.response import MessageResponse, AnalyticsResponse
from auth import require_admin
from routes.grievances import _to_out, _notify

logger = logging.getLogger("grievance_app.routes.admin")
router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/grievances", response_model=List[GrievanceOut])
def list_all_grievances(
    category: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    department: Optional[str] = Query(None),
    min_urgency: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    q = db.query(Grievance)
    if category:
        q = q.filter(Grievance.category == category)
    if status_filter:
        q = q.filter(Grievance.status == status_filter)
    if department:
        q = q.filter(Grievance.department == department)
    if min_urgency is not None:
        q = q.filter(Grievance.urgency_score >= min_urgency)

    rows = q.order_by(Grievance.urgency_score.desc(), Grievance.created_at.desc()).all()
    return [_to_out(g) for g in rows]


@router.patch("/grievances/{grievance_id}/status", response_model=GrievanceOut)
def update_status(
    grievance_id: str,
    payload: StatusUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    g = db.query(Grievance).filter(Grievance.id == grievance_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grievance not found")

    g.status = Status(payload.status)
    g.updated_at = datetime.utcnow()

    update_record = ComplaintUpdate(
        grievance_id=g.id,
        status=g.status,
        message=payload.message,
        progress_image_url=payload.progress_image_url,
    )
    db.add(update_record)

    try:
        db.commit()
        db.refresh(g)
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to update grievance status: {exc}")
        raise HTTPException(status_code=500, detail="Could not update status")

    status_messages = {
        "in_progress": "Your complaint is now in progress.",
        "solved": "Your complaint has been resolved. Thank you for reporting it.",
        "rejected": "Your complaint was rejected by an admin.",
    }
    msg = status_messages.get(payload.status, f"Your complaint status changed to {payload.status}.")
    _notify(db, g.user_id, g.id, msg + (f" Note: {payload.message}" if payload.message else ""))

    return _to_out(g)


@router.patch("/grievances/{grievance_id}/reclassify", response_model=GrievanceOut)
def reclassify_grievance(
    grievance_id: str,
    payload: ReclassifyRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    g = db.query(Grievance).filter(Grievance.id == grievance_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grievance not found")

    valid_categories = {c.value for c in Category}
    if payload.category not in valid_categories:
        raise HTTPException(status_code=400, detail=f"category must be one of {valid_categories}")

    g.category = Category(payload.category)
    if payload.department:
        g.department = payload.department
    if payload.urgency_score is not None:
        g.urgency_score = max(1, min(10, payload.urgency_score))
    g.is_ai_overridden = True
    g.updated_at = datetime.utcnow()

    try:
        db.commit()
        db.refresh(g)
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to reclassify grievance: {exc}")
        raise HTTPException(status_code=500, detail="Could not reclassify grievance")

    return _to_out(g)


@router.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    total = db.query(func.count(Grievance.id)).scalar() or 0

    by_category_rows = db.query(Grievance.category, func.count(Grievance.id)).group_by(Grievance.category).all()
    by_category = {c.value if hasattr(c, "value") else c: n for c, n in by_category_rows}

    by_status_rows = db.query(Grievance.status, func.count(Grievance.id)).group_by(Grievance.status).all()
    by_status = {s.value if hasattr(s, "value") else s: n for s, n in by_status_rows}

    avg_resolution = db.query(
        func.avg(func.extract("epoch", Grievance.updated_at - Grievance.created_at) / 3600.0)
    ).filter(Grievance.status == Status.solved).scalar()

    duplicate_clusters = db.query(func.count(Grievance.id)).filter(Grievance.is_duplicate.is_(True)).scalar() or 0

    return AnalyticsResponse(
        total_grievances=total,
        by_category=by_category,
        by_status=by_status,
        avg_resolution_hours=float(avg_resolution) if avg_resolution else None,
        duplicate_clusters=duplicate_clusters,
    )


@router.post("/users/{user_id}/ban", response_model=MessageResponse)
def ban_user(user_id: str, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_banned = True
    db.commit()
    return MessageResponse(message=f"User {user_id} banned")


@router.post("/users/{user_id}/unban", response_model=MessageResponse)
def unban_user(user_id: str, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_banned = False
    db.commit()
    return MessageResponse(message=f"User {user_id} unbanned")
