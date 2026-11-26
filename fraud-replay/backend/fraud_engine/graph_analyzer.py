"""Поиск направленных временных цепочек в MultiDiGraph."""
from datetime import datetime
from decimal import Decimal

import networkx as nx


def build_graph(transactions):
    graph = nx.MultiDiGraph()
    for tx in transactions:
        graph.add_edge(tx["sender"], tx["receiver"], key=tx["transaction_id"], **tx)
    return graph


def find_chains(transactions, max_depth=6, min_length=3, window_minutes=15, *, max_paths=None):
    """Возвращает максимальные обнаруженные пути; глубина измеряется в переводах.

    Строго возрастающее время, без повторного посещения счета; окно на каждый шаг.
    Вход — проверенные normalize() транзакции.
    """
    if not 1 <= min_length <= max_depth <= 12 or window_minutes <= 0:
        raise ValueError("Требуется 1 <= min_length <= max_depth <= 12 и положительное окно")
    if max_paths is not None and max_paths < 1:
        raise ValueError("max_paths must be positive")
    graph = build_graph(transactions)
    paths = set()

    def visit(path, visited):
        if max_paths is not None and len(paths) >= max_paths:
            return
        previous = path[-1]
        candidates = []
        if len(path) < max_depth:
            for _, target, _, nxt in graph.out_edges(previous["receiver"], keys=True, data=True):
                delta = (datetime.fromisoformat(nxt["timestamp"]) - datetime.fromisoformat(previous["timestamp"])).total_seconds()
                ratio = Decimal(str(nxt["amount"])) / Decimal(str(previous["amount"]))
                if target not in visited and 0 < delta <= window_minutes * 60 and Decimal("0.7") <= ratio <= 1:
                    candidates.append(nxt)
        for nxt in sorted(candidates, key=lambda t: (t["timestamp"], t["transaction_id"])):
            visit(path + [nxt], visited | {nxt["receiver"]})
        if not candidates and len(path) >= min_length:
            paths.add(tuple(t["transaction_id"] for t in path))

    for tx in transactions:
        if max_paths is not None and len(paths) >= max_paths:
            break
        if tx["sender"] != tx["receiver"]:
            visit([tx], {tx["sender"], tx["receiver"]})
    # Удаляем вложенные пути, оставляя отдельные ветви и пути с разными переводами.
    return [list(p) for p in sorted(paths) if not any(len(q) > len(p) and any(q[i:i+len(p)] == p for i in range(len(q)-len(p)+1)) for q in paths)]
