import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import SplashScreen, { shouldShowSplashScreen } from "./components/SplashScreen";
import "./styles.css";

const app = <BrowserRouter><App /></BrowserRouter>;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {shouldShowSplashScreen() ? <SplashScreen>{app}</SplashScreen> : app}
  </StrictMode>,
);
