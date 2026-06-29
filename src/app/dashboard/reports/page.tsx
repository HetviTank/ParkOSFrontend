"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ChevronRight, ChevronDown, Download, AlertCircle,
  Truck, Clock, Activity, AlertTriangle, TrendingUp, MapPin,
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}
async function apiFetch<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", token },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error((e as { detail?: string }).detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── types ─────────────────────────────────────────────────────────────────────
interface Location   { id: string; name: string; city: string | null }
interface DashKPIs   { total_slots: number; occupied_slots: number; occupancy_percent: number; today_checkins: number; today_revenue: number; yesterday_revenue?: number; revenue_growth_percent: number }
interface DivOcc     { division_id: string; division_name: string; truck_type: string; total_slots: number; occupied_slots: number; occupancy_percent: number }
interface WeekRev    { date: string; day: string; cash: number; card_upi: number; total: number }
interface PaySplit   { cash_percent: number; card_upi_percent: number; total_cash: number; total_card_upi: number }
interface DashResp   { kpis: DashKPIs; division_occupancy: DivOcc[]; weekly_revenue: WeekRev[]; payment_split: PaySplit }
interface Session    { id: string; truck_id: string; location_id: string; days: number | null; total_amount: number | null; driver_match: string | null; check_out_time: string | null; created_at: string | null }
interface TruckObj   { id: string; truck_number: string; truck_type: string | null }

// ── utils ─────────────────────────────────────────────────────────────────────
function fmtRupees(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
function fmtShort(n: number)  { if (n >= 100000) return `₹${(n/100000).toFixed(1)}L`; if (n >= 1000) return `₹${(n/1000).toFixed(0)}k`; return fmtRupees(n); }

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

// ── Donut chart ────────────────────────────────────────────────────────────────
function DonutChart({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  const r = 60; const cx = 80; const cy = 80;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const paths = segments.filter(s => s.pct > 0).map(s => {
    const dash = (s.pct / 100) * circ;
    const gap  = circ - dash;
    const el = (
      <circle key={s.label} cx={cx} cy={cy} r={r}
        fill="none" stroke={s.color} strokeWidth={22}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    );
    offset += dash;
    return el;
  });
  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={22} />
      {paths}
    </svg>
  );
}

// ── CSS Bar chart ──────────────────────────────────────────────────────────────
function BarChart({ bars, color = "#4f46e5" }: { bars: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...bars.map(b => b.value), 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f));
  return (
    <div className="flex gap-3 h-48">
      {/* y-axis */}
      <div className="flex flex-col-reverse justify-between pb-6 pr-1 shrink-0">
        {yTicks.map((t, i) => (
          <span key={i} className="text-[10px] text-gray-400 leading-none text-right w-10">{fmtShort(t)}</span>
        ))}
      </div>
      {/* bars */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 relative">
          {/* grid lines */}
          {[0,1,2,3,4].map(i => (
            <div key={i} className="absolute w-full border-t border-gray-100" style={{ bottom: `${i * 25}%` }} />
          ))}
          {/* bars row */}
          <div className="absolute inset-0 flex items-end gap-1.5 px-1">
            {bars.map((b, i) => (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                <div className="w-full rounded-t-lg transition-all duration-700"
                  style={{ height: `${max > 0 ? (b.value / max) * 100 : 0}%`, background: i === bars.length - 1 ? `${color}80` : color, minHeight: b.value > 0 ? 4 : 0 }}
                />
              </div>
            ))}
          </div>
        </div>
        {/* x labels */}
        <div className="flex gap-1.5 px-1 h-6 items-center">
          {bars.map(b => (
            <div key={b.label} className="flex-1 text-center text-[10px] text-gray-400 truncate">{b.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

const selectCls = "appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-10 shadow-sm w-full";

// ── page ──────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const months     = useMemo(() => monthOptions(), []);
  const [locId,    setLocId]    = useState("");
  const [monthIdx, setMonthIdx] = useState(0);  // 0 = current month
  const [locs,     setLocs]     = useState<Location[]>([]);
  const [dash,     setDash]     = useState<DashResp | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [trucks,   setTrucks]   = useState<TruckObj[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  // load locations once
  useEffect(() => {
    apiFetch<{ count: number; list: Location[] }>("/locations?limit=50")
      .then(r => setLocs(r.list ?? [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const dashUrl = `/dashboard${locId ? `?location_id=${locId}` : ""}`;
      const sessUrl = `/parking-sessions?limit=300&sort_by=created_at&order=desc${locId ? `&location_id=${locId}` : ""}`;
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

  // sessions in selected month
  const monthSessions = useMemo(() =>
    sessions.filter(s => inMonth(s.check_out_time ?? s.created_at, selYear, selMonth)),
    [sessions, selYear, selMonth]
  );

  // kpi stats
  const totalTrucks   = useMemo(() => new Set(monthSessions.map(s => s.truck_id)).size, [monthSessions]);
  const avgStay       = useMemo(() => {
    const days = monthSessions.map(s => s.days).filter((d): d is number => d != null && d > 0);
    return days.length ? (days.reduce((a, b) => a + b, 0) / days.length) : 0;
  }, [monthSessions]);
  const peakOccupancy = dash?.kpis.occupancy_percent ?? 0;
  const mismatches    = useMemo(() =>
    sessions.filter(s => s.driver_match === "mismatch" && inMonth(s.check_out_time ?? s.created_at, selYear, selMonth)).length,
    [sessions, selYear, selMonth]
  );

  // monthly revenue (last 6 months)
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const y   = d.getFullYear(); const m = d.getMonth();
      const rev = sessions.filter(s => inMonth(s.check_out_time ?? s.created_at, y, m))
                          .reduce((sum, s) => sum + (s.total_amount ?? 0), 0);
      return { label: d.toLocaleDateString("en-IN", { month: "short" }), value: rev };
    });
  }, [sessions]);

  // revenue by location
  const revenueByLoc = useMemo(() => {
    const map: Record<string, number> = {};
    monthSessions.forEach(s => { map[s.location_id] = (map[s.location_id] ?? 0) + (s.total_amount ?? 0); });
    const locMap: Record<string, string> = {};
    locs.forEach(l => { locMap[l.id] = l.name; });
    const entries = Object.entries(map).map(([id, amt]) => ({ name: locMap[id] ?? id.slice(0, 8), amount: amt }));
    entries.sort((a, b) => b.amount - a.amount);
    return entries.slice(0, 5);
  }, [monthSessions, locs]);

  const maxLocRev = Math.max(...revenueByLoc.map(r => r.amount), 1);

  // truck type distribution
  const truckTypeDist = useMemo(() => {
    const map: Record<string, number> = {};
    trucks.forEach(t => { const k = t.truck_type?.toLowerCase() ?? "other"; map[k] = (map[k] ?? 0) + 1; });
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    const colors: Record<string, string> = { heavy: "#6366f1", medium: "#a855f7", light: "#22c55e", other: "#94a3b8" };
    return Object.entries(map).map(([type, cnt]) => ({
      label: type.charAt(0).toUpperCase() + type.slice(1),
      count: cnt, pct: Math.round(cnt / total * 100),
      color: colors[type] ?? "#94a3b8",
    })).sort((a, b) => b.pct - a.pct);
  }, [trucks]);

  // export
  function exportPDF() { window.print(); }

  return (
    <>
      <style>{`@media print { .no-print { display:none!important; } }`}</style>

      <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-6">

        {/* header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
              <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-gray-600 font-medium">Reports</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reports &amp; analytics</h1>
            <p className="text-sm text-gray-400 mt-0.5">Trends, occupancy, revenue and operational summaries.</p>
          </div>
        </div>

        {/* filters */}
        <div className="no-print flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <select value={locId} onChange={e => setLocId(e.target.value)} className={selectCls}>
              <option value="">All locations</option>
              {locs.map(l => <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ""}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative flex-1">
            <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))} className={selectCls}>
              {months.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <button onClick={exportPDF}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm shadow-blue-200 transition whitespace-nowrap">
            <Download className="w-4 h-4" />Export PDF
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* ── top section: stat cards + revenue by location ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* 4 stat cards (2×2) */}
          <div className="lg:col-span-3 grid grid-cols-2 gap-4">

            {/* Total trucks served */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-5 relative overflow-hidden">
              <div className="absolute right-3 top-3 w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Truck className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-xs font-semibold text-blue-500">Total trucks served</p>
              {loading ? <div className="h-8 w-16 bg-blue-100 rounded-lg animate-pulse mt-2" />
                : <p className="text-4xl font-black text-blue-700 mt-1">{totalTrucks || monthSessions.length}</p>}
              <p className="text-xs text-blue-400 mt-1">{months[monthIdx].label}</p>
            </div>

            {/* Avg stay */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-5 relative overflow-hidden">
              <div className="absolute right-3 top-3 w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-xs font-semibold text-emerald-500">Avg. stay</p>
              {loading ? <div className="h-8 w-20 bg-emerald-100 rounded-lg animate-pulse mt-2" />
                : <p className="text-4xl font-black text-emerald-600 mt-1">{avgStay > 0 ? `${avgStay.toFixed(1)} days` : "—"}</p>}
              <p className="text-xs text-emerald-400 mt-1">Per truck</p>
            </div>

            {/* Peak occupancy */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-5 relative overflow-hidden">
              <div className="absolute right-3 top-3 w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-xs font-semibold text-amber-500">Peak occupancy</p>
              {loading ? <div className="h-8 w-16 bg-amber-100 rounded-lg animate-pulse mt-2" />
                : <p className="text-4xl font-black text-amber-600 mt-1">{peakOccupancy > 0 ? `${peakOccupancy.toFixed(0)}%` : "—"}</p>}
              <p className="text-xs text-amber-400 mt-1">{months[monthIdx].label}</p>
            </div>

            {/* Mismatches */}
            <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-5 relative overflow-hidden">
              <div className="absolute right-3 top-3 w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-xs font-semibold text-red-500">Mismatches</p>
              {loading ? <div className="h-8 w-10 bg-red-100 rounded-lg animate-pulse mt-2" />
                : <p className="text-4xl font-black text-red-600 mt-1">{mismatches}</p>}
              <p className="text-xs text-red-400 mt-1">This month</p>
            </div>
          </div>

          {/* Revenue by location */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-gray-400" />
              <p className="text-sm font-bold text-gray-800">Revenue by location</p>
            </div>
            {loading ? (
              <div className="space-y-3">{Array.from({length:3}).map((_,i) => <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />)}</div>
            ) : revenueByLoc.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-6">No data for this period.</p>
            ) : (
              <div className="space-y-3">
                {revenueByLoc.map((loc, i) => {
                  const barColors = ["bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500","bg-red-400"];
                  const pct = Math.round(loc.amount / maxLocRev * 100);
                  return (
                    <div key={loc.name}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-blue-600 truncate">{loc.name}</p>
                        <p className="text-xs font-bold text-gray-700 shrink-0 ml-2">{fmtShort(loc.amount)}</p>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${barColors[i % barColors.length]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── bottom section: bar chart + donut ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Monthly revenue bar chart */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-gray-800">
                Monthly revenue ({new Date().getFullYear()})
              </p>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-indigo-500" />
                <span className="text-xs text-gray-400 font-medium">Revenue</span>
              </div>
            </div>
            {loading ? (
              <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
            ) : (
              <BarChart bars={monthlyRevenue} color="#4f46e5" />
            )}
          </div>

          {/* Truck type distribution donut */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5">
            <p className="text-sm font-bold text-gray-800 mb-4">Truck type distribution</p>
            {loading ? (
              <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
            ) : truckTypeDist.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-10">No truck data.</p>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <DonutChart segments={truckTypeDist} />
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                  {truckTypeDist.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                      <span className="text-xs text-gray-600 font-medium">{s.label} {s.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── additional: payment split + live occupancy ── */}
        {dash && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">Payment split</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 font-medium">Cash</span>
                    <span className="font-bold text-emerald-600">{dash.payment_split.cash_percent.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${dash.payment_split.cash_percent}%` }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 font-medium">Card / UPI</span>
                    <span className="font-bold text-blue-600">{dash.payment_split.card_upi_percent.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${dash.payment_split.card_upi_percent}%` }} /></div>
                </div>
              </div>
              <div className="flex justify-between mt-3 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400">Cash: <span className="font-bold text-gray-700">{fmtShort(dash.payment_split.total_cash)}</span></p>
                <p className="text-xs text-gray-400">Card/UPI: <span className="font-bold text-gray-700">{fmtShort(dash.payment_split.total_card_upi)}</span></p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">Live occupancy</p>
              <div className="flex items-end gap-2 mb-2">
                <p className="text-3xl font-black text-gray-900">{dash.kpis.occupied_slots}</p>
                <p className="text-sm text-gray-400 pb-1">/ {dash.kpis.total_slots} slots</p>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${dash.kpis.occupancy_percent >= 90 ? "bg-red-500" : dash.kpis.occupancy_percent >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${dash.kpis.occupancy_percent}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">{dash.kpis.occupancy_percent.toFixed(0)}% occupied right now</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">Today&apos;s revenue</p>
              <p className="text-3xl font-black text-gray-900">{fmtShort(dash.kpis.today_revenue)}</p>
              <div className={`flex items-center gap-1 mt-1 ${dash.kpis.revenue_growth_percent >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">
                  {dash.kpis.revenue_growth_percent >= 0 ? "+" : ""}{dash.kpis.revenue_growth_percent.toFixed(0)}% vs yesterday
                </span>
              </div>
              {(dash.kpis.yesterday_revenue ?? 0) > 0 && (
                <p className="text-xs text-gray-400 mt-1">Yesterday: {fmtShort(dash.kpis.yesterday_revenue as number)}</p>
              )}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
