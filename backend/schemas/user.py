"""
schemas/user.py
Pydantic request/response models for auth endpoints.
"""
import re
from pydantic import BaseModel, field_validator, ConfigDict


class RegisterRequest(BaseModel):
    phone: str
    password: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if not re.match(r"^\+?[0-9]{10,15}$", v):
            raise ValueError("Phone must be 10-15 digits, optionally prefixed with +")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class SendOTPRequest(BaseModel):
    phone: str


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str


class LoginRequest(BaseModel):
    phone: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    phone: str
    role: str
    reputation_score: float
    is_phone_verified: bool
