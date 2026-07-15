"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void; mounted: boolean } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // useLayoutEffect runs synchronously before the browser paints, so the
  // resolved theme applies before the user ever sees a frame — no flash,
  // and no <script> tag (React 19 won't execute one on a client-only
  // render, e.g. Fast Refresh or any future client-side remount).
  useLayoutEffect(() => {
    const stored = localStorage.getItem("theme") === "dark" ? "dark" : "light";
    document.getElementById("theme-root")?.setAttribute("data-theme", stored);
    setThemeState(stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) document.getElementById("theme-root")?.setAttribute("data-theme", theme);
  }, [theme, mounted]);

  function toggleTheme() {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      return next;
    });
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme, mounted }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
