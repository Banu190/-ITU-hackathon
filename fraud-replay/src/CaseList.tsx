import { ArrowRight } from "lucide-react";
import { formatDate } from "./api";
import type { Investigation, Transfer } from "./api";
import { linkTo } from "./navigation";
import { RiskBadge } from "./TransactionsPage";
import { StateMessage } from "./ui";

export default function CaseList({ cases, transactions, limit }: { cases: Investigation[]; transactions: Transfer[]; limit?: number }) {
  if (!cases.length) return <StateMessage title="Нет расследований" detail="В текущей выборке нет подходящих кейсов." />;
  const dates = new Map(transactions.map((item) => [item.transaction_id, Date.parse(item.timestamp)]));
  const rows = cases.map((item) => ({
    item, lastActivity: Math.max(...item.transaction_ids.map((id) => dates.get(id) ?? -Infinity)),
  })).sort((a, b) => b.lastActivity - a.lastActivity);

  return (
    <div className="table-wrapper" role="region" aria-label="Таблица расследований" tabIndex={0}>
      <table className="case-table">
        <thead><tr><th scope="col">Кейс</th><th scope="col">Сигналы</th><th scope="col">Операции</th>
          <th scope="col">Последняя операция</th><th scope="col">Риск</th><th scope="col"><span className="sr-only">Открыть</span></th></tr></thead>
        <tbody>{rows.slice(0, limit ?? rows.length).map(({ item, lastActivity }) => (
          <tr key={item.case_id}>
            <th scope="row"><a className="text-button" href={linkTo("investigation", item.case_id)}>{item.case_id}</a></th>
            <td className="case-reasons">{item.reasons.join(" · ") || "—"}</td><td>{item.transaction_ids.length}</td>
            <td className="muted">{Number.isFinite(lastActivity) ? formatDate(new Date(lastActivity).toISOString()) : "—"}</td>
            <td><RiskBadge level={item.risk_level} score={item.risk_score} /></td>
            <td><a className="icon-button small" href={linkTo("investigation", item.case_id)} aria-label={`Открыть ${item.case_id}`}><ArrowRight size={15} /></a></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
