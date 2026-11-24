import { ArrowLeft, Search } from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { AuditPage, EmployeesPage } from "./Administration";
import type { AuditEvent, Employee } from "./Administration";
import { errorMessage, RequestError, request, riskLabels } from "./api";
import type { Dataset } from "./api";
import CaseList from "./CaseList";
import { demoDataset, demoEmployees, demoProfiles } from "./demo";
import Layout from "./Layout";
import type { Theme } from "./Layout";
import LoginPage from "./LoginPage";
import { linkTo, navigation, pagesByRole } from "./navigation";
import type { Page } from "./navigation";
import ProfilePage from "./ProfilePage";
import ReportsPage from "./ReportsPage";
import { loadSession, roles } from "./session";
import type { Role, Session } from "./session";
import TransactionsPage from "./TransactionsPage";
import { PageHeading, PanelHeading, StateMessage } from "./ui";
import UploadPage from "./UploadPage";
import "./App.css";

const Dashboard = lazy(() => import("./Dashboard"));
const InvestigationPage = lazy(() => import("./InvestigationPage"));
const themeKey = "fraud-replay:theme";
const demoKey = "fraud-replay:demo-role";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function currentHash() {
  return window.location.hash;
}

function readDemoRole(): Role | null {
  try {
    const stored = sessionStorage.getItem(demoKey);
    if (stored && Object.hasOwn(roles, stored)) return stored as Role;
  } catch { /* Browser storage is optional. */ }
  return null;
}

function readTheme(): Theme {
  try {
    if (localStorage.getItem(themeKey) === "light") return "light";
  } catch { /* The default theme remains available. */ }
  return "dark";
}

function decode(value?: string) {
  try { return value && decodeURIComponent(value); }
  catch { return value; }
}

function InvestigationsList({ dataset }: { dataset: Dataset }) {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const query = search.trim().toLowerCase();
  const cases = dataset.cases.filter((item) =>
    (!level || item.risk_level === level) && [item.case_id, ...item.reasons].some((field) => field.toLowerCase().includes(query)));
  return <>
    <PageHeading title="Расследования" description="Кейсы и связанные операции в активном наборе." />
    <section className="panel data-panel">
      <PanelHeading title="Список расследований" description={`${cases.length} из ${dataset.cases.length} кейсов`} />
      <div className="toolbar filters">
        <label className="search-field"><span className="sr-only">Поиск расследований</span><Search size={16} aria-hidden="true" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Кейс или сигнал риска" />
        </label>
        <label><span className="sr-only">Уровень риска</span><select value={level} onChange={(event) => setLevel(event.target.value)}>
          <option value="">Все уровни риска</option>
          {Object.entries(riskLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </div>
      <CaseList cases={cases} transactions={dataset.transactions} />
    </section>
  </>;
}

function Workspace({ session, theme, onToggleTheme, onExitDemo }: {
  session: Session;
  theme: Theme;
  onToggleTheme: () => void;
  onExitDemo: () => void;
}) {
  const hash = useSyncExternalStore(subscribe, currentHash);
  const [path, query] = hash.replace(/^#\/?/, "").split("?", 2);
  const [segment, rawCaseId] = path.split("/");
  const caseId = decode(rawCaseId);
  const requested = (segment || "dashboard") as Page;
  const page = Object.hasOwn(navigation, requested) ? requested : null;
  const allowed = pagesByRole[session.role];
  const demo = session.mode === "demo";
  const [dataset, setDataset] = useState<Dataset | null>(demo ? demoDataset : null);
  const [loadingError, setLoadingError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [employees, setEmployees] = useState(() => demo && session.role === "admin" ? demoEmployees : []);
  const [events, setEvents] = useState<AuditEvent[]>(() => demo && session.role === "admin" ? [{
    id: 1, timestamp: new Date().toISOString(), actor: session.name, action: "Вход в демосессию", subject: roles[session.role],
  }] : []);
  const datasetVersion = useRef(0);
  const activeCase = caseId ? dataset?.cases.find((item) => item.case_id === caseId) : undefined;

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    const version = datasetVersion.current;
    request<Dataset>("/api/datasets/current", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted && version === datasetVersion.current) setDataset(result); })
      .catch((error) => { if (!controller.signal.aborted && version === datasetVersion.current) setLoadingError(errorMessage(error)); });
    return () => controller.abort();
  }, [attempt, demo]);

  function recordDemoAction(action: string, subject: string) {
    setEvents((current) => [{
      id: (current[0]?.id ?? 0) + 1, action, subject,
      actor: session.name, timestamp: new Date().toISOString(),
    }, ...current]);
  }

  function updateEmployee(employee: Employee) {
    if (!demo || session.role !== "admin") return;
    const previous = employees.find((item) => item.id === employee.id);
    if (!previous || previous.id === "admin") return;
    setEmployees((current) => current.map((item) => item.id === employee.id ? employee : item));
    const action = previous.role !== employee.role ? `Роль изменена на ${roles[employee.role]}`
      : employee.active ? "Доступ активирован" : "Доступ приостановлен";
    recordDemoAction(action, employee.name);
  }

  function updateDataset(result: Dataset) {
    datasetVersion.current += 1;
    setDataset(result);
    setLoadingError("");
    if (demo && session.role === "admin") recordDemoAction("Выполнен анализ примера", result.source);
  }

  function content() {
    if (!page || !allowed.includes(page)) return <>
      <PageHeading title={page ? "Раздел недоступен" : "Страница не найдена"} />
      <div className="panel">
        <StateMessage title={page ? "У вашей роли нет доступа к этому разделу." : "Проверьте адрес страницы."}>
          <a className="button secondary" href={linkTo("dashboard")}>К обзору</a>
        </StateMessage>
      </div>
    </>;

    if (page === "profile") return <ProfilePage session={session} theme={theme} onToggleTheme={onToggleTheme} onExitDemo={onExitDemo} />;
    if (page === "employees") return <EmployeesPage employees={demo ? employees : undefined} onUpdate={updateEmployee} />;
    if (page === "audit") return <AuditPage events={demo ? events : undefined} />;
    if (page === "upload") return <UploadPage demo={demo} onDataset={updateDataset} />;
    if (!dataset) return <>
      <PageHeading title={navigation[page].label} />
      <div className="panel">
        {loadingError ? <StateMessage title="Не удалось загрузить набор" detail={loadingError} error>
          <button className="button secondary" type="button" onClick={() => { setLoadingError(""); setAttempt(attempt + 1); }}>Повторить</button>
        </StateMessage> : <StateMessage title="Загружаем транзакции…" busy />}
      </div>
    </>;

    if (page === "dashboard") return <Dashboard dataset={dataset} name={session.name} allowed={allowed} />;
    if (page === "transactions") {
      const initialId = new URLSearchParams(query).get("tx") ?? "";
      return <TransactionsPage key={`${dataset.dataset_id}-${initialId}`} dataset={dataset} initialId={initialId} />;
    }
    if (page === "reports") return <ReportsPage key={dataset.dataset_id} dataset={dataset} demo={demo} />;
    if (page === "investigation" && !caseId) return <InvestigationsList dataset={dataset} />;

    const investigation = caseId ? activeCase : dataset.cases[0];
    return <>
      <PageHeading title={page === "investigation" ? "Детали расследования" : navigation[page].label}
        description={page === "graph" ? "Связи между счетами в выбранном расследовании."
          : page === "replay" ? "Последовательность событий и движение средств." : undefined}>
        <a className="button secondary" href={linkTo("investigation")}><ArrowLeft size={15} />К списку</a>
      </PageHeading>
      {investigation
        ? <InvestigationPage key={`${dataset.dataset_id}-${investigation.case_id}-${page}`} dataset={dataset}
          investigation={investigation} page={page} readOnly={session.role === "viewer"} demo={demo} />
        : <section className="panel"><StateMessage title={caseId ? "Расследование не найдено" : "Расследований пока нет"}
          detail={caseId ? "Кейс отсутствует в активном наборе." : "Для просмотра требуется расследование с операциями."} /></section>}
    </>;
  }

  return <Layout page={page && allowed.includes(page) ? page : "dashboard"} activeCaseId={activeCase?.case_id} session={session} dataset={dataset}
    theme={theme} onToggleTheme={onToggleTheme}>
    <Suspense fallback={<div className="panel"><StateMessage title="Загружаем раздел…" busy /></div>}>{content()}</Suspense>
  </Layout>;
}

type SessionStatus = { state: "loading" } | { state: "ready"; session: Session } | { state: "unavailable"; detail: string };

function sessionMessage(error: unknown) {
  if (error instanceof RequestError && (error.status === 401 || error.status === 403)) return "Рабочая сессия не найдена. Войдите через систему вашей команды.";
  if (error instanceof RequestError && error.status === 404) return "Сервис авторизации пока не подключён.";
  if (error instanceof SyntaxError) return "Сервис авторизации не вернул данные сессии.";
  return errorMessage(error);
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [demoRole, setDemoRole] = useState<Role | null>(readDemoRole);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(themeKey, theme); } catch { /* The theme still applies to this view. */ }
  }, [theme]);

  useEffect(() => {
    if (demoRole) return;
    const controller = new AbortController();
    loadSession(controller.signal)
      .then((session) => { if (!controller.signal.aborted) setSessionStatus({ state: "ready", session }); })
      .catch((error) => { if (!controller.signal.aborted) setSessionStatus({ state: "unavailable", detail: sessionMessage(error) }); });
    return () => controller.abort();
  }, [attempt, demoRole]);

  function onToggleTheme() {
    setTheme((current) => current === "dark" ? "light" : "dark");
  }

  function retrySession() {
    setSessionStatus({ state: "loading" });
    setAttempt((current) => current + 1);
  }

  function enterDemo(role: Role) {
    try { sessionStorage.setItem(demoKey, role); } catch { /* Demo mode can run without storage. */ }
    window.location.hash = linkTo("dashboard");
    setDemoRole(role);
  }

  function exitDemo() {
    try { sessionStorage.removeItem(demoKey); } catch { /* The current demo session still ends. */ }
    window.location.hash = linkTo("dashboard");
    setDemoRole(null);
    retrySession();
  }

  const session = demoRole ? demoProfiles[demoRole] : sessionStatus.state === "ready" ? sessionStatus.session : null;
  return session
    ? <Workspace key={`${session.mode}-${session.role}`} session={session} theme={theme} onToggleTheme={onToggleTheme} onExitDemo={exitDemo} />
    : <LoginPage theme={theme} onToggleTheme={onToggleTheme} busy={sessionStatus.state === "loading"}
      detail={sessionStatus.state === "unavailable" ? sessionStatus.detail : undefined} onRetry={retrySession} onDemo={enterDemo} />;
}
