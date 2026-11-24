import { ArrowRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatAmount, formatDate, riskLabels } from "./api";
import type { Dataset, RiskLevel, Transfer } from "./api";
import { linkTo } from "./navigation";
import { PageHeading, PanelHeading, StateMessage } from "./ui";

export function RiskBadge({ level, score }: { level: RiskLevel; score: number }) {
  return <span className={`risk-badge risk-${level}`} title={`${riskLabels[level]} риск`}><i aria-hidden="true" />{riskLabels[level]} <b>{score}</b></span>;
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

export function TransfersTable({ transactions, selectedId, onSelect }: {
  transactions: Transfer[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (!transactions.length) return <StateMessage title="Операции не найдены" detail="Попробуйте изменить условия поиска." />;
  return (
    <div className="table-wrapper" role="region" aria-label="Таблица переводов" tabIndex={0}>
      <table className="transfer-table">
        <thead><tr>
          <th scope="col">Операция</th>
          <th scope="col">Отправитель</th>
          <th scope="col">Получатель</th>
          <th scope="col">Сумма</th>
          <th scope="col">Время · UTC+05</th>
          <th scope="col">Риск</th>
        </tr></thead>
        <tbody>{transactions.map((tx) => (
          <tr key={tx.transaction_id} className={selectedId === tx.transaction_id ? "selected-row" : undefined}>
            <th scope="row"><button className="text-button" onClick={() => onSelect(tx.transaction_id)}>{tx.transaction_id}</button></th>
            <td>{tx.sender}</td>
            <td>{tx.receiver}</td>
            <td className="table-number">{formatAmount(tx.amount_tiyn)}</td>
            <td className="muted">{formatDate(tx.timestamp)}</td>
            <td><RiskBadge level={tx.risk_level} score={tx.risk_score} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

const sortOptions = {
  recent: { label: "Сначала новые", compare: (a: Transfer, b: Transfer) => Date.parse(b.timestamp) - Date.parse(a.timestamp) },
  oldest: { label: "Сначала старые", compare: (a: Transfer, b: Transfer) => Date.parse(a.timestamp) - Date.parse(b.timestamp) },
  risk: { label: "Наибольший риск", compare: (a: Transfer, b: Transfer) => b.risk_score - a.risk_score },
  amount: { label: "Наибольшая сумма", compare: (a: Transfer, b: Transfer) => b.amount_tiyn - a.amount_tiyn },
};

const pageSize = 20;

export default function TransactionsPage({ dataset, initialId = "" }: { dataset: Dataset; initialId?: string }) {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [sort, setSort] = useState<keyof typeof sortOptions>("recent");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(initialId);
  const selected = dataset.transactions.find((tx) => tx.transaction_id === selectedId);
  const matchingCase = dataset.cases.find((item) => item.transaction_ids.includes(selectedId));
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => dataset.transactions.filter((tx) =>
    (!level || level === tx.risk_level) &&
    [tx.transaction_id, tx.sender, tx.receiver].some((field) => field.toLowerCase().includes(query)))
    .sort(sortOptions[sort].compare), [dataset.transactions, level, query, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * pageSize;

  return (
    <>
      <PageHeading title="Транзакции" description={dataset.source}>
        <a className="button" href={linkTo("upload")}>Загрузить CSV <ArrowRight size={15} /></a>
      </PageHeading>
      <div className={selected ? "workspace transaction-workspace" : undefined}>
        <section className="panel data-panel">
          <PanelHeading title="Реестр операций" description={`${filtered.length} из ${dataset.transactions.length} операций`} />
          <div className="toolbar filters">
            <label className="search-field"><span className="sr-only">Поиск по ID или счёту</span><Search size={16} aria-hidden="true" />
              <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="ID операции или счёт" />
            </label>
            <label><span className="sr-only">Уровень риска</span>
              <select value={level} onChange={(event) => { setLevel(event.target.value); setPage(0); }}>
                <option value="">Все уровни риска</option>
                {Object.entries(riskLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </label>
            <label><span className="sr-only">Сортировка операций</span>
              <select value={sort} onChange={(event) => { setSort(event.target.value as keyof typeof sortOptions); setPage(0); }}>
                {Object.entries(sortOptions).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
            </label>
          </div>
          <TransfersTable transactions={filtered.slice(pageStart, pageStart + pageSize)} selectedId={selectedId} onSelect={setSelectedId} />
          {pageCount > 1 && <div className="pagination">
            <span>{pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} из {filtered.length}</span>
            <div><button type="button" className="button secondary compact-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Назад</button>
              <button type="button" className="button secondary compact-button" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Далее</button></div>
          </div>}
        </section>
        {selected && <section className="panel detail-panel" aria-label="Детали перевода">
          <PanelHeading title="Детали перевода">
            <button className="icon-button small" onClick={() => setSelectedId("")} aria-label="Закрыть детали"><X size={16} /></button>
          </PanelHeading>
          <TransferDetails transfer={selected} onSelect={setSelectedId} />
          {matchingCase && <a className="button secondary" href={linkTo("investigation", matchingCase.case_id)}>Открыть {matchingCase.case_id} <ArrowRight size={15} /></a>}
        </section>}
      </div>
    </>
  );
}
