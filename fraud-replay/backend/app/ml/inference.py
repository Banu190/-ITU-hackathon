from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import joblib

from app.fraud_detection.schemas import DetectionSignal, TransactionRecord
from app.ml.features import FEATURE_COLUMNS, build_features

ML_RULE_VERSION = "isolation-forest-1.0.0"


def load_trusted_artifact(
    artifact_path: str,
    expected_sha256: str,
    trusted_directory: Path,
) -> dict[str, Any]:
    trusted_root = trusted_directory.resolve()
    path = Path(artifact_path).resolve()
    if trusted_root not in path.parents or not path.is_file():
        raise ValueError("Model artifact is outside the trusted model directory")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError("Model artifact checksum mismatch")
    artifact = joblib.load(path)
    if not isinstance(artifact, dict) or artifact.get("feature_columns") != FEATURE_COLUMNS:
        raise ValueError("Unsupported model artifact schema")
    return artifact


def infer_anomalies(
    transactions: list[TransactionRecord],
    artifact: dict[str, Any],
) -> list[DetectionSignal]:
    frame = build_features(transactions)
    model = artifact["model"]
    scores = -model.decision_function(frame)
    threshold = float(artifact["threshold"])
    signals: list[DetectionSignal] = []
    for external_id, score in zip(frame.index, scores, strict=True):
        if float(score) <= threshold:
            continue
        signals.append(
            DetectionSignal(
                "ml_anomaly",
                "ML Anomaly",
                "Isolation Forest отметил операцию как статистическую аномалию.",
                {
                    "anomaly_score": round(float(score), 8),
                    "threshold": round(threshold, 8),
                    "model_version": artifact["version"],
                },
                (str(external_id),),
                20,
                ML_RULE_VERSION,
                str(external_id),
            )
        )
    return signals
