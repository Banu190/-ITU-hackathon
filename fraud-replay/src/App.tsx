import { FlaskConical, FolderSearch, LayoutGrid, Play, Shield, UploadCloud } from "lucide-react";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router";
import { BreadcrumbDivider, Toast } from "./components/UI";
import InvestigationDetails, { NotFound } from "./pages/InvestigationDetails";
import Investigations from "./pages/Investigations";
import Replay from "./pages/Replay";
import Upload from "./pages/Upload";

const Dashboard = lazy(() => import("./pages/Dashboard"));

const menu = [
  { to: "/", label: "Обзор", icon: LayoutGrid },
  { to: "/upload", label: "Загрузка CSV", icon: UploadCloud },
  { to: "/investigations", label: "Расследования", icon: FolderSearch },
  { to: "/replay", label: "Replay", icon: Play },
];

export default function App() {
  const location = useLocation();
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const notify = useCallback((message: string) => setToast({ message }), []);
  const reduced = useReducedMotion();
  const [section, caseId] = location.pathname.split("/").slice(1);
  const sectionLabel = menu.find((entry) => entry.to === `/${section}`)?.label;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2 }}>
      <div className="shell">
        <aside className="sidebar">
          <Link to="/" className="wordmark">
            <span className="brand-icon"><Shield size={23} strokeWidth={2.2} /></span>
            <span><strong>Fraud Replay</strong><small>Расследования</small></span>
          </Link>
          <nav aria-label="Основное меню">
            {menu.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} className="nav-link" to={to} end={to === "/"}><Icon size={19} />{label}</NavLink>
            ))}
          </nav>
        </aside>
        <main className="main">
          <div className="topbar">
            <nav className="breadcrumbs" aria-label="Путь к странице">
              {section ? <Link to="/">Обзор</Link> : <span aria-current="page"><LayoutGrid size={16} /> Обзор</span>}
              {section && <><BreadcrumbDivider />{caseId && sectionLabel
                ? <Link to={`/${section}`}>{sectionLabel}</Link>
                : <span aria-current="page">{sectionLabel ?? "Страница"}</span>}</>}
              {caseId && <><BreadcrumbDivider /><span aria-current="page">{caseId}</span></>}
            </nav>
            <span className="demo-pill"><FlaskConical size={15} /> Деморежим</span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div className="page" key={location.pathname}
              initial={{ opacity: 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Routes location={location}>
                <Route path="/" element={
                  <Suspense fallback={<p className="muted" role="status">Загрузка обзора…</p>}><Dashboard /></Suspense>
                } />
                <Route path="/upload" element={<Upload notify={notify} />} />
                <Route path="/investigations" element={<Investigations />} />
                <Route path="/investigations/:caseId" element={<InvestigationDetails notify={notify} />} />
                <Route path="/replay/:caseId?" element={<Replay />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
        <AnimatePresence>{toast && <Toast message={toast.message} onClose={() => setToast(null)} />}</AnimatePresence>
      </div>
    </MotionConfig>
  );
}
