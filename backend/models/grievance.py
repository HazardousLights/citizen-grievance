"""
models/grievance.py
Grievance + complaint_updates tables. Embeddings are stored with pgvector
(768 dims, matching Gemini's text-embedding-004) for semantic duplicate search.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Integer, Float, Boolean, Enum, ForeignKey, Text, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from database import Base


class Category(str, enum.Enum):
    water_supply = "water_supply"
    electricity = "electricity"
    roads = "roads"
    sanitation = "sanitation"
    public_safety = "public_safety"
    street_lights = "street_lights"
    garbage_waste = "garbage_waste"
    out_of_scope = "out_of_scope"


class Status(str, enum.Enum):
    unsolved = "unsolved"
    in_progress = "in_progress"
    solved = "solved"
    rejected = "rejected"


class Grievance(Base):
    __tablename__ = "grievances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    text = Column(Text, nullable=False)
    image_url = Column(String(500), nullable=True)
    location = Column(String(500), nullable=True)  # "lat,lng" or manual address string

    category = Column(Enum(Category), default=Category.out_of_scope, nullable=False)
    department = Column(String(100), nullable=True)
    urgency_score = Column(Integer, default=1)  # 1-10
    confidence = Column(Float, default=0.0)  # AI confidence 0-1

    status = Column(Enum(Status), default=Status.unsolved, nullable=False)

    is_duplicate = Column(Boolean, default=False)
    similar_complaint_ids = Column(ARRAY(String), default=list)
    embedding = Column(Vector(768), nullable=True)

    is_ai_overridden = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="grievances")
    updates = relationship("ComplaintUpdate", back_populates="grievance", cascade="all, delete-orphan")


class ComplaintUpdate(Base):
    __tablename__ = "complaint_updates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grievance_id = Column(UUID(as_uuid=True), ForeignKey("grievances.id"), nullable=False)
    status = Column(Enum(Status), nullable=False)
    message = Column(Text, nullable=True)
    progress_image_url = Column(String(500), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    grievance = relationship("Grievance", back_populates="updates")
