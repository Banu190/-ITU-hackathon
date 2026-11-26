import { clearAccessToken, getAccessToken } from "./accessToken";

const configuredUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "") ?? "";
const apiBase = configuredUrl.endsWith("/api/v1") ? configuredUrl : `${configuredUrl}/api/v1`;

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
  previous_transfer_id?: string | null;
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
  dataset_id: string | null;
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

async function apiFetch(path: string, options?: RequestInit, token = getAccessToken()?.value ?? null) {
  const headers = new Headers(options?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, headers });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new Error("Не удалось подключиться к серверу Fraud Replay.");
  }
  if (!response.ok) {
    if (response.status === 401 && token) clearAccessToken(token);
    const body = await response.json().catch(() => null);
    const fallback = response.status >= 500
      ? "Сервер Fraud Replay недоступен. Проверьте запуск backend."
      : `Запрос завершился ошибкой (${response.status}).`;
    throw new RequestError(typeof body?.detail === "string" ? body.detail : fallback, response.status);
  }
  return response;
}

export async function request<T>(path: string, options?: RequestInit, token?: string | null): Promise<T> {
  const response = await apiFetch(path, options, token);
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Произошла ошибка. Повторите запрос.";
}

export function caseEndpoint(investigation: Investigation) {
  return `/investigations/${encodeURIComponent(investigation.case_id)}`;
}

export function simulateBlock(investigation: Investigation, transfer: Transfer) {
  return request<Simulation>(`${caseEndpoint(investigation)}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocked_transaction_id: transfer.transaction_id }),
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCaseReport(investigation: Investigation) {
  const response = await apiFetch(`${caseEndpoint(investigation)}/report/pdf`);
  downloadBlob(await response.blob(), `fraud-replay-${investigation.case_id}.pdf`);
}

const amountFormat = new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("ru-KZ", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Etc/GMT-5",
});

export const formatAmount = (tiyn: number) => `${amountFormat.format(tiyn / 100)} ₸`;
export const formatDate = (timestamp: string) => dateFormat.format(new Date(timestamp));
