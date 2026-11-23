from __future__ import annotations

from collections import Counter

import networkx as nx

from app.fraud_detection.risk_scoring import risk_score
from app.fraud_detection.rules import run_rules
from app.fraud_detection.schemas import (
    DetectedCase,
    DetectionResult,
    DetectionSignal,
    TransactionRecord,
)

ENGINE_VERSION = "fraud-replay-1.0.0"


class FraudDetectionEngine:
    def analyze(
        self,
        transactions: list[TransactionRecord],
        *,
        additional_signals: list[DetectionSignal] | None = None,
    ) -> DetectionResult:
        signals = [*run_rules(transactions), *(additional_signals or [])]
        graph = nx.Graph()
        for signal in signals:
            identifiers = list(signal.related_transaction_ids)
            graph.add_nodes_from(identifiers)
            if len(identifiers) > 1:
                graph.add_edges_from(zip(identifiers, identifiers[1:], strict=False))
        order = {tx.external_id: (tx.timestamp, tx.external_id) for tx in transactions}
        cases: list[DetectedCase] = []
        components = sorted(
            nx.connected_components(graph),
            key=lambda identifiers: min(order[identifier] for identifier in identifiers),
        )
        for identifiers in components:
            case_signals = tuple(
                signal
                for signal in signals
                if identifiers.intersection(signal.related_transaction_ids)
            )
            score, level = risk_score(case_signals)
            rule_counts = Counter(signal.rule_name for signal in case_signals)
            title = rule_counts.most_common(1)[0][0]
            ordered_ids = tuple(sorted(identifiers, key=order.__getitem__))
            summary = (
                f"Обнаружено {len(case_signals)} объяснимых сигналов риска "
                f"в {len(ordered_ids)} связанных транзакциях."
            )
            cases.append(DetectedCase(ordered_ids, case_signals, score, level, title, summary))
        return DetectionResult(
            cases=cases,
            signals=signals,
            metrics={
                "total_transactions": len(transactions),
                "suspicious_transactions": len(graph.nodes),
                "signals_count": len(signals),
                "cases_count": len(cases),
                "engine_version": ENGINE_VERSION,
            },
        )
