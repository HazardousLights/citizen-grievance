"""
models/notification.py
Notification log — records what was sent (or attempted) for each grievance
lifecycle event, useful for auditing and debugging delivery failures.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    grievance_id = Column(UUID(as_uuid=True), ForeignKey("grievances.id"), nullable=True)
    message = Column(Text, nullable=False)
    channel = Column(String(20), default="sms")  # sms | email
    sent = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
