from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from app.config import get_settings
from app.routers import (
    auth_router,
    fleet_router,
    jobcards_router,
    branding_router,
    schedule_router,
    ml_router,
    audit_router,
    reports_router,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title="KMRL InductPlan API",
    description="AI-Driven Train Induction Planning & Scheduling for Kochi Metro Rail Limited",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Robust CORS Configuration supporting localhost, 127.0.0.1, and cloud deployment domains
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(status_code=404, content={"detail": "Resource not found"})

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Internal server error: {exc}", exc_info=True)
    detail_msg = str(exc) if settings.ENVIRONMENT == "development" else "Internal server error"
    return JSONResponse(status_code=500, content={"detail": detail_msg})

# Routers
app.include_router(auth_router, prefix="/api")
app.include_router(fleet_router, prefix="/api")
app.include_router(jobcards_router, prefix="/api")
app.include_router(branding_router, prefix="/api")
app.include_router(schedule_router, prefix="/api")
app.include_router(ml_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(reports_router, prefix="/api")

@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "service": "KMRL InductPlan API",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
    }

@app.on_event("startup")
async def startup_event():
    logger.info("🚇 KMRL InductPlan API starting up...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Supabase: {settings.SUPABASE_URL}")
