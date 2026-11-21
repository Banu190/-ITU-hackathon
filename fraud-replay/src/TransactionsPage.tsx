import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import demoCsvUrl from "../data/demo.csv?url";
import { errorMessage, formatAmount, formatDate, request } from "./api";
import type { Dataset, RiskLevel, Transfer } from "./api";

const riskLabels: Record<RiskLevel, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };

export function RiskBadge({ level, score }: { level?: RiskLevel | null; score?: number | null }) {
  if (level == null || score == null || !Number.isFinite(score)) {
    return <span className="risk-badge risk-unscored">Не оценён</span>;
  }
  return <span className={`risk-badge risk-${level}`} title={`${riskLabels[level]} риск`}>{score}/100 · {riskLabels[level]}</span>;
}

export function TransferDetails({ transfer, onSelect }: {
  transfer: Transfer;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="transfer-details">
      <div className="section-header compact">
        <h3>{transfer.transaction_id}</h3>
        <RiskBadge level={transfer.risk_level} score={transfer.risk_score} />
      </div>
      <p className="transfer-summary"><span>{transfer.sender} → {transfer.receiver}</span><strong>{formatAmount(transfer.amount_tiyn)}</strong></p>
      <p className="muted">{formatDate(transfer.timestamp)} · UTC+05:00</p>
      {transfer.reasons.length > 0 ? (
        <ul className="reasons">
          {transfer.reasons.map((reason) => (
            <li key={reason.code}>
              <div className="reason-heading"><strong>{reason.title}</strong><span>+{reason.points}</span></div>
              <p>{reason.description}</p>
              {reason.related_transactions.length > 0 && (
                <div className="related">
                  <span>Связанные переводы</span>
                  {reason.related_transactions.slice(0, 8).map((id) => onSelect
                    ? <button key={id} className="text-button" onClick={() => onSelect(id)}>{id}</button>
                    : <span key={id}>{id}</span>)}
                  {reason.related_transactions.length > 8 && <span>ещё {reason.related_transactions.length - 8}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="muted">Правила риска не сработали.</p>}
    </div>
  );
}

export function TransfersTable({ transactions, selectedId, onSelect, compact = false }: {
  transactions: Transfer[];
  selectedId?: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  if (!transactions.length) return <p className="empty">Операции не найдены.</p>;
  return (
    <div className="table-wrapper" role="region" aria-label="Таблица переводов" tabIndex={0}>
      <table>
        <thead><tr>
          <th scope="col">{compact ? "ID" : "Операция"}</th>
          <th scope="col">Отправитель</th>
          <th scope="col">Получатель</th>
          <th scope="col">Сумма</th>
          {!compact && <th scope="col">Время · UTC+05</th>}
          <th scope="col">{compact ? "Оценка риска" : "Риск"}</th>
        </tr></thead>
        <tbody>{transactions.map((tx) => (
          <tr key={tx.transaction_id} className={selectedId === tx.transaction_id ? "selected-row" : undefined}>
            <th scope="row"><button className="text-button" onClick={() => onSelect(tx.transaction_id)}>{tx.transaction_id}</button></th>
            <td>{tx.sender}</td>
            <td>{tx.receiver}</td>
            <td>{formatAmount(tx.amount_tiyn)}</td>
            {!compact && <td>{formatDate(tx.timestamp)}</td>}
            <td><RiskBadge level={tx.risk_level} score={tx.risk_score} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function TransactionsPage({ dataset, onDataset, initialId = "", showTransfers = false, offline = false }: {
  dataset: Dataset;
  onDataset: (dataset: Dataset) => void;
  initialId?: string;
  showTransfers?: boolean;
  offline?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [selectedId, setSelectedId] = useState(initialId);
  const transfersHeading = useRef<HTMLHeadingElement>(null);
  const selected = dataset.transactions.find((tx) => tx.transaction_id === selectedId);
  const matchingCase = dataset.cases.find((item) => item.transaction_ids.includes(selectedId));
  const query = search.trim().toLowerCase();
  const filtered = dataset.transactions.filter((tx) =>
    (!level || level === tx.risk_level) &&
    [tx.transaction_id, tx.sender, tx.receiver].some((field) => field.toLowerCase().includes(query)));

  useEffect(() => {
    if (showTransfers) transfersHeading.current?.focus();
  }, [showTransfers]);

  async function updateDataset(importFile: File | null, form?: HTMLFormElement) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      let url = "/api/datasets/demo";
      let body: FormData | undefined;
      if (importFile) {
        url = "/api/datasets/import";
        body = new FormData();
        body.append("file", importFile);
      }
      const next = await request<Dataset>(url, { method: "POST", body });
      setSelectedId("");
      setSearch("");
      setLevel("");
      setFile(null);
      form?.reset();
      onDataset(next);
      setMessage(`Набор загружен. Переводов: ${next.transactions.length}. Расследований: ${next.cases.length}.`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file && !busy && !offline) void updateDataset(file, event.currentTarget);
  }

  return (
    <>
      <section className="panel">
        <div className="section-header">
          <div><h2>Импорт CSV</h2><p>Используйте только синтетические транзакции.</p></div>
          <a className="button secondary" href={offline ? demoCsvUrl : "/api/demo.csv"} download="demo.csv">Скачать пример</a>
        </div>
        <form className="toolbar" onSubmit={submit}>
          <label>Файл транзакций
            <input type="file" accept=".csv,text/csv" required disabled={busy || offline}
              aria-describedby="csv-format" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
          </label>
          <button type="submit" className="button" disabled={!file || busy || offline}>Импортировать и проверить</button>
          <button type="button" className="button secondary" disabled={busy || offline}
            onClick={(event) => void updateDataset(null, event.currentTarget.form ?? undefined)}>Загрузить демо</button>
        </form>
        <p id="csv-format" className="muted help"><code>transaction_id, timestamp, sender, receiver, amount</code><br />
          UTF-8, до 1 МБ и 1000 строк. Сумма в тенге, время в ISO 8601 со смещением.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="status" role="status">{busy ? "Анализируем набор…" : message}</p>
      </section>

      {selected && (
        <section className="panel" aria-label="Детали перевода">
          <TransferDetails transfer={selected} onSelect={setSelectedId} />
          <div className="toolbar">
            {matchingCase && <a className="button" href={`#/investigation/${matchingCase.case_id}`}>Открыть расследование {matchingCase.case_id}</a>}
            <button className="button secondary" onClick={() => setSelectedId("")}>Скрыть детали</button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-header">
          <div><h2 ref={transfersHeading} tabIndex={-1}>Переводы</h2><p>{dataset.source} · Показано {filtered.length} из {dataset.transactions.length}</p></div>
        </div>
        <div className="toolbar filters">
          <label>Поиск по ID или счёту
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Например, TX-2041" />
          </label>
          <label>Уровень риска
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="">Все уровни</option>
              {Object.entries(riskLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
            </select>
          </label>
        </div>
        <TransfersTable transactions={filtered} selectedId={selectedId} onSelect={setSelectedId} />
      </section>
    </>
  );
}
