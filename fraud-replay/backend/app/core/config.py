from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import quote_plus

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = Field(default="Fraud Replay", validation_alias="APP_NAME")
    app_env: Literal["development", "test", "production"] = Field(
        default="development", validation_alias="APP_ENV"
    )
    debug: bool = Field(default=False, validation_alias="DEBUG")
    host: str = Field(default="127.0.0.1", validation_alias="HOST")
    port: int = Field(default=8000, ge=1, le=65535, validation_alias="PORT")

    db_host: str = Field(default="localhost", validation_alias="DB_HOST")
    db_port: int = Field(default=5432, ge=1, le=65535, validation_alias="DB_PORT")
    db_name: str = Field(default="fraud_replay", validation_alias="DB_NAME")
    db_user: str = Field(default="postgres", validation_alias="DB_USER")
    db_password: SecretStr = Field(validation_alias="DB_PASSWORD")
    db_pool_size: int = Field(default=10, ge=1, le=100, validation_alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=20, ge=0, le=200, validation_alias="DB_MAX_OVERFLOW")
    db_connect_timeout_seconds: int = Field(
        default=10, ge=1, le=60, validation_alias="DB_CONNECT_TIMEOUT_SECONDS"
    )

    jwt_secret_key: SecretStr = Field(validation_alias="JWT_SECRET_KEY")
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = Field(
        default="HS256", validation_alias="JWT_ALGORITHM"
    )
    access_token_expire_minutes: int = Field(
        default=30, ge=5, le=1440, validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES"
    )

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173"], validation_alias="CORS_ORIGINS"
    )
    max_upload_size_mb: int = Field(default=10, ge=1, le=100, validation_alias="MAX_UPLOAD_SIZE_MB")
    max_transactions_per_upload: int = Field(
        default=10_000, ge=1, le=1_000_000, validation_alias="MAX_TRANSACTIONS_PER_UPLOAD"
    )
    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")
    model_dir: Path = Field(default=Path("var/models"), validation_alias="MODEL_DIR")
    worker_poll_seconds: float = Field(
        default=2.0, ge=0.1, le=60, validation_alias="WORKER_POLL_SECONDS"
    )
    job_timeout_minutes: int = Field(
        default=30, ge=1, le=1440, validation_alias="JOB_TIMEOUT_MINUTES"
    )
    data_retention_days: int = Field(default=365, ge=1, validation_alias="DATA_RETENTION_DAYS")

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "production", "prod"}:
                return False
            if normalized in {"debug", "development", "dev"}:
                return True
        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, origins: list[str]) -> list[str]:
        cleaned = [origin.rstrip("/") for origin in origins]
        if any(origin == "*" for origin in cleaned):
            raise ValueError("CORS_ORIGINS must list explicit origins")
        return cleaned

    @model_validator(mode="after")
    def validate_secrets(self) -> Settings:
        secret = self.jwt_secret_key.get_secret_value()
        if len(secret) < 32:
            raise ValueError("JWT_SECRET_KEY must contain at least 32 characters")
        if self.app_env == "production" and self.db_password.get_secret_value() == "admin":
            raise ValueError("The development database password is forbidden in production")
        return self

    @property
    def database_url(self) -> str:
        password = quote_plus(self.db_password.get_secret_value())
        user = quote_plus(self.db_user)
        return (
            f"postgresql+asyncpg://{user}:{password}@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def model_directory(self) -> Path:
        path = self.model_dir if self.model_dir.is_absolute() else BACKEND_DIR / self.model_dir
        return path.resolve()

    @property
    def docs_url(self) -> str | None:
        return "/docs" if self.app_env != "production" else None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
