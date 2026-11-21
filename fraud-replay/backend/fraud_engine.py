from collections import defaultdict
from datetime import timedelta
from statistics import median

from .models import Analysis, Investigation, Reason, RiskLevel, ScoredTransfer, Simulation, Transfer


FREQUENCY_WINDOW = timedelta(minutes=10)
CHAIN_WINDOW = timedelta(minutes=15)
RULES = {
    "new_recipient": ("Новый получатель", "Первая операция по этой паре счетов в загруженном наборе.", 15),
    "unusual_amount": ("Нетипичная сумма", "Сумма от 100 000 ₸, минимум втрое выше медианы 3–10 предыдущих исходящих операций.", 35),
    "frequency": ("Частые переводы", "Три исходящих перевода с одного счёта за 10 минут.", 25),
    "chain": ("Быстрая цепочка", "Исходящий перевод с промежуточного счёта в течение 15 минут, на сумму не больше входящей.", 50),
    "splitting": ("Дробление суммы", "За 10 минут на один счёт ушли не менее трёх переводов меньше 100 000 ₸ каждый, всего от 200 000 ₸.", 40),
}


def risk_level(score: int) -> RiskLevel:
    if score >= 70:
        return "high"
    if score >= 45:
        return "medium"
    return "low"


def analyze(transfers: list[Transfer], source: str) -> Analysis:
    ordered = sorted(transfers, key=lambda transfer: (transfer.timestamp, transfer.transaction_id))
    outgoing: dict[str, list[int]] = defaultdict(list)
    incoming: dict[str, list[int]] = defaultdict(list)
    splits: dict[tuple[str, str], list[int]] = defaultdict(list)
    known_pairs = set()
    evidence: list[dict[str, set[int]]] = [defaultdict(set) for _ in ordered]
    previous_transfers: dict[int, int] = {}

    def flag(rule: str, group: list[int]) -> None:
        # Connect successive evidence items to avoid storing every pair in a busy window.
        for position, index in enumerate(group):
            neighbors = group[max(0, position - 1):position] + group[position + 1:position + 2]
            evidence[index][rule].update(neighbors)

    for index, transfer in enumerate(ordered):
        pair = (transfer.sender, transfer.receiver)
        if pair not in known_pairs:
            flag("new_recipient", [index])
            known_pairs.add(pair)

        history = outgoing[transfer.sender]
        baseline = history[-10:]
        if len(baseline) >= 3 and transfer.amount_tiyn >= 10_000_000:
            if transfer.amount_tiyn >= 3 * median(ordered[i].amount_tiyn for i in baseline):
                evidence[index]["unusual_amount"].update(baseline)
        if len(history) >= 2 and transfer.timestamp - ordered[history[-2]].timestamp <= FREQUENCY_WINDOW:
            flag("frequency", [*history[-2:], index])
        history.append(index)

        for previous in reversed(incoming[transfer.sender]):
            deposit = ordered[previous]
            delay = transfer.timestamp - deposit.timestamp
            if delay > CHAIN_WINDOW:
                break
            if delay > timedelta(0) and deposit.amount_tiyn >= transfer.amount_tiyn:
                previous_transfers[index] = previous
                flag("chain", [previous, index])
                break
        incoming[transfer.receiver].append(index)

        if transfer.amount_tiyn < 10_000_000:
            window = splits[pair]
            start = transfer.timestamp - FREQUENCY_WINDOW
            window[:] = [i for i in window if ordered[i].timestamp >= start]
            window.append(index)
            if len(window) >= 3 and sum(ordered[i].amount_tiyn for i in window) >= 20_000_000:
                flag("splitting", window)

    transactions = []
    for index, transfer in enumerate(ordered):
        reasons = [
            Reason(
                code=rule, title=title, description=description, points=points,
                related_transactions=[ordered[i].transaction_id for i in sorted(evidence[index][rule])],
            )
            for rule, (title, description, points) in RULES.items()
            if rule in evidence[index]
        ]
        score = min(100, sum(reason.points for reason in reasons))
        transactions.append(ScoredTransfer(
            **transfer.model_dump(), risk_score=score, risk_level=risk_level(score), reasons=reasons,
            previous_transfer_id=ordered[previous_transfers[index]].transaction_id if index in previous_transfers else None,
        ))
    return Analysis(source=source, transactions=transactions, cases=build_cases(transactions))


def build_cases(transactions: list[ScoredTransfer]) -> list[Investigation]:
    by_id = {transfer.transaction_id: transfer for transfer in transactions}
    links: dict[str, set[str]] = defaultdict(set)
    for transfer in transactions:
        for reason in transfer.reasons:
            for related in reason.related_transactions:
                links[transfer.transaction_id].add(related)
                links[related].add(transfer.transaction_id)

    groups = []
    visited = set()
    for transfer in transactions:
        if transfer.risk_level == "low" or transfer.transaction_id in visited:
            continue
        pending = [transfer.transaction_id]
        connected = {transfer.transaction_id}
        while pending:
            for neighbor in links[pending.pop()] - connected:
                connected.add(neighbor)
                pending.append(neighbor)
        visited.update(connected)
        group = sorted((by_id[tx_id] for tx_id in connected), key=lambda tx: (tx.timestamp, tx.transaction_id))
        groups.append(group)

    groups.sort(key=lambda group: -max(transfer.risk_score for transfer in group))
    cases = []
    for number, group in enumerate(groups, 1):
        score = max(transfer.risk_score for transfer in group)
        suspicious = [transfer for transfer in group if transfer.risk_level != "low"]
        reasons = {reason.code for transfer in suspicious for reason in transfer.reasons}
        cases.append(Investigation(
            case_id=f"FR-{number:03}", risk_score=score, risk_level=risk_level(score),
            transaction_ids=[transfer.transaction_id for transfer in group],
            suspicious_transactions=[transfer.transaction_id for transfer in suspicious],
            reasons=[title for code, (title, _, _) in RULES.items() if code in reasons],
        ))
    return cases


def simulate(transactions: list[ScoredTransfer], blocked_id: str) -> Simulation:
    affected = set()
    affected_ids = []
    turnover = 0
    for transfer in transactions:
        if transfer.transaction_id == blocked_id or transfer.previous_transfer_id in affected:
            affected.add(transfer.transaction_id)
            affected_ids.append(transfer.transaction_id)
            turnover += transfer.amount_tiyn
    return Simulation(
        blocked_transaction_id=blocked_id,
        affected_transaction_ids=affected_ids,
        affected_turnover_tiyn=turnover,
    )
