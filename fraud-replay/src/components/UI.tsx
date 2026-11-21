import { ChevronRight, FolderSearch, X } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import type { ReactNode } from "react";
import type { Investigation, Risk } from "../data/demo";
import { riskLabels } from "../data/demo";

export function PageTitle({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className="page-title">
      <div><h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}

export function RiskBadge({ risk }: { risk: Risk }) {
  return <span className={`risk-badge risk-${risk.toLowerCase()}`} title={riskLabels[risk]}><i aria-hidden="true" />{risk}</span>;
}

export function CaseTable({ cases }: { cases: Investigation[] }) {
  return (
    <div className="table-scroll" role="region" aria-label="Расследования" tabIndex={0}>
      <table className="case-table">
        <thead><tr><th scope="col">Расследование</th><th scope="col" className="case-date">Дата</th><th scope="col">Риск</th><th scope="col">Балл</th></tr></thead>
        <tbody>
          {cases.map((item) => (
            <tr key={item.id}>
              <th scope="row">
                <Link className="case-link" to={`/investigations/${item.id}`}>
                  <span className="case-icon"><FolderSearch size={17} /></span>
                  <span><strong>{item.title}</strong><small>{item.id}</small></span>
                </Link>
              </th>
              <td className="case-date">{item.day} ноя. 2026</td>
              <td><RiskBadge risk={item.risk} /></td>
              <td className="case-score"><strong>{item.score}</strong><span className="muted"> / 100</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BreadcrumbDivider() {
  return <ChevronRight size={14} className="text-slate-400" aria-hidden="true" />;
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <motion.div className="toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
      <span role="status">{message}</span>
      <button className="icon-button" type="button" aria-label="Закрыть уведомление" onClick={onClose}><X size={17} /></button>
    </motion.div>
  );
}
