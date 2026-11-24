export type RiskLevel = "low" | "medium" | "high";
export const riskLabels: Record<RiskLevel, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };

export type Transfer = {
  transaction_id: string;
  timestamp: string;
  sender: string;
  receiver: string;
  amount_tiyn: number;
  risk_score: number;
  risk_level: RiskLevel;
  reasons: {
    code: string;
    title: string;
    description: string;
    points: number;
    related_transactions: string[];
  }[];
};

export type Investigation = {
  case_id: string;
  risk_score: number;
  risk_level: RiskLevel;
  suspicious_transactions: string[];
  transaction_ids: string[];
  reasons: string[];
};

export type Dataset = {
  dataset_id: number;
  source: string;
  transactions: Transfer[];
  cases: Investigation[];
};

export type Simulation = {
  blocked_transaction_id: string;
  affected_transaction_ids: string[];
  affected_turnover_tiyn: number;
};

export class RequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...options });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new Error("Не удалось подключиться к серверу Fraud Replay.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const fallback = response.status >= 500
      ? "Сервер Fraud Replay недоступен. Проверьте запуск backend."
      : `Запрос завершился ошибкой (${response.status}).`;
    throw new RequestError(typeof body?.detail === "string" ? body.detail : fallback, response.status);
  }
  return response.json();
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Произошла ошибка. Повторите запрос.";
}

export function caseEndpoint(dataset: Dataset, investigation: Investigation) {
  return `/api/datasets/${dataset.dataset_id}/cases/${investigation.case_id}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCaseReport(dataset: Dataset, investigation: Investigation) {
  const response = await fetch(`${caseEndpoint(dataset, investigation)}/report.pdf`, { credentials: "same-origin" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new RequestError(typeof body?.detail === "string" ? body.detail : "Не удалось подготовить PDF.", response.status);
  }
  downloadBlob(await response.blob(), `fraud-replay-${dataset.dataset_id}-${investigation.case_id}.pdf`);
}

const amountFormat = new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("ru-KZ", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Etc/GMT-5",
});

export const formatAmount = (tiyn: number) => `${amountFormat.format(tiyn / 100)} ₸`;
export const formatDate = (timestamp: string) => dateFormat.format(new Date(timestamp));
