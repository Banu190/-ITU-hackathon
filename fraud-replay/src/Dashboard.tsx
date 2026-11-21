import { useState } from "react";
import type { Dataset } from "./api";
import TransferGraph from "./TransferGraph";
import { RiskBadge, TransfersTable } from "./TransactionsPage";

const transferLimit = 8;
const graphLimit = 6;

function openTransfer(id: string) {
  window.location.hash = `#/transactions?${new URLSearchParams({ tx: id })}`;
}

export default function Dashboard({ dataset }: { dataset: Dataset }) {
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const flaggedIds = new Set(dataset.cases.flatMap((item) => item.suspicious_transactions));
  const suspicious = dataset.transactions.filter((tx) =>
    tx.risk_level === "medium" || tx.risk_level === "high" || flaggedIds.has(tx.transaction_id));
  const highRisk = suspicious.filter((tx) => tx.risk_level === "high");
  const highRiskCases = dataset.cases.filter((item) => item.risk_level === "high");
  const recentTransfers = suspicious.slice(-transferLimit).reverse();
  const selectedCase = dataset.cases.find((item) => item.case_id === selectedCaseId) ?? dataset.cases[0];
  const selectedTransferIds = new Set(selectedCase?.transaction_ids);
  const caseTransfers = dataset.transactions.filter((tx) => selectedTransferIds.has(tx.transaction_id));
  const graphTransfers = caseTransfers.slice(0, graphLimit);
  const stats = [
    { label: "Всего переводов", count: dataset.transactions.length, icon: "⇄", tone: "total" },
    { label: "Отмечено для проверки", count: suspicious.length, icon: "✓", tone: "review" },
    { label: "Высокий риск", count: highRisk.length, icon: "!", tone: "high" },
    { label: "Расследования", count: dataset.cases.length, icon: "◎", tone: "cases" },
  ];

  return (
    <div className="dashboard">
      <section className="dashboard-stats" aria-label="Показатели активного набора">
        {stats.map(({ label, count, icon, tone }) => (
          <div className={`stat-card stat-${tone}`} key={label}>
            <span className="stat-icon" aria-hidden="true">{icon}</span>
            <div>
              <p>{label}</p>
              <strong>{count.toLocaleString("ru-KZ")}</strong>
            </div>
          </div>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="suspicious-transfers">
          <div className="section-header">
            <div>
              <h2 id="suspicious-transfers">Подозрительные переводы</h2>
              {suspicious.length > recentTransfers.length && (
                <p>Последние {recentTransfers.length} из {suspicious.length}</p>
              )}
            </div>
            <a className="dashboard-link" href="#/transactions?view=transfers">Все операции <span aria-hidden="true">→</span></a>
          </div>
          {recentTransfers.length > 0 ? (
            <TransfersTable transactions={recentTransfers} compact onSelect={openTransfer} />
          ) : (
            <p className="empty">{dataset.transactions.length
              ? "В активном наборе нет переводов, отмеченных для проверки."
              : "Переводов пока нет. Загрузите CSV, чтобы начать проверку."}</p>
          )}
        </section>

        <section className="panel" aria-labelledby="high-risk-cases">
          <div className="section-header"><h2 id="high-risk-cases">Кейсы высокого риска</h2></div>
          {highRiskCases.length > 0 ? (
            <ul className="dashboard-case-list" aria-labelledby="high-risk-cases">
              {highRiskCases.map((item) => (
                <li key={item.case_id}>
                  <div className="dashboard-case-heading">
                    <h3>{item.case_id}</h3>
                    <RiskBadge level={item.risk_level} score={item.risk_score} />
                  </div>
                  <p>{item.reasons.length ? item.reasons.join(" · ") : "Причина срабатывания не указана."}</p>
                  <a className="dashboard-link" aria-label={`Открыть кейс ${item.case_id}`}
                    href={`#/investigation/${item.case_id}`}>Открыть кейс <span aria-hidden="true">→</span></a>
                </li>
              ))}
            </ul>
          ) : <p className="empty">Кейсов высокого риска пока нет.</p>}
        </section>

        <section className="panel dashboard-graph" aria-labelledby="dashboard-graph-title">
          <div className="section-header">
            <div>
              <h2 id="dashboard-graph-title">Граф переводов</h2>
              {caseTransfers.length > graphTransfers.length && (
                <p>Первые {graphTransfers.length} из {caseTransfers.length} переводов</p>
              )}
            </div>
            {selectedCase && (
              <a className="dashboard-link" href={`#/graph/${selectedCase.case_id}`}>Весь граф <span aria-hidden="true">→</span></a>
            )}
          </div>
          {selectedCase && graphTransfers.length > 0 ? (
            <TransferGraph key={selectedCase.case_id} transactions={graphTransfers} onSelect={openTransfer} />
          ) : <p className="empty">Граф появится, когда будут связанные переводы.</p>}
        </section>

        <section className="panel dashboard-replay" aria-labelledby="selected-case">
          <h2 id="selected-case">Выбранный кейс</h2>
          {selectedCase ? (
            <>
              <div className="toolbar">
                <label><span id="replay-case-label">Расследование</span>
                  <select aria-labelledby="replay-case-label" value={selectedCase.case_id}
                    onChange={(event) => setSelectedCaseId(event.target.value)}>
                    {dataset.cases.map((item) => <option key={item.case_id} value={item.case_id}>{item.case_id}</option>)}
                  </select>
                </label>
                <RiskBadge level={selectedCase.risk_level} score={selectedCase.risk_score} />
              </div>
              <p className="muted">Связанных переводов — {caseTransfers.length}</p>
              <a className="button" href={`#/replay/${selectedCase.case_id}`}>
                <span aria-hidden="true">▷</span> Перейти к воспроизведению
              </a>
            </>
          ) : <p className="empty">Пока нет расследований для воспроизведения.</p>}
        </section>
      </div>
    </div>
  );
}
