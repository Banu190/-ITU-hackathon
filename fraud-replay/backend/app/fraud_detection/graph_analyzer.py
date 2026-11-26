from __future__ import annotations

import networkx as nx

from fraud_engine.graph_analyzer import find_chains

from app.fraud_detection.schemas import TransactionRecord


def build_graph(transactions: list[TransactionRecord]) -> nx.MultiDiGraph:
    graph = nx.MultiDiGraph()
    for tx in transactions:
        graph.add_edge(
            tx.sender,
            tx.receiver,
            key=tx.external_id,
            transaction=tx,
            amount_minor=tx.amount_minor,
            timestamp=tx.timestamp,
        )
    return graph


def to_engine_rows(transactions: list[TransactionRecord]) -> list[dict]:
    return [
        {
            "transaction_id": tx.external_id,
            "timestamp": tx.timestamp.isoformat(),
            "sender": tx.sender,
            "receiver": tx.receiver,
            "amount": tx.amount_minor,
        }
        for tx in sorted(transactions, key=lambda item: (item.timestamp, item.external_id))
    ]


def find_transfer_chains(
    transactions: list[TransactionRecord],
    *,
    min_length: int = 3,
    max_depth: int = 6,
    step_window_minutes: int = 15,
    max_paths: int = 1_000,
) -> list[tuple[TransactionRecord, ...]]:
    if not 2 <= min_length <= max_depth <= 12:
        raise ValueError("Invalid chain depth")
    records = {tx.external_id: tx for tx in transactions}
    paths = find_chains(
        to_engine_rows(transactions),
        min_length=min_length,
        max_depth=max_depth,
        window_minutes=step_window_minutes,
        max_paths=max_paths,
    )
    return [tuple(records[external_id] for external_id in path) for path in paths]
