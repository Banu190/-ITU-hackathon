import { useLayoutEffect, useState } from "react";
import type { Theme } from "./Layout";

const themeKey = "fraud-replay:theme";

function readTheme(): Theme {
  try {
    if (localStorage.getItem(themeKey) === "light") return "light";
  } catch { /* The default theme remains available. */ }
  return "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(themeKey, theme); } catch { /* The theme still applies to this view. */ }
  }, [theme]);

  return { theme, onToggleTheme: () => setTheme((current) => current === "dark" ? "light" : "dark") };
}
