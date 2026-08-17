"""
schemas/response.py
Shared response wrappers so every endpoint returns a consistent shape.
"""
from typing import Optional, Any
from pydantic import BaseModel


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str


class AnalyticsResponse(BaseModel):
    total_grievances: int
    by_category: dict
    by_status: dict
    avg_resolution_hours: Optional[float]
    duplicate_clusters: int
