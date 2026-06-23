"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ChevronRight, ArrowLeft, Search, Loader2, AlertCircle,
  Car, User, Phone, MapPin, Clock, TrendingUp,
  CalendarDays, BarChart2, UserCog, Shield,
  ShieldX, BadgeCheck, Receipt,
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
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ── types ─────────────────────────────────────────────────────────────────────
interface TruckData { id: string; truck_number: string; truck_type: string; owner_id: string }
interface OwnerData { id: string; name: string; company: string | null; primary_mobile: string; alternate_mobile: string | null; email: string | null }
interface Session {
  id: string; truck_id: string; owner_id: string; location_id: string; division_id: string;
  slot_id: string | null; status: string; entry_type: string; driver_match: string;
  checkin_driver_name: string; checkin_driver_mobile: string;
  check_in_time: string; check_out_time: string | null;
  rate_per_day: number; gst_percent: number;
  days: number | null; total_amount: number | null;
  checkin_remarks: string | null; checkout_remarks: string | null;
}
interface DivData  { id: string; name: string }
interface SlotData { id: string; code: string }
interface LocData  { id: string; name: string; city: string | null }
interface Payment  { id: string; session_id: string; method: string; status: string; total_amount: number }
interface HistoryItem extends Session {
  divisionName: string; slotCode: string; locationName: string;
  paymentMethod: string | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function daysSince(iso: string) { return Math.max(1, Math.ceil((Date.now() - new Date(iso).getTime()) / 86_400_000)); }
function fmt(iso: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", opts ?? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtRange(s: Session): string {
  const cin = new Date(s.check_in_time);
  if (!s.check_out_time) return `In ${fmtShort(s.check_in_time)} — still parked`;
  const cout = new Date(s.check_out_time);
  if (cin.getMonth() === cout.getMonth() && cin.getFullYear() === cout.getFullYear())
    return `${cin.getDate()} – ${cout.getDate()} ${cin.toLocaleString("en-IN", { month: "short" })}`;
  return `${cin.getDate()} ${cin.toLocaleString("en-IN", { month: "short" })} – ${cout.getDate()} ${cout.toLocaleString("en-IN", { month: "short" })}`;
}
function getLast6Months(sessions: Session[]): { label: string; count: number }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      label: d.toLocaleString("en-IN", { month: "short" }),
      count: sessions.filter(s => {
        const sd = new Date(s.check_in_time);
        return sd.getFullYear() === d.getFullYear() && sd.getMonth() === d.getMonth();
      }).length,
    };
  });
}
function usualDriver(sessions: Session[]): string {
  const counts: Record<string, number> = {};
  sessions.forEach(s => { counts[s.checkin_driver_name] = (counts[s.checkin_driver_name] ?? 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}
function avgGapDays(sessions: Session[]): number | null {
  const sorted = [...sessions].sort((a, b) => +new Date(a.check_in_time) - +new Date(b.check_in_time));
  if (sorted.length < 2) return null;
  let total = 0;
  for (let i = 1; i < sorted.length; i++) total += (+new Date(sorted[i].check_in_time) - +new Date(sorted[i-1].check_in_time)) / 86_400_000;
  return Math.round(total / (sorted.length - 1));
}
function insight(sessions: Session[], monthly: { count: number }[]): string {
  const avg3 = monthly.slice(-3).reduce((s, m) => s + m.count, 0) / 3;
  const completed = sessions.filter(s => s.days && s.days > 0);
  const avgDays = completed.length ? (completed.reduce((s, r) => s + (r.days ?? 0), 0) / completed.length).toFixed(1) : "—";
  if (avg3 >= 4) return `Very frequent visitor — comes about ${Math.round(avg3)} times a month and stays ${avgDays} days each visit.`;
  if (avg3 >= 2) return `Regular visitor — averages ${avg3.toFixed(1)} visits per month with an average stay of ${avgDays} days.`;
  if (avg3 >= 0.5) return `Occasional visitor — comes about once or twice a month, staying around ${avgDays} days.`;
  return `Infrequent visitor — comes a few times a year with an average stay of ${avgDays} days.`;
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── page export ───────────────────────────────────────────────────────────────
export default function TruckProfilePage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-center text-sm text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…</div>}>
      <ProfileContent />
    </Suspense>
  );
}

// ── main client component ─────────────────────────────────────────────────────
function ProfileContent() {
  const params   = useSearchParams();
  const router   = useRouter();
  const [searchInput, setSearchInput] = useState(params.get("truck") ?? "");

  const [truck,   setTruck]   = useState<TruckData | null>(null);
  const [owner,   setOwner]   = useState<OwnerData | null>(null);
  const [sessions,setSessions]= useState<Session[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [activeLocName, setActiveLocName] = useState("—");
  const [activeDivName, setActiveDivName] = useState("—");
  const [activeSlotCode, setActiveSlotCode] = useState("—");

  const dCache = useRef<Record<string, DivData>>({});
  const sCache = useRef<Record<string, SlotData>>({});
  const lCache = useRef<Record<string, LocData>>({});

  const load = useCallback(async (truckNumber: string) => {
    if (!truckNumber.trim()) return;
    setLoading(true); setError(""); setTruck(null); setOwner(null); setSessions([]); setHistory([]);
    try {
      const trRes = await apiFetch<{ list: TruckData[] }>(`/trucks?search=${encodeURIComponent(truckNumber.trim())}&start=0&limit=10`);
      if (!trRes.list?.length) { setError(`No truck found with number "${truckNumber}".`); return; }
      const t = trRes.list.find(r => r.truck_number.toLowerCase() === truckNumber.trim().toLowerCase()) ?? trRes.list[0];
      setTruck(t);

      const [ownerRes, sessRes] = await Promise.allSettled([
        apiFetch<OwnerData>(`/owners/${t.owner_id}`),
        apiFetch<{ count: number; list: Session[] }>(`/parking-sessions?truck_id=${t.id}&start=0&limit=200&sort_by=check_in_time&order=desc`),
      ]);
      if (ownerRes.status === "fulfilled") setOwner(ownerRes.value);
      const allSessions = sessRes.status === "fulfilled" ? (sessRes.value.list ?? []) : [];
      setSessions(allSessions);

      // enrich active session
      const active = allSessions.find(s => s.status === "parked" || s.status === "overdue");
      if (active) {
        const [dRes, slRes, loRes] = await Promise.allSettled([
          apiFetch<DivData>(`/divisions/${active.division_id}`),
          active.slot_id ? apiFetch<SlotData>(`/slots/${active.slot_id}`) : Promise.resolve(null),
          apiFetch<LocData>(`/locations/${active.location_id}`),
        ]);
        if (dRes.status  === "fulfilled") { const d = dRes.value;  dCache.current[active.division_id] = d; setActiveDivName(d?.name ?? "—"); }
        if (loRes.status === "fulfilled") { const l = loRes.value; lCache.current[active.location_id] = l; setActiveLocName(l?.name ?? "—"); }
        if (slRes.status === "fulfilled" && slRes.value && active.slot_id) {
          const sl = slRes.value; sCache.current[active.slot_id] = sl; setActiveSlotCode(sl?.code ?? "—");
        }
      }

      // enrich recent history (up to 5)
      const recent = allSessions.slice(0, 5);
      const enriched = await Promise.all(recent.map(async (s): Promise<HistoryItem> => {
        const divId  = s.division_id;
        const locId  = s.location_id;
        const slotId = s.slot_id;

        const [dRes, slRes, loRes, payRes] = await Promise.allSettled([
          dCache.current[divId]
            ? Promise.resolve(dCache.current[divId])
            : apiFetch<DivData>(`/divisions/${divId}`).then(d => { dCache.current[divId] = d; return d; }),
          slotId && !sCache.current[slotId]
            ? apiFetch<SlotData>(`/slots/${slotId}`).then(sl => { sCache.current[slotId] = sl; return sl; })
            : Promise.resolve(slotId ? sCache.current[slotId] ?? null : null),
          lCache.current[locId]
            ? Promise.resolve(lCache.current[locId])
            : apiFetch<LocData>(`/locations/${locId}`).then(l => { lCache.current[locId] = l; return l; }),
          apiFetch<{ list: Payment[] }>(`/payments?session_id=${s.id}&limit=1`),
        ]);

        return {
          ...s,
          divisionName:  dRes.status  === "fulfilled" ? dRes.value?.name  ?? "—" : "—",
          slotCode:      slRes.status === "fulfilled" && slRes.value ? (slRes.value as SlotData)?.code ?? "—" : "—",
          locationName:  loRes.status === "fulfilled" ? loRes.value?.name ?? "—" : "—",
          paymentMethod: payRes.status === "fulfilled" ? payRes.value?.list?.[0]?.method ?? null : null,
        };
      }));
      setHistory(enriched);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load truck profile."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = params.get("truck");
    if (t) load(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFind(e: { preventDefault(): void }) {
    e.preventDefault();
    router.push(`/dashboard/trucks/profile?truck=${encodeURIComponent(searchInput.trim())}`);
    load(searchInput.trim());
  }

  // ── computed ────────────────────────────────────────────────────────────────
  const now        = new Date();
  const totalVisits = sessions.length;
  const thisMonth   = sessions.filter(s => { const d = new Date(s.check_in_time); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
  const completed   = sessions.filter(s => s.days && s.days > 0);
  const avgStay     = completed.length ? (completed.reduce((s, r) => s + (r.days ?? 0), 0) / completed.length) : 0;
  const totalRev    = sessions.reduce((s, r) => s + (r.total_amount ?? 0), 0);
  const usualDrv    = usualDriver(sessions);
  const avgGap      = avgGapDays(sessions);
  const lastIn      = sessions[0]?.check_in_time ?? null;
  const lastOut     = sessions.find(s => s.check_out_time)?.check_out_time ?? null;
  const activeSession = sessions.find(s => s.status === "parked" || s.status === "overdue") ?? null;
  const monthly     = getLast6Months(sessions);
  const maxBar      = Math.max(...monthly.map(m => m.count), 1);
  const insightText = sessions.length ? insight(sessions, monthly) : "";
  const sinceYear   = lastIn ? new Date(lastIn).getFullYear() : null;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-5">

      {/* ── Header bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/trucks" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 bg-white px-3 py-2 rounded-xl transition">
            <ArrowLeft className="w-4 h-4" />Back
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-0.5">
              <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
              <ChevronRight className="w-3 h-3" />
              <Link href="/dashboard/trucks" className="hover:text-blue-600 transition">All Trucks</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-gray-600 font-medium">Truck Profile</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Truck Profile</h1>
          </div>
        </div>

        {/* Search / Find */}
        <form onSubmit={handleFind} className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Truck number…"
              className="pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition w-44"
            />
          </div>
          <button type="submit" disabled={loading || !searchInput.trim()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold text-sm px-4 py-2 rounded-xl shadow-sm shadow-blue-200 transition">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Find
          </button>
        </form>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-28 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm h-24 animate-pulse" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm h-60 animate-pulse" />
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-60 animate-pulse" />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !truck && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
            <Car className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-base font-bold text-gray-900">Search for a truck</h2>
          <p className="text-sm text-gray-400 mt-1">Enter a truck registration number above to view its full profile, visit history, and analytics.</p>
        </div>
      )}

      {/* ── Profile content ── */}
      {!loading && truck && (
        <>
          {/* ── Truck header card ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              {/* Left: badge + info */}
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="bg-gradient-to-br from-blue-700 to-violet-700 text-white font-bold text-sm font-mono tracking-widest px-4 py-3 rounded-2xl shadow-md shadow-blue-200 shrink-0">
                  {truck.truck_number}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">
                    {cap(truck.truck_type)} truck
                    {owner && <> · Owned by <span className="text-blue-700">{owner.name}</span>{owner.company ? <span className="text-gray-400 font-normal"> ({owner.company})</span> : null}</>}
                  </p>
                  {activeSession && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {activeLocName} · {activeDivName} · Slot {activeSlotCode}
                      <span>·</span>
                      <User className="w-3 h-3 shrink-0" />Usual driver: {usualDrv}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {activeSession && (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${activeSession.status === "overdue" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                        {activeSession.status === "overdue" ? `Overdue · ${daysSince(activeSession.check_in_time)} days` : `Parked · ${daysSince(activeSession.check_in_time)} ${daysSince(activeSession.check_in_time) === 1 ? "day" : "days"}`}
                      </span>
                    )}
                    {totalVisits > 0 && sinceYear && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                        {totalVisits} visits since {sinceYear}
                      </span>
                    )}
                    {totalRev > 0 && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        ₹{totalRev.toLocaleString("en-IN")} total
                      </span>
                    )}
                    {activeSession && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {cap(activeSession.entry_type ?? "regular")} · pay per visit
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: action buttons */}
              <div className="flex items-center gap-2 shrink-0 self-start">
                {owner && (
                  <Link href={`/dashboard/owners`} className="flex items-center gap-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold px-3 py-2 rounded-xl transition">
                    <UserCog className="w-3.5 h-3.5" />View owner
                  </Link>
                )}
                <Link href="/dashboard/blacklist" className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 text-xs font-semibold px-3 py-2 rounded-xl transition">
                  <ShieldX className="w-3.5 h-3.5" />Add to blacklist
                </Link>
              </div>
            </div>
          </div>

          {/* ── Stats strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={CalendarDays} bg="bg-blue-50" ic="text-blue-600" value={totalVisits.toString()} label="Total visits" sub={sinceYear ? `Since ${sinceYear}` : "All time"} />
            <StatCard icon={BarChart2}    bg="bg-violet-50" ic="text-violet-600" value={thisMonth.toString()} label="Visits this month" sub={now.toLocaleString("en-IN", { month: "long", year: "numeric" })} />
            <StatCard icon={Clock}        bg="bg-amber-50" ic="text-amber-600" value={avgStay ? `${avgStay.toFixed(1)} days` : "—"} label="Avg. stay" sub="Per visit" highlight />
            <StatCard icon={TrendingUp}   bg="bg-emerald-50" ic="text-emerald-600" value={totalRev > 0 ? `₹${totalRev.toLocaleString("en-IN")}` : "—"} label="Revenue from truck" sub="Lifetime" highlight />
          </div>

          {/* ── Chart + Owner details ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Bar chart */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-gray-900">How often it comes &amp; goes</p>
                {thisMonth > 0 && (
                  <span className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full">
                    {thisMonth}+ this month
                  </span>
                )}
              </div>

              {/* Y-axis + bars */}
              <div className="flex gap-3">
                {/* Y-axis labels */}
                <div className="flex flex-col justify-between items-end py-1 shrink-0" style={{ height: 110 }}>
                  {Array.from({ length: Math.min(maxBar + 1, 6) }, (_, i) => Math.min(maxBar, 5) - i).map(n => (
                    <span key={n} className="text-[10px] text-gray-300 leading-none">{n}</span>
                  ))}
                </div>
                {/* Bars */}
                <div className="flex-1 flex items-end gap-3 relative" style={{ height: 110 }}>
                  {/* Grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="w-full border-t border-gray-100" />
                    ))}
                  </div>
                  {monthly.map((m, i) => {
                    const pct  = (m.count / maxBar) * 100;
                    const isCur = i === monthly.length - 1;
                    return (
                      <div key={m.label} className="flex-1 flex flex-col items-center gap-2 z-10">
                        <div className="w-full flex items-end" style={{ height: 90 }}>
                          {m.count > 0
                            ? <div className={`w-full rounded-t-lg transition-all ${isCur ? "bg-blue-600" : "bg-blue-300"}`} style={{ height: `${Math.max(pct, 6)}%` }} />
                            : <div className="w-full rounded-t-lg bg-gray-100" style={{ height: 3 }} />}
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Insight */}
              {insightText && (
                <p className="mt-4 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
                  {insightText}
                </p>
              )}
            </div>

            {/* Owner & movement details */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Owner &amp; movement details</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <DetailItem label="Owner"           value={owner?.name ?? "—"} />
                <DetailItem label="Owner mobile"    value={owner?.primary_mobile ?? "—"} phone />
                <DetailItem label="Usual driver"    value={usualDrv} />
                <DetailItem label="Avg gap between visits" value={avgGap !== null ? `~${avgGap} days` : "—"} />
                <DetailItem label="Last check-in"   value={fmtShort(lastIn)} />
                <DetailItem label="Last check-out"  value={fmtShort(lastOut)} />
              </div>
            </div>
          </div>

          {/* ── Visit history ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-900">Complete visit history</p>
              {totalVisits > 5 && (
                <p className="text-xs text-gray-400">Recent 5 of {totalVisits} visits</p>
              )}
            </div>

            {history.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Receipt className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No visit history yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {history.map(h => {
                  const isPaid  = h.status === "released";
                  const isParked = h.status === "parked";
                  const isOver  = h.status === "overdue";
                  const details: string[] = [];
                  if (h.divisionName !== "—") details.push(h.divisionName);
                  if (h.slotCode !== "—") details.push(h.slotCode);
                  if (h.days) details.push(`${h.days} days`);
                  if (h.total_amount) details.push(`₹${h.total_amount.toLocaleString("en-IN")}`);
                  if (h.paymentMethod) details.push(cap(h.paymentMethod));
                  details.push(`Driver: ${h.checkin_driver_name}`);

                  return (
                    <div key={h.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{fmtRange(h)}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{details.join(" · ")}</p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                        isParked ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        isOver   ? "bg-red-50 text-red-700 border-red-200" :
                                   "bg-teal-50 text-teal-700 border-teal-200"
                      }`}>
                        {isParked ? "Parked" : isOver ? "Overdue" : "Paid"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── small pieces ──────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, bg, ic, value, label, sub, highlight }: {
  icon: React.ElementType; bg: string; ic: string;
  value: string; label: string; sub: string; highlight?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xl font-extrabold leading-none ${highlight ? ic : "text-gray-900"}`}>{value}</p>
          <p className="text-xs font-semibold text-gray-600 mt-1.5">{label}</p>
        </div>
        <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4 h-4 ${ic}`} />
        </div>
      </div>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function DetailItem({ label, value, phone }: { label: string; value: string; phone?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      {phone && value !== "—"
        ? <a href={`tel:${value}`} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition">{value}</a>
        : <p className="text-sm font-semibold text-gray-800">{value}</p>}
    </div>
  );
}
