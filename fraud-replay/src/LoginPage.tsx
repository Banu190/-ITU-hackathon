import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { errorMessage, RequestError } from "./api";
import { Brand, ThemeButton } from "./Layout";
import type { Theme } from "./Layout";
import LoginAnalysis from "./LoginAnalysis";
import type { LoginDetails } from "./session";
import { StateMessage } from "./ui";

type AuthPage = "login" | "register";

export default function LoginPage({ page, theme, onToggleTheme, checking, notice, onLogin }: {
  page: AuthPage;
  theme: Theme;
  onToggleTheme: () => void;
  checking?: boolean;
  notice?: string;
  onLogin: (details: LoginDetails) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const login = page === "login";
  const Icon = login ? KeyRound : ShieldCheck;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const organization = String(values.get("organization_slug") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      await onLogin({
        email: String(values.get("email") ?? "").trim(),
        password: String(values.get("password") ?? ""),
        ...(organization ? { organization_slug: organization } : {}),
      });
    } catch (failure) {
      setError(failure instanceof RequestError && failure.status === 401
        ? "Проверьте почту, пароль и организацию." : errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <div className="login">
    <header className="login-header"><Brand /><ThemeButton theme={theme} onToggle={onToggleTheme} /></header>
    <main className="login-main">
      <LoginAnalysis />
      <section className="panel login-panel" aria-labelledby="auth-title">
        <nav className="auth-switch" aria-label="Авторизация">
          <Link to="/login" aria-current={login ? "page" : undefined}>Вход</Link>
          <Link to="/register" aria-current={login ? undefined : "page"}>Регистрация</Link>
        </nav>
        <span className="login-key"><Icon size={21} aria-hidden="true" /></span>
        <h2 id="auth-title">{login ? "Вход в рабочую область" : "Регистрация"}</h2>
        {checking ? <StateMessage title="Проверяем рабочую сессию…" busy /> : login ? <>
          <p className="muted">Войдите с учётной записью вашей организации.</p>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>Рабочая почта
              <input name="email" type="email" autoComplete="username" required disabled={busy} />
            </label>
            <label>Пароль
              <input name="password" type="password" autoComplete="current-password" maxLength={256} required disabled={busy} />
            </label>
            <label>Код организации <span className="muted">при необходимости</span>
              <input name="organization_slug" autoCapitalize="none" minLength={2} maxLength={80} disabled={busy} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className="button" disabled={busy}>{busy ? "Входим…" : "Войти"}<ArrowRight size={15} aria-hidden="true" /></button>
          </form>
        </> : <div className="registration-info">
          <p className="muted">Учётную запись создаёт администратор вашей организации. Обратитесь к нему за доступом к Fraud Replay.</p>
          <Link className="button secondary" to="/login">Перейти ко входу <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>}
        {notice && <p className="login-status" role="status">{notice}</p>}
      </section>
    </main>
  </div>;
}
