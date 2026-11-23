from __future__ import annotations

from collections import defaultdict, deque
from datetime import timedelta
from statistics import median

import networkx as nx
import pandas as pd

from app.fraud_detection.schemas import TransactionRecord

FEATURE_COLUMNS = [
    "amount_tiyn",
    "relative_amount_deviation",
    "transaction_velocity_5m",
    "unique_receivers_24h",
    "historical_frequency",
    "time_since_previous_seconds",
    "fan_out_10m",
    "historical_chain_depth",
    "sender_out_degree",
    "receiver_in_degree",
]


def build_features(transactions: list[TransactionRecord]) -> pd.DataFrame:
    ordered = sorted(transactions, key=lambda tx: (tx.timestamp, tx.external_id))
    sender_history: dict[str, list[TransactionRecord]] = defaultdict(list)
    recent_5m: dict[str, deque[TransactionRecord]] = defaultdict(deque)
    recent_10m: dict[str, deque[TransactionRecord]] = defaultdict(deque)
    recent_24h: dict[str, deque[TransactionRecord]] = defaultdict(deque)
    account_depth: dict[str, int] = defaultdict(int)
    history_graph = nx.DiGraph()
    rows: list[dict[str, float | int | str]] = []
    batches: dict[object, list[TransactionRecord]] = defaultdict(list)
    for tx in ordered:
        batches[tx.timestamp].append(tx)

    for timestamp in sorted(batches):
        batch = batches[timestamp]
        for tx in batch:
            five = recent_5m[tx.sender]
            ten = recent_10m[tx.sender]
            day = recent_24h[tx.sender]
            while five and tx.timestamp - five[0].timestamp > timedelta(minutes=5):
                five.popleft()
            while ten and tx.timestamp - ten[0].timestamp > timedelta(minutes=10):
                ten.popleft()
            while day and tx.timestamp - day[0].timestamp > timedelta(hours=24):
                day.popleft()
            history = sender_history[tx.sender]
            baseline = (
                median([item.amount_minor for item in history]) if history else tx.amount_minor
            )
            relative_deviation = abs(tx.amount_minor - baseline) / max(float(baseline), 1.0)
            previous_timestamp = history[-1].timestamp if history else None
            elapsed = (
                (tx.timestamp - previous_timestamp).total_seconds()
                if previous_timestamp is not None
                else 86_400.0
            )
            rows.append(
                {
                    "transaction_id": tx.external_id,
                    "amount_tiyn": tx.amount_minor,
                    "relative_amount_deviation": relative_deviation,
                    "transaction_velocity_5m": len(five),
                    "unique_receivers_24h": len({item.receiver for item in day}),
                    "historical_frequency": len(history),
                    "time_since_previous_seconds": min(max(elapsed, 0.0), 31_536_000.0),
                    "fan_out_10m": len({item.receiver for item in ten}),
                    "historical_chain_depth": account_depth[tx.sender],
                    "sender_out_degree": (
                        int(history_graph.out_degree[tx.sender])
                        if history_graph.has_node(tx.sender)
                        else 0
                    ),
                    "receiver_in_degree": (
                        int(history_graph.in_degree[tx.receiver])
                        if history_graph.has_node(tx.receiver)
                        else 0
                    ),
                }
            )
        for tx in batch:
            sender_history[tx.sender].append(tx)
            recent_5m[tx.sender].append(tx)
            recent_10m[tx.sender].append(tx)
            recent_24h[tx.sender].append(tx)
            account_depth[tx.receiver] = max(
                account_depth[tx.receiver], account_depth[tx.sender] + 1
            )
            history_graph.add_edge(tx.sender, tx.receiver)

    return pd.DataFrame(rows).set_index("transaction_id")[FEATURE_COLUMNS]
