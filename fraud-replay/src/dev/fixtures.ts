import type { Dataset, Investigation, RiskLevel, Transfer } from "../api";
import type { Role, Session } from "../session";

export const devProfiles: Record<Role, Session> = {
  admin: { role: "admin", name: "Данияр Алтынов", email: "admin@example.test" },
  analyst: { role: "analyst", name: "Алекс Морган", email: "analyst@example.test" },
  viewer: { role: "viewer", name: "Айжан Садыкова", email: "viewer@example.test" },
};

// A fixed synthetic snapshot for local UI checks.
const volumes = [36, 44, 39, 53, 48, 40, 47, 61, 56, 45, 67, 57, 70, 64];
const signals = [2, 4, 3, 5, 4, 3, 5, 6, 7, 4, 8, 6, 10, 8];
const patterns = [
  { code: "chain", title: "Быстрая цепочка", description: "Перевод со счёта, на который недавно поступили средства." },
  { code: "splitting", title: "Дробление суммы", description: "Несколько близких по времени переводов одному получателю." },
  { code: "unusual_amount", title: "Нетипичная сумма", description: "Сумма заметно выше обычного объёма операций отправителя." },
  { code: "frequency", title: "Частые переводы", description: "Серия операций по одному маршруту за короткое время." },
];

const cases: Investigation[] = [];
const transactions: Transfer[] = [];
let nextId = 2000;
volumes.forEach((volume, day) => {
  const clusters = day % 4 === 2 ? 2 : 1;
  const flaggedCount = signals[day];
  const groups = Array.from({ length: clusters }, () => [] as Transfer[]);
  for (let index = 0; index < volume; index += 1) {
    const flagged = index < flaggedCount;
    const cluster = index % clusters;
    const scoreRange = (day + cluster) % 3 === 1 ? 23 : 53;
    const riskScore = flagged ? 47 + ((day * 13 + index * 7) % scoreRange) : 9 + ((day + index * 5) % 33);
    const riskLevel: RiskLevel = riskScore >= 70 ? "high" : flagged ? "medium" : "low";
    const startAccount = 1100 + day * 30 + cluster * 6 + Math.floor(index / clusters);
    const source = flagged ? startAccount : 3400 + index * 9 + day;
    const destination = flagged ? startAccount + 1 : 6200 + ((index * 13 + day) % 360);
    const timestamp = new Date(Date.UTC(2026, 10, day + 8, 3, 5) + index * 11 * 60_000).toISOString();
    const transfer: Transfer = {
      transaction_id: `TX-${nextId++}`, timestamp,
      sender: `ACC-${source}`, receiver: `ACC-${destination}`,
      amount_tiyn: (flagged ? 181_000 + (day * 4437 + index * 53_900) % 714_000 : 9_000 + (index * 977 + day * 538) % 95_000) * 100,
      risk_score: riskScore,
      risk_level: riskLevel,
      reasons: [],
    };
    transactions.push(transfer);
    if (flagged) groups[cluster].push(transfer);
  }
  groups.forEach((group, cluster) => {
    if (!group.length) return;
    const pattern = patterns[(day + cluster) % patterns.length];
    const ids = group.map((transaction) => transaction.transaction_id);
    const highest = group.reduce((max, transaction) => transaction.risk_score > max.risk_score ? transaction : max);
    group.forEach((transaction, index) => {
      transaction.reasons = [{
        ...pattern, points: transaction.risk_score,
        related_transactions: ids.slice(Math.max(0, index - 1), index + 2).filter((id) => id !== transaction.transaction_id),
      }];
    });
    cases.push({
      case_id: `FR-${String(cases.length + 1).padStart(3, "0")}`,
      risk_score: highest.risk_score,
      risk_level: highest.risk_level,
      reasons: [pattern.title],
      suspicious_transactions: ids,
      transaction_ids: ids,
    });
  });
});

export const devDataset: Dataset = { dataset_id: "dev-fixture", source: "Тестовый набор", transactions, cases };

export function devCsv() {
  return [
    "transaction_id,timestamp,sender,receiver,amount",
    ...transactions.map((item) => [
      item.transaction_id, item.timestamp, item.sender, item.receiver, (item.amount_tiyn / 100).toFixed(2),
    ].join(",")),
  ].join("\n");
}
