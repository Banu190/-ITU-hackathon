from __future__ import annotations

from collections.abc import Iterable

from app.fraud_detection.schemas import DetectionSignal


def risk_score(signals: Iterable[DetectionSignal]) -> tuple[int, str]:
    strongest_by_rule: dict[str, int] = {}
    for signal in signals:
        strongest_by_rule[signal.rule_code] = max(
            strongest_by_rule.get(signal.rule_code, 0), signal.score_contribution
        )
    score = min(100, sum(strongest_by_rule.values()))
    level = "high" if score >= 70 else "medium" if score >= 35 else "low"
    return score, level
