from app.routers.auth import router as auth_router
from app.routers.fleet import router as fleet_router
from app.routers.jobcards import router as jobcards_router
from app.routers.branding import router as branding_router
from app.routers.schedule import router as schedule_router
from app.routers.ml import router as ml_router
from app.routers.audit import router as audit_router
from app.routers.reports import router as reports_router

__all__ = [
    "auth_router",
    "fleet_router",
    "jobcards_router",
    "branding_router",
    "schedule_router",
    "ml_router",
    "audit_router",
    "reports_router"
]
