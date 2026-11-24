import { useEffect, useState, useSyncExternalStore } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { clearAccessToken, getAccessToken, saveAccessToken, subscribeToAccessToken } from "./accessToken";
import type { AccessToken } from "./accessToken";
import { downloadCaseReport, errorMessage, RequestError, simulateBlock } from "./api";
import { loadLatestDataset, uploadAndAnalyze } from "./datasets";
import LoginPage from "./LoginPage";
import { linkTo, navigation } from "./navigation";
import { authenticate, loadSession, revokeSession } from "./session";
import type { LoginDetails, Session } from "./session";
import { useTheme } from "./theme";
import Workspace from "./Workspace";
import type { WorkspaceServices } from "./Workspace";

const services: WorkspaceServices = {
  loadDataset: loadLatestDataset,
  analyze: uploadAndAnalyze,
  downloadReport: downloadCaseReport,
  simulate: simulateBlock,
};

type SessionCheck = { access: AccessToken; session: Session } | { access: AccessToken; error: string };

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, onToggleTheme } = useTheme();
  const access = useSyncExternalStore(subscribeToAccessToken, getAccessToken);
  const [verified, setVerified] = useState<SessionCheck | null>(null);
  const [notice, setNotice] = useState("");
  const checking = access !== null && verified?.access !== access;

  useEffect(() => {
    if (!access || !checking) return;
    const controller = new AbortController();
    loadSession(access.value, controller.signal)
      .then((session) => { if (!controller.signal.aborted) setVerified({ access, session }); })
      .catch((error) => { if (!controller.signal.aborted) setVerified({ access, error: errorMessage(error) }); });
    return () => controller.abort();
  }, [access, checking]);

  useEffect(() => {
    if (!access) return;
    const timer = window.setTimeout(() => clearAccessToken(access.value), Math.max(0, access.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [access]);

  async function login(details: LoginDetails) {
    setNotice("");
    const next = await authenticate(details);
    try {
      const session = await loadSession(next.value);
      setVerified({ access: next, session });
      saveAccessToken(next);
      void navigate(linkTo("dashboard"), { replace: true });
    } catch (error) {
      void revokeSession(next.value).catch(() => { /* An unaccepted token was never stored. */ });
      throw error;
    }
  }

  function logout() {
    if (!access) return;
    clearAccessToken(access.value);
    setVerified(null);
    void navigate("/login", { replace: true });
    void revokeSession(access.value).catch((error) => {
      if (!getAccessToken() && !(error instanceof RequestError && error.status === 401)) {
        setNotice("Вы вышли из приложения. Сервер не подтвердил отзыв сессии.");
      }
    });
  }

  const session = access && verified?.access === access && "session" in verified ? verified.session : null;
  const isLogin = location.pathname === "/login";
  const isRegistration = location.pathname === "/register";

  if (!session) {
    if (!isLogin && !isRegistration && !checking) return <Navigate to="/login" replace />;
    const page = isRegistration ? "register" : "login";
    const checkError = access && verified?.access === access && "error" in verified ? verified.error : "";
    return <LoginPage key={page} page={page} theme={theme} onToggleTheme={onToggleTheme} checking={checking}
      notice={notice || checkError} onLogin={login} />;
  }

  if (location.pathname === "/") {
    const legacy = location.hash.slice(1);
    const legacySection = legacy.split(/[/?]/)[1];
    const target = legacy.startsWith("/") && Object.hasOwn(navigation, legacySection) ? legacy : linkTo("dashboard");
    return <Navigate to={target} replace />;
  }
  if (isLogin || isRegistration) return <Navigate to={linkTo("dashboard")} replace />;
  return <Workspace key={session.role} session={session} theme={theme} onToggleTheme={onToggleTheme} onLogout={logout} services={services} />;
}
