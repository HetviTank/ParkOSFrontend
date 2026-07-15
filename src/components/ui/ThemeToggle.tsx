"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();
  const isDark = mounted && theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/70 hover:bg-white border border-white/60 shadow-sm transition dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:border-slate-700/60 shrink-0"
    >
      {isDark ? (
        <Sun className="w-[18px] h-[18px] text-amber-500" />
      ) : (
        <Moon className="w-[18px] h-[18px] text-indigo-600 dark:text-indigo-300" />
      )}
    </button>
  );
}
