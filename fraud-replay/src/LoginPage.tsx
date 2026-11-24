import { ArrowRight, KeyRound, RefreshCw } from "lucide-react";
import { Brand, ThemeButton } from "./Layout";
import type { Theme } from "./Layout";
import { roles } from "./session";
import type { Role } from "./session";
import { StateMessage } from "./ui";

export default function LoginPage({ theme, onToggleTheme, busy, detail, onRetry, onDemo }: {
  theme: Theme;
  onToggleTheme: () => void;
  busy: boolean;
  detail?: string;
  onRetry: () => void;
  onDemo: (role: Role) => void;
}) {
  return <div className="login">
    <header className="login-header"><Brand /><ThemeButton theme={theme} onToggle={onToggleTheme} /></header>
    <main className="login-main">
      <div className="login-intro">
        <h1>Fraud Replay</h1>
        <p>Рабочая область для анализа транзакций и расследования мошенничества.</p>
      </div>
      <section className="panel login-panel" aria-labelledby="login-title">
        <span className="login-key"><KeyRound size={21} aria-hidden="true" /></span>
        <h2 id="login-title">Вход в рабочую область</h2>
        <p className="muted">Для доступа используется рабочая сессия.</p>
        {busy ? <StateMessage title="Проверяем сессию…" busy /> : <>
          {detail && <p className="login-status" role="status">{detail}</p>}
          <button type="button" className="button login-retry" onClick={onRetry}><RefreshCw size={15} />Проверить сессию</button>
          <div className="demo-select">
            <h3>Демонстрационный доступ</h3>
            <p className="muted">Синтетические данные. Действия выполняются локально.</p>
            {(Object.keys(roles) as Role[]).map((role) => <button type="button" key={role} onClick={() => onDemo(role)}>
              <span>{roles[role]}</span><ArrowRight size={15} aria-hidden="true" />
            </button>)}
          </div>
        </>}
      </section>
    </main>
  </div>;
}
