import { useEffect, useState, useSyncExternalStore } from "react";
import { errorMessage, request } from "./api";
import type { Dataset } from "./api";
import InvestigationPage, { CaseList } from "./InvestigationPage";
import type { CasePage } from "./InvestigationPage";
import TransactionsPage, { TransfersTable } from "./TransactionsPage";
import "./App.css";

const navigation = {
  dashboard: { label: "Обзор", icon: "▦", description: "Мониторинг демонстрационных транзакций" },
  transactions: { label: "Транзакции", icon: "⇄", description: "Импорт и проверка переводов" },
  investigation: { label: "Расследования", icon: "◎", description: "Сигналы риска и связанные переводы" },
  graph: { label: "Граф переводов", icon: "⌘", description: "Маршруты переводов между счетами" },
  replay: { label: "Fraud Replay", icon: "▷", description: "Воспроизведение событий и симуляция остановки" },
};

type Page = keyof typeof navigation;

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

function Dashboard({ dataset }: { dataset: Dataset }) {
  const suspicious = dataset.transactions.filter((tx) => tx.risk_level !== "low");
  const highRisk = suspicious.filter((tx) => tx.risk_level === "high");
  const stats = [
    { label: "Всего переводов", count: dataset.transactions.length },
    { label: "Требуют проверки", count: suspicious.length, tone: "stat-warn" },
    { label: "Высокий риск", count: highRisk.length, tone: "stat-high" },
    { label: "Расследования", count: dataset.cases.length },
  ];

  return (
    <>
      <section className="welcome">
        <div>
          <h2>Мониторинг банковских переводов</h2>
          <p>Активный набор · {dataset.source}</p>
        </div>
        <a className="button" href="#/transactions">Импорт CSV</a>
      </section>
      <section className="stats" aria-label="Сводка по набору">
        {stats.map(({ label, count, tone }) => (
          <div className="stat-card" key={label}>
            <p>{label}</p><strong className={tone}>{count.toLocaleString("ru-KZ")}</strong>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="section-header">
          <div><h2>Расследования</h2><p>Оценка риска помогает определить приоритет проверки.</p></div>
          <a className="button secondary" href="#/investigation">Все расследования</a>
        </div>
        <CaseList cases={dataset.cases.slice(0, 4)} />
      </section>
      <section className="panel">
        <div className="section-header">
          <h2>Последние операции для проверки</h2>
          <a className="button secondary" href="#/transactions">Все операции</a>
        </div>
        <TransfersTable transactions={suspicious.slice(-8).reverse()} onSelect={(id) => {
          window.location.hash = `#/transactions?${new URLSearchParams({ tx: id })}`;
        }} />
      </section>
    </>
  );
}

export default function App() {
  const hash = useSyncExternalStore(subscribe, currentHash);
  const [path, query] = hash.replace(/^#\/?/, "").split("?", 2);
  const [segment, caseId] = path.split("/");
  const page: Page = Object.hasOwn(navigation, segment) ? segment as Page : "dashboard";
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request<Dataset>("/api/datasets/current", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setDataset(result); })
      .catch((error) => { if (!controller.signal.aborted) setLoadingError(errorMessage(error)); });
    return () => controller.abort();
  }, [attempt]);

  const item = dataset?.cases.find((entry) => entry.case_id === caseId);
  const investigation = caseId ? item : dataset?.cases[0];
  const selectedCaseId = item?.case_id;
  const initialTransfer = new URLSearchParams(query).get("tx") ?? "";

  return (
    <div className="app">
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
        <div className="sidebar-bottom"><a href="/docs" target="_blank" rel="noreferrer">Документация API ↗</a></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><h1>{navigation[page].label}</h1><p>{navigation[page].description}</p></div>
          <span className="mode"><i aria-hidden="true" />Демо</span>
        </header>

        {!dataset ? (
          <section className="panel" aria-live="polite">
            {loadingError ? <><p className="error">{loadingError}</p>
              <button className="button" onClick={() => { setLoadingError(""); setAttempt(attempt + 1); }}>Повторить</button>
            </> : <p className="muted">Загружаем транзакции…</p>}
          </section>
        ) : page === "dashboard" ? <Dashboard dataset={dataset} />
          : page === "transactions" ? <TransactionsPage key={initialTransfer} dataset={dataset} onDataset={setDataset} initialId={initialTransfer} />
          : investigation && (page !== "investigation" || caseId) ? (
            <InvestigationPage key={`${dataset.dataset_id}-${investigation.case_id}-${page}`}
              dataset={dataset} investigation={investigation} page={page as CasePage} />
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
