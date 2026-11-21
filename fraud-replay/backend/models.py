from datetime import datetime
from typing import Literal

from pydantic import BaseModel


RiskLevel = Literal["low", "medium", "high"]


class Transfer(BaseModel):
    transaction_id: str
    timestamp: datetime
    sender: str
    receiver: str
    amount_tiyn: int


class Reason(BaseModel):
    code: str
    title: str
    description: str
    points: int
    related_transactions: list[str]


class ScoredTransfer(Transfer):
    risk_score: int
    risk_level: RiskLevel
    reasons: list[Reason]
    previous_transfer_id: str | None


class Investigation(BaseModel):
    case_id: str
    risk_score: int
    risk_level: RiskLevel
    suspicious_transactions: list[str]
    transaction_ids: list[str]
    reasons: list[str]


class Analysis(BaseModel):
    source: str
    transactions: list[ScoredTransfer]
    cases: list[Investigation]


class Dataset(Analysis):
    dataset_id: int


class Simulation(BaseModel):
    blocked_transaction_id: str
    affected_transaction_ids: list[str]
    affected_turnover_tiyn: int
