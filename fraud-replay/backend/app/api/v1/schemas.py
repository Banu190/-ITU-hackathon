from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.data_access.db.models import (
    AnalysisStatus,
    DatasetStatus,
    InvestigationStatus,
    JobStatus,
    JobType,
    RiskLevel,
    Role,
)


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    organization_slug: str | None = Field(default=None, min_length=2, max_length=80)


class TokenResponse(ApiModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_at: datetime


class OrganizationSummary(ApiModel):
    id: uuid.UUID
    name: str
    slug: str


class UserProfile(ApiModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str
    role: Role
    organization: OrganizationSummary


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=2, max_length=80)


class UserCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=12, max_length=256)
    role: Role


class UserSummary(ApiModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str
    is_active: bool
    role: Role
    created_at: datetime


class DatasetSummary(ApiModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    source: str
    source_name: str
    checksum: str
    currency: str
    status: DatasetStatus
    row_count: int
    created_at: datetime


class DatasetUploadResponse(DatasetSummary):
    duplicate: bool


class DatasetPage(ApiModel):
    items: list[DatasetSummary]
    total: int
    limit: int
    offset: int


class RiskReason(ApiModel):
    code: str
    title: str
    description: str
    points: int
    related_transactions: list[str]
    evidence: dict[str, Any] = Field(default_factory=dict)


class TransactionOut(ApiModel):
    transaction_id: str
    timestamp: datetime
    sender: str
    receiver: str
    amount_tiyn: int
    currency: str
    risk_score: int = 0
    risk_level: RiskLevel = RiskLevel.LOW
    reasons: list[RiskReason] = Field(default_factory=list)


class PaginatedTransactions(ApiModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int


class AnalysisRunOut(ApiModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    status: AnalysisStatus
    engine_version: str
    detection_method: str
    metrics: dict[str, Any]
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class AnalysisQueued(ApiModel):
    analysis: AnalysisRunOut
    job_id: uuid.UUID
    duplicate: bool


class InvestigationSummary(ApiModel):
    case_id: str
    dataset_id: uuid.UUID
    title: str
    status: InvestigationStatus
    risk_score: int
    risk_level: RiskLevel
    suspicious_transactions: list[str] = Field(default_factory=list)
    transaction_ids: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class InvestigationDetail(InvestigationSummary):
    summary: str
    transactions: list[TransactionOut]
    signals: list[RiskReason]


class InvestigationPage(ApiModel):
    items: list[InvestigationSummary]
    total: int
    limit: int
    offset: int


class InvestigationUpdate(BaseModel):
    status: InvestigationStatus | None = None
    comment: str | None = Field(default=None, min_length=1, max_length=4000)

    @field_validator("comment")
    @classmethod
    def strip_comment(cls, value: str | None) -> str | None:
        return value.strip() if value else value


class InvestigationEventOut(ApiModel):
    id: uuid.UUID
    event_type: str
    from_status: str | None
    to_status: str | None
    comment: str | None
    created_at: datetime


class GraphNode(ApiModel):
    id: str
    label: str
    node_type: Literal["account"] = "account"
    risk_score: int


class GraphEdge(ApiModel):
    id: str
    source: str
    target: str
    transaction_id: str
    timestamp: datetime
    amount_tiyn: int
    currency: str
    risk_score: int


class GraphResponse(ApiModel):
    case_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class ReplayEvent(ApiModel):
    event_id: str
    case_id: str
    transaction_id: str
    timestamp: datetime
    sender: str
    receiver: str
    amount_tiyn: int
    currency: str
    risk_score: int
    risk_signals: list[str]
    explanation: str
    graph_source: str
    graph_target: str


class ReplayResponse(ApiModel):
    case_id: str
    events: list[ReplayEvent]


class SimulationRequest(BaseModel):
    blocked_transaction_id: str = Field(min_length=1, max_length=128)
    horizon_hours: int = Field(default=24, ge=1, le=24 * 30)


class SimulationResponse(ApiModel):
    blocked_transaction_id: str
    affected_transaction_ids: list[str]
    affected_accounts: list[str]
    affected_turnover_tiyn: int
    graph_change: dict[str, Any]
    explanation: str


class JobOut(ApiModel):
    id: uuid.UUID
    job_type: JobType
    status: JobStatus
    progress: int
    attempts: int
    max_attempts: int
    result_data: dict[str, Any]
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class AuditEventOut(ApiModel):
    id: uuid.UUID
    action: str
    resource_type: str
    resource_id: str | None
    request_id: str | None
    details: dict[str, Any]
    created_at: datetime


class AnalyticsOverview(ApiModel):
    total_transactions: int
    total_datasets: int
    total_investigations: int
    suspicious_transactions: int
    high_risk_cases: int
    medium_risk_cases: int
    low_risk_cases: int
    total_transaction_volume_tiyn: int
    suspicious_transaction_volume_tiyn: int
    risk_distribution: dict[str, int]
    detection_rule_statistics: dict[str, int]
    timeline_statistics: list[dict[str, Any]]
    processing_performance: dict[str, Any]


class HealthResponse(ApiModel):
    status: Literal["ok", "not_ready"]
    database: Literal["ok", "unavailable"] | None = None


class ErrorResponse(ApiModel):
    code: str
    detail: str
    request_id: str
    context: dict[str, Any] = Field(default_factory=dict)
