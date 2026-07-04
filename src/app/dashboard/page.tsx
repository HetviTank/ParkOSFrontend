"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp, TrendingDown, AlertTriangle, Clock,
  Layers, BarChart2, Activity, CreditCard, Loader2, ExternalLink,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import type {
  DashboardResponse, DivisionOccupancyItem, SlotMapDivision,
  WeeklyRevenueItem, PaymentSplit,
} from "@/types/dashboard";

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

// ── slot / alert styling ──────────────────────────────────────────────────────
const SLOT_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  free:     { bg: "bg-emerald-50",  border: "border-emerald-300", text: "text-emerald-700" },
  occupied: { bg: "bg-rose-50",     border: "border-rose-300",    text: "text-rose-600"    },
  reserved: { bg: "bg-amber-50",    border: "border-amber-300",   text: "text-amber-700"   },
};

const CHART = { cash: "#3b82f6", card: "#10b981" };

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

  // mount flag for recharts SSR guard
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setClock(clockNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (!token || !storedUser) { router.replace("/login"); return; }
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE_URL}/dashboard`, { headers: { token } });
      if (res.status === 401) { router.replace("/login"); return; }
      if (!res.ok) throw new Error("Failed to load dashboard data.");
      setData(await res.json());
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchOverdueTrucks = useCallback(async () => {
    const token = localStorage.getItem("token") ?? "";
    if (!token) return;
    setOverdueLoading(true);
    try {
      const [rulesRes, parkedRes, overdueRes] = await Promise.all([
        fetch(`${BASE_URL}/overdue-alert-rules`, { headers: { token } }).then(r => r.ok ? r.json() : { list: [] }).catch(() => ({ list: [] })),
        fetch(`${BASE_URL}/parking-sessions?status=parked&start=0&limit=50&sort_by=check_in_time&order=asc`, { headers: { token } }).then(r => r.ok ? r.json() : { list: [] }).catch(() => ({ list: [] })),
        fetch(`${BASE_URL}/parking-sessions?status=overdue&start=0&limit=50&sort_by=check_in_time&order=asc`, { headers: { token } }).then(r => r.ok ? r.json() : { list: [] }).catch(() => ({ list: [] })),
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
  }, []);

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
    <main className="px-4 sm:px-6 py-6 space-y-5 max-w-screen-2xl mx-auto">

        {/* Greeting */}
        {user && (
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{greet()}, {user.name} 👋</h1>
              <p className="text-sm text-gray-400 mt-0.5">{dateLabel()} · live as of {clock}</p>
            </div>
            {lastUpdated && (
              <p className="text-xs text-gray-400">
                Last refreshed at{" "}
                {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
            )}
          </div>
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
                label="Total Slots"
                value={data.kpis.total_slots.toString()}
                sub={`${data.kpis.total_divisions} division${data.kpis.total_divisions !== 1 ? "s" : ""}`}
                icon={<Layers className="w-5 h-5 text-blue-600" />}
                iconBg="bg-blue-100"
                accentColor="border-l-blue-500"
              />
              <KPICard
                label="Occupied"
                value={data.kpis.occupied_slots.toString()}
                sub={`${data.kpis.occupancy_percent.toFixed(0)}% of capacity`}
                subColor={data.kpis.occupancy_percent >= 80 ? "text-rose-500" : "text-amber-500"}
                icon={<BarChart2 className="w-5 h-5 text-rose-500" />}
                iconBg="bg-rose-100"
                accentColor="border-l-rose-500"
              />
              <KPICard
                label="Today's Check-ins"
                value={data.kpis.today_checkins.toString()}
                sub={`${data.kpis.checkins_diff >= 0 ? "+" : ""}${data.kpis.checkins_diff} vs yesterday`}
                subColor={data.kpis.checkins_diff > 0 ? "text-emerald-600" : data.kpis.checkins_diff < 0 ? "text-rose-500" : "text-gray-400"}
                subIcon={data.kpis.checkins_diff > 0 ? "up" : data.kpis.checkins_diff < 0 ? "down" : undefined}
                icon={<Activity className="w-5 h-5 text-emerald-600" />}
                iconBg="bg-emerald-100"
                accentColor="border-l-emerald-500"
              />
              <KPICard
                label="Today's Revenue"
                value={fmt(data.kpis.today_revenue)}
                sub={`${data.kpis.revenue_growth_percent >= 0 ? "+" : ""}${data.kpis.revenue_growth_percent.toFixed(1)}% vs yesterday`}
                subColor={data.kpis.revenue_growth_percent > 0 ? "text-emerald-600" : data.kpis.revenue_growth_percent < 0 ? "text-rose-500" : "text-gray-400"}
                subIcon={data.kpis.revenue_growth_percent > 0 ? "up" : data.kpis.revenue_growth_percent < 0 ? "down" : undefined}
                icon={<CreditCard className="w-5 h-5 text-amber-600" />}
                iconBg="bg-amber-100"
                accentColor="border-l-amber-500"
              />
            </div>

            {/* ── Main grid: slot map + right panel ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3">
                <SlotMapCard divisions={data.slot_map} />
              </div>
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                <DivisionOccupancyCard items={data.division_occupancy} />
                <OverdueTrucksCard trucks={overdueTrucks} loading={overdueLoading} rulesConfigured={overdueRules.length > 0} />
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
function KPICard({
  label, value, sub, subColor = "text-gray-400", subIcon,
  icon, iconBg, accentColor,
}: {
  label: string; value: string; sub?: string; subColor?: string; subIcon?: "up" | "down";
  icon: React.ReactNode; iconBg: string; accentColor: string;
}) {
  return (
    <div className={`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm border-l-4 ${accentColor}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
      </div>
      <p className="text-3xl font-bold text-gray-900 tracking-tight">{value}</p>
      {sub && (
        <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${subColor}`}>
          {subIcon === "up"   && <TrendingUp  className="w-3.5 h-3.5" />}
          {subIcon === "down" && <TrendingDown className="w-3.5 h-3.5" />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

// ── Slot Map ──────────────────────────────────────────────────────────────────
function SlotMapCard({ divisions }: { divisions: SlotMapDivision[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col h-full min-h-[320px]">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="font-semibold text-gray-900">Live Slot Map</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {(["free", "occupied", "reserved"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1 capitalize">
              <span className={`w-3 h-3 rounded-sm inline-block border ${SLOT_STYLE[s].bg} ${SLOT_STYLE[s].border}`} />
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-5 overflow-y-auto flex-1 min-h-0 pr-1">
        {divisions.map((div) => (
          <div key={div.division_id}>
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-2">
              {div.division_name} — {div.truck_type}
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
              {div.slots.map((slot) => {
                const s = SLOT_STYLE[slot.status.toLowerCase()] ?? SLOT_STYLE.free;
                return (
                  <div
                    key={slot.id}
                    className={`${s.bg} ${s.border} ${s.text} border rounded-lg py-1.5 text-center text-xs font-semibold tracking-wide select-none`}
                  >
                    {slot.code}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {divisions.length === 0 && (
          <p className="text-center text-gray-300 py-12 text-sm">No slot data available</p>
        )}
      </div>
    </div>
  );
}

// ── Division Occupancy ────────────────────────────────────────────────────────
function DivisionOccupancyCard({ items }: { items: DivisionOccupancyItem[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="font-semibold text-gray-900 mb-4">Division Occupancy</h2>
      <div className="space-y-4">
        {items.map((item) => {
          const pct = item.occupancy_percent;
          const barColor =
            pct >= 85 ? "bg-rose-500" :
            pct >= 60 ? "bg-amber-400" :
            "bg-emerald-500";
          return (
            <div key={item.division_id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-gray-800 truncate">{item.division_name}</span>
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">
                    {item.truck_type}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-700 shrink-0 ml-2">
                  {item.occupied_slots}
                  <span className="text-gray-400 font-normal">/{item.total_slots}</span>
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`${barColor} h-2 rounded-full transition-all duration-700`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{pct.toFixed(0)}%</p>
            </div>
          );
        })}
        {items.length === 0 && <p className="text-sm text-gray-300 text-center py-4">No data</p>}
      </div>
    </div>
  );
}

// ── Overdue Trucks ────────────────────────────────────────────────────────────
function OverdueTrucksCard({ trucks, loading, rulesConfigured }: {
  trucks: EnrichedOverdue[];
  loading: boolean;
  rulesConfigured: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Overdue Trucks</h2>
        {trucks.length > 0 && (
          <span className="bg-rose-100 text-rose-600 text-xs font-bold px-2.5 py-1 rounded-full">
            {trucks.length} overdue
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Checking parked trucks…</span>
        </div>
      )}

      {!loading && !rulesConfigured && (
        <div className="text-center py-8">
          <AlertTriangle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No overdue rules configured.</p>
          <p className="text-xs text-gray-300 mt-1">Set thresholds in Settings to see overdue trucks here.</p>
        </div>
      )}

      {!loading && rulesConfigured && trucks.length === 0 && (
        <div className="text-center py-8">
          <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No overdue trucks right now</p>
        </div>
      )}

      {!loading && trucks.length > 0 && (
        <div className="space-y-2.5 overflow-y-auto max-h-56">
          {trucks.map((t) => {
            const hex = t.rule.color;
            return (
              <div
                key={t.sessionId}
                className="border-l-4 rounded-r-xl pl-3 pr-3.5 py-2.5"
                style={{ backgroundColor: hex + "14", borderLeftColor: hex }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold font-mono text-gray-900">{t.truckNumber}</span>
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
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full uppercase">
                        {t.entryType}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {t.ownerName}
                      {t.ownerMobile ? ` · ${t.ownerMobile}` : ""}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      In: {new Date(t.checkInTime).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/trucks/profile?truck=${encodeURIComponent(t.truckNumber)}`}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Weekly Revenue Chart ──────────────────────────────────────────────────────
function WeeklyRevenueCard({ data }: { data: WeeklyRevenueItem[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = (payload as { value: number }[]).reduce((s, p) => s + (p.value ?? 0), 0);
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[160px]">
        <p className="font-semibold text-gray-900 mb-2">{label}</p>
        {(payload as { name: string; value: number; fill: string }[]).map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.fill }} />
              <span className="text-gray-500">{p.name}</span>
            </div>
            <span className="font-medium text-gray-800">{fmt(p.value)}</span>
          </div>
        ))}
        <div className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between">
          <span className="text-gray-400 text-xs">Total</span>
          <span className="font-bold text-gray-900">{fmt(total)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-gray-900">Revenue this week</h2>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm inline-block" style={{ background: CHART.cash }} />
            Cash
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm inline-block" style={{ background: CHART.card }} />
            Card / UPI
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} barCategoryGap="40%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#f3f4f6" />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#9ca3af" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickFormatter={fmtShort}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f9fafb", radius: 6 }} />
          <Bar dataKey="cash"     stackId="a" fill={CHART.cash} name="Cash"     radius={[0, 0, 0, 0]} />
          <Bar dataKey="card_upi" stackId="a" fill={CHART.card} name="Card/UPI" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Payment Split Donut ───────────────────────────────────────────────────────
function PaymentSplitCard({ split }: { split: PaymentSplit }) {
  const total = split.total_cash + split.total_card_upi;
  const pieData = [
    { name: "Cash",      value: split.total_cash,      percent: split.cash_percent      },
    { name: "Card / UPI",value: split.total_card_upi,  percent: split.card_upi_percent  },
  ];
  const PIE_COLORS = [CHART.cash, CHART.card];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as { name: string; value: number; percent: number };
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-sm">
        <p className="font-semibold text-gray-900">{d.name}</p>
        <p className="text-gray-500">{fmt(d.value)}</p>
        <p className="text-xs text-gray-400">{d.percent.toFixed(1)}%</p>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="font-semibold text-gray-900 mb-4">Payment Split</h2>

      {/* Donut with centered label */}
      <div className="relative h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {pieData.map((_, i) => (
                <Cell key={`c-${i}`} fill={PIE_COLORS[i]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-lg font-bold text-gray-900 leading-tight">{fmt(total)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">7-day total</p>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 space-y-2.5">
        {pieData.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i] }} />
              <span className="text-sm text-gray-600">{d.name}</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold text-gray-900">{fmt(d.value)}</span>
              <span className="text-xs text-gray-400 ml-1.5">{d.percent.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm h-28 border-l-4 border-l-gray-200">
            <div className="flex justify-between mb-3">
              <div className="h-3.5 w-24 bg-gray-100 rounded-full" />
              <div className="w-10 h-10 bg-gray-100 rounded-xl" />
            </div>
            <div className="h-7 w-20 bg-gray-100 rounded-lg" />
            <div className="h-3 w-28 bg-gray-50 rounded-full mt-2.5" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm h-80" />
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-36" />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm h-64" />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-64" />
      </div>
    </div>
  );
}
