from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import timedelta
from statistics import median

import numpy as np

from app.fraud_detection.graph_analyzer import find_transfer_chains
from app.fraud_detection.schemas import DetectionSignal, TransactionRecord

RULE_VERSION = "rules-1.0.0"


def _ordered_ids(transactions: Iterable[TransactionRecord]) -> tuple[str, ...]:
    return tuple(
        tx.external_id
        for tx in sorted(transactions, key=lambda item: (item.timestamp, item.external_id))
    )


def large_transactions(transactions: list[TransactionRecord]) -> list[DetectionSignal]:
    history: dict[str, list[int]] = defaultdict(list)
    amounts = np.asarray([tx.amount_minor for tx in transactions], dtype=np.int64)
    fallback = (
        max(50_000_000, int(np.quantile(amounts, 0.95))) if len(amounts) >= 20 else 50_000_000
    )
    signals: list[DetectionSignal] = []
    timestamp_batches: dict[object, list[TransactionRecord]] = defaultdict(list)
    for tx in transactions:
        timestamp_batches[tx.timestamp].append(tx)
    for timestamp in sorted(timestamp_batches):
        batch = timestamp_batches[timestamp]
        for tx in batch:
            previous = history[tx.sender]
            if len(previous) >= 5:
                baseline = int(median(previous))
                threshold = max(baseline * 5, baseline + 1)
                evidence = {
                    "baseline_median_tiyn": baseline,
                    "threshold_tiyn": threshold,
                    "history_size": len(previous),
                }
            else:
                threshold = fallback
                evidence = {"fallback_threshold_tiyn": threshold, "history_size": len(previous)}
            if tx.amount_minor >= threshold:
                signals.append(
                    DetectionSignal(
                        "large_transaction",
                        "Large Transaction",
                        "Перевод существенно превышает доступную историю отправителя.",
                        {**evidence, "amount_tiyn": tx.amount_minor},
                        (tx.external_id,),
                        35,
                        RULE_VERSION,
                        tx.external_id,
                    )
                )
        for tx in batch:
            history[tx.sender].append(tx.amount_minor)
    return signals


def transaction_bursts(transactions: list[TransactionRecord]) -> list[DetectionSignal]:
    grouped: dict[str, list[TransactionRecord]] = defaultdict(list)
    for tx in transactions:
        grouped[tx.sender].append(tx)
    signals: list[DetectionSignal] = []
    seen: set[tuple[str, ...]] = set()
    window = timedelta(minutes=5)
    for sender, outgoing in grouped.items():
        left = 0
        for right, tx in enumerate(outgoing):
            while tx.timestamp - outgoing[left].timestamp > window:
                left += 1
            current = outgoing[left : right + 1]
            if len(current) >= 4:
                ids = _ordered_ids(current)
                if ids not in seen:
                    seen.add(ids)
                    signals.append(
                        DetectionSignal(
                            "transaction_burst",
                            "Transaction Burst",
                            "Отправитель выполнил не менее четырёх переводов за пять минут.",
                            {"sender": sender, "count": len(current), "window_seconds": 300},
                            ids,
                            25,
                            RULE_VERSION,
                            tx.external_id,
                        )
                    )
    return signals


def fan_out(transactions: list[TransactionRecord]) -> list[DetectionSignal]:
    grouped: dict[str, list[TransactionRecord]] = defaultdict(list)
    for tx in transactions:
        grouped[tx.sender].append(tx)
    signals: list[DetectionSignal] = []
    seen: set[tuple[str, ...]] = set()
    window = timedelta(minutes=10)
    for sender, outgoing in grouped.items():
        left = 0
        for right, tx in enumerate(outgoing):
            while tx.timestamp - outgoing[left].timestamp > window:
                left += 1
            current = outgoing[left : right + 1]
            receivers = {item.receiver for item in current}
            if len(receivers) >= 3:
                ids = _ordered_ids(current)
                if ids not in seen:
                    seen.add(ids)
                    signals.append(
                        DetectionSignal(
                            "fan_out",
                            "Fan-Out",
                            (
                                "Средства распределены между несколькими получателями "
                                "за короткий период."
                            ),
                            {
                                "sender": sender,
                                "unique_receivers": len(receivers),
                                "window_seconds": 600,
                            },
                            ids,
                            35,
                            RULE_VERSION,
                            tx.external_id,
                        )
                    )
    return signals


def new_beneficiaries(transactions: list[TransactionRecord]) -> list[DetectionSignal]:
    history_count: dict[str, int] = defaultdict(int)
    known_receivers: dict[str, set[str]] = defaultdict(set)
    signals: list[DetectionSignal] = []
    timestamp_batches: dict[object, list[TransactionRecord]] = defaultdict(list)
    for tx in transactions:
        timestamp_batches[tx.timestamp].append(tx)
    for timestamp in sorted(timestamp_batches):
        batch = timestamp_batches[timestamp]
        for tx in batch:
            if history_count[tx.sender] >= 3 and tx.receiver not in known_receivers[tx.sender]:
                signals.append(
                    DetectionSignal(
                        "new_beneficiary",
                        "New Beneficiary",
                        "Получатель ранее не встречался в достаточной истории отправителя.",
                        {"sender_history_size": history_count[tx.sender], "receiver": tx.receiver},
                        (tx.external_id,),
                        15,
                        RULE_VERSION,
                        tx.external_id,
                    )
                )
        for tx in batch:
            history_count[tx.sender] += 1
            known_receivers[tx.sender].add(tx.receiver)
    return signals


def unusual_activity(transactions: list[TransactionRecord]) -> list[DetectionSignal]:
    histories: dict[str, list[TransactionRecord]] = defaultdict(list)
    signals: list[DetectionSignal] = []
    timestamp_batches: dict[object, list[TransactionRecord]] = defaultdict(list)
    for tx in transactions:
        timestamp_batches[tx.timestamp].append(tx)
    for timestamp in sorted(timestamp_batches):
        batch = timestamp_batches[timestamp]
        for tx in batch:
            previous = histories[tx.sender]
            if len(previous) < 5:
                continue
            previous_amounts = [item.amount_minor for item in previous]
            baseline = float(median(previous_amounts))
            deviations = [abs(amount - baseline) for amount in previous_amounts]
            mad = float(median(deviations))
            amount_threshold = baseline + 6 * max(mad, baseline * 0.05, 1)
            hours = [item.timestamp.hour for item in previous]
            unusual_hour = tx.timestamp.hour not in set(hours) and len(set(hours)) <= 4
            if tx.amount_minor > amount_threshold or unusual_hour:
                signals.append(
                    DetectionSignal(
                        "unusual_activity",
                        "Unusual Activity",
                        "Операция отличается от исторического профиля отправителя.",
                        {
                            "baseline_median_tiyn": int(baseline),
                            "amount_threshold_tiyn": int(amount_threshold),
                            "unusual_hour": unusual_hour,
                            "history_size": len(previous),
                        },
                        (tx.external_id,),
                        25,
                        RULE_VERSION,
                        tx.external_id,
                    )
                )
        for tx in batch:
            histories[tx.sender].append(tx)
    return signals


def transfer_chains(transactions: list[TransactionRecord]) -> list[DetectionSignal]:
    signals: list[DetectionSignal] = []
    for chain in find_transfer_chains(transactions):
        signals.append(
            DetectionSignal(
                "transfer_chain",
                "Transfer Chain",
                (
                    "Обнаружена быстрая последовательная передача сопоставимых сумм "
                    "через связанные счета."
                ),
                {"chain_length": len(chain), "step_window_seconds": 900},
                _ordered_ids(chain),
                50,
                RULE_VERSION,
                chain[-1].external_id,
            )
        )
    return signals


def run_rules(transactions: list[TransactionRecord]) -> list[DetectionSignal]:
    ordered = sorted(transactions, key=lambda tx: (tx.timestamp, tx.external_id))
    signals = [
        *large_transactions(ordered),
        *transaction_bursts(ordered),
        *fan_out(ordered),
        *transfer_chains(ordered),
        *new_beneficiaries(ordered),
        *unusual_activity(ordered),
    ]
    unique: dict[tuple[str, tuple[str, ...]], DetectionSignal] = {}
    for signal in signals:
        unique[(signal.rule_code, signal.related_transaction_ids)] = signal
    return sorted(
        unique.values(),
        key=lambda signal: (signal.related_transaction_ids, signal.rule_code),
    )
