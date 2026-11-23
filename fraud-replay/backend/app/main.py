from __future__ import annotations

import logging
import re
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.api_router import api_router
from app.api.v1.schemas import HealthResponse
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging, request_id_context
from app.data_access.db.session import close_database, database_ready

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Application started", extra={"event": "application.started"})
    try:
        yield
    finally:
        await close_database()
        logger.info("Application stopped", extra={"event": "application.stopped"})


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Banking fraud investigation, replay and explainable risk analysis API.",
    docs_url=settings.docs_url,
    redoc_url="/redoc" if settings.docs_url else None,
    openapi_url="/openapi.json" if settings.docs_url else None,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Content-Disposition"],
    max_age=600,
)
app.include_router(api_router)


def error_payload(code: str, detail: str, context: dict | None = None) -> dict:
    return {
        "code": code,
        "detail": detail,
        "request_id": request_id_context.get(),
        "context": context or {},
    }


@app.middleware("http")
async def request_context(request: Request, call_next):
    supplied = request.headers.get("X-Request-ID", "")
    request_id = supplied if REQUEST_ID_PATTERN.fullmatch(supplied) else str(uuid.uuid4())
    token = request_id_context.set(request_id)
    started = time.perf_counter()
    try:
        content_length = request.headers.get("content-length")
        maximum = settings.max_upload_size_mb * 1024 * 1024 + 1024 * 1024
        if content_length and int(content_length) > maximum:
            return JSONResponse(
                status_code=413,
                content=error_payload("payload_too_large", "Request payload is too large"),
                headers={"X-Request-ID": request_id},
            )
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.app_env == "production":
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'"
            )
            if request.url.scheme == "https":
                response.headers["Strict-Transport-Security"] = (
                    "max-age=31536000; includeSubDomains"
                )
        return response
    finally:
        duration_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "%s %s",
            request.method,
            request.url.path,
            extra={"event": "http.request", "duration_ms": duration_ms},
        )
        request_id_context.reset(token)


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(exc.code, exc.detail, exc.context),
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {"location": list(error["loc"]), "message": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=error_payload(
            "request_validation_error", "Request validation failed", {"errors": errors}
        ),
    )


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(_: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database operation failed", exc_info=exc, extra={"event": "database.error"})
    return JSONResponse(
        status_code=503,
        content=error_payload("database_unavailable", "A database operation failed"),
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "Unhandled application error", exc_info=exc, extra={"event": "application.error"}
    )
    return JSONResponse(
        status_code=500,
        content=error_payload("internal_error", "An internal server error occurred"),
    )


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/ready", response_model=HealthResponse, tags=["System"])
async def ready() -> JSONResponse | HealthResponse:
    if await database_ready():
        return HealthResponse(status="ok", database="ok")
    return JSONResponse(
        status_code=503,
        content=HealthResponse(status="not_ready", database="unavailable").model_dump(),
    )
