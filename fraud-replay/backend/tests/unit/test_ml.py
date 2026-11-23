from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.fraud_detection.schemas import TransactionRecord
from app.ml.features import FEATURE_COLUMNS, build_features
from app.ml.inference import infer_anomalies, load_trusted_artifact
from app.ml.training import train_isolation_forest


def records(count: int) -> list[TransactionRecord]:
    start = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        TransactionRecord(
            uuid4(),
            f"T-{index:03d}",
            start + timedelta(minutes=index),
            f"A-{index % 3}",
            f"B-{index % 5}",
            10_000 + index * 100,
            "KZT",
        )
        for index in range(count)
    ]


def test_feature_schema_and_point_in_time_behavior() -> None:
    base = records(10)
    before = build_features(base)
    after = build_features(records(12))
    assert list(before.columns) == FEATURE_COLUMNS
    assert before.loc["T-000"].to_dict() == after.loc["T-000"].to_dict()
    assert before.loc["T-009"].to_dict() == after.loc["T-009"].to_dict()


def test_training_registry_artifact_and_inference(tmp_path) -> None:
    training_records = records(60)
    result = train_isolation_forest(training_records, tmp_path)
    assert result.artifact_path.is_file()
    assert result.metrics["training_rows"] == 48
    artifact = load_trusted_artifact(str(result.artifact_path), result.artifact_sha256, tmp_path)
    signals = infer_anomalies(training_records, artifact)
    assert isinstance(signals, list)
    assert artifact["feature_columns"] == FEATURE_COLUMNS
