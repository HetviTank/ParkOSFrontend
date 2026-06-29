"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight, ChevronLeft, ChevronRight as ChevronNextIcon,
  Search, RefreshCw, X, Loader2, AlertCircle,
  Car, User, MapPin, Clock, LogOut, Receipt,
  ShieldX, Download, ArrowUpDown, ChevronDown,
  Pencil, Trash2, CheckCircle2, Eye,
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

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function statusConfig(s: Session) {
  const days = daysSince(s.check_in_time);
  if (s.status === "released") return {
    badgeBg: "bg-teal-700", rowBorder: "border-l-4 border-teal-400",
    rowBg: "bg-teal-50/30",
    badgeLabel: "Checked out", badgeCls: "bg-teal-50 text-teal-700 border-teal-200",
    action: "receipt" as const,
  };
  if (s.status === "overdue") return {
    badgeBg: "bg-red-600", rowBorder: "border-l-4 border-red-400",
    rowBg: "bg-red-50/40",
    badgeLabel: `Overdue · ${days}d`, badgeCls: "bg-red-50 text-red-700 border-red-200",
    action: "forceout" as const,
  };
  if (s.entry_type?.toLowerCase() === "khata") return {
    badgeBg: "bg-violet-700", rowBorder: "border-l-4 border-violet-400",
    rowBg: "bg-violet-50/20",
    badgeLabel: "Parked", badgeCls: "bg-violet-50 text-violet-700 border-violet-200",
    action: "checkout" as const,
  };
  return {
    badgeBg: "bg-blue-700", rowBorder: "border-l-4 border-blue-400",
    rowBg: "",
    badgeLabel: "Parked", badgeCls: "bg-blue-50 text-blue-700 border-blue-200",
    action: "checkout" as const,
  };
}

// ── column config ─────────────────────────────────────────────────────────────
const COL_DEFS = [
  { label: "Truck",          sortKey: null,             minW: 120 },
  { label: "Owner / Driver", sortKey: null,             minW: 140 },
  { label: "Location",       sortKey: null,             minW: 130 },
  { label: "Check-in",       sortKey: "check_in_time",  minW: 120 },
  { label: "Check-out / Driver",  sortKey: null,        minW: 140 },
  { label: "Type / Status",  sortKey: null,             minW: 110 },
  { label: "Action",         sortKey: null,             minW: 180 },
];
const INIT_WIDTHS = [160, 200, 190, 160, 160, 140, 210];

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

  // ── resizable columns ──
  const [colWidths, setColWidths] = useState<number[]>(INIT_WIDTHS);
  function startResize(idx: number, startX: number) {
    const startW = colWidths[idx];
    function onMove(e: MouseEvent) {
      const newW = Math.max(COL_DEFS[idx].minW, startW + e.clientX - startX);
      setColWidths(prev => prev.map((w, i) => i === idx ? newW : w));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── edit ──
  const [editSession,    setEditSession]    = useState<Enriched | null>(null);
  const [editDriver,     setEditDriver]     = useState("");
  const [editMobile,     setEditMobile]     = useState("");
  const [editLic,        setEditLic]        = useState("");
  const [editRemarks,    setEditRemarks]    = useState("");
  const [editBusy,       setEditBusy]       = useState(false);
  const [editErr,        setEditErr]        = useState("");
  const [editOk,         setEditOk]         = useState(false);

  // ── delete ──
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  function openEdit(s: Enriched) {
    setEditSession(s);
    setEditDriver(s.checkin_driver_name ?? "");
    setEditMobile(s.checkin_driver_mobile ?? "");
    setEditLic(s.checkin_driver_licence ?? "");
    setEditRemarks(s.checkin_remarks ?? "");
    setEditErr(""); setEditOk(false);
  }

  async function handleSaveEdit() {
    if (!editSession) return;
    setEditBusy(true); setEditErr(""); setEditOk(false);
    try {
      await apiFetch(`/parking-sessions/${editSession.id}`, {
        method: "PUT",
        body: JSON.stringify({
          checkin_driver_name:    editDriver.trim(),
          checkin_driver_mobile:  editMobile.trim(),
          checkin_driver_licence: editLic.trim() || null,
          checkin_remarks:        editRemarks.trim() || null,
        }),
      });
      setEditOk(true);
      setSessions(prev => prev.map(s => s.id === editSession.id
        ? { ...s, checkin_driver_name: editDriver.trim(), checkin_driver_mobile: editMobile.trim(), checkin_driver_licence: editLic.trim() || null, checkin_remarks: editRemarks.trim() || null }
        : s
      ));
      setTimeout(() => setEditSession(null), 900);
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : "Failed to save.");
    } finally { setEditBusy(false); }
  }

  async function handleDelete(id: string) {
    setDeleteBusy(true);
    try {
      await apiFetch(`/parking-sessions/${id}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== id));
      setTotal(t => t - 1);
      setDeleteId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally { setDeleteBusy(false); }
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

  const parkedCount   = sessions.filter(s => s.status === "parked").length;
  const overdueCount  = sessions.filter(s => s.status === "overdue").length;
  const releasedCount = sessions.filter(s => s.status === "released").length;

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-700 font-semibold">All Trucks</span>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">All Trucks</h1>
          <p className="text-sm text-gray-400 mt-1">Live parking sessions across all locations</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => fetchSessions(page, truckIdFilter, locationFilter, statusFilter, typeFilter, sortBy, sortOrder)}
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={exportCSV}
            disabled={!sessions.length}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm shadow-blue-200 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {([
          { label: "Total Sessions", value: total,         icon: "bg-slate-100",   num: "text-slate-700",   bar: "bg-slate-400",   iconC: "text-slate-500"   },
          { label: "Parked",         value: parkedCount,   icon: "bg-emerald-50",  num: "text-emerald-600", bar: "bg-emerald-400", iconC: "text-emerald-400" },
          { label: "Overdue",        value: overdueCount,  icon: "bg-red-50",      num: "text-red-500",     bar: "bg-red-400",     iconC: "text-red-400"     },
          { label: "Checked Out",    value: releasedCount, icon: "bg-sky-50",      num: "text-sky-600",     bar: "bg-sky-400",     iconC: "text-sky-400"     },
        ] as const).map(st => (
          <div key={st.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl ${st.icon} flex items-center justify-center shrink-0`}>
              <Car className={`w-5 h-5 ${st.iconC}`} />
            </div>
            <div className="min-w-0">
              <p className={`text-2xl font-extrabold leading-none ${st.num}`}>{st.value}</p>
              <p className="text-xs text-gray-400 mt-1.5 font-medium truncate">{st.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Table card (filters + headers + rows) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">

        {/* Filter bar — inside the card */}
        <div className="px-4 py-3.5 border-b border-gray-100 flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            {searchLoading
              ? <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
              : searchInput && <button onClick={() => setSearchInput("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition"><X className="w-3.5 h-3.5" /></button>}
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by truck number…"
              className="w-full pl-10 pr-10 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:bg-white transition"
            />
          </div>

          <div className="h-6 w-px bg-gray-100 hidden sm:block" />

          {/* Location */}
          <div className="relative">
            <select value={locationFilter} onChange={e => { setLocationFilter(e.target.value); setPage(1); }} className={selectCls}>
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
            <button onClick={clearFilters} className="text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg flex items-center gap-1 transition">
              <X className="w-3.5 h-3.5" />Clear
            </button>
          )}
        </div>

        {/* ── Scrollable table area ── */}
        <div className="overflow-x-auto border-b border-gray-100"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
          <div style={{ minWidth: colWidths.reduce((a, b) => a + b, 0) + "px" }}>

        {/* Column headers — resizable */}
        <div className="hidden md:grid bg-gray-50 border-b border-gray-100 select-none"
          style={{ gridTemplateColumns: colWidths.map(w => `${w}px`).join(" ") }}>
          {COL_DEFS.map((col, idx) => (
            <div key={col.label} className="relative flex items-center px-4 py-3 group">
              {col.sortKey ? (
                <button onClick={() => handleSort(col.sortKey!)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest hover:text-gray-700 transition">
                  <Clock className="w-3 h-3" />{col.label}
                  <ArrowUpDown className={`w-2.5 h-2.5 ${sortBy === col.sortKey ? "text-blue-500" : "text-gray-300"}`} />
                </button>
              ) : (
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                  {col.label}
                </span>
              )}
              {/* Drag handle — not on last column */}
              {idx < COL_DEFS.length - 1 && (
                <div
                  className="absolute right-0 top-[20%] h-[60%] w-[3px] rounded-full bg-gray-200 opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:bg-blue-400 transition-all cursor-col-resize"
                  onMouseDown={e => { e.preventDefault(); startResize(idx, e.clientX); }}
                />
              )}
            </div>
          ))}
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
            {sessions.map(s => (
              <TruckRow
                key={s.id}
                session={s}
                colWidths={colWidths}
                onReceipt={() => setReceiptSession(s)}
                onEdit={() => openEdit(s)}
                onDelete={() => setDeleteId(s.id)}
                deleteId={deleteId}
                deleteBusy={deleteBusy}
                onDeleteConfirm={handleDelete}
                onDeleteCancel={() => setDeleteId(null)}
              />
            ))}
          </div>
        )}

          </div>{/* end min-width wrapper */}
        </div>{/* end overflow-x-auto */}

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

      {/* ── Edit drawer ── */}
      {editSession && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setEditSession(null)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
            {/* header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Edit Session</p>
                  <p className="text-xs text-gray-400 font-mono">{editSession.truckNumber}</p>
                </div>
              </div>
              <button onClick={() => setEditSession(null)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Driver Name</label>
                <input value={editDriver} onChange={e => setEditDriver(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Driver Mobile</label>
                <input value={editMobile} onChange={e => setEditMobile(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Driver Licence</label>
                <input value={editLic} onChange={e => setEditLic(e.target.value)}
                  placeholder="Optional"
                  className="mt-1.5 w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Remarks</label>
                <textarea value={editRemarks} onChange={e => setEditRemarks(e.target.value)}
                  rows={3} placeholder="Optional"
                  className="mt-1.5 w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition resize-none" />
              </div>

              {editErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-xs px-3.5 py-2.5 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{editErr}
                </div>
              )}
              {editOk && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs px-3.5 py-2.5 rounded-xl">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />Saved successfully!
                </div>
              )}
            </div>

            {/* footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setEditSession(null)}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl transition text-sm">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={editBusy}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {editBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

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
const AVATAR_COLORS = [
  "from-blue-400 to-indigo-500", "from-violet-400 to-violet-600",
  "from-teal-400 to-cyan-500",   "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",   "from-sky-400 to-blue-500",
];
function avatarGradient(name: string) {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
}

interface TruckRowProps {
  session: Enriched;
  colWidths: number[];
  onReceipt: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteId: string | null;
  deleteBusy: boolean;
  onDeleteConfirm: (id: string) => Promise<void>;
  onDeleteCancel: () => void;
}
function TruckRow({ session: s, colWidths, onReceipt, onEdit, onDelete, deleteId, deleteBusy, onDeleteConfirm, onDeleteCancel }: TruckRowProps) {
  const cfg = statusConfig(s);

  return (
    <>
      {/* ── Desktop grid row ── */}
      <div
        className={`hidden md:grid items-center border-b border-gray-100 hover:bg-slate-50/80 transition-all group ${cfg.rowBorder} ${cfg.rowBg}`}
        style={{ gridTemplateColumns: colWidths.map(w => `${w}px`).join(" ") }}
      >
        {/* 1 — Truck badge */}
        <div className="px-4 py-4 min-w-0">
          <div className={`inline-flex items-center justify-center w-full px-3 py-2.5 rounded-xl text-xs font-extrabold tracking-widest text-white font-mono shadow-md ${cfg.badgeBg}`}>
            {s.truckNumber}
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-1 uppercase tracking-wide">{s.truckType}</p>
        </div>

        {/* 2 — Owner / Driver */}
        <div className="px-4 py-4 flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(s.ownerName)} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm`}>
            {s.ownerName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{s.ownerName}</p>
            <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3 shrink-0" />{s.checkin_driver_name}
            </p>
          </div>
        </div>

        {/* 3 — Location */}
        <div className="px-4 py-4 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-blue-400" />{s.locationName}
          </p>
          <p className="text-xs text-gray-400 truncate mt-0.5 pl-5">
            {s.divisionName}{s.slotCode !== "—" ? ` · Slot ${s.slotCode}` : ""}
          </p>
        </div>

        {/* 4 — Check-in time */}
        <div className="px-4 py-4 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{fmtDate(s.check_in_time)}</p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3 shrink-0" />{fmtTime(s.check_in_time)}
          </p>
        </div>

        {/* 5 — Check-out time + driver verification */}
        <div className="px-4 py-4 min-w-0">
          {s.check_out_time ? (
            <>
              <p className="text-sm font-semibold text-teal-700">{fmtDate(s.check_out_time)}</p>
              <p className="text-xs text-teal-500 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3 shrink-0" />{fmtTime(s.check_out_time)}
              </p>
              {s.driver_match && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                  s.driver_match === "match"    ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                  s.driver_match === "override" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                                                  "bg-rose-50 text-rose-700 border border-rose-200"
                }`}>
                  {s.driver_match === "match"    ? "✓ Verified" :
                   s.driver_match === "override" ? "⊘ Override" : "✗ Mismatch"}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-gray-300 font-medium">—</span>
          )}
        </div>

        {/* 6 — Type + Status stacked */}
        <div className="px-4 py-4 flex flex-col gap-1.5 items-start">
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${
            s.entry_type?.toLowerCase() === "khata"
              ? "bg-violet-100 text-violet-700"
              : "bg-slate-100 text-slate-500"
          }`}>
            {s.entry_type?.toUpperCase() ?? "—"}
          </span>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap flex items-center gap-1.5 ${cfg.badgeCls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              s.status === "parked" ? "bg-emerald-500" :
              s.status === "overdue" ? "bg-red-500" : "bg-teal-500"
            }`} />
            {cfg.badgeLabel}
          </span>
        </div>

        {/* 7 — Actions */}
        <div className="px-4 py-4 flex items-center gap-2">
          <Link href={`/dashboard/trucks/${s.id}`} title="View details"
            className="p-2 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition">
            <Eye className="w-3.5 h-3.5" />
          </Link>
          <button onClick={onEdit} title="Edit"
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} title="Delete"
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {cfg.action === "checkout" && (
            <Link href={`/dashboard/check-out?truck=${encodeURIComponent(s.truckNumber)}`}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm shadow-blue-200 transition">
              <LogOut className="w-3.5 h-3.5" />Checkout
            </Link>
          )}
          {cfg.action === "forceout" && (
            <Link href={`/dashboard/check-out?truck=${encodeURIComponent(s.truckNumber)}`}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm shadow-red-200 transition">
              <ShieldX className="w-3.5 h-3.5" />Force out
            </Link>
          )}
          {cfg.action === "receipt" && (
            <button onClick={onReceipt}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm shadow-teal-200 transition">
              <Receipt className="w-3.5 h-3.5" />Receipt
            </button>
          )}
        </div>
      </div>

      {/* ── Inline delete confirmation ── */}
      {deleteId === s.id && (
        <div className="hidden md:flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border-b border-red-100">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Delete session for <span className="font-bold">{s.truckNumber}</span>? This cannot be undone.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onDeleteCancel}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 px-3 py-1.5 rounded-lg transition">
              Cancel
            </button>
            <button onClick={() => onDeleteConfirm(s.id)} disabled={deleteBusy}
              className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 disabled:opacity-60">
              {deleteBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Yes, delete
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile card ── */}
      <div className={`md:hidden flex flex-col gap-3 px-4 py-4 border-b border-gray-50 ${cfg.rowBorder} ${cfg.rowBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-extrabold tracking-widest text-white font-mono shadow-sm ${cfg.badgeBg}`}>
            {s.truckNumber}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
              s.entry_type?.toLowerCase() === "khata" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"
            }`}>{s.entry_type?.toUpperCase()}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${cfg.badgeCls}`}>{cfg.badgeLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(s.ownerName)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
            {s.ownerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{s.ownerName}</p>
            <p className="text-xs text-gray-400">{s.checkin_driver_name} · driver</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />{s.locationName} · {s.divisionName}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-gray-500 space-y-0.5">
            <div><span className="text-gray-400">In  </span><span className="font-medium">{fmtDate(s.check_in_time)}</span> <span className="text-gray-400">{fmtTime(s.check_in_time)}</span></div>
            {s.check_out_time && (
              <div>
                <span className="text-gray-400">Out </span>
                <span className="font-medium text-teal-700">{fmtDate(s.check_out_time)}</span>
                <span className="text-teal-500"> {fmtTime(s.check_out_time)}</span>
              </div>
            )}
            {s.driver_match && s.check_out_time && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                s.driver_match === "match"    ? "bg-emerald-50 text-emerald-700" :
                s.driver_match === "override" ? "bg-blue-50 text-blue-700" :
                                                "bg-rose-50 text-rose-700"
              }`}>
                {s.driver_match === "match" ? "✓" : s.driver_match === "override" ? "⊘" : "✗"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onEdit} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5" /></button>
            {cfg.action === "checkout" && (
              <Link href={`/dashboard/check-out?truck=${encodeURIComponent(s.truckNumber)}`} className="flex items-center gap-1 bg-blue-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition">
                <LogOut className="w-3 h-3" />Checkout
              </Link>
            )}
            {cfg.action === "forceout" && (
              <Link href={`/dashboard/check-out?truck=${encodeURIComponent(s.truckNumber)}`} className="flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition">
                <ShieldX className="w-3 h-3" />Force out
              </Link>
            )}
            {cfg.action === "receipt" && (
              <button onClick={onReceipt} className="flex items-center gap-1 bg-teal-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition">
                <Receipt className="w-3 h-3" />Receipt
              </button>
            )}
          </div>
        </div>
        {/* mobile delete confirm */}
        {deleteId === s.id && (
          <div className="flex flex-col gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
            <p className="text-xs text-red-700 font-medium">Delete this session? This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={onDeleteCancel} className="flex-1 text-xs font-semibold text-gray-600 bg-white border border-gray-200 py-2 rounded-lg transition">Cancel</button>
              <button onClick={() => onDeleteConfirm(s.id)} disabled={deleteBusy}
                className="flex-1 text-xs font-semibold text-white bg-red-600 py-2 rounded-lg transition flex items-center justify-center gap-1 disabled:opacity-60">
                {deleteBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}Yes, delete
              </button>
            </div>
          </div>
        )}
      </div>
    </>
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
