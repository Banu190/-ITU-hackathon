from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class TransactionRecord:
    internal_id: uuid.UUID
    external_id: str
    timestamp: datetime
    sender: str
    receiver: str
    amount_minor: int
    currency: str


@dataclass(frozen=True, slots=True)
class DetectionSignal:
    rule_code: str
    rule_name: str
    description: str
    evidence: dict[str, Any]
    related_transaction_ids: tuple[str, ...]
    score_contribution: int
    algorithm_version: str
    primary_transaction_id: str | None = None


@dataclass(frozen=True, slots=True)
class DetectedCase:
    transaction_ids: tuple[str, ...]
    signals: tuple[DetectionSignal, ...]
    risk_score: int
    risk_level: str
    title: str
    summary: str


@dataclass(slots=True)
class DetectionResult:
    cases: list[DetectedCase] = field(default_factory=list)
    signals: list[DetectionSignal] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
