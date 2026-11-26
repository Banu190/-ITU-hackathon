import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { errorMessage, formatDate, request } from "./api";
import { PageHeading, PanelHeading, StateMessage } from "./ui";

export type AuditEvent = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
};

type EmployeeRole = "organization_admin" | "fraud_analyst" | "read_only_viewer";
type Employee = { id: string; email: string; display_name: string; is_active: boolean; role: EmployeeRole; created_at: string };
const roleNames: Record<EmployeeRole, string> = {
  organization_admin: "Admin", fraud_analyst: "Fraud Analyst", read_only_viewer: "Viewer",
};

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [self, setSelf] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<EmployeeRole>("fraud_analyst");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const profile = await request<{ id: string }>("/auth/me", { signal: controller.signal });
        const items: Employee[] = [];
        while (true) {
          const page = await request<Employee[]>(`/admin/users?limit=100&offset=${items.length}`, { signal: controller.signal });
          items.push(...page);
          if (page.length < 100) break;
        }
        if (!controller.signal.aborted) { setSelf(profile.id); setEmployees(items); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request<Employee>("/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name.trim(), email: email.trim(), password, role }),
      });
      setName(""); setEmail(""); setPassword("");
      setNotice("Учётная запись создана."); setAttempt(value => value + 1);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function disable(item: Employee) {
    if (busy || item.id === self || !item.is_active) return;
    if (!window.confirm(`Деактивировать ${item.display_name}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request<void>(`/admin/users/${encodeURIComponent(item.id)}/disable`, { method: "PATCH" });
      setNotice("Учётная запись деактивирована."); setAttempt(value => value + 1);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeading title="Сотрудники" description="Управление пользователями и ролями." />
    <section className="panel data-panel">
      <PanelHeading title="Добавить сотрудника" />
      <form onSubmit={event => void create(event)} style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "end", padding: "12px" }}>
        <label>Имя<input required minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Почта<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Пароль<input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>Роль<select value={role} onChange={event => setRole(event.target.value as EmployeeRole)}>{Object.entries(roleNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="button" type="submit" disabled={busy}>Создать</button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    <section className="panel data-panel">
      <PanelHeading title="Учётные записи"><button className="button secondary" type="button" disabled={busy} onClick={() => { setError(""); setAttempt(value => value + 1); }}>Обновить</button></PanelHeading>
      {!employees ? <StateMessage title={error ? "Не удалось загрузить сотрудников" : "Загрузка…"} detail={error || undefined} /> :
        !employees.length ? <StateMessage title="Нет сотрудников" /> :
        <div className="table-wrapper" role="region" aria-label="Список сотрудников" tabIndex={0}>
          <table><thead><tr><th>Имя</th><th>Почта</th><th>Роль</th><th>Статус</th><th>Действие</th></tr></thead>
            <tbody>{employees.map(item => <tr key={item.id}>
              <th scope="row">{item.display_name}</th><td>{item.email}</td><td>{roleNames[item.role]}</td><td>{item.is_active ? "Активен" : "Отключён"}</td>
              <td>{item.id === self ? "Текущий аккаунт" : item.is_active ? <button className="button secondary" type="button" disabled={busy} onClick={() => void disable(item)}>Деактивировать</button> : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
  </>;
}

const loadAuditEvents = (signal: AbortSignal) => request<AuditEvent[]>("/admin/audit-events", { signal });

export function AuditPage({ loadEvents = loadAuditEvents }: { loadEvents?: (signal: AbortSignal) => Promise<AuditEvent[]> }) {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadEvents(controller.signal)
      .then((result) => { if (!controller.signal.aborted) setEvents(result); })
      .catch((failure) => { if (!controller.signal.aborted) setError(errorMessage(failure)); });
    return () => controller.abort();
  }, [attempt, loadEvents]);

  const filter = query.trim().toLowerCase();
  const filtered = events?.filter((item) =>
    [item.action, item.resource_type, item.resource_id ?? ""].some((value) => value.toLowerCase().includes(filter)));

  return <>
    <PageHeading title="Аудит" description="Последние действия в организации." />
    <section className="panel data-panel">
      <PanelHeading title="События">
        {events && <label className="search-field"><span className="sr-only">Поиск события</span><Search size={16} aria-hidden="true" />
          <input value={query} type="search" onChange={(event) => setQuery(event.target.value)} placeholder="Объект или действие" />
        </label>}
      </PanelHeading>
      {error ? <StateMessage title="Не удалось загрузить журнал аудита" detail={error} error>
        <button className="button secondary" type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Повторить</button>
      </StateMessage> : !filtered ? <StateMessage title="Загружаем журнал…" busy />
        : !filtered.length ? <StateMessage title="События не найдены" />
        : <div className="table-wrapper" role="region" aria-label="Журнал аудита" tabIndex={0}>
          <table><thead><tr><th scope="col">Время · UTC+05</th><th scope="col">Действие</th><th scope="col">Тип объекта</th><th scope="col">Идентификатор</th></tr></thead>
            <tbody>{filtered.map((item) => <tr key={item.id}>
              <td className="muted">{formatDate(item.created_at)}</td><th scope="row">{item.action}</th>
              <td>{item.resource_type}</td><td>{item.resource_id ?? "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
  </>;
}
