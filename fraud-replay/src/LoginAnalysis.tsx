import { Pause, Play } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import "./LoginAnalysis.css";

const stageSeconds = 5.5;
const motionQuery = "(prefers-reduced-motion: reduce)";
const productDescription = "Рабочая область для анализа транзакций и расследования мошенничества.";

function subscribeToMotion(listener: () => void) {
  const preference = window.matchMedia(motionQuery);
  preference.addEventListener("change", listener);
  return () => preference.removeEventListener("change", listener);
}

function prefersReducedMotion() {
  return window.matchMedia(motionQuery).matches;
}

function Monitoring() {
  return <>
    <rect className="analysis-surface" x="26" y="22" width="228" height="139" rx="10" />
    <path className="analysis-guide" d="M46 58H234 M46 81H234 M46 104H234 M46 127H234" />
    <path className="analysis-line accent" d="M47 117 77 102 106 109 135 81 164 87 194 64 229 53" />
    <circle className="analysis-monitor-probe" cx="47" cy="117" r="3" />
    {[36, 61, 48].map((width, index) => (
      <g key={width} transform={`translate(272 ${40 + index * 38})`}>
        <rect className="analysis-surface" width="82" height="29" rx="6" />
        <circle className="analysis-transaction-dot" cx="12" cy="14.5" r="3" />
        <path className="analysis-placeholder" d={`M23 14.5H${width + 12}`} />
      </g>
    ))}
  </>;
}

const accounts = [
  { id: "102", x: 51, y: 94 }, { id: "218", x: 123, y: 46 }, { id: "337", x: 123, y: 137 },
  { id: "461", x: 202, y: 87 }, { id: "502", x: 277, y: 39 }, { id: "594", x: 277, y: 128 },
  { id: "681", x: 346, y: 77 },
];

function AccountGraph() {
  return <>
    <path className="analysis-line" d="M51 94C89 94 89 46 123 46S169 87 202 87
      M51 94C89 94 89 137 123 137S169 87 202 87
      M202 87C240 87 243 39 277 39S316 77 346 77
      M202 87C240 87 243 128 277 128S315 77 346 77" />
    <g className="analysis-risk">
      <path className="analysis-line" d="M202 87C240 87 243 128 277 128" />
      <rect x="263" y="114" width="28" height="28" rx="8" />
    </g>
    {accounts.map(({ id, x, y }) => (
      <g className="analysis-account" key={id} transform={`translate(${x} ${y})`}>
        <rect className="analysis-surface" x="-10" y="-10" width="20" height="20" rx="6" />
        <path className="analysis-account-icon" d="M-5-2 0-5 5-2 M-4-1H4 M-3-1V4 M0-1V4 M3-1V4 M-5 4H5" />
        <text className="analysis-text" y="25" textAnchor="middle">ACC–{id}</text>
      </g>
    ))}
    <circle className="analysis-graph-probe" cx="202" cy="87" r="2.5" />
  </>;
}

const events = [
  { x: 53, time: "09:41", phase: 0 },
  { x: 147, time: "09:43", phase: 1 },
  { x: 241, time: "09:45", phase: 2 },
  { x: 335, time: "09:48", phase: 3 },
];

function Replay() {
  return <>
    <path className="analysis-line" d="M53 68H335" />
    <path className="analysis-line accent analysis-replay-progress" d="M53 68H335" pathLength="1" />
    {events.map(({ x, time, phase }) => (
      <g key={time} transform={`translate(${x} 68)`}>
        <circle className="analysis-surface" r="7" />
        <circle className="analysis-event-dot" r="3" style={{ "--event-delay": `${phase * 1.1}s` } as CSSProperties} />
        <text className="analysis-text" y="27" textAnchor="middle">{time}</text>
        <rect className="analysis-surface" x="-26" y="42" width="52" height="33" rx="6" />
        <path className="analysis-placeholder" d="M-15 53H13 M-15 63H4" />
      </g>
    ))}
  </>;
}

const stages = [
  { title: "Мониторинг транзакций", description: "Отслеживайте поток переводов и замечайте всплески активности.", Graphic: Monitoring },
  { title: "Анализ связей между счетами", description: "Прослеживайте маршруты переводов и выделяйте подозрительные связи.", Graphic: AccountGraph },
  { title: "Восстановление последовательности операций", description: "Восстанавливайте порядок событий на временной шкале.", Graphic: Replay },
];

function stageTiming(index: number) {
  return { "--stage-delay": `${index ? (index - stages.length) * stageSeconds : 0}s` } as CSSProperties;
}

export default function LoginAnalysis() {
  const reduced = useSyncExternalStore(subscribeToMotion, prefersReducedMotion, () => true);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState(0);
  const gridId = useId();
  const visibleStages = stages.map((stage, index) => ({ ...stage, index }))
    .filter(({ index }) => !reduced || index === selected);

  return (
    <section className="login-analysis" aria-labelledby="login-analysis-title"
      data-paused={paused} data-reduced={reduced} style={{ "--analysis-cycle": `${stages.length * stageSeconds}s` } as CSSProperties}>
      <h1 id="login-analysis-title">Fraud Replay</h1>
      <div className="login-analysis-card">
        <div className="login-analysis-visual">
          <svg className="login-analysis-graph" viewBox="0 0 380 184" aria-hidden="true">
            <defs>
              <pattern id={gridId} width="17" height="17" patternUnits="userSpaceOnUse">
                <circle className="analysis-grid-dot" cx="1" cy="1" r=".7" />
              </pattern>
            </defs>
            <rect x="12" y="12" width="356" height="160" fill={`url(#${gridId})`} />
            {visibleStages.map(({ title, Graphic, index }) => (
              <g key={title} className="login-analysis-layer" data-stage={index} style={stageTiming(index)}><Graphic /></g>
            ))}
          </svg>
          {!reduced && (
            <button type="button" className="icon-button small login-analysis-pause" onClick={() => setPaused((current) => !current)}
              aria-label={paused ? "Воспроизвести анимацию" : "Приостановить анимацию"}
              title={paused ? "Воспроизвести анимацию" : "Приостановить анимацию"}>
              {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            </button>
          )}
        </div>
        <div className="login-analysis-detail">
          <div className="login-analysis-copy">
            {visibleStages.map(({ title, description, index }) => (
              <div key={title} className="login-analysis-layer" data-stage={index} style={stageTiming(index)}>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            ))}
          </div>
          <div className="login-analysis-indicators" role={reduced ? "group" : undefined}
            aria-label={reduced ? "Этапы анализа" : undefined} aria-hidden={!reduced}>
            {stages.map(({ title }, index) => reduced ? (
              <button key={title} type="button" aria-label={title} title={title} aria-pressed={index === selected}
                onClick={() => setSelected(index)}><span /></button>
            ) : (
              <span className="login-analysis-indicator" key={title}>
                <span className="login-analysis-layer" data-stage={index} style={stageTiming(index)} />
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="login-analysis-description">{productDescription}</p>
    </section>
  );
}
