from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.fraud_detection import FraudDetectionEngine, graph_analyzer, rules
from app.fraud_detection.schemas import TransactionRecord


def test_shared_patterns_are_used_without_duplicate_scoring(monkeypatch):
    calls = {"chain": 0, "velocity": 0}
    original_chain = graph_analyzer.find_chains
    original_velocity = rules.find_velocity_hits

    def chain(*args, **kwargs):
        calls["chain"] += 1
        return original_chain(*args, **kwargs)

    def velocity(*args, **kwargs):
        calls["velocity"] += 1
        return original_velocity(*args, **kwargs)

    monkeypatch.setattr(graph_analyzer, "find_chains", chain)
    monkeypatch.setattr(rules, "find_velocity_hits", velocity)
    start = datetime(2026, 11, 17, tzinfo=UTC)
    records = [
        TransactionRecord(uuid4(), f"T{i}", start + timedelta(minutes=i * 2),
                          a, b, amount, "KZT")
        for i, (a, b, amount) in enumerate([
            ("A", "B", 100_000), ("B", "C", 90_000), ("C", "D", 80_000),
        ])
    ]
    records += [
        TransactionRecord(uuid4(), f"V{i}", start + timedelta(hours=1, minutes=i),
                          "X", f"Y{i % 3}", 10_000, "KZT")
        for i in range(4)
    ]
    result = FraudDetectionEngine().analyze(records)
    assert calls == {"chain": 1, "velocity": 1}
    chain_case = next(case for case in result.cases if "T0" in case.transaction_ids)
    velocity_case = next(case for case in result.cases if "V0" in case.transaction_ids)
    assert chain_case.risk_score == 50
    assert velocity_case.risk_score == 60
    assert {s.rule_code for s in velocity_case.signals} == {"transaction_burst", "fan_out"}
