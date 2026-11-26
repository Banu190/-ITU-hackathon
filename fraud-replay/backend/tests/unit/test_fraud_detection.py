from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.fraud_detection import FraudDetectionEngine
from app.fraud_detection.schemas import TransactionRecord

START = datetime(2026, 11, 24, tzinfo=UTC)


def tx(
    external_id: str,
    minute: int,
    sender: str,
    receiver: str,
    amount: int,
) -> TransactionRecord:
    return TransactionRecord(
        uuid4(), external_id, START + timedelta(minutes=minute), sender, receiver, amount, "KZT"
    )


def suspicious_transactions() -> list[TransactionRecord]:
    history = [tx(f"H-{index}", index * 60, "A", "B", 100_000) for index in range(5)]
    large_chain = [
        tx("BIG", 301, "A", "X", 60_000_000),
        tx("CHAIN-2", 305, "X", "Y", 50_000_000),
        tx("CHAIN-3", 309, "Y", "Z", 40_000_000),
    ]
    burst = [tx(f"BURST-{index}", 400 + index, "Q", f"R{index}", 10_000) for index in range(4)]
    return [*history, *large_chain, *burst]


def test_all_required_rule_families_are_explainable() -> None:
    result = FraudDetectionEngine().analyze(suspicious_transactions())
    codes = {signal.rule_code for signal in result.signals}
    assert {
        "large_transaction",
        "transaction_burst",
        "fan_out",
        "transfer_chain",
        "new_beneficiary",
        "unusual_activity",
    }.issubset(codes)
    assert all(signal.evidence for signal in result.signals)
    assert all(0 <= case.risk_score <= 100 for case in result.cases)


def test_detection_is_deterministic_for_input_order() -> None:
    transactions = suspicious_transactions()
    first = FraudDetectionEngine().analyze(transactions)
    second = FraudDetectionEngine().analyze(list(reversed(transactions)))
    assert first.metrics == second.metrics
    assert [case.transaction_ids for case in first.cases] == [
        case.transaction_ids for case in second.cases
    ]


def test_normal_small_history_has_no_case() -> None:
    result = FraudDetectionEngine().analyze([tx("N-1", 0, "A", "B", 1_000)])
    assert result.cases == []
