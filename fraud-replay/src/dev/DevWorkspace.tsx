import { AuditPage } from "../Administration";
import type { AuditEvent } from "../Administration";
import { downloadBlob } from "../api";
import { roles } from "../session";
import type { Role } from "../session";
import { useTheme } from "../theme";
import { PageHeading, PanelHeading } from "../ui";
import Workspace from "../Workspace";
import type { WorkspaceServices } from "../Workspace";
import { devCsv, devDataset, devProfiles } from "./fixtures";

const csv = devCsv();
const services: WorkspaceServices = {
  async loadDataset(signal) {
    signal.throwIfAborted();
    return devDataset;
  },
  async analyze(file, signal, onQueued) {
    if (file.size > 1024 * 1024 || (await file.text()).replace(/\r\n/g, "\n").trimEnd() !== csv) {
      throw new Error("Для локальной проверки загрузите CSV из кнопки «Скачать пример».");
    }
    signal.throwIfAborted();
    onQueued();
    return devDataset;
  },
  async downloadReport(item) {
    const rows = [
      "case_id,risk_score,risk_level,transactions",
      `${item.case_id},${item.risk_score},${item.risk_level},${item.transaction_ids.length}`,
    ];
    downloadBlob(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }), `local-${item.case_id}.csv`);
  },
  exampleUrl: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
  reportFormat: "CSV",
};

const events: AuditEvent[] = [
  { id: "local-audit-1", action: "auth.login", resource_type: "session", resource_id: "local-test", created_at: "2026-11-21T09:00:00Z" },
  { id: "local-audit-2", action: "dataset.upload", resource_type: "dataset", resource_id: devDataset.dataset_id, created_at: "2026-11-21T08:45:00Z" },
];

async function loadEvents(signal: AbortSignal) {
  signal.throwIfAborted();
  return events;
}

function DevEmployeesPage() {
  return <>
    <PageHeading title="Сотрудники" description="Тестовые учётные записи." />
    <section className="panel data-panel">
      <PanelHeading title="Учётные записи" />
      <div className="table-wrapper" role="region" aria-label="Таблица сотрудников" tabIndex={0}>
        <table><thead><tr><th scope="col">Сотрудник</th><th scope="col">Почта</th><th scope="col">Роль</th></tr></thead>
          <tbody>{Object.values(devProfiles).map((profile) => <tr key={profile.role}>
            <th scope="row">{profile.name}</th><td>{profile.email}</td><td>{roles[profile.role]}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </>;
}

export default function DevWorkspace({ role }: { role: Role }) {
  const { theme, onToggleTheme } = useTheme();
  return <Workspace session={devProfiles[role]} theme={theme} onToggleTheme={onToggleTheme}
    onLogout={() => window.location.replace("/login")} label="Локальный тест" services={services}
    employees={<DevEmployeesPage />} audit={<AuditPage loadEvents={loadEvents} />} />;
}
