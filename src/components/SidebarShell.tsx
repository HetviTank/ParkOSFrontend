"use client";

import { useState, useEffect } from "react";
import { Menu, Car } from "lucide-react";
import Sidebar from "./Sidebar";
import { ThemeProvider } from "./ThemeProvider";

function ShellInner({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Ambient background blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-20 w-96 h-96 rounded-full bg-indigo-300/20 dark:bg-indigo-500/10 blur-3xl animate-blob" />
        <div
          className="absolute top-1/3 -right-24 w-[26rem] h-[26rem] rounded-full bg-cyan-300/20 dark:bg-cyan-500/10 blur-3xl animate-blob"
          style={{ animationDelay: "3s" }}
        />
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <div
        className={`hidden md:flex flex-col shrink-0 h-screen sticky top-0 p-4 transition-[width] duration-300 ease-in-out ${
          collapsed ? "w-[100px]" : "w-72"
        }`}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </div>

      {/* Mobile sidebar (slide-in) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 p-3 transition-transform duration-300 ease-in-out md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setMobileOpen(false)} />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 md:hidden bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 py-3 shrink-0 sticky top-0 z-30 dark:bg-slate-900/80 dark:border-slate-800">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-600 to-cyan-500 rounded-lg flex items-center justify-center">
              <Car className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm dark:text-white">
              ParkOS <span className="text-indigo-600 dark:text-indigo-400">Admin</span>
            </span>
          </div>
        </div>

        {/* Scrollable page content */}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export default function SidebarShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ShellInner>{children}</ShellInner>
    </ThemeProvider>
  );
}
