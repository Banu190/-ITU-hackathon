export type RiskLevel = "low" | "medium" | "high";

export type Transfer = {
  transaction_id: string;
  timestamp: string;
  sender: string;
  receiver: string;
  amount_tiyn: number;
  risk_score?: number | null;
  risk_level?: RiskLevel | null;
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

export class ApiUnavailableError extends Error {}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new ApiUnavailableError("Не удалось подключиться к серверу Fraud Replay.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const fallback = response.status >= 500
      ? "Сервер Fraud Replay недоступен."
      : `Запрос завершился ошибкой (${response.status}).`;
    const message = typeof body?.detail === "string" ? body.detail : fallback;
    if (response.status >= 500) throw new ApiUnavailableError(message);
    throw new Error(message);
  }
  return response.json();
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Произошла ошибка. Повторите запрос.";
}

export function caseEndpoint(dataset: Dataset, investigation: Investigation) {
  return `/api/datasets/${dataset.dataset_id}/cases/${investigation.case_id}`;
}

const amountFormat = new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("ru-KZ", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Etc/GMT-5",
});

export const formatAmount = (tiyn: number) => `${amountFormat.format(tiyn / 100)} ₸`;
export const formatDate = (timestamp: string) => dateFormat.format(new Date(timestamp));
