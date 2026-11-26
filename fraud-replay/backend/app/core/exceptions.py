from __future__ import annotations

from typing import Any


class AppError(Exception):
    def __init__(
        self,
        detail: str,
        *,
        status_code: int = 400,
        code: str = "application_error",
        headers: dict[str, str] | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.code = code
        self.headers = headers
        self.context = context or {}


class NotFoundError(AppError):
    def __init__(self, detail: str = "Resource not found") -> None:
        super().__init__(detail, status_code=404, code="not_found")


class ConflictError(AppError):
    def __init__(self, detail: str) -> None:
        super().__init__(detail, status_code=409, code="conflict")


class AuthorizationError(AppError):
    def __init__(self, detail: str = "Insufficient permissions") -> None:
        super().__init__(detail, status_code=403, code="forbidden")


class AuthenticationError(AppError):
    def __init__(self, detail: str = "Invalid or expired credentials") -> None:
        super().__init__(
            detail,
            status_code=401,
            code="unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )


class ValidationError(AppError):
    def __init__(self, detail: str, *, context: dict[str, Any] | None = None) -> None:
        super().__init__(detail, status_code=422, code="validation_error", context=context)
