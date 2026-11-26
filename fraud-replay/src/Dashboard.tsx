import { ArrowLeftRight, ArrowRight, FileText, SearchCheck, ShieldAlert, TriangleAlert, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dataset, RiskLevel, Transfer } from "./api";
import CaseList from "./CaseList";
import { linkTo } from "./navigation";
import type { Page } from "./navigation";
import { PageHeading, PanelHeading, StateMessage } from "./ui";

const number = new Intl.NumberFormat("ru-KZ");
const shortDate = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayMs = 86_400_000;
const offsetMs = 5 * 3_600_000;
const chartTooltip = { background: "var(--raised)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text)" };
const riskRanges: { key: RiskLevel; name: string; range: string; color: string }[] = [
  { key: "low", name: "Низкий", range: "0–44", color: "var(--risk-low)" },
  { key: "medium", name: "Средний", range: "45–69", color: "var(--risk-medium)" },
  { key: "high", name: "Высокий", range: "70–100", color: "var(--risk-high)" },
];

function calendarDay(timestamp: string) {
  return Math.floor((Date.parse(timestamp) + offsetMs) / dayMs);
}

function ActivityChart({ transfers }: { transfers: Transfer[] }) {
  const [days, setDays] = useState(14);
  const daily = useMemo(() => {
    const groups = new Map<number, { total: number; suspicious: number }>();
    let last = -Infinity;
    for (const transfer of transfers) {
      const day = calendarDay(transfer.timestamp);
      if (!Number.isFinite(day)) continue;
      last = Math.max(last, day);
      const counts = groups.get(day) ?? { total: 0, suspicious: 0 };
      counts.total += 1;
      if (transfer.risk_level !== "low") counts.suspicious += 1;
      groups.set(day, counts);
    }
    return { last, groups };
  }, [transfers]);
  const series = Number.isFinite(daily.last)
    ? Array.from({ length: days }, (_, index) => {
      const day = daily.last - days + index + 1;
      return { day, ...(daily.groups.get(day) ?? { total: 0, suspicious: 0 }) };
    })
    : [];

  return <section className="panel activity-panel">
    <PanelHeading title="Динамика транзакций">
      <div className="segmented" role="group" aria-label="Период динамики">
        {[7, 14, 30].map((period) => <button type="button" key={period} onClick={() => setDays(period)}
          aria-pressed={period === days}>{period} дн.</button>)}
      </div>
    </PanelHeading>
    {series.length ? <>
      <div className="chart-legend"><span><i className="chart-total" />Все операции</span><span><i className="chart-suspicious" />Подозрительные</span></div>
      <div className="activity-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={series} margin={{ top: 8, right: 12, left: 1, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
            <XAxis dataKey="day" tickFormatter={(day: number) => shortDate.format(day * dayMs)} minTickGap={26}
              tick={{ fill: "var(--muted)", fontSize: 11 }} tickMargin={8} axisLine={false} tickLine={false} />
            <YAxis width={35} tickCount={5} allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <Tooltip contentStyle={chartTooltip} labelStyle={{ color: "var(--text)" }}
              labelFormatter={(day) => longDate.format(Number(day) * dayMs)} cursor={{ stroke: "var(--border-strong)" }} />
            <Line type="monotone" dataKey="total" name="Все операции" stroke="var(--chart-primary)" strokeWidth={2.6}
              dot={false} activeDot={{ r: 4 }} animationDuration={200} />
            <Line type="monotone" dataKey="suspicious" name="Подозрительные" stroke="var(--chart-secondary)" strokeWidth={2} strokeDasharray="4 4"
              dot={false} activeDot={{ r: 4 }} animationDuration={200} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </> : <StateMessage title="Динамика пока недоступна" detail="В активном наборе нет операций с датой." />}
  </section>;
}

function RiskDistribution({ transfers }: { transfers: Transfer[] }) {
  const [selected, setSelected] = useState<RiskLevel | null>(null);
  const counts = { low: 0, medium: 0, high: 0 };
  for (const transfer of transfers) {
    const score = transfer.risk_score;
    counts[score < 45 ? "low" : score < 70 ? "medium" : "high"] += 1;
  }
  const data = riskRanges.map((item) => ({
    ...item, value: counts[item.key], fill: selected && selected !== item.key ? "var(--border-strong)" : item.color,
  }));
  function select(key: RiskLevel) { setSelected((current) => current === key ? null : key); }

  return <section className="panel risk-panel">
    <PanelHeading title="Распределение Risk Score" />
    {transfers.length ? <>
      <div className="risk-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart accessibilityLayer>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="69%" outerRadius="93%" paddingAngle={3} stroke="none"
              onClick={(_, index) => select(data[index].key)} animationDuration={200} />
            <Tooltip contentStyle={chartTooltip} itemStyle={{ color: "var(--text)" }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="risk-chart-center"><strong>{number.format(selected ? counts[selected] : transfers.length)}</strong>
          <span>{selected ? riskRanges.find((item) => item.key === selected)?.name : "операций"}</span></div>
      </div>
      <div className="risk-legend">
        {data.map(({ key, name, range, value, color }) => (
          <button type="button" key={key} aria-pressed={selected === key} onClick={() => select(key)}>
            <i style={{ background: color }} /><span>{name} <small>{range}</small></span><strong>{number.format(value)}</strong>
          </button>
        ))}
      </div>
    </> : <StateMessage title="Нет оценок риска" />}
  </section>;
}

const workActions = [
  { page: "upload", title: "Загрузить CSV", detail: "Импорт и запуск анализа", icon: Upload },
  { page: "transactions", title: "Открыть транзакции", detail: "Поиск и фильтры", icon: ArrowLeftRight },
  { page: "reports", title: "Посмотреть отчёты", detail: "Сводка по расследованиям", icon: FileText },
] as const;

export default function Dashboard({ dataset, name, allowed }: { dataset: Dataset; name: string; allowed: readonly Page[] }) {
  const suspicious = dataset.transactions.filter((item) => item.risk_level !== "low");
  const highRisk = suspicious.filter((item) => item.risk_level === "high");
  const metrics = [
    { label: "Всего транзакций", value: dataset.transactions.length, icon: ArrowLeftRight, tone: "neutral" },
    { label: "Подозрительные операции", value: suspicious.length, icon: TriangleAlert, tone: "medium" },
    { label: "Операции высокого риска", value: highRisk.length, icon: ShieldAlert, tone: "high" },
    { label: "Активные расследования", value: dataset.cases.length, icon: SearchCheck, tone: "low" },
  ];
  const actions = allowed.includes("upload") ? workActions
    : [{ page: "investigation", title: "Открыть расследования", detail: "Просмотр кейсов", icon: SearchCheck }] as const;

  return <>
    <PageHeading title={`Здравствуйте, ${name.trim().split(/\s+/)[0]}`} description={`Активный набор · ${dataset.source}`} />
    <section className="stats" aria-label="Сводка по транзакциям">
      {metrics.map(({ label, value, icon: Icon, tone }) => <article className="stat-card" key={label}>
        <span className={`stat-icon stat-${tone}`}><Icon size={18} aria-hidden="true" /></span>
        <strong>{number.format(value)}</strong><p>{label}</p>
      </article>)}
    </section>
    <div className="dashboard-grid">
      <section className="panel case-table-panel">
        <PanelHeading title="Последние расследования">
          <Link className="button secondary compact-button" to={linkTo("investigation")}>Все расследования <ArrowRight size={14} /></Link>
        </PanelHeading>
        <CaseList cases={dataset.cases} transactions={dataset.transactions} limit={5} />
      </section>
      <section className="panel quick-actions">
        <PanelHeading title="Быстрые действия" />
        <div className="action-list">{actions.map(({ page, title, detail, icon: Icon }) => (
          <Link className={`action-tile ${page === "upload" ? "action-primary" : ""}`} key={page} to={linkTo(page)}>
            <span className="action-icon"><Icon size={17} aria-hidden="true" /></span>
            <span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={15} aria-hidden="true" />
          </Link>
        ))}</div>
      </section>
      <ActivityChart transfers={dataset.transactions} />
      <RiskDistribution transfers={dataset.transactions} />
    </div>
  </>;
}
