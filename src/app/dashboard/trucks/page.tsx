"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight, ChevronLeft, ChevronRight as ChevronNextIcon,
  Search, RefreshCw, X, Loader2, AlertCircle,
  Car, User, MapPin, Clock, LogOut, Receipt,
  AlertTriangle, ShieldX, Download, ArrowUpDown,
  ChevronDown,
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const PAGE_SIZE = 10;

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
interface Session {
  id: string; truck_id: string; owner_id: string;
  location_id: string; division_id: string; slot_id: string | null;
  status: string; entry_type: string; driver_match: string;
  checkin_driver_name: string; checkin_driver_mobile: string;
  checkout_driver_name: string | null; checkout_driver_mobile: string | null;
  check_in_time: string; check_out_time: string | null;
  rate_per_day: number; gst_percent: number;
  days: number | null; subtotal: number | null;
  gst_amount: number | null; total_amount: number | null;
  checkin_remarks: string | null; checkout_remarks: string | null;
  checkin_driver_licence: string | null; checkin_id_proof_type: string | null;
  override_by: string | null;
}
interface TruckData    { id: string; truck_number: string; truck_type: string }
interface OwnerData    { id: string; name: string; mobile: string }
interface LocData      { id: string; name: string; city: string | null }
interface DivData      { id: string; name: string }
interface SlotData     { id: string; code: string }
interface Enriched extends Session {
  truckNumber: string; truckType: string;
  ownerName: string; ownerMobile: string;
  locationName: string; divisionName: string; slotCode: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function daysSince(iso: string): number {
  return Math.max(1, Math.ceil((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function statusConfig(s: Session) {
  const days = daysSince(s.check_in_time);
  const today = isToday(s.check_in_time);
  if (s.status === "released") return {
    badgeBg: "bg-teal-700", rowBorder: "border-l-4 border-teal-400",
    rowBg: "bg-teal-50/30", dayLabel: "Checked out",
    badgeLabel: "Checked out", badgeCls: "bg-teal-50 text-teal-700 border-teal-200",
    action: "receipt" as const,
  };
  if (s.status === "overdue") return {
    badgeBg: "bg-red-600", rowBorder: "border-l-4 border-red-400",
    rowBg: "bg-red-50/40", dayLabel: `Overdue · ${days} days`,
    badgeLabel: `Overdue · ${days}d`, badgeCls: "bg-red-50 text-red-700 border-red-200",
    action: "forceout" as const,
  };
  if (s.entry_type?.toLowerCase() === "khata") return {
    badgeBg: "bg-violet-700", rowBorder: "border-l-4 border-violet-400",
    rowBg: "bg-violet-50/20", dayLabel: today ? "Parked · today" : `Parked · ${days} days`,
    badgeLabel: today ? "Parked · today" : `Parked · ${days}d`, badgeCls: "bg-violet-50 text-violet-700 border-violet-200",
    action: "checkout" as const,
  };
  return {
    badgeBg: "bg-blue-700", rowBorder: "border-l-4 border-blue-400",
    rowBg: "", dayLabel: today ? "Parked · today" : `Parked · ${days} days`,
    badgeLabel: today ? "Parked · today" : `Parked · ${days}d`, badgeCls: "bg-blue-50 text-blue-700 border-blue-200",
    action: "checkout" as const,
  };
}

// ── component ─────────────────────────────────────────────────────────────────
export default function AllTrucksPage() {
  const [sessions,  setSessions]  = useState<Enriched[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [listError, setListError] = useState("");

  const [searchInput,    setSearchInput]    = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter,   setStatusFilter]   = useState("");
  const [typeFilter,     setTypeFilter]     = useState("");
  const [sortBy,         setSortBy]         = useState("check_in_time");
  const [sortOrder,      setSortOrder]      = useState<"asc"|"desc">("desc");

  const [truckIdFilter, setTruckIdFilter]   = useState("");
  const [truckSearch,   setTruckSearch]     = useState(""); // resolved truck_id or "__none__"
  const [searchLoading, setSearchLoading]   = useState(false);

  const [locations, setLocations] = useState<LocData[]>([]);
  const [receiptSession, setReceiptSession] = useState<Enriched | null>(null);

  // ── enrichment cache (survives page changes) ──
  const tCache = useRef<Record<string, TruckData>>({});
  const oCache = useRef<Record<string, OwnerData>>({});
  const lCache = useRef<Record<string, LocData>>({});
  const dCache = useRef<Record<string, DivData>>({});
  const sCache = useRef<Record<string, SlotData>>({});

  useEffect(() => {
    apiFetch<{ list: LocData[] }>("/locations?limit=100&start=0").then(r => setLocations(r.list ?? [])).catch(() => {});
  }, []);

  // Debounce truck number search → resolve to truck_id
  useEffect(() => {
    if (!searchInput.trim()) { setTruckIdFilter(""); setTruckSearch(""); setPage(1); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiFetch<{ list: TruckData[] }>(`/trucks?search=${encodeURIComponent(searchInput.trim())}&start=0&limit=10`);
        if (res.list?.length) {
          setTruckIdFilter(res.list[0].id);
          setTruckSearch(res.list[0].id);
          // seed cache
          res.list.forEach(t => { tCache.current[t.id] = t; });
        } else {
          setTruckIdFilter("__none__");
          setTruckSearch("__none__");
        }
      } catch { setTruckIdFilter("__none__"); setTruckSearch("__none__"); }
      finally { setSearchLoading(false); setPage(1); }
    }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchSessions = useCallback(async (
    p: number, tid: string, locId: string, status: string, type: string, sb: string, ord: string,
  ) => {
    if (tid === "__none__") { setSessions([]); setTotal(0); return; }
    setLoading(true); setListError("");
    try {
      const start = (p - 1) * PAGE_SIZE;
      let url = `/parking-sessions?start=${start}&limit=${PAGE_SIZE}&sort_by=${sb}&order=${ord}`;
      if (tid)    url += `&truck_id=${tid}`;
      if (locId)  url += `&location_id=${locId}`;
      if (status) url += `&status=${status}`;
      if (type)   url += `&entry_type=${type}`;
      const data = await apiFetch<{ count: number; list: Session[] }>(url);
      const list = data.list ?? [];

      // enrich using cache + parallel fetch for missing IDs
      const truckIds = [...new Set(list.map(s => s.truck_id))].filter(id => !tCache.current[id]);
      const ownerIds = [...new Set(list.map(s => s.owner_id))].filter(id => !oCache.current[id]);
      const locIds   = [...new Set(list.map(s => s.location_id))].filter(id => !lCache.current[id]);
      const divIds   = [...new Set(list.map(s => s.division_id))].filter(id => !dCache.current[id]);
      const slotIds  = [...new Set(list.map(s => s.slot_id).filter(Boolean) as string[])].filter(id => !sCache.current[id]);

      await Promise.allSettled([
        ...truckIds.map(id => apiFetch<TruckData>(`/trucks/${id}`).then(t => { tCache.current[id] = t; }).catch(() => {})),
        ...ownerIds.map(id => apiFetch<OwnerData>(`/owners/${id}`).then(o => { oCache.current[id] = o; }).catch(() => {})),
        ...locIds.map(id => apiFetch<LocData>(`/locations/${id}`).then(l => { lCache.current[id] = l; }).catch(() => {})),
        ...divIds.map(id => apiFetch<DivData>(`/divisions/${id}`).then(d => { dCache.current[id] = d; }).catch(() => {})),
        ...slotIds.map(id => apiFetch<SlotData>(`/slots/${id}`).then(s => { sCache.current[id] = s; }).catch(() => {})),
      ]);

      const enriched: Enriched[] = list.map(s => ({
        ...s,
        truckNumber:  tCache.current[s.truck_id]?.truck_number ?? s.truck_id.slice(0, 8).toUpperCase(),
        truckType:    tCache.current[s.truck_id]?.truck_type   ?? "—",
        ownerName:    oCache.current[s.owner_id]?.name         ?? "—",
        ownerMobile:  oCache.current[s.owner_id]?.mobile       ?? "",
        locationName: lCache.current[s.location_id]?.name      ?? "—",
        divisionName: dCache.current[s.division_id]?.name      ?? "—",
        slotCode:     s.slot_id ? (sCache.current[s.slot_id]?.code ?? "—") : "—",
      }));

      setSessions(enriched);
      setTotal(data.count ?? 0);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchSessions(page, truckIdFilter, locationFilter, statusFilter, typeFilter, sortBy, sortOrder);
  }, [page, truckIdFilter, locationFilter, statusFilter, typeFilter, sortBy, sortOrder, fetchSessions]);

  function handleSort(field: string) {
    if (sortBy === field) setSortOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder("desc"); }
    setPage(1);
  }

  function clearFilters() {
    setSearchInput(""); setLocationFilter(""); setStatusFilter(""); setTypeFilter("");
    setTruckIdFilter(""); setTruckSearch(""); setPage(1);
  }

  function exportCSV() {
    if (!sessions.length) return;
    const headers = ["Truck No","Type","Owner","Driver","Location","Division","Slot","Status","Entry Type","Check-in","Check-out","Days","Total (₹)"];
    const rows = sessions.map(s => {
      const cfg = statusConfig(s);
      return [
        s.truckNumber, s.truckType, s.ownerName, s.checkin_driver_name,
        s.locationName, s.divisionName, s.slotCode, cfg.badgeLabel,
        s.entry_type, fmtDateTime(s.check_in_time), fmtDateTime(s.check_out_time),
        s.days ?? "", s.total_amount ?? "",
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv]));
    a.download = `parkos-trucks-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = !!(searchInput || locationFilter || statusFilter || typeFilter);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 font-medium">All Trucks</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">All Trucks</h1>
          <p className="text-sm text-gray-400 mt-0.5">Live tracking across all locations and divisions</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={() => fetchSessions(page, truckIdFilter, locationFilter, statusFilter, typeFilter, sortBy, sortOrder)}
            disabled={loading}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 px-3.5 py-2 rounded-xl text-sm font-semibold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={exportCSV}
            disabled={!sessions.length}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 px-3.5 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total sessions", value: total, cls: "text-blue-600",   bg: "bg-blue-50"   },
          { label: "Parked",         value: "—",   cls: "text-emerald-600",bg: "bg-emerald-50" },
          { label: "Overdue",        value: "—",   cls: "text-red-600",    bg: "bg-red-50"    },
          { label: "Checked out",    value: "—",   cls: "text-teal-600",   bg: "bg-teal-50"   },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
              <Car className={`w-4 h-4 ${s.cls}`} />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none">
                {s.label === "Total sessions"
                  ? total
                  : sessions.filter(ss =>
                      s.label === "Parked" ? ss.status === "parked" :
                      s.label === "Overdue" ? ss.status === "overdue" :
                      ss.status === "released"
                    ).length}
              </p>
              <p className="text-xs text-gray-400 mt-1 truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-2.5 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          {searchLoading
            ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
            : searchInput && <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X className="w-3.5 h-3.5" /></button>}
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Truck number — Enter for full search…"
            className="w-full pl-9 pr-9 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition"
          />
        </div>

        {/* Location */}
        <div className="relative">
          <select
            value={locationFilter}
            onChange={e => { setLocationFilter(e.target.value); setPage(1); }}
            className={selectCls}
          >
            <option value="">All locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ""}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>

        {/* Status */}
        <div className="relative">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">All statuses</option>
            <option value="parked">Parked</option>
            <option value="overdue">Overdue</option>
            <option value="released">Checked out</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>

        {/* Type */}
        <div className="relative">
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">All types</option>
            <option value="regular">Regular</option>
            <option value="khata">KHATA</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>

        {filtersActive && (
          <button onClick={clearFilters} className="text-xs font-semibold text-gray-500 hover:text-red-600 flex items-center gap-1 transition">
            <X className="w-3.5 h-3.5" />Clear
          </button>
        )}
      </div>

      {/* ── List ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Sort row */}
        <div className="hidden md:flex items-center px-5 py-3 border-b border-gray-100 bg-gray-50/60 gap-4">
          <button onClick={() => handleSort("check_in_time")} className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-widest hover:text-gray-800 transition">
            <Clock className="w-3.5 h-3.5" />
            Check-in time
            <ArrowUpDown className={`w-3 h-3 ${sortBy === "check_in_time" ? "text-blue-500" : "text-gray-300"}`} />
          </button>
          <span className="ml-auto text-xs text-gray-400">{total} result{total !== 1 ? "s" : ""}</span>
        </div>

        {listError && (
          <div className="flex items-center gap-2.5 px-5 py-4 bg-red-50 border-b border-red-100">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{listError}</p>
          </div>
        )}

        {truckSearch === "__none__" && (
          <div className="px-5 py-10 text-center">
            <Car className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">No truck found matching &ldquo;{searchInput}&rdquo;</p>
            <p className="text-xs text-gray-400 mt-1">Check the registration number and try again</p>
          </div>
        )}

        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-gray-50 flex items-center gap-4">
              <div className="w-28 h-8 bg-gray-100 rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-gray-100 rounded-full animate-pulse w-40" />
                <div className="h-3 bg-gray-100 rounded-full animate-pulse w-56" />
              </div>
              <div className="w-20 h-6 bg-gray-100 rounded-full animate-pulse hidden sm:block" />
              <div className="w-24 h-8 bg-gray-100 rounded-xl animate-pulse hidden md:block" />
            </div>
          ))
        ) : truckSearch !== "__none__" && sessions.length === 0 && !loading ? (
          <div className="px-5 py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Car className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">No sessions found</p>
            {filtersActive && <p className="text-xs text-gray-400 mt-1">Try clearing some filters</p>}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sessions.map(s => <TruckRow key={s.id} session={s} onReceipt={() => setReceiptSession(s)} />)}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/40">
            <p className="text-xs text-gray-400 order-2 sm:order-1">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of <span className="font-semibold text-gray-600">{total}</span>
            </p>
            <div className="flex items-center gap-1 order-1 sm:order-2">
              <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const n = i + 1;
                return (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition ${page === n ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200"}`}>
                    {n}
                  </button>
                );
              })}
              <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronNextIcon className="w-4 h-4" /></PagBtn>
            </div>
          </div>
        )}
      </div>

      {/* ── Receipt modal ── */}
      {receiptSession && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setReceiptSession(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
                  <Receipt className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Receipt</p>
                  <p className="text-xs text-gray-400">{receiptSession.truckNumber}</p>
                </div>
              </div>
              <button onClick={() => setReceiptSession(null)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-5 space-y-3">
              <ReceiptRow label="Owner"       value={receiptSession.ownerName} />
              <ReceiptRow label="Driver"      value={receiptSession.checkin_driver_name} />
              <ReceiptRow label="Location"    value={`${receiptSession.locationName} · ${receiptSession.divisionName} · ${receiptSession.slotCode}`} />
              <ReceiptRow label="Entry type"  value={receiptSession.entry_type?.toUpperCase()} />
              <ReceiptRow label="Check-in"    value={fmtDateTime(receiptSession.check_in_time)} />
              <ReceiptRow label="Check-out"   value={fmtDateTime(receiptSession.check_out_time)} />
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <ReceiptRow label={`${receiptSession.days ?? "—"} days × ₹${receiptSession.rate_per_day}/day`} value={`₹${receiptSession.subtotal?.toFixed(2) ?? "—"}`} />
                <ReceiptRow label={`GST ${receiptSession.gst_percent}%`} value={`₹${receiptSession.gst_amount?.toFixed(2) ?? "—"}`} />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-bold text-gray-700">Total</span>
                  <span className="text-lg font-extrabold text-gray-900">₹{receiptSession.total_amount?.toFixed(2) ?? "—"}</span>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setReceiptSession(null)} className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl transition text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TruckRow ──────────────────────────────────────────────────────────────────
function TruckRow({ session: s, onReceipt }: { session: Enriched; onReceipt: () => void }) {
  const cfg = statusConfig(s);

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-4 hover:bg-gray-50/60 transition-colors ${cfg.rowBorder} ${cfg.rowBg}`}>
      {/* Truck number badge */}
      <div className={`inline-flex items-center justify-center min-w-28 px-3 py-2 rounded-xl text-xs font-bold tracking-widest text-white font-mono shadow-sm shrink-0 ${cfg.badgeBg}`}>
        {s.truckNumber}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-gray-900">{s.ownerName}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <User className="w-3 h-3" />{s.checkin_driver_name} (driver)
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400 flex-wrap">
          <MapPin className="w-3 h-3 shrink-0" />
          <span>{s.locationName}</span>
          {s.divisionName !== "—" && <><span>·</span><span>{s.divisionName}</span></>}
          {s.slotCode !== "—" && <><span>·</span><span>{s.slotCode}</span></>}
          <span>·</span>
          <Clock className="w-3 h-3 shrink-0" />
          {s.status === "released" && s.check_out_time
            ? <span>{fmtDateTime(s.check_in_time)} → {fmtDateTime(s.check_out_time)}</span>
            : <span>{fmtDateTime(s.check_in_time)}</span>}
        </div>
      </div>

      {/* Badges + action */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        {/* Entry type badge */}
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
          s.entry_type?.toLowerCase() === "khata"
            ? "bg-violet-100 text-violet-700 border-violet-200"
            : "bg-gray-100 text-gray-500 border-gray-200"
        }`}>
          {s.entry_type?.toUpperCase() ?? "—"}
        </span>

        {/* Status badge */}
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${cfg.badgeCls}`}>
          {cfg.badgeLabel}
        </span>

        {/* Action button */}
        {cfg.action === "checkout" && (
          <Link href="/dashboard/check-out" className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm shadow-blue-200 transition whitespace-nowrap">
            <LogOut className="w-3.5 h-3.5" />Checkout
          </Link>
        )}
        {cfg.action === "forceout" && (
          <Link href="/dashboard/check-out" className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm shadow-red-200 transition whitespace-nowrap">
            <ShieldX className="w-3.5 h-3.5" />Force out
          </Link>
        )}
        {cfg.action === "receipt" && (
          <button onClick={onReceipt} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm shadow-teal-200 transition whitespace-nowrap">
            <Receipt className="w-3.5 h-3.5" />Receipt
          </button>
        )}
      </div>
    </div>
  );
}

// ── small reusable pieces ─────────────────────────────────────────────────────
function ReceiptRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-gray-700 text-right">{value ?? "—"}</span>
    </div>
  );
}
function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition border border-transparent hover:border-gray-200">
      {children}
    </button>
  );
}

const selectCls = "pl-3 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition appearance-none cursor-pointer";
