import type { Simulation, Transfer } from "../api";

/**
 * Локальная What-if симуляция.
 * Условно блокирует выбранный перевод и все последующие
 * операции, связанные через previous_transfer_id.
 *
 * Не выполняет реальные банковские операции.
 */
export function simulateBlockedTransfer(
  transactions: Transfer[],
  blockedId: string
): Simulation {
  const exists = transactions.some(
    (transfer) => transfer.transaction_id === blockedId
  );

  if (!exists) {
    throw new Error("Выбранный перевод не найден.");
  }


  const affected = new Set<string>([blockedId]);
  const affectedIds: string[] = [];
  let turnover = 0;

  // Ищем всю цепочку независимо от порядка переводов.
  let changed = true;

  while (changed) {
    changed = false;

    for (const transfer of transactions) {
      if (affected.has(transfer.transaction_id)) {
        continue;
      }

      const previousId = transfer.previous_transfer_id;

      if (previousId && affected.has(previousId)) {
        affected.add(transfer.transaction_id);
        changed = true;
      }
    }
  }

  // Сохраняем исходный порядок операций.
  for (const transfer of transactions) {
    if (affected.has(transfer.transaction_id)) {
      affectedIds.push(transfer.transaction_id);
      turnover += transfer.amount_tiyn;
    }
  }

  return {
    blocked_transaction_id: blockedId,
    affected_transaction_ids: affectedIds,
    affected_turnover_tiyn: turnover,
  };
}

