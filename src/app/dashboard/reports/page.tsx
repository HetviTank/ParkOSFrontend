"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ChevronRight, Download, AlertCircle, RefreshCw,
  Truck, Clock, Activity, AlertTriangle, TrendingUp, TrendingDown, MapPin,
  Wallet, Layers, PackageSearch, LogIn, Crown, Sparkles,
} from "lucide-react";

import { handleUnauthorized, useLocationFilter } from "@/lib/auth";
import { LocationSelect } from "@/components/ui/LocationSelect";
import { EnumFilterSelect } from "@/components/ui/EnumFilterSelect";
import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}
async function apiFetch<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { token },
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Your session has expired. Redirecting to login…");
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error((e as { detail?: string }).detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── types (mirror the real /dashboard, /parking-sessions, /trucks payloads) ────
interface Location { id: string; name: string; city: string | null }
interface DashKPIs {
  total_slots: number; occupied_slots: number; occupancy_percent: number;
  today_checkins: number; yesterday_checkins?: number; checkins_diff?: number;
  today_revenue: number; yesterday_revenue?: number; revenue_growth_percent: number;
}
interface DivOcc { division_id: string; division_name: string; truck_type: string; total_slots: number; occupied_slots: number; occupancy_percent: number }
interface WeekRev { date: string; day: string; cash: number; card_upi: number; total: number }
interface PaySplit { cash_percent: number; card_upi_percent: number; total_cash: number; total_card_upi: number }
interface DashResp { kpis: DashKPIs; division_occupancy: DivOcc[]; weekly_revenue: WeekRev[]; payment_split: PaySplit }
interface Session {
  id: string; truck_id: string; location_id: string; days: number | null; total_amount: number | null;
  driver_match: string | null; status: string; check_out_time: string | null; created_at: string | null;
}
interface TruckObj { id: string; truck_number: string; truck_type: string | null }

// ── utils ─────────────────────────────────────────────────────────────────────
function fmtRupees(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
function fmtShort(n: number)  { if (n >= 100000) return `₹${(n/100000).toFixed(1)}L`; if (n >= 1000) return `₹${(n/1000).toFixed(0)}k`; return fmtRupees(n); }
function fmtInt(n: number)    { return n.toLocaleString("en-IN"); }

function monthOptions(): { label: string; year: number; month: number }[] {
  const now = new Date(); const opts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), year: d.getFullYear(), month: d.getMonth() });
  }
  return opts;
}
function inMonth(iso: string | null, y: number, m: number) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === y && d.getMonth() === m;
}
function monthlySeries(sessions: Session[], monthsBack: number, reducer: (subset: Session[]) => number) {
  const now = new Date();
  return Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    const subset = sessions.filter(s => inMonth(s.check_out_time ?? s.created_at, d.getFullYear(), d.getMonth()));
    return { label: d.toLocaleDateString("en-IN", { month: "short" }), value: reducer(subset) };
  });
}
function occColor(pct: number) { return pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981"; }
function occBarClass(pct: number) { return pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"; }

interface Badge { text: string; good: boolean }
function pctBadge(curr: number, prev: number, invert = false, suffix = "vs last month"): Badge | null {
  if (!prev) return null;
  const delta = Math.round(((curr - prev) / prev) * 100);
  const good = invert ? delta <= 0 : delta >= 0;
  return { text: `${delta > 0 ? "+" : ""}${delta}% ${suffix}`, good };
}
function countBadge(diff: number | undefined, invert = false, suffix = "vs yesterday"): Badge | null {
  if (diff == null) return null;
  const good = invert ? diff <= 0 : diff >= 0;
  return { text: `${diff > 0 ? "+" : ""}${diff} ${suffix}`, good };
}

// ── count-up animated number (shared convention across the dashboard) ─────────
function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const from = 0;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}
function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value);
  return <>{format ? format(v) : Math.round(v)}</>;
}

function RatioRing({ percent, color, size = 84, stroke = 9 }: { percent: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const dash = (c * Math.min(Math.max(percent, 0), 100)) / 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-gray-100 dark:stroke-slate-800" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={color}
        strokeDasharray={`${dash} ${c - dash}`} style={{ transition: "stroke-dasharray 0.8s ease" }} />
    </svg>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, format, icon, iconBg, delay = 0, sub, subColor = "text-gray-400 dark:text-slate-500", sparklineData, sparklineColor, badge }: {
  label: string; value: number; format?: (n: number) => string;
  icon: React.ReactNode; iconBg: string; delay?: number;
  sub?: string; subColor?: string;
  sparklineData?: number[]; sparklineColor?: string;
  badge?: Badge | null;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay, ease: "easeOut" }} whileHover={{ scale: 1.02 }}
      className="rounded-3xl transition-shadow duration-300 hover:shadow-xl">
      <GlassCard gradientBorder className="p-4 group h-full">
        <div className="flex items-start justify-between mb-2.5">
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 leading-tight">{label}</p>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}>{icon}</div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight tabular-nums truncate">
              <AnimatedNumber value={value} format={format} />
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {sub && <p className={`text-xs font-medium truncate ${subColor}`}>{sub}</p>}
              {badge && (
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${badge.good ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"}`}>
                  {badge.good ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {badge.text}
                </span>
              )}
            </div>
          </div>
          {sparklineData && sparklineData.some(v => v > 0) && (
            <div className="hidden sm:block shrink-0">
              <Sparkline data={sparklineData} stroke={sparklineColor} width={56} height={28} />
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ── donut chart — interactive, with a center metric ────────────────────────────
function DonutChart({ segments, centerValue, centerLabel }: { segments: { label: string; pct: number; color: string }[]; centerValue: string; centerLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const r = 62, cx = 90, cy = 90, circ = 2 * Math.PI * r;
  const visible = segments.filter(s => s.pct > 0);
  const withOffsets = visible.reduce<{ seg: typeof visible[number]; dash: number; offset: number }[]>((acc, seg) => {
    const dash = (seg.pct / 100) * circ;
    const prev = acc[acc.length - 1];
    const offset = prev ? prev.offset + prev.dash : 0;
    return [...acc, { seg, dash, offset }];
  }, []);
  const paths = withOffsets.map(({ seg, dash, offset }, i) => (
    <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={hover === i ? 26 : 22}
      strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`}
      style={{ transition: "all 0.25s ease", opacity: hover === null || hover === i ? 1 : 0.4, cursor: "pointer" }}
      onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
    />
  ));
  const hovered = hover != null ? visible[hover] : null;
  return (
    <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
      <svg width={180} height={180} viewBox="0 0 180 180">
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={22} className="stroke-gray-100 dark:stroke-slate-800" />
        {paths}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {hovered ? (
          <>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{hovered.pct}%</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 font-medium truncate max-w-[110px]">{hovered.label}</p>
          </>
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{centerValue}</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">{centerLabel}</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── bar chart — hover tooltips, highlights the latest bar ─────────────────────
function BarChart({ bars, color, valueFormat = fmtShort }: { bars: { label: string; value: number }[]; color: string; valueFormat?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...bars.map(b => b.value), 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f));
  return (
    <div className="flex gap-3 h-52">
      <div className="flex flex-col-reverse justify-between pb-6 pr-1 shrink-0">
        {yTicks.map((t, i) => <span key={i} className="text-[10px] text-gray-400 dark:text-slate-500 leading-none text-right w-10">{valueFormat(t)}</span>)}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 relative">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="absolute w-full border-t border-gray-100 dark:border-slate-800" style={{ bottom: `${i * 25}%` }} />)}
          <div className="absolute inset-0 flex items-end gap-1.5 px-1">
            {bars.map((b, i) => (
              <div key={b.label} className="flex-1 relative flex flex-col items-center gap-0.5 h-full justify-end"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {hover === i && (
                  <div className="absolute -top-8 bg-gray-900 dark:bg-slate-700 text-white text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap z-10 shadow-lg">
                    {valueFormat(b.value)}
                  </div>
                )}
                <div className="w-full rounded-t-lg transition-all duration-700 cursor-pointer"
                  style={{ height: `${max > 0 ? (b.value / max) * 100 : 0}%`, background: color, minHeight: b.value > 0 ? 4 : 0, opacity: hover === null || hover === i ? 1 : 0.55 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 px-1 h-6 items-center">
          {bars.map((b, i) => <div key={b.label} className={`flex-1 text-center text-[10px] truncate ${i === bars.length - 1 ? "font-bold text-gray-600 dark:text-slate-300" : "text-gray-400 dark:text-slate-500"}`}>{b.label}</div>)}
        </div>
      </div>
    </div>
  );
}

// ── weekly activity chart — cash vs card/UPI stacked bars, last 7 days ────────
function WeeklyActivityChart({ data }: { data: WeekRev[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map(d => d.total), 1);
  return (
    <div className="h-52 flex flex-col">
      <div className="flex-1 relative">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="absolute w-full border-t border-gray-100 dark:border-slate-800" style={{ bottom: `${i * 25}%` }} />)}
        <div className="absolute inset-0 flex items-end gap-2 px-1">
          {data.map((d, i) => (
            <div key={d.date} className="flex-1 relative flex flex-col items-stretch justify-end h-full"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {hover === i && (
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-slate-700 text-white text-[10px] rounded-lg px-2.5 py-1.5 z-10 shadow-lg whitespace-nowrap space-y-0.5">
                  <p className="font-bold">{fmtShort(d.total)} total</p>
                  <p className="text-emerald-300">Cash · {fmtShort(d.cash)}</p>
                  <p className="text-blue-300">Card/UPI · {fmtShort(d.card_upi)}</p>
                </div>
              )}
              <div className="w-full flex flex-col justify-end rounded-t-lg overflow-hidden cursor-pointer transition-all duration-700"
                style={{ height: `${max > 0 ? (d.total / max) * 100 : 0}%`, minHeight: d.total > 0 ? 4 : 0, opacity: hover === null || hover === i ? 1 : 0.55 }}>
                <div className="w-full bg-blue-500" style={{ height: d.total > 0 ? `${(d.card_upi / d.total) * 100}%` : "0%" }} />
                <div className="w-full bg-emerald-500" style={{ height: d.total > 0 ? `${(d.cash / d.total) * 100}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2 px-1 h-6 items-center">
        {data.map((d, i) => <div key={d.date} className={`flex-1 text-center text-[10px] truncate ${i === data.length - 1 ? "font-bold text-gray-600 dark:text-slate-300" : "text-gray-400 dark:text-slate-500"}`}>{d.day}</div>)}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-gray-400 dark:text-slate-500 truncate">{label}</p>
      <p className="text-sm font-bold text-gray-800 dark:text-slate-200 truncate">{value}</p>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
      <div className="text-gray-300 dark:text-slate-700">{icon}</div>
      <p className="text-sm text-gray-400 dark:text-slate-500">{text}</p>
    </div>
  );
}

const DIV_TYPE_META: Record<string, string> = {
  heavy: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  medium: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  light: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};
const LOC_BAR_COLORS = ["bg-indigo-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-400"];
const DONUT_COLORS: Record<string, string> = { heavy: "#6366f1", medium: "#a855f7", light: "#22c55e", other: "#94a3b8" };

// ── page ──────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const router = useRouter();
  const months = useMemo(() => monthOptions(), []);

  // Non-admin roles are locked to their assigned location — no "All locations" escape hatch.
  const { isAdmin, locationId: locId, setLocationId: setLocId } = useLocationFilter();

  const [monthIdx, setMonthIdx] = useState(0); // 0 = current month
  const [locs, setLocs] = useState<Location[]>([]);
  const [dash, setDash] = useState<DashResp | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [trucks, setTrucks] = useState<TruckObj[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chartMetric, setChartMetric] = useState<"revenue" | "trucks">("revenue");

  // load locations once
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }
    apiFetch<{ count: number; list: Location[] }>("/locations?limit=50")
      .then(r => setLocs(r.list ?? [])).catch(() => {});
  }, [router]);

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }
    setLoading(true); setError("");
    try {
      const dashUrl = `/dashboard${locId ? `?location_id=${locId}` : ""}`;
      // A generous cap keeps the 6-month trend / month-over-month comparisons
      // reasonably accurate without needing a dedicated aggregate endpoint.
      const sessUrl = `/parking-sessions?limit=1000&sort_by=created_at&order=desc${locId ? `&location_id=${locId}` : ""}`;
      const truckUrl = `/trucks?limit=300`;

      const [d, s, t] = await Promise.all([
        apiFetch<DashResp>(dashUrl),
        apiFetch<{ count: number; list: Session[] }>(sessUrl),
        apiFetch<{ count: number; list: TruckObj[] }>(truckUrl),
      ]);
      setDash(d);
      setSessions(s.list ?? []);
      setTrucks(t.list ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load reports."); }
    finally { setLoading(false); }
  }, [locId]);

  useEffect(() => { load(); }, [load]);

  // ── derived data ──────────────────────────────────────────────────────────
  const { year: selYear, month: selMonth } = months[monthIdx];
  const prevMonth = months[monthIdx + 1] ?? null;

  const monthSessions = useMemo(() =>
    sessions.filter(s => inMonth(s.check_out_time ?? s.created_at, selYear, selMonth)),
    [sessions, selYear, selMonth]
  );
  const prevMonthSessions = useMemo(() =>
    prevMonth ? sessions.filter(s => inMonth(s.check_out_time ?? s.created_at, prevMonth.year, prevMonth.month)) : [],
    [sessions, prevMonth]
  );

  function truckCount(list: Session[]) { return new Set(list.map(s => s.truck_id)).size; }
  function avgStayOf(list: Session[]) {
    const d = list.map(s => s.days).filter((x): x is number => x != null && x > 0);
    return d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
  }
  function revenueOf(list: Session[]) { return list.reduce((sum, s) => sum + (s.total_amount ?? 0), 0); }
  function mismatchesOf(list: Session[]) { return list.filter(s => s.driver_match === "mismatch").length; }

  const totalTrucks = truckCount(monthSessions);
  const avgStay = avgStayOf(monthSessions);
  const mismatches = mismatchesOf(monthSessions);
  const monthRevenue = revenueOf(monthSessions);
  const occupancyPercent = dash?.kpis.occupancy_percent ?? 0;

  const prevTotalTrucks = truckCount(prevMonthSessions);
  const prevAvgStay = avgStayOf(prevMonthSessions);
  const prevMismatches = mismatchesOf(prevMonthSessions);
  const prevMonthRevenue = revenueOf(prevMonthSessions);

  const completedSessions = monthSessions.filter(s => s.status === "released").length;
  const activeSessions = monthSessions.filter(s => s.status === "parked" || s.status === "overdue").length;
  const avgRevenuePerTruck = totalTrucks > 0 ? monthRevenue / totalTrucks : 0;

  // 6-month trend series (used for KPI sparklines and the toggleable bar chart)
  const revenueSeries  = useMemo(() => monthlySeries(sessions, 6, revenueOf), [sessions]);
  const trucksSeries   = useMemo(() => monthlySeries(sessions, 6, truckCount), [sessions]);
  const avgStaySeries  = useMemo(() => monthlySeries(sessions, 6, avgStayOf).map(p => p.value), [sessions]);
  const mismatchSeries = useMemo(() => monthlySeries(sessions, 6, mismatchesOf).map(p => p.value), [sessions]);

  const activeSeries = chartMetric === "revenue" ? revenueSeries : trucksSeries;
  const chartColor    = chartMetric === "revenue" ? "#4f46e5" : "#0ea5e9";
  const chartFormat   = chartMetric === "revenue" ? fmtShort : fmtInt;
  const sixMoTotal    = revenueSeries.reduce((a, b) => a + b.value, 0);
  const sixMoAvg      = sixMoTotal / (revenueSeries.length || 1);
  const bestMonth     = revenueSeries.reduce((a, b) => (b.value > a.value ? b : a), revenueSeries[0] ?? { label: "—", value: 0 });

  // revenue by location (dynamic, supports any number of locations)
  const revenueByLoc = useMemo(() => {
    const map: Record<string, number> = {};
    monthSessions.forEach(s => { map[s.location_id] = (map[s.location_id] ?? 0) + (s.total_amount ?? 0); });
    const locMap: Record<string, string> = {};
    locs.forEach(l => { locMap[l.id] = l.name; });
    return Object.entries(map)
      .map(([id, amt]) => ({ name: locMap[id] ?? id.slice(0, 8), amount: amt }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [monthSessions, locs]);
  const maxLocRev = Math.max(...revenueByLoc.map(r => r.amount), 1);
  const totalLocRev = revenueByLoc.reduce((a, b) => a + b.amount, 0);

  // truck type distribution
  const truckTypeDist = useMemo(() => {
    const map: Record<string, number> = {};
    trucks.forEach(t => { const k = t.truck_type?.toLowerCase() ?? "other"; map[k] = (map[k] ?? 0) + 1; });
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(map).map(([type, cnt]) => ({
      label: type.charAt(0).toUpperCase() + type.slice(1),
      count: cnt, pct: Math.round(cnt / total * 100),
      color: DONUT_COLORS[type] ?? DONUT_COLORS.other,
    })).sort((a, b) => b.pct - a.pct);
  }, [trucks]);

  // derived, honest insights — only rendered when the underlying figure is meaningful
  const insights = useMemo(() => {
    const items: { icon: React.ReactNode; text: string; tone: string }[] = [];
    if (dash) {
      const busiest = dash.weekly_revenue.filter(d => d.total > 0).reduce((a, b) => (b.total > a.total ? b : a), dash.weekly_revenue[0]);
      if (busiest && busiest.total > 0) {
        items.push({ icon: <TrendingUp className="w-4 h-4" />, tone: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10",
          text: `${busiest.day} was the busiest day this week, with ${fmtShort(busiest.total)} in revenue.` });
      }
      const weekTotal = dash.payment_split.total_cash + dash.payment_split.total_card_upi;
      if (weekTotal > 0) {
        const cashWins = dash.payment_split.cash_percent >= dash.payment_split.card_upi_percent;
        items.push({ icon: <Wallet className="w-4 h-4" />, tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
          text: `${(cashWins ? dash.payment_split.cash_percent : dash.payment_split.card_upi_percent).toFixed(0)}% of this week's revenue came from ${cashWins ? "cash" : "card/UPI"} payments.` });
      }
      if (dash.kpis.total_slots > 0) {
        items.push({ icon: <Activity className="w-4 h-4" />, tone: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
          text: `${dash.kpis.occupancy_percent.toFixed(0)}% of slots are occupied right now (${dash.kpis.occupied_slots}/${dash.kpis.total_slots}).` });
      }
    }
    if (prevMonthRevenue > 0) {
      const delta = Math.round(((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100);
      items.push({
        icon: delta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />,
        tone: delta >= 0 ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
        text: `Revenue is ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)}% compared to ${prevMonth?.label}.`,
      });
    }
    if (mismatches > 0) {
      items.push({ icon: <AlertTriangle className="w-4 h-4" />, tone: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
        text: `${mismatches} driver mismatch${mismatches > 1 ? "es" : ""} flagged this month — review in Verification.` });
    }
    return items;
  }, [dash, prevMonthRevenue, monthRevenue, prevMonth, mismatches]);

  // export
  async function exportPDF() {
    const { year, month } = months[monthIdx];
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
    const params = new URLSearchParams({ month: monthStr });
    if (locId) params.set("location_id", locId);
    const res = await fetch(`${BASE_URL}/reports/pdf?${params}`, { headers: { token: getToken() } });
    if (!res.ok) return;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = href; a.download = `report-${monthStr}.pdf`; a.click();
    URL.revokeObjectURL(href);
  }

  return (
    <>
      <style>{`@media print { .no-print { display:none!important; } }`}</style>

      <div className="relative min-h-full px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />

        {/* header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500 mb-1.5">
              <Link href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">Dashboard</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-gray-600 dark:text-slate-300 font-medium">Reports</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Reports &amp; analytics</h1>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">Trends, occupancy, revenue and operational summaries.</p>
          </div>
          <div className="no-print flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="p-2.5 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl transition shrink-0">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={exportPDF}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:-translate-y-0.5 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-md shadow-indigo-200 dark:shadow-none transition-all duration-200 whitespace-nowrap">
              <Download className="w-4 h-4" />Export PDF
            </button>
          </div>
        </div>

        {/* filters */}
        <div className="no-print flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <LocationSelect value={locId} onChange={setLocId} locations={locs} allowAll={isAdmin} locked={!isAdmin} className="w-full" />
          </div>
          <div className="flex-1">
            <EnumFilterSelect className="w-full" value={String(monthIdx)} onChange={(v) => setMonthIdx(Number(v))}
              options={months.map((m, i) => ({ value: String(i), label: m.label }))} showDot={false} />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* ── KPI row ── */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3.5">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-3xl" />)
          ) : (
            <>
              <KPICard delay={0} label="Total Trucks Served" value={totalTrucks} format={fmtInt}
                icon={<Truck className="w-4 h-4 text-blue-600 dark:text-blue-300" />} iconBg="bg-blue-100 dark:bg-blue-500/15"
                sub={months[monthIdx].label} badge={pctBadge(totalTrucks, prevTotalTrucks)}
                sparklineData={trucksSeries.map(p => p.value)} sparklineColor="#3b82f6" />
              <KPICard delay={0.06} label="Avg. Stay" value={avgStay} format={n => n > 0 ? `${n.toFixed(1)}d` : "—"}
                icon={<Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />} iconBg="bg-emerald-100 dark:bg-emerald-500/15"
                sub="Per truck" badge={pctBadge(avgStay, prevAvgStay)}
                sparklineData={avgStaySeries} sparklineColor="#10b981" />
              <KPICard delay={0.12} label="Current Occupancy" value={occupancyPercent} format={n => `${n.toFixed(0)}%`}
                icon={<Activity className="w-4 h-4 text-amber-600 dark:text-amber-300" />} iconBg="bg-amber-100 dark:bg-amber-500/15"
                sub={`${dash?.kpis.occupied_slots ?? 0} / ${dash?.kpis.total_slots ?? 0} slots`} />
              <KPICard delay={0.18} label="Mismatches" value={mismatches} format={fmtInt}
                icon={<AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-300" />} iconBg="bg-red-100 dark:bg-red-500/15"
                sub="This month" badge={pctBadge(mismatches, prevMismatches, true)}
                sparklineData={mismatchSeries} sparklineColor="#ef4444" />
              <KPICard delay={0.24} label="Today's Check-ins" value={dash?.kpis.today_checkins ?? 0} format={fmtInt}
                icon={<LogIn className="w-4 h-4 text-violet-600 dark:text-violet-300" />} iconBg="bg-violet-100 dark:bg-violet-500/15"
                sub="All locations" badge={countBadge(dash?.kpis.checkins_diff)} />
            </>
          )}
        </div>

        {/* ── revenue by location + live overview ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <GlassCard className="lg:col-span-3 p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200">Revenue by location</p>
              <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">{months[monthIdx].label}</span>
            </div>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-xl" />)}</div>
            ) : revenueByLoc.length === 0 ? (
              <EmptyState icon={<MapPin className="w-8 h-8" />} text="No revenue recorded for this period." />
            ) : (
              <div className="space-y-3.5">
                {revenueByLoc.map((loc, i) => {
                  const pct = Math.round(loc.amount / maxLocRev * 100);
                  const share = totalLocRev > 0 ? Math.round(loc.amount / totalLocRev * 100) : 0;
                  return (
                    <div key={loc.name} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-slate-800 text-[11px] font-bold text-gray-500 dark:text-slate-400 flex items-center justify-center shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <p className="text-xs font-semibold text-gray-700 dark:text-slate-200 truncate flex items-center gap-1.5">
                            {loc.name}
                            {i === 0 && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                          </p>
                          <p className="text-xs font-bold text-gray-800 dark:text-slate-200 shrink-0 ml-2">{fmtShort(loc.amount)} <span className="text-gray-400 dark:text-slate-500 font-medium">· {share}%</span></p>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${LOC_BAR_COLORS[i % LOC_BAR_COLORS.length]}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>

          <GlassCard className="lg:col-span-2 p-5">
            <p className="text-sm font-bold text-gray-800 dark:text-slate-200 mb-4">Live overview</p>
            {loading || !dash ? (
              <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : (
              <div className="flex items-center gap-4">
                <RatioRing percent={dash.kpis.occupancy_percent} color={occColor(dash.kpis.occupancy_percent)} />
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
                  <MiniStat label="Occupied" value={`${dash.kpis.occupied_slots} / ${dash.kpis.total_slots}`} />
                  <MiniStat label="Available" value={fmtInt(Math.max(dash.kpis.total_slots - dash.kpis.occupied_slots, 0))} />
                  <MiniStat label="Today's Revenue" value={fmtShort(dash.kpis.today_revenue)} />
                  <MiniStat label="Occupancy" value={`${dash.kpis.occupancy_percent.toFixed(0)}%`} />
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* ── monthly trend + truck type distribution ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <GlassCard className="lg:col-span-3 p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200">Monthly trend</p>
              <div className="flex items-center gap-1 bg-gray-50 dark:bg-slate-800/60 rounded-xl p-1">
                {(["revenue", "trucks"] as const).map(m => (
                  <button key={m} onClick={() => setChartMetric(m)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${chartMetric === m ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"}`}>
                    {m === "revenue" ? "Revenue" : "Trucks served"}
                  </button>
                ))}
              </div>
            </div>
            {!loading && chartMetric === "revenue" && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3">
                <MiniStat label="Total (6mo)" value={fmtShort(sixMoTotal)} />
                <MiniStat label="Best Month" value={`${bestMonth.label} · ${fmtShort(bestMonth.value)}`} />
                <MiniStat label="Avg / Month" value={fmtShort(sixMoAvg)} />
              </div>
            )}
            {loading ? <Skeleton className="h-52 rounded-xl" /> : <BarChart bars={activeSeries} color={chartColor} valueFormat={chartFormat} />}
          </GlassCard>

          <GlassCard className="lg:col-span-2 p-5">
            <p className="text-sm font-bold text-gray-800 dark:text-slate-200 mb-4">Truck type distribution</p>
            {loading ? (
              <Skeleton className="h-52 rounded-xl" />
            ) : truckTypeDist.length === 0 ? (
              <EmptyState icon={<PackageSearch className="w-8 h-8" />} text="No truck data available." />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <DonutChart segments={truckTypeDist} centerValue={fmtInt(trucks.length)} centerLabel="Total Trucks" />
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                  {truckTypeDist.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                      <span className="text-xs text-gray-600 dark:text-slate-300 font-medium">{s.label} · {s.count} ({s.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* ── weekly activity + occupancy by division ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <GlassCard className="lg:col-span-3 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200">Weekly activity</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /><span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Cash</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /><span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Card/UPI</span></div>
              </div>
            </div>
            {loading ? <Skeleton className="h-52 rounded-xl" /> : !dash || dash.weekly_revenue.every(d => d.total === 0) ? (
              <EmptyState icon={<Wallet className="w-8 h-8" />} text="No revenue recorded in the last 7 days." />
            ) : (
              <WeeklyActivityChart data={dash.weekly_revenue} />
            )}
          </GlassCard>

          <GlassCard className="lg:col-span-2 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200">Occupancy by division</p>
            </div>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-xl" />)}</div>
            ) : !dash || dash.division_occupancy.length === 0 ? (
              <EmptyState icon={<Layers className="w-8 h-8" />} text="No divisions configured yet." />
            ) : (
              <div className="space-y-3.5 max-h-56 overflow-y-auto pr-1">
                {dash.division_occupancy.map(d => (
                  <div key={d.division_id}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <p className="text-xs font-semibold text-gray-700 dark:text-slate-200 truncate flex items-center gap-1.5">
                        {d.division_name}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${DIV_TYPE_META[d.truck_type.toLowerCase()] ?? "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400"}`}>{d.truck_type}</span>
                      </p>
                      <p className="text-xs font-bold text-gray-800 dark:text-slate-200 shrink-0">{d.occupied_slots}/{d.total_slots}</p>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${occBarClass(d.occupancy_percent)}`} style={{ width: `${d.occupancy_percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* ── parking performance strip ── */}
        <GlassCard className="p-5">
          <p className="text-sm font-bold text-gray-800 dark:text-slate-200 mb-4">Parking performance · {months[monthIdx].label}</p>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <MiniStat label="Total Sessions" value={fmtInt(monthSessions.length)} />
              <MiniStat label="Completed" value={fmtInt(completedSessions)} />
              <MiniStat label="Active Now" value={fmtInt(activeSessions)} />
              <MiniStat label="Avg Revenue / Truck" value={fmtShort(avgRevenuePerTruck)} />
              <MiniStat label="Total Revenue" value={fmtShort(monthRevenue)} />
            </div>
          )}
        </GlassCard>

        {/* ── insights ── */}
        {!loading && insights.length > 0 && (
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <p className="text-sm font-bold text-gray-800 dark:text-slate-200">Insights</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {insights.map((it, i) => (
                <div key={i} className="flex items-start gap-3 bg-gray-50/60 dark:bg-slate-800/40 rounded-2xl px-4 py-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${it.tone}`}>{it.icon}</div>
                  <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">{it.text}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

      </div>
    </>
  );
}
