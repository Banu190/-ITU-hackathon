import { Activity, ArrowLeftRight, CalendarDays, FolderSearch, Plus, ShieldAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CaseTable, PageTitle, RiskBadge } from "../components/UI";
import { activity, flaggedTransactions, formatNumber, investigations, risks, totalTransactions } from "../data/demo";

const metrics = [
  { name: "Всего транзакций", value: totalTransactions, detail: "За 8–21 ноября", icon: ArrowLeftRight, color: "violet" },
  {
    name: "Подозрительные операции", value: flaggedTransactions,
    detail: `${Math.round(flaggedTransactions / totalTransactions * 100)}% от всех транзакций`,
    icon: ShieldAlert, color: "amber",
  },
  {
    name: "Расследования", value: investigations.length,
    detail: `Высокий риск — ${investigations.filter((item) => item.risk === "High").length}`,
    icon: FolderSearch, color: "blue",
  },
];

function ActivityChart() {
  const [days, setDays] = useState<7 | 14>(14);
  const reduceMotion = useReducedMotion();
  const series = activity.slice(-days);

  return (
    <section className="card chart-card" aria-labelledby="chart-title">
      <div className="card-heading">
        <div><h2 id="chart-title">Активность транзакций</h2><p>Количество операций по дням</p></div>
        <div className="segmented" aria-label="Период графика">
          {([7, 14] as const).map((option) => (
            <button key={option} type="button" aria-pressed={option === days} onClick={() => setDays(option)}>
              {option === 7 ? "7 дней" : "14 дней"}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-area">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart key={days} data={series} margin={{ top: 10, right: 4, left: 0, bottom: 0 }} accessibilityLayer>
            <defs>
              <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a58aff" />
                <stop offset="100%" stopColor="#ebe3ff" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#efecf6" strokeDasharray="4 4" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tickMargin={10} interval="preserveStartEnd" minTickGap={12} tick={{ fill: "#6f6884", fontSize: 12 }} />
            <YAxis width={34} axisLine={false} tickLine={false} tickCount={4} tick={{ fill: "#6f6884", fontSize: 12 }} />
            <Tooltip cursor={{ fill: "#f5f0ff" }} labelFormatter={(day) => `${day} ноября`} />
            <Bar dataKey="total" name="Транзакции" fill="url(#activity-fill)" radius={[6, 6, 3, 3]} maxBarSize={29}
              activeBar={{ fill: "#7753e5" }} isAnimationActive={!reduceMotion} animationDuration={500} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-footer"><CalendarDays size={15} /> <span>{series[0].day}–21 ноября 2026</span></div>
    </section>
  );
}

function RiskSummary() {
  const counts = risks.map((risk) => ({ risk, count: investigations.filter((item) => item.risk === risk).length }));
  return (
    <section className="card risk-summary" aria-labelledby="risk-title">
      <div className="card-heading">
        <div><h2 id="risk-title">Уровни риска</h2><p>Распределение расследований</p></div>
        <span className="panel-icon"><Activity size={19} /></span>
      </div>
      <div className="risk-strip" aria-hidden="true">
        {counts.map(({ risk, count }) => <span key={risk} className={risk.toLowerCase()} style={{ flex: count }} />)}
      </div>
      <ul className="risk-summary-list">
        {counts.map(({ risk, count }) => (
          <li key={risk}>
            <Link to={`/investigations?risk=${risk}`}>
              <RiskBadge risk={risk} /><strong>{count}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Dashboard() {
  return (
    <>
      <PageTitle title="Обзор расследований" description="Активность транзакций и последние кейсы в одном месте."
        action={<Link className="button primary" to="/upload"><Plus size={18} /> Новое расследование</Link>} />
      <section className="metrics-grid" aria-label="Ключевые показатели">
        {metrics.map(({ name, value, detail, icon: Icon, color }, index) => (
          <motion.article key={name} className={`card metric metric-${color}`}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.06 }}>
            <div className="metric-text"><h2>{name}</h2><strong>{formatNumber(value)}</strong><p>{detail}</p></div>
            <span className="metric-icon"><Icon size={22} /></span>
          </motion.article>
        ))}
      </section>
      <div className="analytics-grid"><ActivityChart /><RiskSummary /></div>
      <section className="card latest-card" aria-labelledby="latest-title">
        <div className="card-heading">
          <h2 id="latest-title">Последние расследования</h2>
          <Link className="quiet-link" to="/investigations">Все расследования</Link>
        </div>
        <CaseTable cases={investigations.slice(0, 4)} />
      </section>
    </>
  );
}
