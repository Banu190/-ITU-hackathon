import { useEffect, useState, useSyncExternalStore } from "react";
import { ApiUnavailableError, errorMessage, request } from "./api";
import type { Dataset } from "./api";
import Dashboard from "./Dashboard";
import InvestigationPage, { CaseList } from "./InvestigationPage";
import type { CasePage } from "./InvestigationPage";
import TransactionsPage from "./TransactionsPage";
import "./App.css";

const navigation = {
  dashboard: { label: "Обзор", icon: "▦" },
  transactions: { label: "Транзакции", icon: "⇄", description: "Импорт и проверка переводов" },
  investigation: { label: "Расследования", icon: "◎", description: "Сигналы риска и связанные переводы" },
  graph: { label: "Граф переводов", icon: "⌘", description: "Маршруты переводов между счетами" },
  replay: { label: "Fraud Replay", icon: "▷", description: "Воспроизведение событий и симуляция остановки" },
};

type Page = keyof typeof navigation;
const apiEnabled = import.meta.env.VITE_API_ENABLED === "true";

async function loadDemo() {
  const { default: dataset } = await import("./demoDataset");
  return { dataset, offline: true };
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function currentHash() {
  return window.location.hash;
}

function linkTo(page: Page, caseId?: string) {
  if (page === "dashboard") return "#/";
  if (page === "transactions" || !caseId) return `#/${page}`;
  return `#/${page}/${caseId}`;
}

export default function App() {
  const hash = useSyncExternalStore(subscribe, currentHash);
  const [path, query] = hash.replace(/^#\/?/, "").split("?", 2);
  const [segment, caseId] = path.split("/");
  const page: Page = Object.hasOwn(navigation, segment) ? segment as Page : "dashboard";
  const [current, setCurrent] = useState<{ dataset: Dataset; offline: boolean } | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = apiEnabled
      ? request<Dataset>("/api/datasets/current", { signal: controller.signal })
        .then((dataset) => ({ dataset, offline: false }))
        .catch((error: unknown) => {
          if (controller.signal.aborted || !(error instanceof ApiUnavailableError)) throw error;
          return loadDemo();
        })
      : loadDemo();
    load
      .then((result) => { if (!controller.signal.aborted) setCurrent(result); })
      .catch((error) => { if (!controller.signal.aborted) setLoadingError(errorMessage(error)); });
    return () => controller.abort();
  }, [attempt]);

  const dataset = current?.dataset;
  const offline = current?.offline ?? false;
  const item = dataset?.cases.find((entry) => entry.case_id === caseId);
  const investigation = caseId ? item : dataset?.cases[0];
  const selectedCaseId = item?.case_id;
  const params = new URLSearchParams(query);
  const initialTransfer = params.get("tx") ?? "";
  const showTransfers = params.get("view") === "transfers";

  function retry() {
    setLoadingError("");
    setAttempt((value) => value + 1);
  }

  return (
    <div className={page === "dashboard" ? "app app-overview" : "app"}>
      <aside className="sidebar">
        <a className="logo" href="#/"><span aria-hidden="true">◈</span> Fraud Replay</a>
        <nav aria-label="Разделы">
          {(Object.entries(navigation) as [Page, typeof navigation[Page]][]).map(([key, entry]) => (
            <a href={linkTo(key, key === "investigation" ? undefined : selectedCaseId)} key={key}
              aria-current={key === page ? "page" : undefined}>
              <span aria-hidden="true">{entry.icon}</span>{entry.label}
            </a>
          ))}
        </nav>
      </aside>

      <main className={page === "dashboard" ? "main dashboard-main" : "main"}>
        <header className="topbar">
          {page === "dashboard" ? (
            <>
              <div>
                <h1>Обзор расследований</h1>
                {dataset && <p>Активный набор · {dataset.source}</p>}
              </div>
              <a className="button" href={linkTo("transactions")}>
                <span aria-hidden="true">↑</span> Загрузить CSV
              </a>
            </>
          ) : (
            <>
              <div><h1>{navigation[page].label}</h1><p>{navigation[page].description}</p></div>
              <span className="mode"><i aria-hidden="true" />Демо</span>
            </>
          )}
        </header>

        {offline && (
          <div className="offline-notice">
            <p role="status"><strong>Демонстрационные данные.</strong> Для импорта CSV, симуляции и PDF нужен сервер.</p>
            {apiEnabled && <button type="button" className="button secondary" onClick={retry}>Подключиться</button>}
          </div>
        )}

        {!dataset ? (
          <section className="panel" aria-live="polite">
            {loadingError ? <><p className="error">{loadingError}</p>
              <button className="button" onClick={retry}>Повторить</button>
            </> : <p className="muted">Загружаем транзакции…</p>}
          </section>
        ) : page === "dashboard" ? <Dashboard key={dataset.dataset_id} dataset={dataset} />
          : page === "transactions" ? (
            <TransactionsPage key={initialTransfer} dataset={dataset}
              onDataset={(next) => setCurrent({ dataset: next, offline: false })}
              initialId={initialTransfer} showTransfers={showTransfers} offline={offline} />
          )
          : investigation && (page !== "investigation" || caseId) ? (
            <InvestigationPage key={`${dataset.dataset_id}-${investigation.case_id}-${page}`}
              dataset={dataset} investigation={investigation} page={page as CasePage} offline={offline} />
          ) : (
            <section className="panel">
              <h2>{caseId ? "Расследование не найдено в активном наборе" : "Список расследований"}</h2>
              <CaseList cases={dataset.cases} />
            </section>
          )}
      </main>
    </div>
  );
}
