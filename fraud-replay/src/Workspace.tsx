import { ArrowLeft, Search } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { AuditPage, EmployeesPage } from "./Administration";
import { errorMessage, riskLabels } from "./api";
import type { Dataset, Investigation, Simulation, Transfer } from "./api";
import CaseList from "./CaseList";
import Layout from "./Layout";
import type { Theme } from "./Layout";
import { linkTo, navigation, pagesByRole } from "./navigation";
import type { Page } from "./navigation";
import ProfilePage from "./ProfilePage";
import ReportsPage from "./ReportsPage";
import type { Session } from "./session";
import TransactionsPage from "./TransactionsPage";
import { PageHeading, PanelHeading, StateMessage } from "./ui";
import UploadPage from "./UploadPage";

const Dashboard = lazy(() => import("./Dashboard"));
const InvestigationPage = lazy(() => import("./InvestigationPage"));

export type WorkspaceServices = {
  loadDataset: (signal: AbortSignal) => Promise<Dataset>;
  analyze: (file: File, signal: AbortSignal, onQueued: () => void) => Promise<Dataset>;
  downloadReport: (investigation: Investigation) => Promise<void>;
  simulate?: (investigation: Investigation, transfer: Transfer) => Promise<Simulation>;
  exampleUrl?: string;
  reportFormat?: "PDF" | "CSV";
};

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

export default function Workspace({ session, theme, onToggleTheme, onLogout, services, label, employees, audit }: {
  session: Session;
  theme: Theme;
  onToggleTheme: () => void;
  onLogout: () => void;
  services: WorkspaceServices;
  label?: string;
  employees?: ReactNode;
  audit?: ReactNode;
}) {
  const { pathname, search } = useLocation();
  const [segment, rawCaseId] = pathname.split("/").slice(1);
  const caseId = decode(rawCaseId);
  const requested = (segment || "dashboard") as Page;
  const page = Object.hasOwn(navigation, requested) ? requested : null;
  const allowed = pagesByRole[session.role];
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const datasetVersion = useRef(0);
  const { loadDataset } = services;
  const activeCase = caseId ? dataset?.cases.find((item) => item.case_id === caseId) : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const version = datasetVersion.current;
    loadDataset(controller.signal)
      .then((result) => { if (!controller.signal.aborted && version === datasetVersion.current) setDataset(result); })
      .catch((error) => { if (!controller.signal.aborted && version === datasetVersion.current) setLoadingError(errorMessage(error)); });
    return () => controller.abort();
  }, [attempt, loadDataset]);

  function updateDataset(result: Dataset) {
    datasetVersion.current += 1;
    setDataset(result);
    setLoadingError("");
  }

  function content() {
    if (!page || !allowed.includes(page)) return <>
      <PageHeading title={page ? "Раздел недоступен" : "Страница не найдена"} />
      <div className="panel">
        <StateMessage title={page ? "У вашей роли нет доступа к этому разделу." : "Проверьте адрес страницы."}>
          <Link className="button secondary" to={linkTo("dashboard")}>К обзору</Link>
        </StateMessage>
      </div>
    </>;

    if (page === "profile") return <ProfilePage session={session} theme={theme} onToggleTheme={onToggleTheme} onLogout={onLogout} />;
    if (page === "employees") return employees ?? <EmployeesPage />;
    if (page === "audit") return audit ?? <AuditPage />;
    if (page === "upload") return <UploadPage onDataset={updateDataset} analyze={services.analyze} exampleUrl={services.exampleUrl} />;
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
      const initialId = new URLSearchParams(search).get("tx") ?? "";
      return <TransactionsPage key={`${dataset.dataset_id}-${initialId}`} dataset={dataset} initialId={initialId} />;
    }
    if (page === "reports") return <ReportsPage key={dataset.dataset_id} dataset={dataset} downloadReport={services.downloadReport} reportFormat={services.reportFormat} />;
    if (page === "investigation" && !caseId) return <InvestigationsList dataset={dataset} />;

    const investigation = caseId ? activeCase : dataset.cases[0];
    return <>
      <PageHeading title={page === "investigation" ? "Детали расследования" : navigation[page].label}
        description={page === "graph" ? "Связи между счетами в выбранном расследовании."
          : page === "replay" ? "Последовательность событий и движение средств." : undefined}>
        <Link className="button secondary" to={linkTo("investigation")}><ArrowLeft size={15} />К списку</Link>
      </PageHeading>
      {investigation
        ? <InvestigationPage key={`${dataset.dataset_id}-${investigation.case_id}-${page}`} dataset={dataset}
          investigation={investigation} page={page} readOnly={session.role === "viewer"} downloadReport={services.downloadReport}
          reportFormat={services.reportFormat} simulate={services.simulate} />
        : <section className="panel"><StateMessage title={caseId ? "Расследование не найдено" : "Расследований пока нет"}
          detail={caseId ? "Кейс отсутствует в активном наборе." : "Для просмотра требуется расследование с операциями."} /></section>}
    </>;
  }

  return <Layout page={page && allowed.includes(page) ? page : "dashboard"} activeCaseId={activeCase?.case_id} session={session} dataset={dataset}
    theme={theme} onToggleTheme={onToggleTheme} onLogout={onLogout} label={label}>
    <Suspense fallback={<div className="panel"><StateMessage title="Загружаем раздел…" busy /></div>}>{content()}</Suspense>
  </Layout>;
}
