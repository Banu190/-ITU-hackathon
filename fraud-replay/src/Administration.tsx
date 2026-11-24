import { Search } from "lucide-react";
import { useState } from "react";
import { formatDate } from "./api";
import { roles } from "./session";
import type { Role } from "./session";
import { PageHeading, PanelHeading, StateMessage } from "./ui";

export type Employee = { id: string; name: string; email: string; role: Role; active: boolean };
export type AuditEvent = { id: number; timestamp: string; actor: string; action: string; subject: string };

export function EmployeesPage({ employees, onUpdate }: { employees?: Employee[]; onUpdate: (employee: Employee) => void }) {
  const [query, setQuery] = useState("");
  const filtered = employees?.filter((person) => `${person.name} ${person.email} ${roles[person.role]}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <PageHeading title="Сотрудники" description={employees ? "Демонстрационный список. Изменения действуют до закрытия демосессии." : "Управление пользователями и ролями."} />
    <section className="panel data-panel">
      <PanelHeading title="Учётные записи">
        {employees && <label className="search-field"><span className="sr-only">Поиск сотрудника</span><Search size={16} />
          <input value={query} type="search" onChange={(event) => setQuery(event.target.value)} placeholder="Имя, почта или роль" />
        </label>}
      </PanelHeading>
      {!filtered ? <StateMessage title="Список сотрудников недоступен" detail="API управления сотрудниками ещё не подключён." />
        : !filtered.length ? <StateMessage title="Сотрудники не найдены" detail="Уточните запрос." />
        : <div className="table-wrapper" role="region" aria-label="Таблица сотрудников" tabIndex={0}>
          <table className="employee-table"><thead><tr><th scope="col">Сотрудник</th><th scope="col">Роль</th><th scope="col">Доступ</th><th scope="col">Действия</th></tr></thead>
            <tbody>{filtered.map((person) => <tr key={person.id}>
              <th scope="row"><div className="employee-name"><strong>{person.name}</strong><small>{person.email}</small></div></th>
              <td>{person.id === "admin" ? roles[person.role] : <select aria-label={`Роль сотрудника ${person.name}`} value={person.role}
                onChange={(event) => onUpdate({ ...person, role: event.target.value as Role })}>
                {(Object.keys(roles) as Role[]).map((role) => <option key={role} value={role}>{roles[role]}</option>)}
              </select>}</td>
              <td><span className={person.active ? "access-code enabled" : "access-code"}><i />{person.active ? "Активен" : "Приостановлен"}</span></td>
              <td>{person.id === "admin" ? <span className="muted">Текущий профиль</span>
                : <button type="button" className="button secondary compact-button" onClick={() => onUpdate({ ...person, active: !person.active })}>
                  {person.active ? "Приостановить" : "Активировать"}
                </button>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
  </>;
}

export function AuditPage({ events }: { events?: AuditEvent[] }) {
  const [query, setQuery] = useState("");
  const filtered = events?.filter((item) => `${item.actor} ${item.action} ${item.subject}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <PageHeading title="Аудит" description={events ? "Журнал действий в текущей демонстрационной сессии." : "История действий пользователей."} />
    <section className="panel data-panel">
      <PanelHeading title="События">
        {events && <label className="search-field"><span className="sr-only">Поиск события</span><Search size={16} />
          <input value={query} type="search" onChange={(event) => setQuery(event.target.value)} placeholder="Пользователь или действие" />
        </label>}
      </PanelHeading>
      {!filtered ? <StateMessage title="Журнал аудита недоступен" detail="API аудита ещё не подключён." />
        : !filtered.length ? <StateMessage title="События не найдены" />
        : <div className="table-wrapper" role="region" aria-label="Журнал аудита" tabIndex={0}>
          <table><thead><tr><th scope="col">Время · UTC+05</th><th scope="col">Пользователь</th><th scope="col">Действие</th><th scope="col">Объект</th></tr></thead>
            <tbody>{filtered.map((item) => <tr key={item.id}>
              <td className="muted">{formatDate(item.timestamp)}</td><th scope="row">{item.actor}</th><td>{item.action}</td><td>{item.subject}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
  </>;
}
