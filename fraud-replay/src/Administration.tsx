import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage, formatDate, request } from "./api";
import { PageHeading, PanelHeading, StateMessage } from "./ui";

export type AuditEvent = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
};

export function EmployeesPage() {
  return <>
    <PageHeading title="Сотрудники" description="Управление пользователями и ролями." />
    <section className="panel data-panel">
      <PanelHeading title="Учётные записи" />
      <StateMessage title="Список сотрудников недоступен" detail="Сервер пока не предоставляет список учётных записей." />
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
