import { LogOut, Moon, Sun, UserRound } from "lucide-react";
import type { Theme } from "./Layout";
import { roles } from "./session";
import type { Session } from "./session";
import { PageHeading, PanelHeading } from "./ui";

export default function ProfilePage({ session, theme, onToggleTheme, onExitDemo }: {
  session: Session;
  theme: Theme;
  onToggleTheme: () => void;
  onExitDemo: () => void;
}) {
  return <>
    <PageHeading title="Профиль" description="Учётная запись и настройки интерфейса." />
    <div className="workspace profile-workspace">
      <section className="panel">
        <PanelHeading title="Учётная запись" />
        <div className="profile-person"><span className="stat-icon stat-low"><UserRound size={22} /></span>
          <div><h3>{session.name}</h3>{session.email && <p className="muted">{session.email}</p>}</div>
        </div>
        <dl className="details-list">
          <div><dt>Роль</dt><dd>{roles[session.role]}</dd></div>
          <div><dt>Тип сессии</dt><dd>{session.mode === "demo" ? "Демонстрационная" : "Рабочая"}</dd></div>
        </dl>
        {session.mode === "demo" && <button type="button" className="button secondary" onClick={onExitDemo}><LogOut size={15} />Завершить демосессию</button>}
      </section>
      <section className="panel">
        <PanelHeading title="Оформление" />
        <div className="segmented profile-theme" role="group" aria-label="Цветовая тема">
          <button type="button" aria-pressed={theme === "dark"} onClick={() => theme !== "dark" && onToggleTheme()}><Moon size={15} />Тёмная</button>
          <button type="button" aria-pressed={theme === "light"} onClick={() => theme !== "light" && onToggleTheme()}><Sun size={15} />Светлая</button>
        </div>
      </section>
    </div>
  </>;
}
