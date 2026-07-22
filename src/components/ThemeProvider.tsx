"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";

type Theme = "light";

const ThemeContext = createContext<{ theme: Theme; mounted: boolean } | null>(null);

// Dark mode has been retired — the app is light-only. This provider still
// sets data-theme/color-scheme (some `dark:` utility classes remain in
// markup but can never match) and clears any stale "dark" value a
// previously-toggled browser may have left in localStorage.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    localStorage.removeItem("theme");
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.colorScheme = "light";
    setMounted(true);
  }, []);

  return <ThemeContext.Provider value={{ theme: "light", mounted }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
