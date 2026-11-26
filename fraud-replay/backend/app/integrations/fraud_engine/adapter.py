from __future__ import annotations

from typing import Protocol

from app.fraud_detection.detector import FraudDetectionEngine
from app.fraud_detection.schemas import DetectionResult, DetectionSignal, TransactionRecord


class FraudDetection(Protocol):
    def analyze(
        self,
        transactions: list[TransactionRecord],
        *,
        additional_signals: list[DetectionSignal] | None = None,
    ) -> DetectionResult: ...


class FraudDetectionAdapter:
    """Stable boundary for replacing the built-in engine with an approved external engine."""

    def __init__(self, implementation: FraudDetection | None = None) -> None:
        self._implementation = implementation or FraudDetectionEngine()

    def analyze(
        self,
        transactions: list[TransactionRecord],
        *,
        additional_signals: list[DetectionSignal] | None = None,
    ) -> DetectionResult:
        return self._implementation.analyze(transactions, additional_signals=additional_signals)
