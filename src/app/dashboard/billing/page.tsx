"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  ChevronRight, Download, ChevronDown,
  Loader2, AlertCircle, TrendingUp, CreditCard, Banknote,
  Clock, Receipt, Phone, ChevronLeft, ChevronRight as Next,
  RefreshCw, X, Printer, FileDown, Send, CheckCircle2,
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", token, ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error((e as { detail?: string }).detail ?? "Request failed");
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ── types ─────────────────────────────────────────────────────────────────────
interface Location { id: string; name: string; city: string | null }
interface TruckObj  { id: string; truck_number: string }
interface Owner     { id: string; name: string; primary_mobile: string }
interface Session {
  id: string; truck_id: string; owner_id: string | null; location_id: string;
  days: number | null; total_amount: number | null; subtotal: number | null;
  status: string; check_in_time: string | null; check_out_time: string | null; created_at: string | null;
}
interface Payment {
  id: string; session_id: string; receipt_no: string | null;
  total_amount: number | null; method: string; status: string; paid_at: string | null;
}
interface Row {
  session: Session;
  payment: Payment | null;
  truck_number: string;
  owner_name: string;
  owner_mobile: string;
  location_name: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtRupees(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
function fmtRupeesShort(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}k`;
  return fmtRupees(n);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })} ${d.getFullYear()}`;
}
function methodLabel(m: string | undefined) {
  if (!m) return "—";
  return { cash: "Cash", card: "Card", upi: "UPI", online: "Online" }[m.toLowerCase()] ?? m;
}
function methodBadge(m: string | undefined) {
  if (!m) return "bg-gray-100 text-gray-500";
  const t = m.toLowerCase();
  if (t === "cash")   return "bg-emerald-100 text-emerald-700";
  if (t === "card")   return "bg-blue-100 text-blue-700";
  if (t === "upi")    return "bg-violet-100 text-violet-700";
  return "bg-gray-100 text-gray-600";
}

// date period filter
type Period = "this_month" | "last_month" | "last_3" | "all";
function inPeriod(iso: string | null, period: Period): boolean {
  if (!iso || period === "all") return true;
  const d = new Date(iso);
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (period === "this_month") return d.getFullYear() === y && d.getMonth() === m;
  if (period === "last_month") {
    const lm = m === 0 ? 11 : m - 1;
    const ly = m === 0 ? y - 1 : y;
    return d.getFullYear() === ly && d.getMonth() === lm;
  }
  if (period === "last_3") { const cutoff = new Date(y, m - 2, 1); return d >= cutoff; }
  return true;
}
function periodLabel2(p: Period) {
  const now = new Date();
  if (p === "this_month") return now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  if (p === "last_month") { const d = new Date(now.getFullYear(), now.getMonth() - 1); return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }); }
  if (p === "last_3") return "Last 3 months";
  return "All time";
}

const PAGE_SIZE = 15;
const selectCls = "w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-10 shadow-sm";

// ── page ──────────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const [locations,   setLocations]   = useState<Location[]>([]);
  const [allRows,     setAllRows]     = useState<Row[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [page,        setPage]        = useState(1);
  const [receiptId,   setReceiptId]   = useState<string | null>(null);

  // filters
  const [locId,   setLocId]   = useState("");
  const [period,  setPeriod]  = useState<Period>("this_month");
  const [method,  setMethod]  = useState("");

  // caches
  const truckCache = useRef<Record<string, TruckObj>>({});
  const ownerCache = useRef<Record<string, Owner>>({});
  const locCache   = useRef<Record<string, Location>>({});

  // load locations once
  useEffect(() => {
    apiFetch<{ count: number; list: Location[] }>("/locations?limit=50")
      .then(r => {
        setLocations(r.list ?? []);
        (r.list ?? []).forEach(l => { locCache.current[l.id] = l; });
      }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      // load sessions + recent payments in parallel
      const sessUrl = `/parking-sessions?limit=200&sort_by=created_at&order=desc${locId ? `&location_id=${locId}` : ""}`;
      const payUrl  = `/payments?limit=300&sort_by=created_at&order=desc`;

      const [sessRes, payRes] = await Promise.all([
        apiFetch<{ count: number; list: Session[] }>(sessUrl),
        apiFetch<{ count: number; list: Payment[] }>(payUrl),
      ]);

      const sessions = sessRes.list ?? [];
      const payments = payRes.list ?? [];

      // payment map: session_id → payment
      const payMap: Record<string, Payment> = {};
      payments.forEach(p => { payMap[p.session_id] = p; });

      // collect unique IDs to enrich
      const truckIds = [...new Set(sessions.map(s => s.truck_id).filter(Boolean))].filter(id => !truckCache.current[id]);
      const ownerIds = [...new Set(sessions.map(s => s.owner_id).filter(Boolean) as string[])].filter(id => !ownerCache.current[id]);
      const locIds   = [...new Set(sessions.map(s => s.location_id).filter(Boolean))].filter(id => !locCache.current[id]);

      await Promise.allSettled([
        ...truckIds.map(id => apiFetch<TruckObj>(`/trucks/${id}`).then(t => { truckCache.current[id] = t; }).catch(() => {})),
        ...ownerIds.map(id => apiFetch<Owner>(`/owners/${id}`).then(o => { ownerCache.current[id] = o; }).catch(() => {})),
        ...locIds.map(id => apiFetch<Location>(`/locations/${id}`).then(l => { locCache.current[id] = l; }).catch(() => {})),
      ]);

      const rows: Row[] = sessions.map(s => ({
        session: s,
        payment: payMap[s.id] ?? null,
        truck_number:  truckCache.current[s.truck_id]?.truck_number ?? "—",
        owner_name:    s.owner_id ? (ownerCache.current[s.owner_id]?.name ?? "—") : "—",
        owner_mobile:  s.owner_id ? (ownerCache.current[s.owner_id]?.primary_mobile ?? "") : "",
        location_name: locCache.current[s.location_id]?.name ?? "—",
      }));

      setAllRows(rows);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load billing data."); }
    finally { setLoading(false); }
  }, [locId]);

  useEffect(() => { loadData(); setPage(1); }, [loadData]);

  // apply client-side filters
  const filtered = useMemo(() => {
    return allRows.filter(r => {
      const dateStr = r.payment?.paid_at ?? r.session.check_out_time ?? r.session.created_at;
      if (!inPeriod(dateStr, period)) return false;
      if (method) {
        if (method === "pending") return !r.payment || r.payment.status !== "paid";
        if (r.payment?.method?.toLowerCase() !== method) return false;
      }
      return true;
    });
  }, [allRows, period, method]);

  // stats
  const stats = useMemo(() => {
    const paid    = filtered.filter(r => r.payment?.status === "paid");
    const pending = filtered.filter(r => !r.payment || r.payment.status !== "paid");
    const total   = paid.reduce((s, r) => s + (r.payment?.total_amount ?? r.session.total_amount ?? 0), 0);
    const cash    = paid.filter(r => r.payment?.method?.toLowerCase() === "cash").reduce((s, r) => s + (r.payment?.total_amount ?? 0), 0);
    const card    = paid.filter(r => ["card","upi"].includes(r.payment?.method?.toLowerCase() ?? "")).reduce((s, r) => s + (r.payment?.total_amount ?? 0), 0);
    const out     = pending.reduce((s, r) => s + (r.session.total_amount ?? r.session.subtotal ?? 0), 0);
    return { total, cash, card, out, pendingCount: pending.length, cashPct: total ? Math.round(cash / total * 100) : 0, cardPct: total ? Math.round(card / total * 100) : 0 };
  }, [filtered]);

  // pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // CSV export
  function exportCSV() {
    const header = "Truck,Owner,Location,Days,Total,Method,Status,Date\n";
    const body   = filtered.map(r => [
      r.truck_number, r.owner_name, r.location_name,
      r.session.days ?? "",
      r.payment?.total_amount ?? r.session.total_amount ?? "",
      methodLabel(r.payment?.method),
      r.payment?.status ?? (r.session.status === "parked" ? "Pending" : "—"),
      fmtDate(r.payment?.paid_at ?? r.session.check_out_time),
    ].join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `billing-${period}.csv`;
    a.click();
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-6">

      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 font-medium">Billing</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Billing &amp; transactions</h1>
          <p className="text-sm text-gray-400 mt-0.5">All payment records across locations and dates.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadData()} disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-sm hover:bg-gray-50 transition">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm transition">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* location */}
        <div className="relative">
          <select value={locId} onChange={e => { setLocId(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">All locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ""}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* period */}
        <div className="relative">
          <select value={period} onChange={e => { setPeriod(e.target.value as Period); setPage(1); }} className={selectCls}>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="last_3">Last 3 months</option>
            <option value="all">All time</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* method */}
        <div className="relative">
          <select value={method} onChange={e => { setMethod(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">All methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="pending">Pending only</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* total revenue */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 shadow-lg shadow-blue-200">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full" />
          <div className="absolute -right-2 -bottom-6 w-28 h-28 bg-white/5 rounded-full" />
          <p className="text-xs font-semibold text-blue-200 mb-1">Total revenue</p>
          <p className="text-2xl font-bold text-white">{fmtRupeesShort(stats.total)}</p>
          <p className="text-xs text-blue-300 mt-1">{periodLabel2(period)}</p>
          <TrendingUp className="absolute right-4 bottom-4 w-6 h-6 text-white/20" />
        </div>

        {/* cash */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 shadow-lg shadow-emerald-200">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full" />
          <div className="absolute -right-2 -bottom-6 w-28 h-28 bg-white/5 rounded-full" />
          <p className="text-xs font-semibold text-emerald-200 mb-1">Cash collected</p>
          <p className="text-2xl font-bold text-white">{fmtRupeesShort(stats.cash)}</p>
          <p className="text-xs text-emerald-300 mt-1">{stats.cashPct}% of total</p>
          <Banknote className="absolute right-4 bottom-4 w-6 h-6 text-white/20" />
        </div>

        {/* card / upi */}
        <div className="relative overflow-hidden bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl p-5 shadow-lg shadow-violet-200">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full" />
          <div className="absolute -right-2 -bottom-6 w-28 h-28 bg-white/5 rounded-full" />
          <p className="text-xs font-semibold text-violet-200 mb-1">Card / UPI</p>
          <p className="text-2xl font-bold text-white">{fmtRupeesShort(stats.card)}</p>
          <p className="text-xs text-violet-300 mt-1">{stats.cardPct}% of total</p>
          <CreditCard className="absolute right-4 bottom-4 w-6 h-6 text-white/20" />
        </div>

        {/* outstanding */}
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-500 to-red-600 rounded-2xl p-5 shadow-lg shadow-red-200">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full" />
          <div className="absolute -right-2 -bottom-6 w-28 h-28 bg-white/5 rounded-full" />
          <p className="text-xs font-semibold text-red-200 mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-white">{fmtRupeesShort(stats.out)}</p>
          <p className="text-xs text-red-300 mt-1">{stats.pendingCount} pending</p>
          <Clock className="absolute right-4 bottom-4 w-6 h-6 text-white/20" />
        </div>
      </div>

      {/* table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* table header row count */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">
            {loading ? "Loading…" : `${filtered.length} transaction${filtered.length !== 1 ? "s" : ""}`}
          </p>
          {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>

        {/* desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {["Truck","Owner","Location","Days","Total","Method","Status",""].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && pageRows.length === 0 && (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3.5 bg-gray-100 rounded-full w-20" /></td>
                    ))}
                  </tr>
                ))
              )}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    No transactions match the selected filters.
                  </td>
                </tr>
              )}
              {pageRows.map(r => {
                const isPaid    = r.payment?.status === "paid";
                const isPending = !r.payment || r.payment.status !== "paid";
                const amount    = r.payment?.total_amount ?? r.session.total_amount ?? 0;
                const rowBg     = isPending && r.session.status === "parked" ? "bg-amber-50/40" : "";
                return (
                  <tr key={r.session.id} className={`hover:bg-gray-50/60 transition-colors ${rowBg}`}>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-sm font-bold text-blue-600">{r.truck_number}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-gray-800 text-sm">{r.owner_name}</p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{r.location_name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-700 font-medium">
                      {r.session.days ?? "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-bold text-gray-900">{amount ? fmtRupees(amount) : "—"}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {r.payment?.method ? (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${methodBadge(r.payment.method)}`}>
                          {methodLabel(r.payment.method)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                          Paid
                        </span>
                      ) : r.session.status === "parked" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {isPaid && r.payment && (
                          <button onClick={() => setReceiptId(r.payment!.id)}
                            className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 px-2.5 py-1.5 rounded-lg transition">
                            <Receipt className="w-3 h-3" />Receipt
                          </button>
                        )}
                        {isPending && r.owner_mobile && (
                          <a href={`tel:${r.owner_mobile}`}
                            className="flex items-center gap-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition">
                            <Phone className="w-3 h-3" />Chase
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* mobile cards */}
        <div className="md:hidden divide-y divide-gray-50">
          {loading && pageRows.length === 0 && (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-4 animate-pulse space-y-2">
                <div className="flex gap-2"><div className="h-4 bg-gray-100 rounded w-24" /><div className="h-4 bg-gray-100 rounded w-16 ml-auto" /></div>
                <div className="h-3 bg-gray-100 rounded w-32" />
              </div>
            ))
          )}
          {!loading && pageRows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No transactions found.</p>
          )}
          {pageRows.map(r => {
            const isPaid    = r.payment?.status === "paid";
            const isPending = !r.payment || r.payment.status !== "paid";
            const amount    = r.payment?.total_amount ?? r.session.total_amount ?? 0;
            return (
              <div key={r.session.id} className={`px-4 py-4 ${isPending && r.session.status === "parked" ? "bg-amber-50/40" : ""}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-sm font-bold text-blue-600">{r.truck_number}</span>
                  {isPaid ? (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Paid</span>
                  ) : r.session.status === "parked" ? (
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Active</span>
                  ) : (
                    <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Pending</span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{r.owner_name} · {r.location_name}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-bold text-gray-900">{amount ? fmtRupees(amount) : "—"}</p>
                  <div className="flex items-center gap-2">
                    {r.payment?.method && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${methodBadge(r.payment.method)}`}>
                        {methodLabel(r.payment.method)}
                      </span>
                    )}
                    {isPaid && r.payment && (
                      <Link href={`/dashboard/billing/receipt?payment_id=${r.payment.id}`}
                        className="flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-2 py-1 rounded-lg">
                        <Receipt className="w-3 h-3" />Receipt
                      </Link>
                    )}
                    {isPending && r.owner_mobile && (
                      <a href={`tel:${r.owner_mobile}`}
                        className="flex items-center gap-1 text-xs font-semibold text-white bg-red-500 px-2 py-1 rounded-lg">
                        <Phone className="w-3 h-3" />Chase
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/40">
            <p className="text-xs text-gray-400">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
              <span className="font-semibold text-gray-600">{filtered.length}</span>
            </p>
            <div className="flex items-center gap-1">
              <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </PagBtn>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const n = i + 1;
                return (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition ${page === n ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"}`}>
                    {n}
                  </button>
                );
              })}
              <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <Next className="w-4 h-4" />
              </PagBtn>
            </div>
          </div>
        )}
      </div>

      {/* receipt drawer */}
      {receiptId && <ReceiptDrawer paymentId={receiptId} onClose={() => setReceiptId(null)} />}
    </div>
  );
}

// ── Receipt types ─────────────────────────────────────────────────────────────
interface RPayment {
  id: string; session_id: string; receipt_no: string | null;
  subtotal: number | null; gst_amount: number | null; total_amount: number | null;
  method: string; amount_received: number | null; change_due: number | null;
  status: string; paid_at: string | null;
}
interface RSession {
  id: string; truck_id: string; owner_id: string | null; location_id: string;
  division_id: string | null; slot_id: string | null;
  check_in_time: string | null; check_out_time: string | null;
  days: number | null; rate_per_day: number | null; gst_percent: number | null;
  subtotal: number | null; gst_amount: number | null; total_amount: number | null;
}
interface RTruck    { truck_number: string; truck_type: string | null }
interface ROwner    { id: string; name: string; primary_mobile: string }
interface RLocation { name: string; city: string | null; address: string | null }
interface RDivision { name: string }
interface RSlot     { code: string }
interface ReceiptData {
  payment: RPayment; session: RSession;
  truck: RTruck | null; owner: ROwner | null; location: RLocation | null;
  division: RDivision | null; slot: RSlot | null;
}

function receiptNo(p: RPayment) { return p.receipt_no ?? `PKG-${p.id.slice(0, 6).toUpperCase()}`; }
function fmtDT(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })} · ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}
function calcDur(ci: string | null, co: string | null) {
  if (!ci || !co) return "—";
  const ms = new Date(co).getTime() - new Date(ci).getTime();
  if (ms <= 0) return "—";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") || "< 1m";
}
function rMethodLabel(m: string) {
  return { cash: "Cash", card: "Card", upi: "UPI", online: "Online" }[m.toLowerCase()] ?? m;
}

// ── Receipt Drawer ────────────────────────────────────────────────────────────
function ReceiptDrawer({ paymentId, onClose }: { paymentId: string; onClose(): void }) {
  const [data,    setData]    = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [sending, setSending] = useState(false);
  const [sentOk,  setSentOk]  = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const payment = await apiFetch<RPayment>(`/payments/${paymentId}`);
        const session = await apiFetch<RSession>(`/parking-sessions/${payment.session_id}`);
        const [trR, owR, loR, diR, slR] = await Promise.allSettled([
          apiFetch<RTruck>(`/trucks/${session.truck_id}`),
          session.owner_id    ? apiFetch<ROwner>(`/owners/${session.owner_id}`) : Promise.resolve(null),
          apiFetch<RLocation>(`/locations/${session.location_id}`),
          session.division_id ? apiFetch<RDivision>(`/divisions/${session.division_id}`) : Promise.resolve(null),
          session.slot_id     ? apiFetch<RSlot>(`/slots/${session.slot_id}`) : Promise.resolve(null),
        ]);
        if (!live) return;
        setData({
          payment, session,
          truck:    trR.status === "fulfilled" ? trR.value : null,
          owner:    owR.status === "fulfilled" ? owR.value : null,
          location: loR.status === "fulfilled" ? loR.value : null,
          division: diR.status === "fulfilled" ? diR.value : null,
          slot:     slR.status === "fulfilled" ? slR.value : null,
        });
      } catch (e) { if (live) setErr(e instanceof Error ? e.message : "Failed to load receipt."); }
      finally    { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [paymentId]);

  async function handleSend() {
    if (!data?.session.owner_id) return;
    setSending(true);
    try {
      await apiFetch("/notices", {
        method: "POST",
        body: JSON.stringify({
          notice_type: "receipt_sent",
          message: `Receipt ${receiptNo(data.payment)} for truck ${data.truck?.truck_number ?? ""} — ₹${data.payment.total_amount}. Thank you for using ParkOS.`,
          owner_id: data.session.owner_id, session_id: data.session.id, status: "open",
        }),
      });
      setSentOk(true); setTimeout(() => setSentOk(false), 3000);
    } catch { /* silent */ }
    finally { setSending(false); }
  }

  return (
    <>
      {/* print styles */}
      <style>{`@media print { .no-print { display:none!important; } body { background:white!important; } .receipt-card { box-shadow:none!important; border:none!important; } }`}</style>

      {/* backdrop */}
      <div className="no-print fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-[#f8fafc] shadow-2xl flex flex-col overflow-hidden">

        {/* header */}
        <div className="no-print flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100 shrink-0">
          <p className="text-sm font-bold text-gray-900">Receipt</p>
          <div className="flex items-center gap-2">
            {sentOk && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                <CheckCircle2 className="w-3.5 h-3.5" /> Sent
              </span>
            )}
            {data?.session.owner_id && (
              <button onClick={handleSend} disabled={sending}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm transition">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
              </button>
            )}
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl shadow-sm shadow-blue-200 transition">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={() => { document.title = `Receipt-${data ? receiptNo(data.payment) : ""}`; window.print(); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm transition">
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="animate-pulse space-y-4">
              <div className="h-40 bg-gray-200 rounded-2xl" />
              <div className="h-20 bg-gray-100 rounded-2xl" />
              <div className="h-32 bg-gray-100 rounded-2xl" />
            </div>
          )}

          {!loading && err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{err}</p>
            </div>
          )}

          {!loading && data && (() => {
            const { payment, session, truck, owner, location, division, slot } = data;
            const subtotal = payment.subtotal ?? session.subtotal ?? 0;
            const gstAmt   = payment.gst_amount ?? session.gst_amount ?? 0;
            const total    = payment.total_amount ?? session.total_amount ?? 0;
            const gstPct   = session.gst_percent ?? 0;
            const days     = session.days ?? 0;
            const rate     = session.rate_per_day ?? (days > 0 ? Math.round(subtotal / days) : 0);
            const truckType = truck?.truck_type ? truck.truck_type.charAt(0).toUpperCase() + truck.truck_type.slice(1) : null;
            return (
              <div className="receipt-card bg-white rounded-3xl shadow-xl shadow-gray-200/80 overflow-hidden border border-gray-100 max-w-md mx-auto">
                {/* dark header */}
                <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-blue-900 px-6 py-7 text-center relative overflow-hidden">
                  <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
                  <div className="absolute -right-4 -bottom-8 w-28 h-28 rounded-full bg-white/5" />
                  <p className="text-xl font-black text-white tracking-wide relative">ParkOS</p>
                  {location && (
                    <>
                      <p className="text-sm text-indigo-300 mt-1 font-medium relative">{location.name}{location.city ? ` — ${location.city}` : ""}</p>
                      {location.address && <p className="text-xs text-indigo-400 mt-0.5 relative">{location.address}</p>}
                    </>
                  )}
                  <div className="inline-flex items-center gap-1.5 mt-3 bg-white/10 border border-white/20 rounded-full px-3 py-1 relative">
                    <span className="text-xs font-bold text-indigo-200 font-mono tracking-wider">Receipt No: {receiptNo(payment)}</span>
                  </div>
                </div>

                {/* truck */}
                <div className="mx-5 mt-5 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl px-5 py-4 text-center">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5">Truck Number</p>
                  <p className="text-3xl font-black text-indigo-700 tracking-widest font-mono">{truck?.truck_number ?? "—"}</p>
                  {(division || slot || truckType) && (
                    <p className="text-xs text-indigo-400 mt-1.5 font-medium">
                      {[division?.name, slot ? `Slot ${slot.code}` : null, truckType].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                {/* owner + dates */}
                <div className="mx-5 mt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: "Owner",     val: owner?.name ?? "—" },
                    { label: "Check-in",  val: fmtDT(session.check_in_time) },
                    { label: "Check-out", val: fmtDT(session.check_out_time) },
                    { label: "Duration",  val: calcDur(session.check_in_time, session.check_out_time) },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                      <p className="text-sm font-semibold text-gray-800">{val}</p>
                    </div>
                  ))}
                </div>

                {/* charges */}
                <div className="mx-5 mt-4 border border-gray-100 rounded-2xl overflow-hidden">
                  {days > 0 && rate > 0 && (
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                      <p className="text-sm text-gray-600">{days} day{days !== 1 ? "s" : ""} × ₹{rate.toLocaleString("en-IN")}</p>
                      <p className="text-sm font-semibold text-gray-800">₹{subtotal.toLocaleString("en-IN")}</p>
                    </div>
                  )}
                  {gstPct > 0 && (
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                      <p className="text-sm text-gray-600">GST {gstPct}%</p>
                      <p className="text-sm font-semibold text-gray-800">₹{gstAmt.toLocaleString("en-IN")}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-5 py-4 bg-gray-50/60">
                    <p className="text-base font-bold text-gray-900">Total paid</p>
                    <p className="text-2xl font-black text-indigo-700">₹{total.toLocaleString("en-IN")}</p>
                  </div>
                </div>

                {/* payment footer */}
                <div className="mx-5 mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Payment method</p>
                    <p className="text-sm font-bold text-gray-900">{rMethodLabel(payment.method)}</p>
                  </div>
                  {(payment.change_due ?? 0) > 0 && (
                    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Change given</p>
                      <p className="text-sm font-bold text-indigo-600">₹{(payment.change_due ?? 0).toLocaleString("en-IN")}</p>
                    </div>
                  )}
                  {payment.paid_at && (
                    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Paid at</p>
                      <p className="text-xs font-semibold text-gray-600">{fmtDT(payment.paid_at)}</p>
                    </div>
                  )}
                </div>

                <p className="text-center text-xs text-gray-400 italic py-5">Thank you for using ParkOS. Drive safe!</p>
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}

function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition border border-transparent hover:border-gray-200">
      {children}
    </button>
  );
}
