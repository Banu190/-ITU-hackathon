import { ArrowRight, Download, FileText } from "lucide-react";
import { useState } from "react";
import { downloadBlob, downloadCaseReport, errorMessage } from "./api";
import type { Dataset, Investigation } from "./api";
import { linkTo } from "./navigation";
import { RiskBadge } from "./TransactionsPage";
import { PageHeading, PanelHeading, StateMessage } from "./ui";

export default function ReportsPage({ dataset, demo }: { dataset: Dataset; demo: boolean }) {
  const [selectedId, setSelectedId] = useState(dataset.cases[0]?.case_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = dataset.cases.find((item) => item.case_id === selectedId);

  async function exportReport(report: Investigation) {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const data = `case_id,risk_score,risk_level,transactions,suspicious\n${report.case_id},${report.risk_score},${report.risk_level},${report.transaction_ids.length},${report.suspicious_transactions.length}\n`;
        downloadBlob(new Blob([data], { type: "text/csv;charset=utf-8" }), `demo-${report.case_id}.csv`);
      } else {
        await downloadCaseReport(dataset, report);
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <PageHeading title="Отчёты" description={demo ? "Демонстрационные сводки по расследованиям и экспорт в CSV." : "Сводки по расследованиям и экспорт в PDF."} />
    <div className="workspace reports-workspace">
      <section className="panel data-panel">
        <PanelHeading title="Отчёты расследований" description={dataset.source} />
        {dataset.cases.length ? <div className="table-wrapper" tabIndex={0} role="region" aria-label="Список отчётов">
          <table><thead><tr><th scope="col">Расследование</th><th scope="col">Сигналы</th><th scope="col">Риск</th></tr></thead>
            <tbody>{dataset.cases.map((item) => <tr key={item.case_id} className={item.case_id === selectedId ? "selected-row" : undefined}>
              <th scope="row"><button type="button" className="text-button" onClick={() => { setSelectedId(item.case_id); setError(""); }}>
                <FileText size={15} aria-hidden="true" />{item.case_id}
              </button></th>
              <td>{item.reasons.join(" · ")}</td><td><RiskBadge score={item.risk_score} level={item.risk_level} /></td>
            </tr>)}</tbody>
          </table>
        </div> : <StateMessage title="Отчётов пока нет" detail="Отчёты доступны для расследований активного набора." />}
      </section>
      {selected && <section className="panel detail-panel">
        <PanelHeading title={selected.case_id} description="Сводка расследования" />
        <dl className="details-list">
          <div><dt>Оценка риска</dt><dd><RiskBadge score={selected.risk_score} level={selected.risk_level} /></dd></div>
          <div><dt>Операций в кейсе</dt><dd>{selected.transaction_ids.length}</dd></div>
          <div><dt>Требуют проверки</dt><dd>{selected.suspicious_transactions.length}</dd></div>
          <div><dt>Сигналы</dt><dd>{selected.reasons.join(" · ") || "—"}</dd></div>
        </dl>
        <div className="toolbar">
          <button type="button" className="button" disabled={busy} onClick={() => void exportReport(selected)}>
            <Download size={16} />{busy ? "Готовим отчёт…" : demo ? "Скачать CSV" : "Скачать PDF"}
          </button>
          <a className="button secondary" href={linkTo("investigation", selected.case_id)}>Расследование <ArrowRight size={14} /></a>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>}
    </div>
  </>;
}
