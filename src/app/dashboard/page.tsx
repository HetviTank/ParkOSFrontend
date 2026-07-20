"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  TrendingUp, TrendingDown, AlertTriangle, Clock,
  Layers, BarChart2, Activity, CreditCard, Loader2, ExternalLink,
  Bell, Megaphone, Phone, ChevronDown, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import type {
  DashboardResponse, SlotMapDivision,
  WeeklyRevenueItem, PaymentSplit, LiveAlertItem,
} from "@/types/dashboard";
import { useTheme } from "@/components/ThemeProvider";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "@/components/ui/Sparkline";
import { Skeleton } from "@/components/ui/Skeleton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LocationSelect, type LocationOption } from "@/components/ui/LocationSelect";
import { useLocationFilter } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// ── types ─────────────────────────────────────────────────────────────────────
interface OverdueRule { id: string; days: number; color: string; label: string | null }

interface SessionRaw {
  id: string; truck_id: string; owner_id: string;
  check_in_time: string; status: string; entry_type: string;
}
interface EnrichedOverdue {
  sessionId: string; truckNumber: string; ownerName: string; ownerMobile: string;
  checkInTime: string; daysParked: number; rule: OverdueRule; entryType: string;
}

// ── formatters ────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtShort = (n: number) =>
  n >= 100_000 ? `₹${(n / 100_000).toFixed(1)}L`
  : n >= 1_000 ? `₹${(n / 1_000).toFixed(0)}k`
  : `₹${n}`;

function greet() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function clockNow() {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}
function dateLabel() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ── animated number (count-up) ────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const v = useCountUp(value);
  return <>{format(v)}</>;
}

// ── slot / alert styling ──────────────────────────────────────────────────────
const SLOT_STYLE: Record<string, { bg: string; border: string; text: string; legendDot: string }> = {
  free:     { bg: "bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-500/10 dark:to-emerald-500/20", border: "border-emerald-300 dark:border-emerald-500/30", text: "text-emerald-700 dark:text-emerald-300", legendDot: "bg-emerald-500" },
  occupied: { bg: "bg-gradient-to-br from-red-50 to-red-100 dark:from-red-500/10 dark:to-red-500/20",                border: "border-red-300 dark:border-red-500/30",         text: "text-red-600 dark:text-red-300",         legendDot: "bg-red-500" },
  reserved: { bg: "bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-500/10 dark:to-amber-500/20",        border: "border-amber-300 dark:border-amber-500/30",     text: "text-amber-700 dark:text-amber-300",     legendDot: "bg-amber-500" },
};

// ── main page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: { name: string } } | null>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clock, setClock] = useState(clockNow());
  const [mounted, setMounted] = useState(false);
  const [overdueRules, setOverdueRules] = useState<OverdueRule[]>([]);
  const [overdueTrucks, setOverdueTrucks] = useState<EnrichedOverdue[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  // Non-admin roles are locked to their assigned location — no "All locations" escape hatch.
  const { isAdmin, locationId, setLocationId } = useLocationFilter();

  // mount flag for recharts SSR guard
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setClock(clockNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  // load the location list once (for the location picker)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch(`${BASE_URL}/locations?limit=50`, { headers: { token } })
      .then(r => r.ok ? r.json() : { list: [] })
      .then(r => setLocations(r.list ?? []))
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (!token || !storedUser) { router.replace("/login"); return; }
    if (!silent) setLoading(true);
    setError("");
    try {
      const url = `${BASE_URL}/dashboard${locationId ? `?location_id=${locationId}` : ""}`;
      const res = await fetch(url, { headers: { token } });
      if (res.status === 401) { router.replace("/login"); return; }
      if (!res.ok) throw new Error("Failed to load dashboard data.");
      setData(await res.json());
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, [router, locationId]);

  const fetchOverdueTrucks = useCallback(async () => {
    const token = localStorage.getItem("token") ?? "";
    if (!token) return;
    setOverdueLoading(true);
    try {
      const locParam = locationId ? `&location_id=${locationId}` : "";
      const [rulesRes, parkedRes, overdueRes] = await Promise.all([
        fetch(`${BASE_URL}/overdue-alert-rules`, { headers: { token } }).then(r => r.ok ? r.json() : { list: [] }).catch(() => ({ list: [] })),
        fetch(`${BASE_URL}/parking-sessions?status=parked&start=0&limit=50&sort_by=check_in_time&order=asc${locParam}`, { headers: { token } }).then(r => r.ok ? r.json() : { list: [] }).catch(() => ({ list: [] })),
        fetch(`${BASE_URL}/parking-sessions?status=overdue&start=0&limit=50&sort_by=check_in_time&order=asc${locParam}`, { headers: { token } }).then(r => r.ok ? r.json() : { list: [] }).catch(() => ({ list: [] })),
      ]);
      const rules: OverdueRule[] = (rulesRes.list ?? []).sort((a: OverdueRule, b: OverdueRule) => b.days - a.days);
      setOverdueRules(rules);
      if (!rules.length) { setOverdueTrucks([]); return; }
      const sessions: SessionRaw[] = [...(parkedRes.list ?? []), ...(overdueRes.list ?? [])];
      const now = Date.now();
      const minDays = Math.min(...rules.map((r: OverdueRule) => r.days));
      const qualifying = sessions
        .map(s => ({ ...s, daysParked: Math.floor((now - new Date(s.check_in_time).getTime()) / 86_400_000) }))
        .filter(s => s.daysParked >= minDays)
        .sort((a, b) => b.daysParked - a.daysParked)
        .slice(0, 15);
      if (!qualifying.length) { setOverdueTrucks([]); return; }
      const enriched = await Promise.all(qualifying.map(async s => {
        const [truck, owner] = await Promise.all([
          fetch(`${BASE_URL}/trucks/${s.truck_id}`, { headers: { token } }).then(r => r.ok ? r.json() : null).catch(() => null),
          s.owner_id ? fetch(`${BASE_URL}/owners/${s.owner_id}`, { headers: { token } }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
        ]);
        const rule = rules.find((r: OverdueRule) => s.daysParked >= r.days);
        if (!rule) return null;
        return {
          sessionId: s.id,
          truckNumber: truck?.truck_number ?? "—",
          ownerName: owner?.name ?? "—",
          ownerMobile: owner?.mobile ?? owner?.primary_mobile ?? "",
          checkInTime: s.check_in_time,
          daysParked: s.daysParked,
          rule,
          entryType: s.entry_type,
        } as EnrichedOverdue;
      }));
      setOverdueTrucks(enriched.filter((x): x is EnrichedOverdue => x !== null));
    } finally {
      setOverdueLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
    fetchData();
    fetchOverdueTrucks();
  }, [fetchData, fetchOverdueTrucks]);

  // auto-refresh every 30 s
  useEffect(() => {
    const id = setInterval(() => { fetchData(true); fetchOverdueTrucks(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchData, fetchOverdueTrucks]);

  return (
    <main className="relative px-4 sm:px-5 lg:px-6 py-5 space-y-4 w-full">
        {/* Ambient background is provided by SidebarShell (shared across the dashboard) */}

        {/* Greeting / header bar */}
        {user && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-sm px-5 py-4 dark:bg-slate-900/60 dark:border-slate-800/70"
          >
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight truncate">
                {greet()}, {user.name} 👋
              </h1>
              <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
                {dateLabel()} · live as of {clock}
                {lastUpdated && (
                  <>
                    {" · refreshed "}
                    {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
              {/* Location — scopes the KPIs, Live Slot Map and Overdue Trucks below.
                  Admins can view any location; everyone else is locked to their own. */}
              <LocationSelect
                className="w-full sm:w-56"
                value={locationId}
                onChange={setLocationId}
                locations={locations}
                allowAll={isAdmin}
                locked={!isAdmin}
              />

              <div className="flex items-center gap-2 justify-end sm:justify-start">
                <a
                  href="#live-alerts"
                  title="Live alerts"
                  className="relative w-10 h-10 rounded-xl flex items-center justify-center bg-white/70 hover:bg-white border border-white/60 shadow-sm transition dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:border-slate-700/60"
                >
                  <Bell className="w-[18px] h-[18px] text-gray-500 dark:text-slate-300" />
                  {!!data?.live_alerts?.length && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {data.live_alerts.length}
                    </span>
                  )}
                </a>

                <ThemeToggle />

                <div
                  title={user.role.name}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0"
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Loading skeleton */}
        {loading && <LoadingSkeleton />}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-4">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
            <div>
              <p className="font-semibold text-red-700">{error}</p>
              <button onClick={() => fetchData()} className="mt-1 text-sm text-red-500 underline hover:text-red-700">
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Dashboard content */}
        {!loading && data && (
          <>
            {/* ── KPIs ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <KPICard
                delay={0}
                label="Total Slots"
                value={<AnimatedNumber value={data.kpis.total_slots} format={(n) => Math.round(n).toString()} />}
                sub={`${data.kpis.total_divisions} division${data.kpis.total_divisions !== 1 ? "s" : ""}`}
                icon={<Layers className="w-5 h-5 text-indigo-600" />}
                iconBg="bg-indigo-100 dark:bg-indigo-500/15"
              />
              <KPICard
                delay={0.08}
                label="Occupied"
                value={<AnimatedNumber value={data.kpis.occupied_slots} format={(n) => Math.round(n).toString()} />}
                sub={`${data.kpis.occupancy_percent.toFixed(0)}% of capacity`}
                subColor={data.kpis.occupancy_percent >= 80 ? "text-red-500" : "text-amber-500"}
                icon={<BarChart2 className={`w-5 h-5 ${data.kpis.occupancy_percent >= 80 ? "text-red-500" : "text-amber-500"}`} />}
                iconBg={data.kpis.occupancy_percent >= 80 ? "bg-red-100 dark:bg-red-500/15" : "bg-amber-100 dark:bg-amber-500/15"}
                trend={{ kind: "ring", percent: data.kpis.occupancy_percent, color: data.kpis.occupancy_percent >= 80 ? "#EF4444" : "#F59E0B" }}
              />
              <KPICard
                delay={0.16}
                label="Today's Check-ins"
                value={<AnimatedNumber value={data.kpis.today_checkins} format={(n) => Math.round(n).toString()} />}
                sub={`${data.kpis.checkins_diff >= 0 ? "+" : ""}${data.kpis.checkins_diff} vs yesterday`}
                subColor={data.kpis.checkins_diff > 0 ? "text-emerald-600" : data.kpis.checkins_diff < 0 ? "text-red-500" : "text-gray-400"}
                subIcon={data.kpis.checkins_diff > 0 ? "up" : data.kpis.checkins_diff < 0 ? "down" : undefined}
                icon={<Activity className="w-5 h-5 text-emerald-600" />}
                iconBg="bg-emerald-100 dark:bg-emerald-500/15"
                trend={{ kind: "sparkline", data: [data.kpis.yesterday_checkins, data.kpis.today_checkins], color: "#10B981" }}
              />
              <KPICard
                delay={0.24}
                label="Today's Revenue"
                value={<AnimatedNumber value={data.kpis.today_revenue} format={fmt} />}
                sub={`${data.kpis.revenue_growth_percent >= 0 ? "+" : ""}${data.kpis.revenue_growth_percent.toFixed(1)}% vs yesterday`}
                subColor={data.kpis.revenue_growth_percent > 0 ? "text-emerald-600" : data.kpis.revenue_growth_percent < 0 ? "text-red-500" : "text-gray-400"}
                subIcon={data.kpis.revenue_growth_percent > 0 ? "up" : data.kpis.revenue_growth_percent < 0 ? "down" : undefined}
                icon={<CreditCard className="w-5 h-5 text-cyan-600" />}
                iconBg="bg-cyan-100 dark:bg-cyan-500/15"
                trend={{ kind: "sparkline", data: data.weekly_revenue.map((w) => w.total), color: "#06B6D4" }}
              />
            </div>

            {/* ── Main grid: slot map + right panel ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3">
                <SlotMapCard divisions={data.slot_map} />
              </div>
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 lg:flex lg:flex-col lg:h-[580px] gap-4">
                <OverdueTrucksCard trucks={overdueTrucks} loading={overdueLoading} rulesConfigured={overdueRules.length > 0} />
                <LiveAlertsCard alerts={data.live_alerts} />
              </div>
            </div>

            {/* ── Charts row ── */}
            {mounted && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <WeeklyRevenueCard data={data.weekly_revenue} />
                </div>
                <PaymentSplitCard split={data.payment_split} />
              </div>
            )}
          </>
        )}
    </main>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
type KPITrend =
  | { kind: "sparkline"; data: number[]; color: string }
  | { kind: "ring"; percent: number; color: string };

function OccupancyRing({ percent, color }: { percent: number; color: string }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const dash = (c * Math.min(Math.max(percent, 0), 100)) / 100;
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" className="-rotate-90 shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth={5} className="stroke-gray-100 dark:stroke-slate-800" />
      <circle
        cx="20" cy="20" r={r} fill="none" strokeWidth={5} strokeLinecap="round"
        stroke={color} strokeDasharray={`${dash} ${c - dash}`}
      />
    </svg>
  );
}

function KPICard({
  label, value, sub, subColor = "text-gray-400", subIcon,
  icon, iconBg, delay = 0, trend,
}: {
  label: string; value: React.ReactNode; sub?: string; subColor?: string; subIcon?: "up" | "down";
  icon: React.ReactNode; iconBg: string; delay?: number; trend?: KPITrend;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      whileHover={{ scale: 1.03 }}
      className="transition-shadow duration-300 hover:shadow-xl rounded-3xl"
    >
      <GlassCard gradientBorder className="p-5 group">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{label}</p>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}>
            {icon}
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight tabular-nums">{value}</p>
            {sub && (
              <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${subColor}`}>
                {subIcon === "up"   && <TrendingUp  className="w-3.5 h-3.5" />}
                {subIcon === "down" && <TrendingDown className="w-3.5 h-3.5" />}
                <span>{sub}</span>
              </div>
            )}
          </div>
          {trend?.kind === "sparkline" && (
            <Sparkline data={trend.data} stroke={trend.color} width={72} height={32} />
          )}
          {trend?.kind === "ring" && <OccupancyRing percent={trend.percent} color={trend.color} />}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ── Slot Map ──────────────────────────────────────────────────────────────────
function SlotMapCard({ divisions }: { divisions: SlotMapDivision[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.32, ease: "easeOut" }}
    >
      <GlassCard className="p-5 flex flex-col h-[580px]">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <h2 className="font-semibold text-gray-900 dark:text-white">Live Slot Map</h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400 bg-white/60 dark:bg-slate-800/50 border border-white/60 dark:border-slate-700/50 rounded-full px-3 py-1.5">
            {(["free", "occupied", "reserved"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5 capitalize">
                <span className={`w-2 h-2 rounded-full inline-block ${SLOT_STYLE[s].legendDot}`} />
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
          {divisions.map((div) => (
            <div key={div.division_id}>
              <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2">
                {div.division_name} — {div.truck_type}
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {div.slots.map((slot) => {
                  const s = SLOT_STYLE[slot.status.toLowerCase()] ?? SLOT_STYLE.free;
                  return (
                    <div key={slot.id} className="group relative">
                      <div
                        className={`${s.bg} ${s.border} ${s.text} border rounded-lg py-1.5 text-center text-xs font-semibold tracking-wide select-none cursor-default transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg group-hover:relative group-hover:z-20`}
                      >
                        {slot.code}
                      </div>
                      {/* animated tooltip — real fields only (code/status/division) */}
                      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-30 whitespace-nowrap rounded-lg bg-gray-900 dark:bg-slate-950 text-white text-[11px] px-2.5 py-1.5 shadow-xl">
                        <p className="font-semibold">{slot.code}</p>
                        <p className="text-gray-300 dark:text-slate-400 capitalize">{slot.status} · {div.division_name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {divisions.length === 0 && (
            <p className="text-center text-gray-300 dark:text-slate-600 py-12 text-sm">No slot data available</p>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ── Overdue Trucks ────────────────────────────────────────────────────────────
function OverdueTrucksCard({ trucks, loading, rulesConfigured }: {
  trucks: EnrichedOverdue[];
  loading: boolean;
  rulesConfigured: boolean;
}) {
  // "Critical" = matches the most severe rule tier among the trucks currently shown.
  const maxSeverityDays = trucks.length ? Math.max(...trucks.map((t) => t.rule.days)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.46, ease: "easeOut" }}
      className="flex-1 min-h-0 flex flex-col"
    >
      <GlassCard className="p-5 flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">Overdue Trucks</h2>
          {trucks.length > 0 && <Badge color="red">{trucks.length} overdue</Badge>}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400 dark:text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Checking parked trucks…</span>
          </div>
        )}

        {!loading && !rulesConfigured && (
          <div className="text-center py-8">
            <AlertTriangle className="w-8 h-8 text-gray-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-slate-500">No overdue rules configured.</p>
            <p className="text-xs text-gray-300 dark:text-slate-600 mt-1">Set thresholds in Settings to see overdue trucks here.</p>
          </div>
        )}

        {!loading && rulesConfigured && trucks.length === 0 && (
          <div className="text-center py-8">
            <Clock className="w-8 h-8 text-gray-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-slate-500">No overdue trucks right now</p>
          </div>
        )}

        {!loading && trucks.length > 0 && (
          <div className="space-y-2.5 overflow-y-auto flex-1 min-h-0">
            {trucks.map((t, i) => {
              const hex = t.rule.color;
              const isCritical = maxSeverityDays > 0 && t.rule.days === maxSeverityDays;
              return (
                <motion.div
                  key={t.sessionId}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.015 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04 }}
                  className="border-l-4 rounded-r-2xl pl-3 pr-3.5 py-2.5 hover:shadow-md transition-shadow"
                  style={{ backgroundColor: hex + "14", borderLeftColor: hex }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isCritical && (
                          <span className="relative flex h-1.5 w-1.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                          </span>
                        )}
                        <span className="text-sm font-bold font-mono text-gray-900 dark:text-white">{t.truckNumber}</span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: hex + "28", color: hex }}
                        >
                          {t.daysParked}d parked
                        </span>
                        {t.rule.label && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: hex + "18", color: hex }}
                          >
                            {t.rule.label}
                          </span>
                        )}
                        <span className="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full uppercase">
                          {t.entryType}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                        {t.ownerName}
                        {t.ownerMobile ? ` · ${t.ownerMobile}` : ""}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                        In: {new Date(t.checkInTime).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {t.ownerMobile && (
                        <a
                          href={`tel:${t.ownerMobile}`}
                          title="Call owner"
                          className="flex items-center justify-center w-7 h-7 rounded-lg text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:text-emerald-400 transition"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        disabled
                        title="Extend session — coming soon"
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 dark:text-slate-600 bg-gray-50 dark:bg-slate-800/60 cursor-not-allowed"
                      >
                        <Clock className="w-3.5 h-3.5" />
                      </button>
                      <Link
                        href={`/dashboard/trucks/profile?truck=${encodeURIComponent(t.truckNumber)}`}
                        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}

// ── Live Alerts ───────────────────────────────────────────────────────────────
function relativeTime(iso: string) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function AlertItem({ alert, index }: { alert: LiveAlertItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (alert.message?.length ?? 0) > 90;
  const Icon = alert.is_system ? Info : alert.notice_type === "warning" ? AlertTriangle : Bell;
  const iconColor = alert.is_system ? "text-slate-400" : alert.notice_type === "warning" ? "text-red-500" : "text-amber-500";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
      className={`border-l-4 rounded-r-2xl pl-3 pr-3.5 py-2.5 ${
        alert.is_system
          ? "bg-slate-50 border-slate-300 dark:bg-slate-800/40 dark:border-slate-600"
          : alert.notice_type === "warning"
          ? "bg-red-50 border-red-300 dark:bg-red-500/10 dark:border-red-500/40"
          : "bg-amber-50 border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/40"
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {alert.truck_number && (
              <span className="text-sm font-bold font-mono text-gray-900 dark:text-white">{alert.truck_number}</span>
            )}
            {alert.is_system && <Badge color="gray">System</Badge>}
          </div>
          {alert.owner_name && <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">{alert.owner_name}</p>}
          <p className={`text-xs text-gray-600 dark:text-slate-300 mt-0.5 ${!expanded && isLong ? "line-clamp-2" : ""}`}>
            {alert.message ?? alert.notice_type}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-0.5"
            >
              {expanded ? "Show less" : "Show more"}
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
          {alert.created_at && (
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">{relativeTime(alert.created_at)}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function LiveAlertsCard({ alerts }: { alerts: LiveAlertItem[] }) {
  const active = alerts.filter((a) => !a.notice_type || a.notice_type !== "resolved");
  return (
    <motion.div
      id="live-alerts"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.52, ease: "easeOut" }}
      className="flex-1 min-h-0 flex flex-col scroll-mt-4"
    >
      <GlassCard className="p-5 flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Live Alerts</h2>
          </div>
          {active.length > 0 && <Badge color="amber">{active.length} active</Badge>}
        </div>

        {alerts.length === 0 && (
          <div className="text-center py-8">
            <Megaphone className="w-8 h-8 text-gray-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-slate-500">No alerts right now</p>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="space-y-2.5 overflow-y-auto flex-1 min-h-0">
            {alerts.map((a, i) => (
              <AlertItem key={a.id} alert={a} index={i} />
            ))}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}

// ── Weekly Revenue Chart ──────────────────────────────────────────────────────
function WeeklyRevenueCard({ data }: { data: WeeklyRevenueItem[] }) {
  const { theme } = useTheme();
  const gridColor = theme === "dark" ? "#1e293b" : "#eef2f7";
  const tickColor = theme === "dark" ? "#64748b" : "#9ca3af";
  const cursorFill = theme === "dark" ? "#1e293b" : "#f8fafc";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = (payload as { value: number }[]).reduce((s, p) => s + (p.value ?? 0), 0);
    return (
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[160px]">
        <p className="font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
        {(payload as { name: string; value: number; fill: string }[]).map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.fill }} />
              <span className="text-gray-500 dark:text-slate-400">{p.name}</span>
            </div>
            <span className="font-medium text-gray-800 dark:text-slate-200">{fmt(p.value)}</span>
          </div>
        ))}
        <div className="border-t border-gray-100 dark:border-slate-800 mt-2 pt-2 flex items-center justify-between">
          <span className="text-gray-400 dark:text-slate-500 text-xs">Total</span>
          <span className="font-bold text-gray-900 dark:text-white">{fmt(total)}</span>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease: "easeOut" }}
    >
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">Revenue this week</h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Cash vs Card / UPI · last 7 days</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "linear-gradient(180deg,#60a5fa,#2563eb)" }} />
              Cash
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "linear-gradient(180deg,#34d399,#059669)" }} />
              Card / UPI
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="barCash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
              <linearGradient id="barCard" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 5" vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: tickColor }}
              dy={6}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: tickColor }}
              tickFormatter={fmtShort}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: cursorFill, radius: 8 }} />
            <Bar dataKey="cash"     stackId="a" fill="url(#barCash)" name="Cash"     radius={[0, 0, 0, 0]} maxBarSize={46} animationDuration={1100} animationEasing="ease-out" />
            <Bar dataKey="card_upi" stackId="a" fill="url(#barCard)" name="Card/UPI" radius={[6, 6, 0, 0]} maxBarSize={46} animationDuration={1100} animationEasing="ease-out" />
          </BarChart>
        </ResponsiveContainer>
      </GlassCard>
    </motion.div>
  );
}

// ── Payment Split Donut ───────────────────────────────────────────────────────
function PaymentSplitCard({ split }: { split: PaymentSplit }) {
  const total = split.total_cash + split.total_card_upi;
  const pieData = [
    { name: "Cash",      value: split.total_cash,      percent: split.cash_percent      },
    { name: "Card / UPI",value: split.total_card_upi,  percent: split.card_upi_percent  },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as { name: string; value: number; percent: number };
    return (
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2.5 text-sm">
        <p className="font-semibold text-gray-900 dark:text-white">{d.name}</p>
        <p className="text-gray-500 dark:text-slate-400">{fmt(d.value)}</p>
        <p className="text-xs text-gray-400 dark:text-slate-500">{d.percent.toFixed(1)}%</p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.48, ease: "easeOut" }}
    >
      <GlassCard className="p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Payment Split</h2>

        {/* Donut with centered label */}
        <div className="relative h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                <linearGradient id="pieCash" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
                <linearGradient id="pieCard" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={3}
                dataKey="value"
                stroke="none"
                startAngle={90}
                endAngle={-270}
                animationDuration={1100}
                animationEasing="ease-out"
              >
                {pieData.map((_, i) => (
                  <Cell key={`c-${i}`} fill={i === 0 ? "url(#pieCash)" : "url(#pieCard)"} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{fmt(total)}</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">7-day total</p>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 space-y-2.5">
          {pieData.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: i === 0 ? "linear-gradient(135deg,#60a5fa,#2563eb)" : "linear-gradient(135deg,#34d399,#059669)" }} />
                <span className="text-sm text-gray-600 dark:text-slate-300">{d.name}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{fmt(d.value)}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500 ml-1.5">{d.percent.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton() {
  const frameClasses = "rounded-3xl border border-white/60 dark:border-slate-800/70 shadow-sm";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`bg-white/70 dark:bg-slate-900/60 ${frameClasses} p-5 h-28`}>
            <div className="flex justify-between mb-3">
              <Skeleton className="h-3.5 w-24 rounded-full" />
              <Skeleton className="w-10 h-10 rounded-xl" />
            </div>
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="h-3 w-28 rounded-full mt-2.5" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Skeleton className={`xl:col-span-3 ${frameClasses} h-80`} />
        <div className="xl:col-span-2 space-y-4">
          <Skeleton className={`${frameClasses} h-36`} />
          <Skeleton className={`${frameClasses} h-40`} />
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Skeleton className={`xl:col-span-2 ${frameClasses} h-64`} />
        <Skeleton className={`${frameClasses} h-64`} />
      </div>
    </div>
  );
}
