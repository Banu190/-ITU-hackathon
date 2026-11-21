import { AlertCircle, FileDown, Play, ShieldCheck } from "lucide-react";
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { PageTitle, RiskBadge } from "../components/UI";
import { formatAmount, investigations, riskLabels } from "../data/demo";
import type { Risk } from "../data/demo";

function RiskScore({ score, risk }: { score: number; risk: Risk }) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    const controls = animate(0, score, { duration: reduced ? 0 : 0.75, onUpdate: (next) => setValue(Math.round(next)) });
    return () => controls.stop();
  }, [score, reduced]);

  return (
    <section className="card score-card" aria-labelledby="score-title">
      <div className="card-heading"><h2 id="score-title">Risk Score</h2><RiskBadge risk={risk} /></div>
      <div className="score-ring" role="img" aria-label={`${riskLabels[risk]}, ${score} из 100`}>
        <svg viewBox="0 0 132 132" aria-hidden="true">
          <circle cx="66" cy="66" r="56" fill="none" stroke="#efeaf8" strokeWidth="9" />
          <motion.circle className={`score-stroke ${risk.toLowerCase()}`} cx="66" cy="66" r="56" fill="none"
            strokeWidth="9" strokeLinecap="round" transform="rotate(-90 66 66)"
            initial={{ pathLength: 0 }} animate={{ pathLength: score / 100 }} transition={{ duration: reduced ? 0 : 0.75 }} />
        </svg>
        <div aria-hidden="true"><strong>{value}</strong><span>из 100</span></div>
      </div>
      <p className="muted score-caption">Условная оценка для демонстрации</p>
    </section>
  );
}

export default function InvestigationDetails({ notify }: { notify: (message: string) => void }) {
  const { caseId } = useParams();
  const investigation = investigations.find((item) => item.id === caseId);
  if (!investigation) return <NotFound />;

  return (
    <>
      <PageTitle title={`Расследование ${investigation.id}`}
        description={`${investigation.title} · ${investigation.day} ноября 2026`}
        action={<div className="action-group">
          <button className="button secondary" type="button" onClick={() => notify("Экспорт отчёта пока недоступен в демоверсии.")}>
            <FileDown size={17} /> Export Report
          </button>
          <Link className="button primary" to={`/replay/${investigation.id}`}><Play size={17} /> Open Replay</Link>
        </div>} />
      <div className="detail-grid">
        <RiskScore score={investigation.score} risk={investigation.risk} />
        <section className="card reasons-card" aria-labelledby="reasons-title">
          <div className="card-heading"><div><h2 id="reasons-title">Причины для проверки</h2><p>Сигналы в демонстрационном кейсе</p></div><span className="panel-icon"><ShieldCheck size={20} /></span></div>
          <ul>
            {investigation.reasons.map((reason) => <li key={reason}><AlertCircle size={18} /><span>{reason}</span></li>)}
          </ul>
        </section>
      </div>
      <section className="card related-card" aria-labelledby="related-title">
        <div className="card-heading"><h2 id="related-title">Связанные транзакции</h2></div>
        <div className="table-scroll" role="region" aria-label="Связанные транзакции" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">ID</th><th scope="col">Отправитель</th><th scope="col">Получатель</th><th scope="col">Время</th><th scope="col">Сумма</th></tr></thead>
            <tbody>{investigation.transactions.map((tx) => (
              <tr key={tx.id}><th scope="row">{tx.id}</th><td>{tx.sender}</td><td>{tx.recipient}</td><td>{tx.time}</td><td>{formatAmount(tx.amount)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function NotFound() {
  return <section className="card empty-state"><h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь к списку кейсов.</p>
    <Link to="/investigations" className="button secondary">К расследованиям</Link>
  </section>;
}
