import { Bell, ChevronDown, Menu, Moon, PanelLeftClose, ShieldCheck, Sun, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Dataset } from "./api";
import { linkTo, navigation, pagesByRole } from "./navigation";
import type { Page } from "./navigation";
import { roles } from "./session";
import type { Session } from "./session";

export type Theme = "dark" | "light";

export function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const label = theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
  const Icon = theme === "dark" ? Sun : Moon;
  return <button className="icon-button" type="button" onClick={onToggle} aria-label={label} title={label}>
    <Icon size={18} aria-hidden="true" />
  </button>;
}

export function Brand() {
  return <span className="brand"><span className="brand-mark"><ShieldCheck size={18} aria-hidden="true" /></span>Fraud Replay</span>;
}

function Avatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className="avatar" aria-hidden="true">{initials || <UserRound size={16} />}</span>;
}

export default function Layout({ page, activeCaseId, session, dataset, theme, onToggleTheme, children }: {
  page: Page;
  activeCaseId?: string;
  session: Session;
  dataset: Dataset | null;
  theme: Theme;
  onToggleTheme: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<"notifications" | "profile" | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  const highRiskCases = dataset?.cases.filter((item) => item.risk_level === "high") ?? [];
  const allowed = pagesByRole[session.role];

  function closeMobileNavigation() {
    if (expanded && window.matchMedia("(max-width: 760px)").matches) setExpanded(false);
  }

  useEffect(() => {
    if (!panel) return;
    function dismiss(event: PointerEvent) {
      if (!controls.current?.contains(event.target as Node)) setPanel(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      controls.current?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus();
      setPanel(null);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [panel]);

  return <div className={`app ${expanded ? "nav-expanded" : ""}`}>
    <a className="skip-link" href="#workspace" onClick={(event) => {
      event.preventDefault();
      document.getElementById("workspace")?.focus();
    }}>К содержимому</a>
    <header className="topbar">
      <div className="header-brand">
        <button className="icon-button nav-toggle" type="button" onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Свернуть навигацию" : "Развернуть навигацию"} aria-expanded={expanded}>
          {expanded ? <PanelLeftClose size={18} /> : <Menu size={18} />}
        </button>
        <a href={linkTo("dashboard")} aria-label="Fraud Replay, главная"><Brand /></a>
      </div>
      <div className="header-controls" ref={controls}>
        {session.mode === "demo" && <span className="mode"><i />Демо</span>}
        <ThemeButton theme={theme} onToggle={onToggleTheme} />
        <div className="header-control">
          <button type="button" className="icon-button notification-button" aria-label="Уведомления"
            aria-expanded={panel === "notifications"} onClick={() => setPanel(panel === "notifications" ? null : "notifications")}>
            <Bell size={18} aria-hidden="true" />{highRiskCases.length > 0 && <i aria-hidden="true" />}
          </button>
          {panel === "notifications" && <div className="header-popover">
            <div className="popover-heading"><h2>Уведомления</h2>
              <button type="button" className="icon-button small" aria-label="Закрыть уведомления" onClick={() => setPanel(null)}><X size={16} /></button>
            </div>
            {highRiskCases.length ? <>
              <p>Расследования с высоким риском</p>
              {highRiskCases.slice(-4).reverse().map((item) => <a key={item.case_id} className="popover-row"
                href={linkTo("investigation", item.case_id)} onClick={() => setPanel(null)}>
                <span>{item.case_id}</span><strong className="risk-text-high">{item.risk_score} / 100</strong>
              </a>)}
            </> : <p>Новых сигналов высокого риска нет.</p>}
          </div>}
        </div>
        <div className="header-control">
          <button type="button" className="profile-trigger" aria-label="Меню профиля" aria-expanded={panel === "profile"}
            onClick={() => setPanel(panel === "profile" ? null : "profile")}>
            <Avatar name={session.name} /><ChevronDown className="profile-chevron" size={13} aria-hidden="true" />
          </button>
          {panel === "profile" && <div className="header-popover profile-popover">
            <div className="popover-account"><strong>{session.name}</strong><span>{roles[session.role]}</span></div>
            <a className="popover-row" href={linkTo("profile")} onClick={() => setPanel(null)}><span>Открыть профиль</span><UserRound size={15} /></a>
          </div>}
        </div>
      </div>
    </header>
    <aside className="sidebar">
      <nav aria-label="Главная навигация">
        {allowed.filter((key) => key !== "profile").map((key) => {
          const { label, icon: Icon } = navigation[key];
          const caseId = key === "graph" || key === "replay" ? activeCaseId : undefined;
          return <a key={key} href={linkTo(key, caseId)} className={key === "employees" ? "nav-split" : undefined} onClick={closeMobileNavigation}
            aria-current={key === page ? "page" : undefined} aria-label={label} title={label}>
            <Icon size={18} aria-hidden="true" /><span>{label}</span>
          </a>;
        })}
      </nav>
      <nav className="sidebar-bottom" aria-label="Профиль">
        <a href={linkTo("profile")} aria-current={page === "profile" ? "page" : undefined} onClick={closeMobileNavigation}
          aria-label="Профиль" title="Профиль"><UserRound size={18} aria-hidden="true" /><span>Профиль</span></a>
      </nav>
    </aside>
    <main className="main" id="workspace" tabIndex={-1}>{children}</main>
  </div>;
}
