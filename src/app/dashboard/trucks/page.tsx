"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight, ChevronLeft, Search, RefreshCw, X, Loader2, AlertCircle,
  Truck as TruckIcon, User, MapPin, Clock, LogOut, LogIn, Receipt,
  ShieldX, Download, ChevronDown, ChevronUp, Pencil, Trash2, CheckCircle2, Eye,
  MoreVertical, ShieldCheck, ShieldAlert, IndianRupee, FileText,
  Phone, Building2, TrendingUp, TrendingDown, PackageSearch,
  SlidersHorizontal, RotateCcw, StickyNote, Plus, History, Layers, Wallet, Timer,
  CalendarClock, Hash, ExternalLink,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { Overlay } from "@/components/ui/Overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { dashboardApi } from "@/lib/api";

import { handleUnauthorized, useLocationFilter } from "@/lib/auth";
import { LocationSelect } from "@/components/ui/LocationSelect";
import { EnumFilterSelect } from "@/components/ui/EnumFilterSelect";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const PAGE_SIZE = 10;
const DATE_FILTER_CAP = 500;

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", token, ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Your session has expired. Redirecting to login…");
  }
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
interface OwnerData    { id: string; name: string; company: string | null; primary_mobile: string; mobile?: string }
interface LocData      { id: string; name: string; city: string | null }
interface DivData      { id: string; name: string }
interface SlotData     { id: string; code: string; status?: string }
interface OverdueRule  { id: string; days: number; color: string; label: string | null }
interface UserData     { id: string; name?: string; full_name?: string; username?: string; email?: string }
interface Enriched extends Session {
  truckNumber: string; truckType: string;
  ownerName: string; ownerMobile: string; ownerCompany: string | null;
  locationName: string; divisionName: string; slotCode: string;
}

// ── formatters ────────────────────────────────────────────────────────────────
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtDuration(startIso: string, endIso: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const totalMin = Math.max(0, Math.floor((end - new Date(startIso).getTime()) / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// ── status / priority derivation ───────────────────────────────────────────────
type StatusKey = "parked" | "overdue" | "checkedout" | "forced" | "verification";
type Priority = "green" | "orange" | "red";

function daysSince(iso: string): number {
  return Math.max(1, Math.ceil((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function topMatchedRule(checkInTime: string, rules: OverdueRule[]): OverdueRule | null {
  if (!rules.length) return null;
  const elapsed = Math.floor((Date.now() - new Date(checkInTime).getTime()) / 86_400_000);
  let matched: OverdueRule | null = null;
  for (const r of rules) if (elapsed >= r.days) matched = r;
  return matched;
}

function deriveStatusKey(s: Session): StatusKey {
  if (s.status !== "released" && s.driver_match === "mismatch") return "verification";
  if (s.status === "released") return s.driver_match === "override" ? "forced" : "checkedout";
  if (s.status === "overdue") return "overdue";
  return "parked";
}

function priorityFor(key: StatusKey, s: Session, rules: OverdueRule[]): Priority {
  if (key === "verification") return "red";
  if (key === "overdue") {
    const maxDays = rules.length ? Math.max(...rules.map(r => r.days)) : 0;
    const rule = topMatchedRule(s.check_in_time, rules);
    return rule && maxDays > 0 && rule.days === maxDays ? "red" : "orange";
  }
  return "green";
}

const PRIORITY_BAR: Record<Priority, string> = {
  green: "bg-emerald-400 dark:bg-emerald-500",
  orange: "bg-amber-400 dark:bg-amber-500",
  red: "bg-red-500",
};

const STATUS_META: Record<StatusKey, {
  label: string; dot: string; chip: string;
}> = {
  parked:       { label: "Parked",         dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20" },
  overdue:      { label: "Overdue",        dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20" },
  checkedout:   { label: "Checked out",    dot: "bg-sky-500",     chip: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20" },
  forced:       { label: "Force Checkout", dot: "bg-violet-500",  chip: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20" },
  verification: { label: "Verification Pending", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20" },
};

function statusLabel(key: StatusKey, s: Session): string {
  if (key === "overdue") return `Overdue · ${daysSince(s.check_in_time)}d`;
  return STATUS_META[key].label;
}

// Filter dropdown options — reuse the same dot colors as STATUS_META / the row
// KHATA badge so the filter chips read consistently with the rest of the page.
const STATUS_FILTER_OPTIONS = [
  { value: "parked", label: STATUS_META.parked.label, dot: STATUS_META.parked.dot },
  { value: "overdue", label: STATUS_META.overdue.label, dot: STATUS_META.overdue.dot },
  { value: "released", label: STATUS_META.checkedout.label, dot: STATUS_META.checkedout.dot },
];
const TYPE_FILTER_OPTIONS = [
  { value: "regular", label: "Regular", dot: "bg-gray-400 dark:bg-slate-500" },
  { value: "khata", label: "KHATA", dot: "bg-violet-500" },
];

// ── full-payload PUT builder ───────────────────────────────────────────────────
// The backend's PUT /parking-sessions/{id} is a full replace, not a partial patch —
// every field on ParkingSessionUpdate is required, so we always send the session's
// existing values and only override what's actually changing.
function buildUpdatePayload(s: Enriched, overrides: Record<string, unknown>) {
  return {
    truck_id: s.truck_id,
    owner_id: s.owner_id,
    location_id: s.location_id,
    division_id: s.division_id,
    slot_id: s.slot_id,
    entry_type: s.entry_type,
    checkin_driver_name: s.checkin_driver_name,
    checkin_driver_mobile: s.checkin_driver_mobile,
    checkin_driver_licence: s.checkin_driver_licence,
    checkin_id_proof_type: s.checkin_id_proof_type,
    check_in_time: s.check_in_time,
    checkin_remarks: s.checkin_remarks,
    checkout_driver_name: s.checkout_driver_name,
    checkout_driver_mobile: s.checkout_driver_mobile,
    driver_match: s.driver_match,
    override_by: s.override_by,
    check_out_time: s.check_out_time,
    checkout_remarks: s.checkout_remarks,
    rate_per_day: s.rate_per_day,
    gst_percent: s.gst_percent,
    days: s.days,
    subtotal: s.subtotal,
    gst_amount: s.gst_amount,
    total_amount: s.total_amount,
    status: s.status,
    ...overrides,
  };
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 800) {
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

function OccupancyRing({ percent, color }: { percent: number; color: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const dash = (c * Math.min(Math.max(percent, 0), 100)) / 100;
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" className="-rotate-90 shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth={4} className="stroke-gray-100 dark:stroke-slate-800" />
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth={4} strokeLinecap="round" stroke={color} strokeDasharray={`${dash} ${c - dash}`} />
    </svg>
  );
}

type KPITrend = { kind: "sparkline"; data: number[]; color: string } | { kind: "ring"; percent: number; color: string };

function KPICard({
  label, value, sub, subColor = "text-gray-400 dark:text-slate-500", subIcon,
  icon, iconBg, delay = 0, trend,
}: {
  label: string; value: React.ReactNode; sub?: string; subColor?: string; subIcon?: "up" | "down";
  icon: React.ReactNode; iconBg: string; delay?: number; trend?: KPITrend;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      whileHover={{ scale: 1.02 }}
      className="rounded-3xl transition-shadow duration-300 hover:shadow-xl"
    >
      <GlassCard gradientBorder className="p-4 group h-full">
        <div className="flex items-start justify-between mb-2.5">
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 leading-tight">{label}</p>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}>
            {icon}
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight tabular-nums truncate">{value}</p>
            {sub && (
              <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${subColor}`}>
                {subIcon === "up" && <TrendingUp className="w-3 h-3 shrink-0" />}
                {subIcon === "down" && <TrendingDown className="w-3 h-3 shrink-0" />}
                <span className="truncate">{sub}</span>
              </div>
            )}
          </div>
          {trend && (
            <div className="hidden sm:block shrink-0">
              {trend.kind === "sparkline" && <Sparkline data={trend.data} stroke={trend.color} width={60} height={28} />}
              {trend.kind === "ring" && <OccupancyRing percent={trend.percent} color={trend.color} />}
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ── small building blocks ──────────────────────────────────────────────────────

function ReceiptRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-400 dark:text-slate-500 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-gray-700 dark:text-slate-200 text-right">{value ?? "—"}</span>
    </div>
  );
}
function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="p-2 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition border border-transparent hover:border-gray-200 dark:hover:border-slate-700">
      {children}
    </button>
  );
}
function DetailField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm text-gray-800 dark:text-slate-200 font-medium ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}
const GRID_COLS = "28px minmax(150px,1.1fr) minmax(190px,1.5fr) minmax(150px,1.1fr) minmax(150px,1.1fr) minmax(150px,1fr) minmax(200px,1.2fr)";

// ── column config for header labels ────────────────────────────────────────────
const COL_LABELS = ["", "Truck", "Owner / Driver", "Location", "Check-in / Check-out", "Status", "Actions"];

// ── main page ─────────────────────────────────────────────────────────────────
export default function AllTrucksPage() {
  const [sessions,  setSessions]  = useState<Enriched[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [listError, setListError] = useState("");

  // Non-admin roles are locked to their assigned location — no "All locations" escape hatch.
  const { isAdmin, locationId: locationFilter, setLocationId: setLocationFilter } = useLocationFilter();

  const [searchInput,    setSearchInput]    = useState("");
  const [statusFilter,   setStatusFilter]   = useState("");
  const [typeFilter,     setTypeFilter]     = useState("");
  const [sortOrder,      setSortOrder]      = useState<"asc" | "desc">("desc");

  const [truckIdFilter, setTruckIdFilter]   = useState("");
  const [truckSearch,   setTruckSearch]     = useState("");
  const [searchLoading, setSearchLoading]   = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  const [locations,     setLocations]     = useState<LocData[]>([]);
  const [overdueRules,  setOverdueRules]  = useState<OverdueRule[]>([]);
  const [receiptSession, setReceiptSession] = useState<Enriched | null>(null);
  const [detailSession,  setDetailSession]  = useState<Enriched | null>(null);
  const [detailApprover, setDetailApprover] = useState<UserData | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const [kpiCounts, setKpiCounts] = useState({ total: 0, parked: 0, overdue: 0, released: 0 });
  const [revenue, setRevenue] = useState<{ today: number; growthPercent: number; weekly: number[] } | null>(null);

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
  const [deleteSession, setDeleteSession] = useState<Enriched | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ── enrichment cache (survives page changes) ──
  const tCache = useRef<Record<string, TruckData>>({});
  const oCache = useRef<Record<string, OwnerData>>({});
  const lCache = useRef<Record<string, LocData>>({});
  const dCache = useRef<Record<string, DivData>>({});
  const sCache = useRef<Record<string, SlotData>>({});

  useEffect(() => {
    apiFetch<{ list: LocData[] }>("/locations?limit=100&start=0").then(r => setLocations(r.list ?? [])).catch(() => {});
    apiFetch<{ list: OverdueRule[] }>("/overdue-alert-rules").then(r => setOverdueRules((r.list ?? []).sort((a, b) => a.days - b.days))).catch(() => {});
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

  const enrich = useCallback(async (list: Session[]): Promise<Enriched[]> => {
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

    return list.map(s => ({
      ...s,
      truckNumber:  tCache.current[s.truck_id]?.truck_number ?? s.truck_id.slice(0, 8).toUpperCase(),
      truckType:    tCache.current[s.truck_id]?.truck_type   ?? "—",
      ownerName:    oCache.current[s.owner_id]?.name         ?? "—",
      ownerMobile:  oCache.current[s.owner_id]?.primary_mobile ?? oCache.current[s.owner_id]?.mobile ?? "",
      ownerCompany: oCache.current[s.owner_id]?.company      ?? null,
      locationName: lCache.current[s.location_id]?.name      ?? "—",
      divisionName: dCache.current[s.division_id]?.name      ?? "—",
      slotCode:     s.slot_id ? (sCache.current[s.slot_id]?.code ?? "—") : "—",
    }));
  }, []);

  const fetchSessions = useCallback(async (
    p: number, tid: string, locId: string, status: string, type: string, ord: string,
    from: string, to: string,
  ) => {
    if (tid === "__none__") { setSessions([]); setTotal(0); return; }
    setLoading(true); setListError("");
    try {
      const dateFiltering = !!(from || to);
      const start = dateFiltering ? 0 : (p - 1) * PAGE_SIZE;
      const limit = dateFiltering ? DATE_FILTER_CAP : PAGE_SIZE;
      let url = `/parking-sessions?start=${start}&limit=${limit}&sort_by=check_in_time&order=${ord}`;
      if (tid)    url += `&truck_id=${tid}`;
      if (locId)  url += `&location_id=${locId}`;
      if (status) url += `&status=${status}`;
      if (type)   url += `&entry_type=${type}`;
      const data = await apiFetch<{ count: number; list: Session[] }>(url);
      let list = data.list ?? [];
      let count = data.count ?? 0;

      if (dateFiltering) {
        const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
        const toMs   = to   ? new Date(`${to}T23:59:59`).getTime()   : Infinity;
        list = list.filter(s => {
          const t = new Date(s.check_in_time).getTime();
          return t >= fromMs && t <= toMs;
        });
        count = list.length;
        list = list.slice((p - 1) * PAGE_SIZE, (p - 1) * PAGE_SIZE + PAGE_SIZE);
      }

      const enriched = await enrich(list);
      setSessions(enriched);
      setTotal(count);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally { setLoading(false); }
  }, [enrich]);

  useEffect(() => {
    fetchSessions(page, truckIdFilter, locationFilter, statusFilter, typeFilter, sortOrder, dateFrom, dateTo);
  }, [page, truckIdFilter, locationFilter, statusFilter, typeFilter, sortOrder, dateFrom, dateTo, fetchSessions]);

  // ── KPI counts (independent of pagination; respects location/type/truck filters, not status) ──
  const fetchKpis = useCallback(async () => {
    if (truckIdFilter === "__none__") { setKpiCounts({ total: 0, parked: 0, overdue: 0, released: 0 }); return; }
    const base = (status: string) => {
      let url = `/parking-sessions?start=0&limit=1`;
      if (status) url += `&status=${status}`;
      if (truckIdFilter)  url += `&truck_id=${truckIdFilter}`;
      if (locationFilter) url += `&location_id=${locationFilter}`;
      if (typeFilter)     url += `&entry_type=${typeFilter}`;
      return apiFetch<{ count: number }>(url).then(r => r.count ?? 0).catch(() => 0);
    };
    const [t, p, o, r] = await Promise.all([base(""), base("parked"), base("overdue"), base("released")]);
    setKpiCounts({ total: t, parked: p, overdue: o, released: r });
  }, [truckIdFilter, locationFilter, typeFilter]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  // ── revenue KPI (reuses the dashboard aggregate endpoint) ──
  const fetchRevenue = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const data = await dashboardApi.get(token, locationFilter || undefined);
      setRevenue({
        today: data.kpis.today_revenue,
        growthPercent: data.kpis.revenue_growth_percent,
        weekly: data.weekly_revenue.map(w => w.total),
      });
    } catch { /* non-critical — card just shows a dash */ }
  }, [locationFilter]);

  useEffect(() => { fetchRevenue(); }, [fetchRevenue]);

  const refreshAll = useCallback(() => {
    fetchSessions(page, truckIdFilter, locationFilter, statusFilter, typeFilter, sortOrder, dateFrom, dateTo);
    fetchKpis();
    fetchRevenue();
  }, [fetchSessions, page, truckIdFilter, locationFilter, statusFilter, typeFilter, sortOrder, dateFrom, dateTo, fetchKpis, fetchRevenue]);

  function clearFilters() {
    setSearchInput(""); setLocationFilter(""); setStatusFilter(""); setTypeFilter("");
    setTruckIdFilter(""); setTruckSearch(""); setDateFrom(""); setDateTo(""); setPage(1);
  }

  const avgParkingTime = useMemo(() => {
    const done = sessions.filter(s => s.check_out_time && s.days != null);
    if (!done.length) return null;
    const avgDays = done.reduce((sum, s) => sum + (s.days ?? 0), 0) / done.length;
    return avgDays < 1 ? `${Math.round(avgDays * 24)}h` : `${avgDays.toFixed(1)}d`;
  }, [sessions]);

  // ── edit ──
  function openEdit(s: Enriched) {
    setEditSession(s);
    setEditDriver(s.checkin_driver_name ?? "");
    setEditMobile(s.checkin_driver_mobile ?? "");
    setEditLic(s.checkin_driver_licence ?? "");
    setEditRemarks(s.checkin_remarks ?? "");
    setEditErr(""); setEditOk(false);
    setMenuId(null);
  }
  async function handleSaveEdit() {
    if (!editSession) return;
    setEditBusy(true); setEditErr(""); setEditOk(false);
    try {
      const payload = buildUpdatePayload(editSession, {
        checkin_driver_name: editDriver.trim(),
        checkin_driver_mobile: editMobile.trim(),
        checkin_driver_licence: editLic.trim() || null,
        checkin_remarks: editRemarks.trim() || null,
      });
      await apiFetch(`/parking-sessions/${editSession.id}`, { method: "PUT", body: JSON.stringify(payload) });
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

  // ── delete ──
  async function handleDelete(id: string) {
    setDeleteBusy(true);
    try {
      await apiFetch(`/parking-sessions/${id}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== id));
      setTotal(t => t - 1);
      setDeleteSession(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally { setDeleteBusy(false); }
  }

  // ── details drawer ──
  function openDetails(s: Enriched) {
    setDetailSession(s); setDetailApprover(null); setMenuId(null);
    if (s.override_by) {
      apiFetch<UserData>(`/users/${s.override_by}`).then(setDetailApprover).catch(() => {});
    }
  }

  function exportCSV() {
    if (!sessions.length) return;
    const headers = ["Truck No","Type","Owner","Driver","Location","Division","Slot","Status","Entry Type","Check-in","Check-out","Days","Total (₹)"];
    const rows = sessions.map(s => {
      const key = deriveStatusKey(s);
      return [
        s.truckNumber, s.truckType, s.ownerName, s.checkin_driver_name,
        s.locationName, s.divisionName, s.slotCode, statusLabel(key, s),
        s.entry_type, fmtDateTime(s.check_in_time), fmtDateTime(s.check_out_time),
        s.days ?? "", s.total_amount ?? "",
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv]));
    a.download = `parkos-trucks-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = !!(searchInput || (isAdmin && locationFilter) || statusFilter || typeFilter || dateFrom || dateTo);
  const occPercent = kpiCounts.total ? (kpiCounts.parked / kpiCounts.total) * 100 : 0;
  const overduePercent = kpiCounts.total ? (kpiCounts.overdue / kpiCounts.total) * 100 : 0;
  const releasedPercent = kpiCounts.total ? (kpiCounts.released / kpiCounts.total) * 100 : 0;

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 space-y-5 w-full">

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500 mb-2">
            <Link href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-700 dark:text-slate-300 font-semibold">All Trucks</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">All Trucks</h1>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Monitor all active and completed parking sessions.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={refreshAll}
            disabled={loading}
            className="flex items-center gap-2 bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={exportCSV}
            disabled={!sessions.length}
            className="flex items-center gap-2 bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <Link
            href="/dashboard/check-in"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm shadow-indigo-200 dark:shadow-none"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Truck</span>
          </Link>
        </div>
      </motion.div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <KPICard
          delay={0}
          label="Total Trucks"
          value={<AnimatedNumber value={kpiCounts.total} format={n => Math.round(n).toString()} />}
          sub="all sessions"
          icon={<Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />}
          iconBg="bg-indigo-100 dark:bg-indigo-500/15"
        />
        <KPICard
          delay={0.06}
          label="Currently Parked"
          value={<AnimatedNumber value={kpiCounts.parked} format={n => Math.round(n).toString()} />}
          sub={`${occPercent.toFixed(0)}% of fleet`}
          icon={<TruckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />}
          iconBg="bg-emerald-100 dark:bg-emerald-500/15"
          trend={{ kind: "ring", percent: occPercent, color: "#10B981" }}
        />
        <KPICard
          delay={0.12}
          label="Overdue"
          value={<AnimatedNumber value={kpiCounts.overdue} format={n => Math.round(n).toString()} />}
          sub={kpiCounts.overdue > 0 ? "needs action" : "all clear"}
          subColor={kpiCounts.overdue > 0 ? "text-red-500" : "text-emerald-500"}
          icon={<AlertCircle className="w-4 h-4 text-red-500" />}
          iconBg="bg-red-100 dark:bg-red-500/15"
          trend={{ kind: "ring", percent: overduePercent, color: "#EF4444" }}
        />
        <KPICard
          delay={0.18}
          label="Checked Out"
          value={<AnimatedNumber value={kpiCounts.released} format={n => Math.round(n).toString()} />}
          sub={`${releasedPercent.toFixed(0)}% of fleet`}
          icon={<CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-300" />}
          iconBg="bg-sky-100 dark:bg-sky-500/15"
          trend={{ kind: "ring", percent: releasedPercent, color: "#0EA5E9" }}
        />
        <KPICard
          delay={0.24}
          label="Revenue Today"
          value={revenue ? <AnimatedNumber value={revenue.today} format={fmtINR} /> : "—"}
          sub={revenue ? `${revenue.growthPercent >= 0 ? "+" : ""}${revenue.growthPercent.toFixed(1)}% vs yesterday` : undefined}
          subColor={revenue && revenue.growthPercent > 0 ? "text-emerald-600" : revenue && revenue.growthPercent < 0 ? "text-red-500" : undefined}
          subIcon={revenue ? (revenue.growthPercent > 0 ? "up" : revenue.growthPercent < 0 ? "down" : undefined) : undefined}
          icon={<Wallet className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />}
          iconBg="bg-cyan-100 dark:bg-cyan-500/15"
          trend={revenue ? { kind: "sparkline", data: revenue.weekly, color: "#06B6D4" } : undefined}
        />
        <KPICard
          delay={0.3}
          label="Avg Parking Time"
          value={avgParkingTime ?? "—"}
          sub="checked-out · current view"
          icon={<Timer className="w-4 h-4 text-amber-600 dark:text-amber-300" />}
          iconBg="bg-amber-100 dark:bg-amber-500/15"
        />
      </div>

      {/* ── Toolbar ── */}
      <GlassCard className="p-3.5">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative w-full sm:flex-1 sm:min-w-52">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
            {searchLoading
              ? <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
              : searchInput && <button onClick={() => setSearchInput("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition"><X className="w-3.5 h-3.5" /></button>}
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search truck number…"
              className="w-full pl-10 pr-10 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition"
            />
          </div>

          <div className="h-6 w-px bg-gray-100 dark:bg-slate-700 hidden sm:block" />

          <LocationSelect
            className="w-full sm:w-auto"
            value={locationFilter}
            onChange={(v) => { setLocationFilter(v); setPage(1); }}
            locations={locations}
            allowAll={isAdmin}
            locked={!isAdmin}
          />

          <EnumFilterSelect
            className="w-full sm:w-auto"
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={STATUS_FILTER_OPTIONS}
            allLabel="All statuses"
          />

          <EnumFilterSelect
            className="w-full sm:w-auto"
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setPage(1); }}
            options={TYPE_FILTER_OPTIONS}
            allLabel="All types"
          />

          <div className="flex items-center gap-2 w-full sm:w-auto sm:contents">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className={`flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition ${showAdvanced ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" : "bg-gray-50 dark:bg-slate-800/60 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"}`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />Advanced
            </button>

            {filtersActive && (
              <button onClick={clearFilters} className="flex-1 sm:flex-none text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/20 hover:bg-red-100 px-3 py-2 rounded-xl flex items-center justify-center sm:justify-start gap-1.5 transition">
                <RotateCcw className="w-3.5 h-3.5" />Reset
              </button>
            )}

            <div className="flex-1 hidden lg:block" />

            <button onClick={exportCSV} disabled={!sessions.length}
              className="flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800/60 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition disabled:opacity-40">
              <Download className="w-3.5 h-3.5" />Export
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 mt-3 border-t border-gray-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-slate-400">
                  <CalendarClock className="w-3.5 h-3.5" />Check-in date range
                </div>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <span className="text-gray-300 dark:text-slate-600 text-sm">to</span>
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                {(dateFrom || dateTo) && (
                  <span className="text-[11px] text-gray-400 dark:text-slate-500">
                    scanning most recent {DATE_FILTER_CAP} matching sessions
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ── Data grid ── */}
      <GlassCard className="overflow-hidden">
        <div className="md:overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
          <div className="md:min-w-[1060px]">

            {/* sticky header — desktop grid only, mobile cards carry their own labels */}
            <div className="hidden md:grid sticky top-0 z-10 bg-gray-50/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800"
              style={{ gridTemplateColumns: GRID_COLS }}>
              {COL_LABELS.map((label, i) => (
                <div key={i} className="px-3 py-3 flex items-center">
                  {label && i === 4 ? (
                    <button
                      onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
                      className="flex items-center gap-1 text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest hover:text-gray-700 dark:hover:text-slate-200 transition"
                    >
                      <Clock className="w-3 h-3" />{label}
                      {sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  ) : label && (
                    <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                      {label}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {listError && (
              <div className="flex items-center gap-2.5 px-5 py-4 bg-red-50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{listError}</p>
              </div>
            )}

            <div className="p-2.5 space-y-2">
              {truckSearch === "__none__" ? (
                <EmptyState
                  icon={<PackageSearch className="w-8 h-8 text-gray-300 dark:text-slate-600" />}
                  title={`No truck found matching "${searchInput}"`}
                  sub="Check the registration number and try again"
                />
              ) : loading ? (
                Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
              ) : sessions.length === 0 ? (
                <EmptyState
                  icon={<TruckIcon className="w-8 h-8 text-gray-300 dark:text-slate-600" />}
                  title="No active trucks found."
                  sub={filtersActive ? "Try clearing some filters" : "Check in a truck to get started"}
                  cta={!filtersActive}
                />
              ) : (
                sessions.map((s, i) => (
                  <TruckRow
                    key={s.id}
                    session={s}
                    index={i}
                    rules={overdueRules}
                    expanded={expandedId === s.id}
                    onToggleExpand={() => setExpandedId(prev => prev === s.id ? null : s.id)}
                    menuOpen={menuId === s.id}
                    onToggleMenu={() => setMenuId(prev => prev === s.id ? null : s.id)}
                    onCloseMenu={() => setMenuId(null)}
                    onView={() => openDetails(s)}
                    onEdit={() => openEdit(s)}
                    onReceipt={() => { setReceiptSession(s); setMenuId(null); }}
                    onDelete={() => { setDeleteSession(s); setMenuId(null); }}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/40 dark:bg-slate-800/20">
            <p className="text-xs text-gray-400 dark:text-slate-500 order-2 sm:order-1">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of <span className="font-semibold text-gray-600 dark:text-slate-300">{total}</span>
            </p>
            <div className="flex items-center gap-1 order-1 sm:order-2">
              <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const n = i + 1;
                return (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition ${page === n ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white border border-transparent hover:border-gray-200 dark:hover:border-slate-700"}`}>
                    {n}
                  </button>
                );
              })}
              <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></PagBtn>
            </div>
          </div>
        )}
      </GlassCard>

      {/* ── Edit drawer ── */}
      <Overlay open={!!editSession} onClose={() => setEditSession(null)} variant="drawer" title="Edit Session" widthClass="max-w-md">
        {editSession && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400 dark:text-slate-500 font-mono -mt-2">{editSession.truckNumber}</p>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Driver Name</label>
              <input value={editDriver} onChange={e => setEditDriver(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Driver Mobile</label>
              <input value={editMobile} onChange={e => setEditMobile(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Driver Licence</label>
              <input value={editLic} onChange={e => setEditLic(e.target.value)} placeholder="Optional"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Remarks</label>
              <textarea value={editRemarks} onChange={e => setEditRemarks(e.target.value)} rows={3} placeholder="Optional"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition resize-none" />
            </div>

            {editErr && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-300 text-xs px-3.5 py-2.5 rounded-xl">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />{editErr}
              </div>
            )}
            {editOk && (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs px-3.5 py-2.5 rounded-xl">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />Saved successfully!
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditSession(null)}
                className="flex-1 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold py-2.5 rounded-xl transition text-sm">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={editBusy}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {editBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </Overlay>


      {/* ── Receipt modal ── */}
      <Overlay open={!!receiptSession} onClose={() => setReceiptSession(null)} variant="modal" title="Receipt" widthClass="max-w-sm">
        {receiptSession && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 dark:text-slate-500 font-mono -mt-2">{receiptSession.truckNumber}</p>
            <ReceiptRow label="Owner"      value={receiptSession.ownerName} />
            <ReceiptRow label="Driver"     value={receiptSession.checkin_driver_name} />
            <ReceiptRow label="Location"   value={`${receiptSession.locationName} · ${receiptSession.divisionName} · ${receiptSession.slotCode}`} />
            <ReceiptRow label="Entry type" value={receiptSession.entry_type?.toUpperCase()} />
            <ReceiptRow label="Check-in"   value={fmtDateTime(receiptSession.check_in_time)} />
            <ReceiptRow label="Check-out"  value={fmtDateTime(receiptSession.check_out_time)} />
            <div className="border-t border-gray-100 dark:border-slate-800 pt-3 space-y-2">
              <ReceiptRow label={`${receiptSession.days ?? "—"} days × ₹${receiptSession.rate_per_day}/day`} value={`₹${receiptSession.subtotal?.toFixed(2) ?? "—"}`} />
              <ReceiptRow label={`GST ${receiptSession.gst_percent}%`} value={`₹${receiptSession.gst_amount?.toFixed(2) ?? "—"}`} />
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-bold text-gray-700 dark:text-slate-200">Total</span>
                <span className="text-lg font-extrabold text-gray-900 dark:text-white">₹{receiptSession.total_amount?.toFixed(2) ?? "—"}</span>
              </div>
            </div>
            <button onClick={() => setReceiptSession(null)}
              className="w-full border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold py-2.5 rounded-xl transition text-sm mt-1">
              Close
            </button>
          </div>
        )}
      </Overlay>

      {/* ── Delete confirm modal ── */}
      <Overlay open={!!deleteSession} onClose={() => setDeleteSession(null)} variant="modal" title="Delete session" widthClass="max-w-sm">
        {deleteSession && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3.5">
              <Trash2 className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Delete session for <span className="font-bold">{deleteSession.truckNumber}</span>? This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteSession(null)}
                className="flex-1 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold py-2.5 rounded-xl transition text-sm">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteSession.id)} disabled={deleteBusy}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Yes, delete
              </button>
            </div>
          </div>
        )}
      </Overlay>

      {/* ── Details drawer ── */}
      <Overlay open={!!detailSession} onClose={() => setDetailSession(null)} variant="drawer" title="Truck Details" widthClass="max-w-lg">
        {detailSession && <DetailsDrawerBody s={detailSession} approver={detailApprover} rules={overdueRules} />}
      </Overlay>
    </div>
  );
}

// ── empty / loading states ─────────────────────────────────────────────────────
function EmptyState({ icon, title, sub, cta }: { icon: React.ReactNode; title: string; sub: string; cta?: boolean }) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-3">
        {icon}
      </div>
      <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{title}</p>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{sub}</p>
      {cta && (
        <Link href="/dashboard/check-in"
          className="inline-flex items-center gap-2 mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm">
          <Plus className="w-4 h-4" />Add Truck
        </Link>
      )}
    </div>
  );
}
function RowSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-800 px-4 py-4 flex items-center gap-4">
      <Skeleton className="w-24 h-8 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-40 rounded-full" />
        <Skeleton className="h-3 w-56 rounded-full" />
      </div>
      <Skeleton className="w-20 h-6 rounded-full hidden sm:block" />
      <Skeleton className="w-24 h-8 rounded-xl hidden md:block" />
    </div>
  );
}

// ── truck row ─────────────────────────────────────────────────────────────────
interface TruckRowProps {
  session: Enriched;
  index: number;
  rules: OverdueRule[];
  expanded: boolean;
  onToggleExpand: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onView: () => void;
  onEdit: () => void;
  onReceipt: () => void;
  onDelete: () => void;
}
function TruckRow({
  session: s, index, rules, expanded, onToggleExpand,
  menuOpen, onToggleMenu, onCloseMenu, onView, onEdit, onReceipt, onDelete,
}: TruckRowProps) {
  const key = deriveStatusKey(s);
  const priority = priorityFor(key, s, rules);
  const meta = STATUS_META[key];
  const isActive = s.status === "parked" || s.status === "overdue";

  // Portal-positioned (fixed) row menu — escapes the table card's own
  // overflow-hidden clipping, which otherwise cut the panel off whenever a
  // row sat near the bottom of a short table (e.g. a single-row list).
  const desktopBtnRef = useRef<HTMLButtonElement>(null);
  const mobileBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  function openFrom(ref: React.RefObject<HTMLButtonElement | null>) {
    if (!menuOpen && ref.current) setRect(ref.current.getBoundingClientRect());
    onToggleMenu();
  }

  useEffect(() => {
    if (!menuOpen) return;
    function reposition() {
      const ref = desktopBtnRef.current?.offsetParent ? desktopBtnRef : mobileBtnRef;
      if (ref.current) setRect(ref.current.getBoundingClientRect());
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const insideDesktop = desktopBtnRef.current?.contains(target);
      const insideMobile = mobileBtnRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideDesktop && !insideMobile && !insidePanel) onCloseMenu();
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCloseMenu(); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [menuOpen, onCloseMenu]);

  // Recomputed on every render from `rect` so it stays correct after scroll/resize.
  const PANEL_W = 208; // w-52
  const PANEL_H = 230; // 6 menu items + divider
  const panelStyle: React.CSSProperties = rect ? (() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rawLeft = rect.right - PANEL_W;
    const left = Math.max(8, Math.min(rawLeft, vw - PANEL_W - 8));
    const openUp = rect.bottom + PANEL_H + 8 > vh && rect.top > PANEL_H + 8;
    return {
      position: "fixed" as const,
      left,
      zIndex: 10000,
      ...(openUp
        ? { bottom: vh - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    };
  })() : { display: "none" };

  const menuContent = (
    <>
      <MenuItem icon={<Eye className="w-3.5 h-3.5" />} label="View Details" onClick={onView} />
      <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} label="Edit" onClick={onEdit} />
      <MenuItem icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Driver Verification" href="/dashboard/verification" disabled={s.driver_match !== "mismatch"} />
      <MenuItem icon={<Receipt className="w-3.5 h-3.5" />} label="Generate Receipt" onClick={onReceipt} disabled={s.status !== "released"} />
      <MenuItem icon={<ShieldX className="w-3.5 h-3.5" />} label="Force Checkout" href={`/dashboard/check-out?truck=${encodeURIComponent(s.truckNumber)}`} disabled={!isActive} danger />
      <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
      <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" onClick={onDelete} danger />
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.02 }}
      whileHover={{ y: -1 }}
      style={{ zIndex: menuOpen ? 30 : undefined }}
      className={`relative rounded-2xl border border-gray-100 dark:border-slate-800 overflow-visible transition-shadow hover:shadow-md ${
        index % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/20" : "bg-white/80 dark:bg-slate-900/50"
      }`}
    >
      <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${PRIORITY_BAR[priority]}`} />

      {/* Desktop row */}
      <div
        className="hidden md:grid items-center cursor-pointer"
        style={{ gridTemplateColumns: GRID_COLS }}
        onClick={onToggleExpand}
      >
        <div className="px-3 flex items-center justify-center text-gray-300 dark:text-slate-600">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>

        {/* Truck */}
        <div className="px-3 py-3.5 min-w-0">
          <p className="text-sm font-bold font-mono text-gray-900 dark:text-white truncate flex items-center gap-1.5">
            <TruckIcon className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 shrink-0" />{s.truckNumber}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">{s.truckType}</p>
          <p className="text-[11px] text-indigo-500 dark:text-indigo-400 mt-0.5 font-medium">
            {s.check_out_time ? "Parked for " : "Parked for "}{fmtDuration(s.check_in_time, s.check_out_time)}
          </p>
        </div>

        {/* Owner / Driver */}
        <div className="px-3 py-3.5 flex items-center gap-2.5 min-w-0">
          <Avatar name={s.ownerName} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.ownerName}</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate flex items-center gap-1 mt-0.5">
              {s.ownerMobile ? <><Phone className="w-2.5 h-2.5 shrink-0" />{s.ownerMobile}</> : <><User className="w-2.5 h-2.5 shrink-0" />{s.checkin_driver_name}</>}
            </p>
            <p className="text-[11px] text-gray-300 dark:text-slate-600 truncate flex items-center gap-1 mt-0.5">
              <Building2 className="w-2.5 h-2.5 shrink-0" />{s.ownerCompany ?? <span className="italic">No firm</span>}
            </p>
          </div>
        </div>

        {/* Location */}
        <div className="px-3 py-3.5 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-indigo-400" />{s.locationName}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate mt-0.5 pl-4.5">
            {s.divisionName}{s.slotCode !== "—" ? ` · Slot ${s.slotCode}` : ""}
          </p>
        </div>

        {/* Timeline */}
        <div className="px-3 py-3.5 min-w-0 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-gray-700 dark:text-slate-200">
            <LogIn className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="font-semibold">{fmtDate(s.check_in_time)}</span>
            <span className="text-gray-400 dark:text-slate-500">{fmtTime(s.check_in_time)}</span>
          </div>
          {s.check_out_time ? (
            <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
              <LogOut className="w-3 h-3 shrink-0" />
              <span className="font-semibold">{fmtDate(s.check_out_time)}</span>
              <span className="opacity-70">{fmtTime(s.check_out_time)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-gray-300 dark:text-slate-600 italic">
              <Clock className="w-3 h-3 shrink-0" />Still Parked
            </div>
          )}
        </div>

        {/* Status */}
        <div className="px-3 py-3.5 flex flex-col gap-1.5 items-start">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${meta.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {statusLabel(key, s)}
          </span>
          {s.entry_type?.toLowerCase() === "khata" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">KHATA</span>
          )}
        </div>

        {/* Actions */}
        <div className="px-3 py-3.5 flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {key === "parked" && (
            <Link href={`/dashboard/check-out?truck=${encodeURIComponent(s.truckNumber)}`}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition">
              <LogOut className="w-3 h-3" />Checkout
            </Link>
          )}
          {key === "overdue" && (
            <Link href={`/dashboard/check-out?truck=${encodeURIComponent(s.truckNumber)}`}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition">
              <ShieldX className="w-3 h-3" />Force out
            </Link>
          )}
          {(key === "checkedout" || key === "forced") && (
            <button onClick={onReceipt}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition">
              <Receipt className="w-3 h-3" />Receipt
            </button>
          )}
          {key === "verification" && (
            <Link href="/dashboard/verification"
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition">
              <ShieldAlert className="w-3 h-3" />Verify
            </Link>
          )}

          <div className="relative">
            <button ref={desktopBtnRef} onClick={() => openFrom(desktopBtnRef)}
              className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile card */}
      <div className="md:hidden flex flex-col gap-3 px-4 py-4 pl-5" onClick={onToggleExpand}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold font-mono text-gray-900 dark:text-white flex items-center gap-1.5">
            <TruckIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />{s.truckNumber}
          </p>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{statusLabel(key, s)}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Avatar name={s.ownerName} size="sm" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.ownerName}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">{s.checkin_driver_name} · driver</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
          <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />{s.locationName} · {s.divisionName}
        </div>
        <div className="flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
          <div className="text-xs text-gray-500 dark:text-slate-400 space-y-0.5">
            <div><span className="text-gray-400 dark:text-slate-500">In </span><span className="font-medium">{fmtDate(s.check_in_time)}</span></div>
            {s.check_out_time && <div><span className="text-gray-400 dark:text-slate-500">Out </span><span className="font-medium text-sky-600 dark:text-sky-400">{fmtDate(s.check_out_time)}</span></div>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {key === "parked" && <Link href={`/dashboard/check-out?truck=${encodeURIComponent(s.truckNumber)}`} className="flex items-center gap-1 bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition"><LogOut className="w-3 h-3" />Checkout</Link>}
            {key === "overdue" && <Link href={`/dashboard/check-out?truck=${encodeURIComponent(s.truckNumber)}`} className="flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition"><ShieldX className="w-3 h-3" />Force out</Link>}
            {(key === "checkedout" || key === "forced") && <button onClick={onReceipt} className="flex items-center gap-1 bg-slate-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition"><Receipt className="w-3 h-3" />Receipt</button>}
            {key === "verification" && <Link href="/dashboard/verification" className="flex items-center gap-1 bg-rose-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition"><ShieldAlert className="w-3 h-3" />Verify</Link>}

            <div className="relative">
              <button ref={mobileBtnRef} onClick={() => openFrom(mobileBtnRef)} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {menuOpen && typeof window !== "undefined" && createPortal(
        <AnimatePresence>
          <motion.div
            ref={panelRef}
            style={panelStyle}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="w-52 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden py-1.5"
          >
            {menuContent}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* Expansion panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ExpansionPanel s={s} statusKey={key} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MenuItem({ icon, label, onClick, href, disabled, danger }: {
  icon: React.ReactNode; label: string; onClick?: () => void; href?: string; disabled?: boolean; danger?: boolean;
}) {
  const cls = `w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold transition ${
    disabled
      ? "text-gray-300 dark:text-slate-700 cursor-not-allowed"
      : danger
      ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
      : "text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
  }`;
  if (href && !disabled) {
    return <Link href={href} className={cls}>{icon}{label}</Link>;
  }
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} className={cls}>{icon}{label}</button>;
}

// ── row expansion panel ─────────────────────────────────────────────────────────
function ExpansionPanel({ s, statusKey }: { s: Enriched; statusKey: StatusKey }) {
  const isReleased = s.status === "released";
  return (
    <div className="border-t border-gray-100 dark:border-slate-800 px-4 py-4 pl-5 grid grid-cols-1 lg:grid-cols-3 gap-4 bg-gray-50/50 dark:bg-slate-800/20">
      <div>
        <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><History className="w-3 h-3" />Timeline</p>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-200">
            <LogIn className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Checked in {fmtDateTime(s.check_in_time)}</span>
          </div>
          {s.check_out_time ? (
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Checked out {fmtDateTime(s.check_out_time)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 italic">
              <Clock className="w-3.5 h-3.5 shrink-0" />Still parked · {fmtDuration(s.check_in_time, null)} so far
            </div>
          )}
        </div>

        <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mt-3 mb-1.5">Verification</p>
        {s.driver_match === "match" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-1 rounded-lg"><ShieldCheck className="w-3 h-3" />Verified</span>
        ) : s.driver_match === "override" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 px-2 py-1 rounded-lg"><ShieldCheck className="w-3 h-3" />Override approved</span>
        ) : s.driver_match === "mismatch" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-2 py-1 rounded-lg"><ShieldAlert className="w-3 h-3" />Mismatch</span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-slate-500">Pending</span>
        )}
      </div>

      <div>
        <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><IndianRupee className="w-3 h-3" />Parking Charges</p>
        {isReleased ? (
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-gray-400 dark:text-slate-500">{s.days ?? "—"}d × ₹{s.rate_per_day}</span><span className="font-semibold text-gray-700 dark:text-slate-200">₹{s.subtotal?.toFixed(2) ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 dark:text-slate-500">GST {s.gst_percent}%</span><span className="font-semibold text-gray-700 dark:text-slate-200">₹{s.gst_amount?.toFixed(2) ?? "—"}</span></div>
            <div className="flex justify-between pt-1 border-t border-gray-100 dark:border-slate-800"><span className="font-bold text-gray-700 dark:text-slate-200">Total</span><span className="font-extrabold text-gray-900 dark:text-white">₹{s.total_amount?.toFixed(2) ?? "—"}</span></div>
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-2.5 h-2.5" />Paid</span>
          </div>
        ) : (
          <div className="text-xs text-gray-400 dark:text-slate-500">
            <p>₹{s.rate_per_day}/day · {statusKey === "overdue" ? "accruing" : "in progress"}</p>
            <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full"><Clock className="w-2.5 h-2.5" />Pending</span>
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><StickyNote className="w-3 h-3" />Documents &amp; Notes</p>
        <div className="space-y-1.5 text-xs text-gray-600 dark:text-slate-300">
          <p className="flex items-center gap-1.5"><FileText className="w-3 h-3 text-gray-300 dark:text-slate-600 shrink-0" />{s.checkin_id_proof_type ?? "No ID proof on file"}</p>
          <p className="flex items-center gap-1.5"><Hash className="w-3 h-3 text-gray-300 dark:text-slate-600 shrink-0" />{s.checkin_driver_licence ?? "No licence on file"}</p>
          {(s.checkin_remarks || s.checkout_remarks) ? (
            <p className="text-gray-500 dark:text-slate-400 italic pt-1">&ldquo;{s.checkout_remarks ?? s.checkin_remarks}&rdquo;</p>
          ) : (
            <p className="text-gray-300 dark:text-slate-600 italic pt-1">No notes</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── full details drawer ─────────────────────────────────────────────────────────
function DetailsDrawerBody({ s, approver, rules }: { s: Enriched; approver: UserData | null; rules: OverdueRule[] }) {
  const key = deriveStatusKey(s);
  const meta = STATUS_META[key];
  const isReleased = s.status === "released";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-lg font-bold font-mono text-gray-900 dark:text-white">{s.truckNumber}</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">{s.truckType}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{statusLabel(key, s)}
        </span>
      </div>

      <Link href={`/dashboard/trucks/session?id=${s.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
        <ExternalLink className="w-3 h-3" />Open full session page
      </Link>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">Truck &amp; Driver</p>
        <div className="grid grid-cols-2 gap-3">
          <DetailField label="Owner" value={s.ownerName} />
          <DetailField label="Company" value={s.ownerCompany} />
          <DetailField label="Owner Phone" value={s.ownerMobile} mono />
          <DetailField label="Driver" value={s.checkin_driver_name} />
          <DetailField label="Driver Mobile" value={s.checkin_driver_mobile} mono />
          <DetailField label="Licence" value={s.checkin_driver_licence} mono />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">Parking</p>
        <div className="grid grid-cols-2 gap-3">
          <DetailField label="Location" value={s.locationName} />
          <DetailField label="Division / Slot" value={`${s.divisionName} · ${s.slotCode}`} />
          <DetailField label="Entry type" value={s.entry_type?.toUpperCase()} />
          <DetailField label="Rate / day" value={`₹${s.rate_per_day}`} />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5" />Timeline &amp; Activity</p>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0"><LogIn className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" /></div>
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Checked in</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{fmtDateTime(s.check_in_time)} by {s.checkin_driver_name}</p>
            </div>
          </div>
          {s.driver_match && s.driver_match !== "pending" && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><ShieldCheck className="w-3.5 h-3.5 text-gray-500 dark:text-slate-300" /></div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Driver verification: {s.driver_match}</p>
                {s.override_by && <p className="text-xs text-gray-400 dark:text-slate-500">Approved by {approver?.name ?? approver?.full_name ?? approver?.username ?? approver?.email ?? "Admin"}</p>}
              </div>
            </div>
          )}
          {isReleased ? (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center shrink-0"><LogOut className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300" /></div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Checked out</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{fmtDateTime(s.check_out_time)} by {s.checkout_driver_name ?? "—"}</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 opacity-50">
              <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><Clock className="w-3.5 h-3.5 text-gray-400" /></div>
              <p className="text-xs text-gray-400 dark:text-slate-500 pt-1.5">Still parked · {fmtDuration(s.check_in_time, null)} so far{s.status === "overdue" ? ` (${topMatchedRule(s.check_in_time, rules)?.label ?? "overdue"})` : ""}</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" />Payment</p>
        {isReleased ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Subtotal</span><span className="font-semibold text-gray-800 dark:text-slate-200">₹{s.subtotal?.toFixed(2) ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">GST ({s.gst_percent}%)</span><span className="font-semibold text-gray-800 dark:text-slate-200">₹{s.gst_amount?.toFixed(2) ?? "—"}</span></div>
            <div className="flex justify-between border-t border-gray-100 dark:border-slate-800 pt-1.5"><span className="font-bold text-gray-700 dark:text-slate-200">Total</span><span className="font-extrabold text-gray-900 dark:text-white">₹{s.total_amount?.toFixed(2) ?? "—"}</span></div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-slate-500">Billing finalizes at checkout · ₹{s.rate_per_day}/day</p>
        )}
      </div>

      {(s.checkin_remarks || s.checkout_remarks) && (
        <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5" />Notes</p>
          {s.checkin_remarks && <p className="text-xs text-gray-600 dark:text-slate-300 mb-1">Check-in: {s.checkin_remarks}</p>}
          {s.checkout_remarks && <p className="text-xs text-gray-600 dark:text-slate-300">Check-out: {s.checkout_remarks}</p>}
        </div>
      )}
    </div>
  );
}
