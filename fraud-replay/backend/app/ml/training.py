from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from app.fraud_detection.schemas import TransactionRecord
from app.ml.features import FEATURE_COLUMNS, build_features


@dataclass(frozen=True, slots=True)
class TrainingResult:
    version: str
    artifact_path: Path
    artifact_sha256: str
    feature_schema: dict[str, Any]
    metrics: dict[str, Any]
    trained_at: datetime


def train_isolation_forest(
    transactions: list[TransactionRecord],
    model_directory: Path,
    *,
    contamination: float = 0.05,
    random_state: int = 42,
) -> TrainingResult:
    if len(transactions) < 50:
        raise ValueError("At least 50 transactions are required for ML training")
    frame = build_features(transactions)
    split_index = max(40, int(len(frame) * 0.8))
    training = frame.iloc[:split_index]
    validation = frame.iloc[split_index:]
    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=random_state,
        n_jobs=1,
    )
    model.fit(training)
    validation_scores = -model.decision_function(validation) if len(validation) else np.array([])
    threshold = (
        float(np.quantile(validation_scores, 1 - contamination)) if len(validation_scores) else 0.0
    )
    data_digest = hashlib.sha256("|".join(frame.index.astype(str)).encode("utf-8")).hexdigest()[:12]
    trained_at = datetime.now(UTC)
    version = f"iforest-{trained_at:%Y%m%d%H%M%S}-{data_digest}"
    artifact = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "version": version,
        "threshold": threshold,
        "trained_at": trained_at.isoformat(),
        "random_state": random_state,
    }
    model_directory.mkdir(parents=True, exist_ok=True)
    path = (model_directory / f"{version}.joblib").resolve()
    if model_directory.resolve() not in path.parents:
        raise ValueError("Invalid model artifact path")
    joblib.dump(artifact, path, compress=3)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    metrics = {
        "training_rows": len(training),
        "validation_rows": len(validation),
        "contamination": contamination,
        "validation_score_mean": float(validation_scores.mean())
        if len(validation_scores)
        else None,
        "validation_score_std": float(validation_scores.std()) if len(validation_scores) else None,
        "threshold": threshold,
        "limitations": (
            "Unsupervised validation metrics are descriptive and do not measure fraud accuracy."
        ),
    }
    return TrainingResult(
        version,
        path,
        digest,
        {"columns": FEATURE_COLUMNS, "point_in_time": True},
        metrics,
        trained_at,
    )
