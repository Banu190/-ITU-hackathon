import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { errorMessage, formatAmount, formatDate } from "./api";
import type { Dataset, Investigation, Simulation, Transfer } from "./api";
import { linkTo } from "./navigation";
import TransferGraph from "./TransferGraph";
import { RiskBadge, TransferDetails, TransfersTable } from "./TransactionsPage";

export type CasePage = "investigation" | "graph" | "replay";

function Replay({ transactions, simulate, showWhatIf = false }: {
  transactions: Transfer[];
  simulate?: (transfer: Transfer) => Promise<Simulation>;
  showWhatIf?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timeline = useRef<HTMLOListElement>(null);
  const selected = transactions[step - 1];
  const affected = new Set(simulation?.affected_transaction_ids);
  const last = transactions.length;

  useEffect(() => {
    if (!playing || step >= last) return;
    const timer = window.setTimeout(() => {
      setStep(step + 1);
      if (step + 1 === last) setPlaying(false);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [playing, step, last]);

  useEffect(() => {
    const list = timeline.current;
    if (!list) return;
    if (step === 0) {
      list.scrollTop = 0;
      return;
    }
    const event = list.children[step - 1]?.getBoundingClientRect();
    if (!event) return;
    const bounds = list.getBoundingClientRect();
    if (event.top < bounds.top) list.scrollTop += event.top - bounds.top;
    if (event.bottom > bounds.bottom) list.scrollTop += event.bottom - bounds.bottom;
  }, [step]);

  function jump(next: number) {
    setPlaying(false);
    setStep(next);
  }

  function select(id: string) {
    const index = transactions.findIndex((tx) => tx.transaction_id === id);
    if (index !== -1) jump(index + 1);
  }

  async function runSimulation(transfer: Transfer) {
    if (!simulate) return;
    setPlaying(false);
    setBusy(true);
    setError("");
    try {
      setSimulation(await simulate(transfer));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace replay-workspace">
      <section className="panel replay-graph">
        <div className="section-header">
          <div><h2>Хронология переводов</h2><p>Шаг {step} из {last} · UTC+05:00</p></div>
        </div>
        <TransferGraph transactions={transactions} visibleCount={step} selectedId={selected?.transaction_id}
          affected={affected} onSelect={select} />
        <div className="toolbar replay-controls">
          <button className="button" disabled={!last} onClick={() => {
            if (playing) setPlaying(false);
            else {
              if (step === last) setStep(0);
              setPlaying(true);
            }
          }}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Пауза" : "Старт"}</button>
          <button className="button secondary" aria-label="Предыдущий шаг" disabled={step === 0} onClick={() => jump(step - 1)}><SkipBack size={15} /></button>
          <button className="button secondary" aria-label="Следующий шаг" disabled={step === last} onClick={() => jump(step + 1)}><SkipForward size={15} /></button>
          <button className="button secondary" aria-label="Сначала" disabled={!step} onClick={() => jump(0)}><RotateCcw size={15} /></button>
          <input type="range" min={0} max={last} value={step} aria-label="Шаг воспроизведения"
            onChange={(event) => jump(Number(event.target.value))} />
        </div>
        <ol ref={timeline} className="timeline" aria-label="События расследования">
          {transactions.map((tx, index) => {
            const active = step === index + 1;
            return (
              <li key={tx.transaction_id}>
                <button onClick={() => jump(index + 1)} aria-current={active ? "step" : undefined}>
                  <span>{formatDate(tx.timestamp)}</span><strong>{tx.transaction_id}</strong>
                  <span>{tx.sender} → {tx.receiver}</span><span>{formatAmount(tx.amount_tiyn)}</span>
                  {affected.has(tx.transaction_id) && <small className="affected">
                    {simulation?.blocked_transaction_id === tx.transaction_id ? "Условно остановлен" : "Затронут"}
                  </small>}
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <div className="side-panels">
        <section className="panel" aria-label="Событие">
          {selected ? <TransferDetails transfer={selected} onSelect={select} />
            : <><h2>Детали события</h2><p className="muted">Запустите Replay или выберите перевод на шкале.</p></>}
        </section>
        {showWhatIf && simulate && <section className="panel">
          <h2>What-if</h2>
          <p className="muted">Проверьте, какие последующие переводы в цепочке затронет условная остановка выбранной операции.</p>
          <button className="button" disabled={!selected || busy} onClick={() => selected && void runSimulation(selected)}>
            {busy ? "Считаем…" : "Смоделировать остановку"}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
          {simulation && <div className="simulation" aria-live="polite">
            <p><strong>{simulation.blocked_transaction_id}</strong> условно остановлен.</p>
            <p>Затронуто последующих операций: <strong>{simulation.affected_transaction_ids.length - 1}</strong></p>
            <p>Оборот затронутых переводов: <strong>{formatAmount(simulation.affected_turnover_tiyn)}</strong></p>
            <p className="muted">Модель следует найденным связям по сумме и времени. Оборот включает звенья одной цепочки.</p>
            <button className="text-button" disabled={busy} onClick={() => { setSimulation(null); setError(""); }}>Сбросить симуляцию</button>
          </div>}
        </section>}
      </div>
    </div>
  );
}

export default function InvestigationPage({ dataset, investigation, page, readOnly, downloadReport, reportFormat = "PDF", simulate }: {
  dataset: Dataset;
  investigation: Investigation;
  page: CasePage;
  readOnly: boolean;
  downloadReport: (investigation: Investigation) => Promise<void>;
  reportFormat?: "PDF" | "CSV";
  simulate?: (investigation: Investigation, transfer: Transfer) => Promise<Simulation>;
}) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(investigation.suspicious_transactions[0] ?? investigation.transaction_ids[0]);
  const ids = new Set(investigation.transaction_ids);
  const transactions = dataset.transactions.filter((tx) => ids.has(tx.transaction_id));
  const selected = transactions.find((tx) => tx.transaction_id === selectedId);

  async function exportReport() {
    setReportBusy(true);
    setReportError("");
    try {
      await downloadReport(investigation);
    } catch (failure) {
      setReportError(errorMessage(failure));
    } finally {
      setReportBusy(false);
    }
  }

  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");

  return (
    <>
      <section className="panel case-overview">
        <div className="section-header">
          <div><h2>{investigation.case_id}</h2><p>{investigation.reasons.join(" · ")}</p></div>
          <RiskBadge level={investigation.risk_level} score={investigation.risk_score} />
        </div>
        <div className="toolbar case-toolbar">
          <label>Расследование
            <select value={investigation.case_id} onChange={(event) => void navigate(linkTo(page, event.target.value))}>
              {dataset.cases.map((item) => <option key={item.case_id} value={item.case_id}>{item.case_id} · {item.risk_score}/100</option>)}
            </select>
          </label>
          {!readOnly && <div className="case-tabs">
            <Link className="button secondary" to={linkTo("investigation", investigation.case_id)} aria-current={page === "investigation" ? "page" : undefined}>Детали</Link>
            <Link className="button secondary" to={linkTo("graph", investigation.case_id)} aria-current={page === "graph" ? "page" : undefined}>Граф</Link>
            <Link className="button secondary" to={linkTo("replay", investigation.case_id)} aria-current={page === "replay" ? "page" : undefined}>Replay</Link>
          </div>}
          {!readOnly && <button className="button case-report" disabled={reportBusy} onClick={() => void exportReport()}>
            <Download size={15} />{reportBusy ? "Готовим отчёт…" : `Скачать ${reportFormat}`}
          </button>}
        </div>
        {reportError && <p className="error" role="alert">{reportError}</p>}
      </section>

      {page === "replay" ? <Replay transactions={transactions} simulate={simulate && ((transfer) => simulate(investigation, transfer))} /> : (
        <div className={`workspace ${page === "graph" ? "graph-workspace" : ""}`}>
          <section className="panel">
            {page === "graph" ? <>
              <h2>Связи между счетами</h2>
              <p className="muted">Выберите счёт или стрелку, чтобы увидеть перевод.</p>
              <TransferGraph transactions={transactions} selectedId={selectedId} onSelect={setSelectedId} />
            </> : <>
              <h2>Операции расследования</h2>
              <p className="muted">Для проверки: {investigation.suspicious_transactions.length} · Всего связанных: {transactions.length}</p>
            </>}
            <TransfersTable transactions={transactions} selectedId={selectedId} onSelect={setSelectedId} />
          </section>
          {selected && <section className="panel" aria-label="Детали перевода">
            <TransferDetails transfer={selected} onSelect={setSelectedId} />
          </section>}
        </div>
      )}
    </>
  );
}
