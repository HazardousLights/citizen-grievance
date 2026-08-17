"""
schemas/grievance.py
Pydantic request/response models for grievance submission and admin actions.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, field_validator, ConfigDict


class GrievanceCreate(BaseModel):
    text: str
    location: Optional[str] = None
    image_url: Optional[str] = None

    @field_validator("text")
    @classmethod
    def validate_text(cls, v):
        cleaned = v.strip()
        if len(cleaned) < 20:
            raise ValueError("Complaint text must be at least 20 characters long")
        if len(cleaned) > 2000:
            raise ValueError("Complaint text must be under 2000 characters")
        return cleaned


class GrievanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    category: str
    department: Optional[str]
    urgency_score: int
    confidence: float
    status: str
    text: str
    image_url: Optional[str]
    location: Optional[str]
    is_duplicate: bool
    similar_complaint_ids: List[str] = []
    created_at: datetime
    updated_at: datetime


class GrievanceRejected(BaseModel):
    rejected: bool = True
    reason: str


class StatusUpdateRequest(BaseModel):
    status: str  # unsolved | in_progress | solved | rejected
    message: Optional[str] = None
    progress_image_url: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        allowed = {"unsolved", "in_progress", "solved", "rejected"}
        if v not in allowed:
            raise ValueError(f"status must be one of {allowed}")
        return v


class ReclassifyRequest(BaseModel):
    category: str
    department: Optional[str] = None
    urgency_score: Optional[int] = None
