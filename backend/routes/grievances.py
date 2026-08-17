"""
routes/grievances.py
Citizen-facing endpoints: submit a grievance, list own grievances, view one.
Handles the full AI pipeline: classify -> reject if out-of-scope ->
embed -> duplicate check -> persist -> notify.
"""
import logging
import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from database import get_db
from config import settings
from models.user import User
from models.grievance import Grievance, Category, Status
from models.notification import Notification
from schemas.grievance import GrievanceCreate, GrievanceOut
from schemas.response import MessageResponse
from auth import get_current_user
from ai_service.gemini_client import ai_client
from ai_service.utils import find_similar_grievances
from utils.validators import sanitize_text, looks_like_injection_attempt, validate_image_content_type
from utils.rate_limiter import can_submit_complaint, rejection_rate

logger = logging.getLogger("grievance_app.routes.grievances")
router = APIRouter(prefix="/api/grievances", tags=["grievances"])

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


def _notify(db: Session, user_id, grievance_id, message: str):
    """Best-effort notification logging. Failure here should never break
    the main request flow, so errors are caught and logged only."""
    try:
        note = Notification(user_id=user_id, grievance_id=grievance_id, message=message, sent=True)
        db.add(note)
        db.commit()
        # TODO: integrate real SMS/email provider (Twilio / SendGrid) here.
        logger.info(f"[MOCK NOTIFY] user={user_id} grievance={grievance_id}: {message}")
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to log notification: {exc}")


async def _save_image(image: Optional[UploadFile]) -> Optional[str]:
    if image is None:
        return None
    if not validate_image_content_type(image.content_type):
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WEBP images are allowed")

    contents = await image.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 5MB")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[image.content_type]
    filename = f"{uuid.uuid4()}.{ext}"
    path = os.path.join(settings.UPLOAD_DIR, filename)
    # TODO: swap this for an S3 upload (settings.S3_BUCKET_NAME) in production
    with open(path, "wb") as f:
        f.write(contents)
    return f"/uploads/{filename}"


@router.post("", response_model=GrievanceOut, status_code=status.HTTP_201_CREATED)
async def submit_grievance(
    text: str = Form(...),
    location: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # --- Anti-abuse checks ---
    if not can_submit_complaint(db, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily limit of {settings.MAX_COMPLAINTS_PER_DAY} complaints reached. Try again tomorrow.",
        )
    if rejection_rate(db, current_user.id) >= settings.AUTO_BAN_REJECTION_RATE:
        current_user.is_banned = True
        db.commit()
        raise HTTPException(status_code=403, detail="Account banned due to high rejection rate")

    # --- Input validation & sanitization ---
    if looks_like_injection_attempt(text):
        raise HTTPException(status_code=400, detail="Complaint text contains disallowed characters")
    try:
        validated = GrievanceCreate(text=text, location=location)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    clean_text = sanitize_text(validated.text)

    image_url = await _save_image(image)

    # --- AI classification ---
    try:
        result = ai_client.classify_grievance(clean_text, image_url)
    except Exception as exc:
        logger.error(f"AI classification error: {exc}")
        raise HTTPException(status_code=502, detail="Classification service temporarily unavailable")

    if result["is_out_of_scope"]:
        grievance = Grievance(
            user_id=current_user.id,
            text=clean_text,
            image_url=image_url,
            location=location,
            category=Category.out_of_scope,
            department=None,
            urgency_score=1,
            confidence=result.get("confidence", 0.0),
            status=Status.rejected,
        )
        db.add(grievance)
        db.commit()
        db.refresh(grievance)
        raise HTTPException(
            status_code=422,
            detail=result.get("rejection_reason") or "This complaint is out of scope for this portal.",
        )

    # --- Embedding + duplicate detection ---
    try:
        embedding = ai_client.get_embedding(clean_text)
        similar = find_similar_grievances(db, embedding, result["category"])
    except Exception as exc:
        logger.warning(f"Duplicate detection skipped due to error: {exc}")
        embedding, similar = None, []

    grievance = Grievance(
        user_id=current_user.id,
        text=clean_text,
        image_url=image_url,
        location=location,
        category=Category(result["category"]),
        department=result["department"],
        urgency_score=result["urgency_score"],
        confidence=result["confidence"],
        status=Status.unsolved,
        is_duplicate=len(similar) > 0,
        similar_complaint_ids=[s["id"] for s in similar],
        embedding=embedding,
    )
    db.add(grievance)
    try:
        db.commit()
        db.refresh(grievance)
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to save grievance: {exc}")
        raise HTTPException(status_code=500, detail="Could not save your complaint. Please try again.")

    _notify(db, current_user.id, grievance.id,
            f"Your complaint has been received and classified as '{grievance.category.value}' "
            f"(urgency {grievance.urgency_score}/10) and assigned to {grievance.department}.")

    return _to_out(grievance)


@router.get("", response_model=List[GrievanceOut])
def list_my_grievances(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Grievance).filter(Grievance.user_id == current_user.id).order_by(Grievance.created_at.desc()).all()
    return [_to_out(g) for g in rows]


@router.get("/{grievance_id}", response_model=GrievanceOut)
def get_grievance(grievance_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    g = db.query(Grievance).filter(Grievance.id == grievance_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grievance not found")
    if str(g.user_id) != str(current_user.id) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view this grievance")
    return _to_out(g)


def _to_out(g: Grievance) -> GrievanceOut:
    return GrievanceOut(
        id=str(g.id),
        category=g.category.value if hasattr(g.category, "value") else g.category,
        department=g.department,
        urgency_score=g.urgency_score,
        confidence=g.confidence,
        status=g.status.value if hasattr(g.status, "value") else g.status,
        text=g.text,
        image_url=g.image_url,
        location=g.location,
        is_duplicate=g.is_duplicate,
        similar_complaint_ids=g.similar_complaint_ids or [],
        created_at=g.created_at,
        updated_at=g.updated_at,
    )
