import { request } from "./api";
import type { Dataset, Investigation, Transfer } from "./api";

type DatasetSummary = { dataset_id: string; source: string };
type Page<T> = { items: T[]; total: number; limit: number; offset: number };

async function getAll<T>(path: string, query: URLSearchParams, signal: AbortSignal) {
  const items: T[] = [];
  while (true) {
    query.set("offset", String(items.length));
    const page = await request<Page<T>>(`${path}?${query}`, { signal });
    items.push(...page.items);
    if (!page.items.length || items.length >= page.total) return items;
  }
}

export async function loadDataset(summary: DatasetSummary, signal: AbortSignal): Promise<Dataset> {
  const id = encodeURIComponent(summary.dataset_id);
  const [transactions, cases] = await Promise.all([
    getAll<Transfer>(`/datasets/${id}/transactions`, new URLSearchParams({ limit: "500" }), signal),
    getAll<Investigation>("/investigations", new URLSearchParams({ dataset_id: summary.dataset_id, limit: "200" }), signal),
  ]);
  return { ...summary, transactions, cases };
}

export async function loadLatestDataset(signal: AbortSignal): Promise<Dataset> {
  const { items } = await request<Page<DatasetSummary>>("/datasets?limit=1", { signal });
  return items.length ? loadDataset(items[0], signal)
    : { dataset_id: null, source: "Наборы ещё не загружены", transactions: [], cases: [] };
}

function pause(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 1500);
    function abort() {
      window.clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function uploadAndAnalyze(file: File, signal: AbortSignal, onQueued: () => void) {
  const body = new FormData();
  body.append("file", file);
  body.append("currency", "KZT");
  const summary = await request<DatasetSummary>("/datasets/upload", { method: "POST", body, signal });
  const { job_id } = await request<{ job_id: string }>(`/datasets/${encodeURIComponent(summary.dataset_id)}/analyze`, { method: "POST", signal });
  onQueued();
  while (true) {
    const job = await request<{ status: "queued" | "running" | "completed" | "retry" | "failed"; error_message?: string }>(
      `/jobs/${encodeURIComponent(job_id)}`, { signal },
    );
    if (job.status === "completed") return loadDataset(summary, signal);
    if (job.status === "failed") throw new Error(job.error_message || "Анализ завершился ошибкой.");
    await pause(signal);
  }
}
