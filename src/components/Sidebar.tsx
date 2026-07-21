"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  Car, LogOut, LogIn, ShieldCheck, Truck, Ban, BookOpen,
  Users, Bell, FileText, BarChart2, MapPin, Layers, Settings,
  ChevronRight, X, LayoutDashboard, UserCog, Shield, Menu,
} from "lucide-react";

// ── nav config ────────────────────────────────────────────────────────────────

interface NavChild { label: string; href: string }
interface NavItem {
  label: string; href: string; icon: React.ElementType;
  badge?: number; badgeColor?: "blue" | "red"; children?: NavChild[];
}
interface NavGroup { section: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    section: "OPERATIONS",
    items: [
      { label: "Dashboard",    href: "/dashboard",              icon: LayoutDashboard },
      { label: "Check-in",     href: "/dashboard/check-in",     icon: LogIn,      badge: 0, badgeColor: "blue" },
      { label: "Check-out",    href: "/dashboard/check-out",    icon: LogOut,     badge: 0, badgeColor: "blue" },
      { label: "Verification", href: "/dashboard/verification", icon: ShieldCheck, badge: 0, badgeColor: "red" },
    ],
  },
  {
    section: "RECORDS",
    items: [
      {
        label: "All Trucks", href: "/dashboard/trucks", icon: Truck,
        children: [{ label: "Truck Profile", href: "/dashboard/trucks/profile" }],
      },
      { label: "Blacklist",    href: "/dashboard/blacklist", icon: Ban,      badge: 0, badgeColor: "red"  },
      { label: "Khata Master", href: "/dashboard/khata",     icon: BookOpen, badge: 0, badgeColor: "blue" },
      { label: "Owners",       href: "/dashboard/owners",    icon: Users },
      { label: "Notices",      href: "/dashboard/notices",   icon: Bell, badge: 0, badgeColor: "red" },
    ],
  },
  {
    section: "FINANCE",
    items: [
      { label: "Billing", href: "/dashboard/billing", icon: FileText },
      { label: "Reports", href: "/dashboard/reports", icon: BarChart2 },
    ],
  },
  {
    section: "SETUP",
    items: [
      { label: "Locations",         href: "/dashboard/locations", icon: MapPin  },
      { label: "Divisions & Rates", href: "/dashboard/divisions", icon: Layers  },
      { label: "Settings",          href: "/dashboard/settings",  icon: Settings },
    ],
  },
  {
    section: "ADMINISTRATION",
    items: [
      { label: "Admin Users", href: "/dashboard/admin-users", icon: UserCog },
      { label: "Roles",       href: "/dashboard/roles",       icon: Shield  },
    ],
  },
];

// ── component ─────────────────────────────────────────────────────────────────

interface User { name: string; email: string; role: { name: string } }

export default function Sidebar({
  onClose,
  collapsed,
  onToggleCollapse,
}: {
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const rawPathname = usePathname();
  const router      = useRouter();
  // Direct navigation on the raw GCS test host (storage.googleapis.com/<bucket>/...)
  // requires an explicit "/index.html" and doesn't collapse a trailing slash,
  // so the browser's real pathname can be e.g. "/dashboard/index.html" or
  // "/dashboard/" instead of the clean "/dashboard" the nav config uses.
  const pathname = rawPathname.replace(/\/index\.html$/, "").replace(/(?!^)\/$/, "");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const s = localStorage.getItem("user");
    if (s) setUser(JSON.parse(s));
  }, []);

  function handleLogout() {
    localStorage.clear();
    router.replace("/login");
  }

  const c = collapsed ?? false;

  return (
    <aside className="h-full w-full flex flex-col rounded-[30px] bg-white/70 backdrop-blur-xl border border-white/60 shadow-xl shadow-indigo-900/5 overflow-hidden dark:bg-slate-900/60 dark:border-slate-800/70">

      {/* ── Logo + hamburger ── */}
      <div className={`flex items-center justify-between px-4 pt-5 pb-4 ${c ? "flex-col gap-3" : ""}`}>
        {!c && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 shrink-0">
              <Car className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <p className="font-extrabold text-gray-900 dark:text-white text-[15px] leading-tight tracking-tight">ParkOS</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-tight">Admin Panel</p>
            </div>
          </div>
        )}

        {c && (
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-indigo-900/40">
            <Car className="w-[18px] h-[18px] text-white" />
          </div>
        )}

        {/* hamburger / collapse toggle — desktop only */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={c ? "Expand sidebar" : "Collapse sidebar"}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition shrink-0 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition md:hidden dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Location chip ── */}
      {!c && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2.5 border border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20">
            <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
              <MapPin className="w-3 h-3 text-indigo-500 dark:text-indigo-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-indigo-400 dark:text-indigo-300/70 font-medium leading-none mb-0.5">Location</p>
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 truncate">North Gate</p>
            </div>
          </div>
        </div>
      )}

      {c && (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-center bg-indigo-50 rounded-xl p-2 border border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20" title="North Gate">
            <MapPin className="w-4 h-4 text-indigo-500 dark:text-indigo-300" />
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className={`flex-1 overflow-y-auto pb-4 space-y-4 scrollbar-none ${c ? "px-2" : "px-3"}`}>
        {NAV.map((group) => (
          <div key={group.section}>
            {/* Section header — hidden when collapsed */}
            {!c && (
              <p className="text-[10px] font-bold text-gray-400 dark:text-slate-600 uppercase tracking-[0.14em] px-2.5 mb-2">
                {group.section}
              </p>
            )}
            {c && <div className="border-t border-gray-100 dark:border-slate-800 mb-2 mt-1" />}

            <ul className="space-y-1">
              {group.items.map((item) => {
                const exact      = pathname === item.href;
                const starts     = item.href !== "/dashboard" && pathname.startsWith(item.href + "/");
                const childHit   = item.children?.some((ch) => pathname === ch.href) ?? false;
                const active     = (exact || starts) && !childHit;
                const parentHL   = active || childHit;

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      title={c ? item.label : undefined}
                      onClick={onClose}
                      className={`group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150 ${
                        c ? "justify-center px-0 py-3" : "px-3 py-2.5"
                      } ${
                        active
                          ? "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow-[0_0_20px_-4px_rgba(79,70,229,0.65)]"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                      }`}
                    >
                      <item.icon
                        className={`shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-6 ${c ? "w-5 h-5" : "w-[18px] h-[18px]"} ${
                          active ? "text-white" : "text-gray-400 group-hover:text-gray-600 dark:text-slate-500 dark:group-hover:text-slate-300"
                        }`}
                      />

                      <AnimatePresence initial={false}>
                        {!c && (
                          <motion.span
                            key="label-group"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex-1 min-w-0 flex items-center gap-2"
                          >
                            <span className="flex-1 truncate">{item.label}</span>

                            {!!item.badge && item.badge > 0 && (
                              <span className={`text-[11px] font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5 ${
                                active
                                  ? "bg-white/25 text-white"
                                  : item.badgeColor === "red"
                                  ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                                  : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
                              }`}>
                                {item.badge}
                              </span>
                            )}

                            {item.children && (
                              <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                                parentHL ? "rotate-90" : ""
                              } ${active ? "text-white/50" : "text-gray-300 dark:text-slate-600"}`} />
                            )}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Link>

                    {/* Sub-items — only when expanded */}
                    {!c && item.children && (
                      <ul className="mt-0.5 ml-3.5 pl-3.5 border-l-2 border-gray-100 dark:border-slate-800 space-y-0.5 py-0.5">
                        {item.children.map((child) => {
                          const childActive = pathname === child.href;
                          return (
                            <li key={child.label}>
                              <Link
                                href={child.href}
                                onClick={onClose}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 ${
                                  childActive
                                    ? "bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-500/10 dark:text-indigo-300"
                                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 font-medium dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                                  childActive ? "bg-indigo-500 dark:bg-indigo-400" : "bg-gray-300 dark:bg-slate-600"
                                }`} />
                                {child.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── User footer (floating profile card) ── */}
      <div className="p-3">
        {user ? (
          c ? (
            /* Collapsed: just avatar with logout on hover */
            <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 shadow-sm py-2.5">
              <div
                title={`${user.name} — ${user.role.name}`}
                className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-indigo-200 dark:shadow-indigo-900/40 cursor-default"
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                title="Logout"
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Expanded: floating profile card */
            <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-2xl bg-white/70 hover:bg-white/90 dark:bg-slate-800/60 dark:hover:bg-slate-800/90 border border-white/60 dark:border-slate-700/60 shadow-sm transition group">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm shadow-indigo-200 dark:shadow-indigo-900/40">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">{user.name}</p>
                <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate leading-tight mt-0.5">{user.role.name}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Logout"
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )
        ) : (
          <div className="h-14 rounded-2xl bg-white/50 dark:bg-slate-800/40 animate-pulse" />
        )}
      </div>
    </aside>
  );
}
