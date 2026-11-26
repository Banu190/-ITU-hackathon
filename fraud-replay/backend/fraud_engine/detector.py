"""Публичный интерфейс анализа и сборки кейсов."""
from collections import defaultdict
from datetime import datetime
from statistics import median

import networkx as nx

from .graph_analyzer import find_chains
from .risk_scoring import REASONS, score_rules
from .schemas import normalize, read_csv

DEMO_LARGE_THRESHOLD = 500_000
MIN_HISTORY = 5
HISTORY_MULTIPLIER = 5


def analyze_csv(path: str) -> dict:
    return analyze_transactions(read_csv(path))


def find_velocity_hits(txs):
    """Return burst and fan-out hits from sorted, validated records."""
    hits = []
    senders = defaultdict(list)
    for tx in txs:
        senders[tx["sender"]].append(tx)
    for outgoing in senders.values():
        for rule, seconds, count in (("burst", 300, 4), ("fanout", 600, 3)):
            left = 0
            for right, tx in enumerate(outgoing):
                while (datetime.fromisoformat(tx["timestamp"]) - datetime.fromisoformat(outgoing[left]["timestamp"])).total_seconds() > seconds:
                    left += 1
                window = outgoing[left:right+1]
                size = len(window) if rule == "burst" else len({t["receiver"] for t in window})
                if size >= count:
                    hits.append(({t["transaction_id"] for t in window}, rule, REASONS[rule]))
    return hits


def analyze_transactions(transactions: list[dict]) -> dict:
    txs = normalize(transactions)
    by_id = {t["transaction_id"]: t for t in txs}
    hits = []
    history = defaultdict(list)
    groups = defaultdict(list)
    # Одновременные операции не используют друг друга как историю.
    for tx in txs:
        groups[tx["timestamp"]].append(tx)
    for batch in groups.values():
        for tx in batch:
            past = history[tx["sender"]]
            fallback = len(past) < MIN_HISTORY
            threshold = DEMO_LARGE_THRESHOLD if fallback else HISTORY_MULTIPLIER * median(past)
            if tx["amount"] >= threshold:
                reason = (f"Крупный перевод: применён демонстрационный порог {DEMO_LARGE_THRESHOLD} (история менее {MIN_HISTORY} операций)" if fallback else REASONS["large"])
                hits.append(({tx["transaction_id"]}, "large", reason))
        for tx in batch:
            history[tx["sender"]].append(tx["amount"])
    hits.extend(find_velocity_hits(txs))
    for chain in find_chains(txs):
        hits.append((set(chain), "chain", REASONS["chain"]))
    links = nx.Graph()
    for ids, _, _ in hits:
        ordered = sorted(ids)
        links.add_nodes_from(ordered)
        links.add_edges_from((ordered[0], other) for other in ordered[1:])
    components = sorted(nx.connected_components(links), key=lambda ids: min((by_id[i]["timestamp"], i) for i in ids))
    cases = []
    for index, ids in enumerate(components, 1):
        relevant = [(rule, reason) for members, rule, reason in hits if members & ids]
        score, level = score_rules(rule for rule, _ in relevant)
        timeline = [t.copy() for t in txs if t["transaction_id"] in ids]
        cases.append({
            "case_id": f"FR-{index:03d}", "risk_score": score, "risk_level": level,
            "reasons": sorted({reason for _, reason in relevant}),
            "transaction_ids": [t["transaction_id"] for t in timeline], "timeline": timeline,
            "graph": {"nodes": [{"id": account} for account in sorted({t[k] for t in timeline for k in ("sender", "receiver")})],
                      "edges": [{"id": t["transaction_id"], "source": t["sender"], "target": t["receiver"], "amount": t["amount"]} for t in timeline]},
        })
    return {"cases": cases, "summary": {"total_transactions": len(txs), "suspicious_transactions": links.number_of_nodes(), "cases_count": len(cases)}}
