"""
app.py
FastAPI application entrypoint. Wires up CORS, static file serving for
uploaded images, rate limiting, routers, and startup DB initialization.

Run with: uvicorn app:app --reload
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import settings
from database import init_db
from utils.logger import setup_logging
from routes import auth as auth_routes
from routes import grievances as grievance_routes
from routes import admin as admin_routes

setup_logging()
logger = logging.getLogger("grievance_app.main")

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="AI-Based Citizen Grievance Classification System",
    description="Citizens submit civic grievances; Gemini AI classifies, "
                "scores urgency, detects duplicates, and filters out-of-scope complaints.",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth_routes.router)
app.include_router(grievance_routes.router)
app.include_router(admin_routes.router)


@app.on_event("startup")
def on_startup():
    logger.info(f"Starting up in '{settings.ENV}' mode...")
    init_db()


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all so unhandled errors never leak stack traces to clients."""
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health_check():
    return {"status": "ok", "env": settings.ENV}
