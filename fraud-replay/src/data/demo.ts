export type Risk = "High" | "Medium" | "Low";

type Transaction = {
  id: string;
  sender: string;
  recipient: string;
  time: string;
  amount: number;
};

export type Investigation = {
  id: string;
  title: string;
  day: number;
  risk: Risk;
  score: number;
  reasons: string[];
  transactions: Transaction[];
};

export const risks: Risk[] = ["High", "Medium", "Low"];
export const riskLabels: Record<Risk, string> = {
  High: "Высокий риск",
  Medium: "Средний риск",
  Low: "Низкий риск",
};

export const investigations: Investigation[] = [
  {
    id: "FR-1048", title: "Быстрая цепочка переводов", day: 21, risk: "High", score: 92,
    reasons: ["Деньги прошли через три счёта за 12 минут.", "Один из получателей впервые появился в истории переводов."],
    transactions: [
      { id: "TX-2041", sender: "ACC-1024", recipient: "ACC-2081", time: "09:12", amount: 850000 },
      { id: "TX-2042", sender: "ACC-2081", recipient: "ACC-3092", time: "09:18", amount: 420000 },
      { id: "TX-2043", sender: "ACC-3092", recipient: "ACC-4015", time: "09:24", amount: 310000 },
    ],
  },
  {
    id: "FR-1047", title: "Дробление суммы", day: 20, risk: "High", score: 84,
    reasons: ["Три перевода одному получателю за девять минут.", "Суммы операций близки друг к другу."],
    transactions: [
      { id: "TX-2044", sender: "ACC-6110", recipient: "ACC-6180", time: "13:04", amount: 74000 },
      { id: "TX-2045", sender: "ACC-6110", recipient: "ACC-6180", time: "13:08", amount: 72000 },
      { id: "TX-2046", sender: "ACC-6110", recipient: "ACC-6180", time: "13:13", amount: 76500 },
    ],
  },
  {
    id: "FR-1046", title: "Нетипичная сумма", day: 19, risk: "Medium", score: 66,
    reasons: ["Сумма заметно выше обычного диапазона операций по счёту."],
    transactions: [
      { id: "TX-2051", sender: "ACC-2603", recipient: "ACC-9401", time: "10:16", amount: 285000 },
      { id: "TX-2052", sender: "ACC-2603", recipient: "ACC-4102", time: "10:43", amount: 22000 },
    ],
  },
  {
    id: "FR-1045", title: "Новый получатель", day: 18, risk: "Low", score: 28,
    reasons: ["Перевод сделан на счёт, с которым отправитель раньше не взаимодействовал."],
    transactions: [{ id: "TX-2063", sender: "ACC-3251", recipient: "ACC-7150", time: "16:25", amount: 48000 }],
  },
  {
    id: "FR-1044", title: "Частые исходящие переводы", day: 17, risk: "Medium", score: 58,
    reasons: ["Несколько исходящих переводов с одного счёта за короткий промежуток времени."],
    transactions: [
      { id: "TX-2070", sender: "ACC-2204", recipient: "ACC-1712", time: "11:29", amount: 39000 },
      { id: "TX-2071", sender: "ACC-2204", recipient: "ACC-2702", time: "11:33", amount: 115000 },
      { id: "TX-2072", sender: "ACC-2204", recipient: "ACC-3052", time: "11:38", amount: 61000 },
    ],
  },
  {
    id: "FR-1043", title: "Перевод вне обычного времени", day: 16, risk: "Low", score: 19,
    reasons: ["Операция проведена позднее обычного для истории этого счёта."],
    transactions: [{ id: "TX-2084", sender: "ACC-1109", recipient: "ACC-4152", time: "23:52", amount: 34000 }],
  },
];

export const activity = [58, 73, 62, 88, 74, 92, 71, 94, 79, 110, 87, 135, 106, 119]
  .map((total, index) => ({
    day: index + 8,
    total,
    flagged: [2, 1, 3, 2, 1, 3, 2, 3, 2, 4, 2, 5, 3, 4][index],
  }));

export const totalTransactions = activity.reduce((total, item) => total + item.total, 0);
export const flaggedTransactions = activity.reduce((total, item) => total + item.flagged, 0);
export const formatNumber = new Intl.NumberFormat("ru-RU").format;
export const formatAmount = (amount: number) => `${formatNumber(amount)} ₸`;
