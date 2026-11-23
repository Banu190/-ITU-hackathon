from fastapi import APIRouter

from app.api.v1 import admin, analytics, auth, datasets, investigations

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(datasets.router)
api_router.include_router(investigations.router)
api_router.include_router(analytics.router)
