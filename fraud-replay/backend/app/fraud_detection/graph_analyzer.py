from __future__ import annotations

from datetime import timedelta

import networkx as nx

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
    graph = build_graph(transactions)
    window = timedelta(minutes=step_window_minutes)
    paths: set[tuple[str, ...]] = set()
    records = {tx.external_id: tx for tx in transactions}

    def visit(path: tuple[TransactionRecord, ...], accounts: frozenset[str]) -> None:
        if len(paths) >= max_paths:
            return
        previous = path[-1]
        candidates: list[TransactionRecord] = []
        if len(path) < max_depth:
            for _, receiver, _key, data in graph.out_edges(previous.receiver, keys=True, data=True):
                candidate: TransactionRecord = data["transaction"]
                elapsed = candidate.timestamp - previous.timestamp
                amount_ratio = candidate.amount_minor / previous.amount_minor
                if (
                    receiver not in accounts
                    and timedelta(0) < elapsed <= window
                    and 0.70 <= amount_ratio <= 1.0
                ):
                    candidates.append(candidate)
        candidates.sort(key=lambda tx: (tx.timestamp, tx.external_id))
        if not candidates and len(path) >= min_length:
            paths.add(tuple(tx.external_id for tx in path))
            return
        for candidate in candidates:
            visit(path + (candidate,), accounts | {candidate.receiver})

    for tx in transactions:
        if tx.sender != tx.receiver:
            visit((tx,), frozenset({tx.sender, tx.receiver}))

    maximal = [
        path
        for path in sorted(paths)
        if not any(
            len(other) > len(path)
            and any(other[index : index + len(path)] == path for index in range(len(other)))
            for other in paths
        )
    ]
    return [tuple(records[external_id] for external_id in path) for path in maximal]
