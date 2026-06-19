"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Car, LogOut, LogIn, ShieldCheck, Truck, Ban, BookOpen,
  Users, Bell, FileText, BarChart2, MapPin, Layers, Settings,
  ChevronRight, X, LayoutDashboard,
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
      { label: "Dashboard",    href: "/dashboard",             icon: LayoutDashboard },
      { label: "Check-in",     href: "/dashboard/check-in",    icon: LogIn,    badge: 0, badgeColor: "blue" },
      { label: "Check-out",    href: "/dashboard/check-out",   icon: LogOut,   badge: 0, badgeColor: "blue" },
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
      {
        label: "Owners", href: "/dashboard/owners", icon: Users,
        children: [{ label: "Owner Profile", href: "/dashboard/owners/profile" }],
      },
      { label: "Notices", href: "/dashboard/notices", icon: Bell, badge: 0, badgeColor: "red" },
    ],
  },
  {
    section: "FINANCE",
    items: [
      {
        label: "Billing", href: "/dashboard/billing", icon: FileText,
        children: [{ label: "Receipt View", href: "/dashboard/billing/receipt" }],
      },
      { label: "Reports", href: "/dashboard/reports", icon: BarChart2 },
    ],
  },
  {
    section: "SETUP",
    items: [
      { label: "Locations",       href: "/dashboard/locations",  icon: MapPin  },
      { label: "Divisions & Rates", href: "/dashboard/divisions", icon: Layers  },
      { label: "Settings",        href: "/dashboard/settings",   icon: Settings },
    ],
  },
];

// ── component ─────────────────────────────────────────────────────────────────

interface User { name: string; email: string; role: { name: string } }

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const s = localStorage.getItem("user");
    if (s) setUser(JSON.parse(s));
  }, []);

  function handleLogout() {
    localStorage.clear();
    router.replace("/login");
  }

  return (
    <aside className="w-64 h-full flex flex-col bg-white border-r border-gray-100 shadow-[1px_0_12px_rgba(0,0,0,0.04)]">

      {/* ── Logo ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
            <Car className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <p className="font-extrabold text-gray-900 text-[15px] leading-tight tracking-tight">ParkOS</p>
            <p className="text-[11px] text-gray-400 leading-tight">Admin Panel</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition md:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Location chip ── */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2.5 border border-blue-100">
          <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <MapPin className="w-3 h-3 text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-blue-400 font-medium leading-none mb-0.5">Location</p>
            <p className="text-xs font-semibold text-blue-700 truncate">North Gate</p>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5 scrollbar-none">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] px-2.5 mb-1.5">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const exact    = pathname === item.href;
                const starts   = item.href !== "/dashboard" && pathname.startsWith(item.href + "/");
                const childHit = item.children?.some((c) => pathname === c.href) ?? false;
                const active   = (exact || starts) && !childHit;
                const parentHighlight = active || childHit;

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                        active
                          ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <item.icon
                        className={`w-4 h-4 shrink-0 ${
                          active ? "text-white" : "text-gray-400 group-hover:text-gray-600"
                        }`}
                      />
                      <span className="flex-1 truncate">{item.label}</span>

                      {/* badge */}
                      {!!item.badge && item.badge > 0 && (
                        <span className={`text-[11px] font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5 ${
                          active
                            ? "bg-white/25 text-white"
                            : item.badgeColor === "red"
                            ? "bg-red-100 text-red-600"
                            : "bg-blue-100 text-blue-600"
                        }`}>
                          {item.badge}
                        </span>
                      )}

                      {/* chevron for items with children */}
                      {item.children && (
                        <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                          parentHighlight ? "rotate-90" : ""
                        } ${active ? "text-white/50" : "text-gray-300"}`} />
                      )}
                    </Link>

                    {/* sub-items — always visible */}
                    {item.children && (
                      <ul className="mt-0.5 ml-3.5 pl-3.5 border-l-2 border-gray-100 space-y-0.5 py-0.5">
                        {item.children.map((child) => {
                          const childActive = pathname === child.href;
                          return (
                            <li key={child.label}>
                              <Link
                                href={child.href}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 ${
                                  childActive
                                    ? "bg-blue-50 text-blue-700 font-semibold"
                                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 font-medium"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                                  childActive ? "bg-blue-500" : "bg-gray-300"
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

      {/* ── User footer ── */}
      <div className="border-t border-gray-100 p-3">
        {user ? (
          <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition group">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm shadow-blue-200">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{user.name}</p>
              <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{user.role.name}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="h-14 rounded-xl bg-gray-50 animate-pulse" />
        )}
      </div>
    </aside>
  );
}
