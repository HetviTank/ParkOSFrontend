"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import type { SortingState, PaginationState, VisibilityState } from "@tanstack/react-table";
import { useReactTable, getCoreRowModel, createColumnHelper } from "@tanstack/react-table";
import {
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Search, X, Loader2, AlertCircle,
  BookOpen, Plus, RefreshCw, Download, Upload, Info, IndianRupee, Truck as TruckIcon,
  Pencil, Trash2, Eye, MoreVertical, Link2, CheckCircle2, PauseCircle, PlayCircle,
  Building2, Phone, Users, Wallet, Receipt, AlertTriangle, RotateCcw,
  PackageSearch, Columns3, History, User,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { Overlay } from "@/components/ui/Overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { EnumFilterSelect } from "@/components/ui/EnumFilterSelect";
import { LocationSelect } from "@/components/ui/LocationSelect";

import { handleUnauthorized, useLocationFilter } from "@/lib/auth";

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
interface Khata {
  id: string; owner_id: string; monthly_rate: number;
  billing_day: number; grace_days: number;
  total_amount: number; bill_updated_at: string | null;
  is_active: boolean; is_deleted: boolean;
  created_at: string | null; updated_at: string | null;
}
interface Owner { id: string; name: string; company: string | null; primary_mobile: string; gst_number: string | null }
interface KhataTruckLink { id: string; khata_id: string; truck_id: string }
interface TruckObj { id: string; truck_number: string; truck_type?: string }
interface KhataStats {
  total_accounts: number; active_accounts: number; linked_trucks: number;
  pending_bills: number; revenue_this_month: number; overdue_payments: number;
}
interface Enriched extends Khata {
  ownerName: string; ownerCompany: string | null; ownerMobile: string; ownerGst: string | null;
  khataTrucks: (KhataTruckLink & { truck_number?: string; truck_type?: string })[];
}
interface BillTruck { truck_id: string; truck_number: string; session_count: number; total_days: number; total_amount: number }
interface KhataBill { khata_id: string; period_start: string; billing_day: number; trucks: BillTruck[]; grand_total: number }
interface LocationObj { id: string; name: string; city?: string | null }

const TRUCK_TYPES = [
  { value: "heavy", label: "Heavy (20T+)" },
  { value: "medium", label: "Medium (10-20T)" },
  { value: "light", label: "Light (<10T)" },
  { value: "trailer", label: "Trailer" },
  { value: "tanker", label: "Tanker" },
];

// ── formatters ────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
function fmtRupee(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function fmtMobile(m: string): string {
  return m?.startsWith("+91") ? m : `+91 ${m}`;
}
function khataRef(globalIndex: number): string {
  return `KH-${String(globalIndex + 1).padStart(3, "0")}`;
}

// ── status / priority derivation (all from real fields: is_active, is_deleted, total_amount, billing_day, grace_days) ──
type StatusKey = "active" | "payment_due" | "suspended" | "closed";
type Priority = "green" | "orange" | "red";

function daysSinceLastBillingDay(today: Date, billingDay: number): number {
  let year = today.getFullYear(), month = today.getMonth(); // 0-indexed
  for (let i = 0; i < 3; i++) {
    const candidate = new Date(year, month, billingDay);
    if (candidate.getMonth() === month && candidate <= today) {
      return Math.floor((today.getTime() - candidate.getTime()) / 86_400_000);
    }
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return 0;
}
function isOverdue(k: Khata): boolean {
  if (!k.total_amount || k.total_amount <= 0) return false;
  return daysSinceLastBillingDay(new Date(), k.billing_day) > k.grace_days;
}
function deriveStatus(k: Khata): StatusKey {
  if (k.is_deleted) return "closed";
  if (!k.is_active) return "suspended";
  if (k.total_amount > 0) return "payment_due";
  return "active";
}
function priorityFor(status: StatusKey, overdue: boolean): Priority {
  if (status === "suspended") return "red";
  if (status === "payment_due") return overdue ? "red" : "orange";
  return "green";
}
const PRIORITY_BAR: Record<Priority, string> = {
  green: "bg-emerald-400 dark:bg-emerald-500",
  orange: "bg-amber-400 dark:bg-amber-500",
  red: "bg-red-500",
};
const STATUS_META: Record<StatusKey, { label: string; dot: string; chip: string }> = {
  active:       { label: "Active",       dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20" },
  payment_due:  { label: "Payment Due",  dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20" },
  suspended:    { label: "Suspended",    dot: "bg-red-500",     chip: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20" },
  closed:       { label: "Closed",       dot: "bg-gray-400",    chip: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" },
};

// Filter dropdown options — reuse the same dot colors as STATUS_META so the
// filter chip reads consistently with the rest of the page.
const STATUS_FILTER_OPTIONS = [
  { value: "active", label: STATUS_META.active.label, dot: STATUS_META.active.dot },
  { value: "suspended", label: STATUS_META.suspended.label, dot: STATUS_META.suspended.dot },
];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "highest_due", label: "Highest Due" },
  { value: "alphabetical", label: "Alphabetical" },
];

// ── full-payload PUT builder — KhataUpdate requires all 4 fields ───────────────
function buildUpdatePayload(k: Khata, overrides: Record<string, unknown>) {
  return { owner_id: k.owner_id, billing_day: k.billing_day, grace_days: k.grace_days, is_active: k.is_active, ...overrides };
}

// ── toasts ────────────────────────────────────────────────────────────────────
interface Toast { id: string; kind: "success" | "error"; message: string }
function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 12, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold max-w-sm ${t.kind === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
            {t.kind === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
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
function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value);
  return <>{format ? format(v) : Math.round(v)}</>;
}
function OccupancyRing({ percent, color }: { percent: number; color: string }) {
  const r = 15, c = 2 * Math.PI * r;
  const dash = (c * Math.min(Math.max(percent, 0), 100)) / 100;
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" className="-rotate-90 shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth={4} className="stroke-gray-100 dark:stroke-slate-800" />
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth={4} strokeLinecap="round" stroke={color} strokeDasharray={`${dash} ${c - dash}`} />
    </svg>
  );
}
type KPITrend = { kind: "sparkline"; data: number[]; color: string } | { kind: "ring"; percent: number; color: string };
function KPICard({ label, value, format, sub, subColor = "text-gray-400 dark:text-slate-500", icon, iconBg, delay = 0, trend }: {
  label: string; value: number; format?: (n: number) => string; sub?: string; subColor?: string;
  icon: React.ReactNode; iconBg: string; delay?: number; trend?: KPITrend;
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
            <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight tabular-nums truncate"><AnimatedNumber value={value} format={format} /></p>
            {sub && <p className={`text-xs font-medium mt-1.5 truncate ${subColor}`}>{sub}</p>}
          </div>
          {trend && (
            <div className="hidden sm:block shrink-0">
              {trend.kind === "sparkline" && <Sparkline data={trend.data} stroke={trend.color} width={56} height={28} />}
              {trend.kind === "ring" && <OccupancyRing percent={trend.percent} color={trend.color} />}
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ── small building blocks ──────────────────────────────────────────────────────
const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 transition";
const selectCls = "pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 transition appearance-none cursor-pointer";

function DetailField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm text-gray-800 dark:text-slate-200 font-medium ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
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
function MenuItem({ icon, label, onClick, disabled, danger }: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; danger?: boolean }) {
  const cls = `w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold transition text-left ${
    disabled ? "text-gray-300 dark:text-slate-700 cursor-not-allowed" : danger ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
  }`;
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} className={cls}>{icon}{label}</button>;
}
function TruckChip({ kt, onEdit, onUnlink, unlinkBusy }: {
  kt: KhataTruckLink & { truck_number?: string; truck_type?: string };
  onEdit: () => void; onUnlink: () => void; unlinkBusy: boolean;
}) {
  const typeLabel = kt.truck_type ? TRUCK_TYPES.find(t => t.value === kt.truck_type)?.label ?? kt.truck_type : undefined;
  return (
    <div title={typeLabel} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-bold px-2.5 py-1 rounded-lg font-mono">
      <TruckIcon className="w-3 h-3 shrink-0" />{kt.truck_number ?? kt.truck_id.slice(0, 8)}
      <button onClick={onEdit} className="ml-0.5 text-blue-400 hover:text-violet-600 dark:hover:text-violet-400 transition" title="Edit truck">
        <Pencil className="w-3 h-3" />
      </button>
      <button onClick={onUnlink} disabled={unlinkBusy} className="text-blue-400 hover:text-red-500 transition disabled:opacity-40" title="Remove from khata">
        {unlinkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
      </button>
    </div>
  );
}
function EmptyState({ icon, title, sub, ctaLabel, onCta }: { icon: React.ReactNode; title: string; sub: string; ctaLabel?: string; onCta?: () => void }) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-3">{icon}</div>
      <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{title}</p>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{sub}</p>
      {ctaLabel && onCta && (
        <button onClick={onCta} className="inline-flex items-center gap-2 mt-4 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm">
          <Plus className="w-4 h-4" />{ctaLabel}
        </button>
      )}
    </div>
  );
}
function RowSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-800 px-4 py-4 flex items-center gap-4">
      <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-40 rounded-full" />
        <Skeleton className="h-3 w-56 rounded-full" />
      </div>
      <Skeleton className="w-20 h-6 rounded-full hidden sm:block" />
      <Skeleton className="w-9 h-9 rounded-xl hidden md:block" />
    </div>
  );
}

const GRID_COLS = "24px 22px 78px minmax(190px,1.5fr) minmax(170px,1.2fr) minmax(110px,0.9fr) minmax(104px,0.9fr) minmax(90px,0.8fr) minmax(72px,0.7fr)";
type ColKey = "trucks" | "updated";
const OPTIONAL_COLS: { key: ColKey; label: string }[] = [
  { key: "trucks", label: "Linked Trucks" },
  { key: "updated", label: "Last Updated" },
];

// ── main page ─────────────────────────────────────────────────────────────────
export default function KhataMasterPage() {
  const { isAdmin, locationId, setLocationId } = useLocationFilter();
  const [locations, setLocations] = useState<LocationObj[]>([]);

  const [rows, setRows] = useState<Enriched[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listErr, setListErr] = useState("");

  const [stats, setStats] = useState<KhataStats | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "suspended">("");
  const [sortKey, setSortKey] = useState<"newest" | "oldest" | "highest_due" | "alphabetical">("newest");

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ trucks: true, updated: true });
  const [showColMenu, setShowColMenu] = useState(false);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const [showAddForm, setShowAddForm] = useState(false);
  const [formColumnMounted, setFormColumnMounted] = useState(false);

  // caches
  const ownerCache = useRef<Record<string, Owner>>({});
  const truckCache = useRef<Record<string, TruckObj>>({});

  // create form
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [fName, setFName] = useState("");
  const [fMobile, setFMobile] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fGst, setFGst] = useState("");
  const [fBillingDay, setFBillingDay] = useState("1");
  const [fErr, setFErr] = useState("");
  const [fBusy, setFBusy] = useState(false);
  const [fOk, setFOk] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // edit modal
  const [editRow, setEditRow] = useState<Enriched | null>(null);
  const [editBillingDay, setEditBillingDay] = useState("");
  const [editGraceDays, setEditGraceDays] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");

  // delete / bulk
  const [deleteRow, setDeleteRow] = useState<Enriched | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // view drawer
  const [detailRow, setDetailRow] = useState<Enriched | null>(null);
  const [detailBill, setDetailBill] = useState<KhataBill | "loading" | "error" | null>(null);

  // per-row link-truck state (only relevant to the currently expanded row)
  const [linkInput, setLinkInput] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState("");
  const [linkNewType, setLinkNewType] = useState<string | null>(null);
  const [unlinkBusyId, setUnlinkBusyId] = useState<string | null>(null);

  // edit-truck modal (change a linked truck's own number/type)
  const [editTruckTarget, setEditTruckTarget] = useState<{ row: Enriched; kt: KhataTruckLink & { truck_number?: string; truck_type?: string } } | null>(null);
  const [eTruckNumber, setETruckNumber] = useState("");
  const [eTruckType, setETruckType] = useState("heavy");
  const [eTruckBusy, setETruckBusy] = useState(false);
  const [eTruckErr, setETruckErr] = useState("");

  function pushToast(kind: Toast["kind"], message: string) {
    const id = `${kind}-${toastSeq.current++}`;
    setToasts(prev => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }

  useEffect(() => {
    apiFetch<{ count: number; list: LocationObj[] }>("/locations?limit=50")
      .then(r => setLocations(r.list ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPagination(p => ({ ...p, pageIndex: 0 })); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  const sortParams = useMemo((): { sort_by: string; order: string } => {
    switch (sortKey) {
      case "oldest": return { sort_by: "created_at", order: "asc" };
      case "highest_due": return { sort_by: "total_amount", order: "desc" };
      case "alphabetical": return { sort_by: "owner_name", order: "asc" };
      default: return { sort_by: "created_at", order: "desc" };
    }
  }, [sortKey]);

  const enrich = useCallback(async (khatas: Khata[]): Promise<Enriched[]> => {
    const missingOwners = [...new Set(khatas.map(k => k.owner_id).filter(id => !ownerCache.current[id]))];
    await Promise.allSettled(missingOwners.map(id => apiFetch<Owner>(`/owners/${id}`).then(o => { ownerCache.current[id] = o; }).catch(() => {})));

    const ktResults = await Promise.allSettled(
      khatas.map(k => apiFetch<{ count: number; list: KhataTruckLink[] }>(`/khata-trucks?khata_id=${k.id}&limit=50`))
    );
    const allTruckIds = ktResults.flatMap(r => r.status === "fulfilled" ? r.value.list.map(t => t.truck_id) : []);
    const missingTrucks = [...new Set(allTruckIds.filter(id => !truckCache.current[id]))];
    await Promise.allSettled(missingTrucks.map(id => apiFetch<TruckObj>(`/trucks/${id}`).then(t => { truckCache.current[id] = t; }).catch(() => {})));

    return khatas.map((k, i) => {
      const owner = ownerCache.current[k.owner_id];
      const kt = ktResults[i].status === "fulfilled" ? (ktResults[i] as PromiseFulfilledResult<{ count: number; list: KhataTruckLink[] }>).value.list : [];
      return {
        ...k,
        ownerName: owner?.name ?? "Unknown",
        ownerCompany: owner?.company ?? null,
        ownerMobile: owner?.primary_mobile ?? "",
        ownerGst: owner?.gst_number ?? null,
        khataTrucks: kt.map(t => ({ ...t, truck_number: truckCache.current[t.truck_id]?.truck_number, truck_type: truckCache.current[t.truck_id]?.truck_type })),
      };
    });
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true); setListErr("");
    try {
      const start = pagination.pageIndex * pagination.pageSize;
      let url = `/khatas?start=${start}&limit=${pagination.pageSize}&sort_by=${sortParams.sort_by}&order=${sortParams.order}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (statusFilter) url += `&is_active=${statusFilter === "active"}`;
      if (locationId) url += `&location_id=${locationId}`;
      const data = await apiFetch<{ count: number; list: Khata[] }>(url);
      setTotal(data.count ?? 0);
      const enriched = await enrich(data.list ?? []);
      setRows(enriched);
    } catch (e) { setListErr(e instanceof Error ? e.message : "Failed to load accounts."); }
    finally { setLoading(false); }
  }, [pagination, sortParams, search, statusFilter, locationId, enrich]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await apiFetch<KhataStats>("/khatas/stats");
      setStats(s);
      setWeeklyTrend(prev => [...prev.slice(1), s.total_accounts]);
    } catch { /* KPI cards just show 0 */ }
  }, []);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const refreshAll = useCallback(() => { fetchList(); fetchStats(); }, [fetchList, fetchStats]);

  function clearFilters() {
    setSearchInput(""); setSearch(""); setStatusFilter(""); setSortKey("newest"); setLocationId("");
    setPagination(p => ({ ...p, pageIndex: 0 }));
  }

  // react-table — drives header labels, sort affordances, and column visibility;
  // body rows are custom-rendered (not literal <tr>s) to support the card/priority-bar design.
  const columnHelper = useMemo(() => createColumnHelper<Enriched>(), []);
  const columns = useMemo(() => [
    columnHelper.display({ id: "select", header: "" }),
    columnHelper.display({ id: "expand", header: "" }),
    columnHelper.accessor("id", { id: "account", header: "Account" }),
    columnHelper.accessor("ownerName", { header: "Owner" }),
    columnHelper.display({ id: "trucks", header: "Linked Trucks" }),
    columnHelper.accessor("total_amount", { id: "outstanding", header: "Total Amount" }),
    columnHelper.display({ id: "status", header: "Status" }),
    columnHelper.accessor("updated_at", { id: "updated", header: "Last Updated" }),
    columnHelper.display({ id: "actions", header: "Actions" }),
  ], [columnHelper]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination, columnVisibility },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    getCoreRowModel: getCoreRowModel(),
  });
  const isColVisible = (key: ColKey) => columnVisibility[key] !== false;

  const totalPages = table.getPageCount();
  const filtersActive = !!(searchInput || statusFilter || sortKey !== "newest" || (isAdmin && locationId));
  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const allOnPageSelected = rows.length > 0 && rows.every(r => selected[r.id]);

  function toggleSelectAll() {
    setSelected(prev => {
      const next = { ...prev };
      if (allOnPageSelected) rows.forEach(r => { delete next[r.id]; });
      else rows.forEach(r => { next[r.id] = true; });
      return next;
    });
  }
  function toggleSelectRow(id: string) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // ── create account ──
  function openAddForm() {
    setFormColumnMounted(true);
    setShowAddForm(true);
    setTimeout(() => { nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); nameInputRef.current?.focus(); }, 250);
  }
  function toggleAddForm() { if (showAddForm) setShowAddForm(false); else openAddForm(); }
  function resetForm() { setFName(""); setFMobile(""); setFCompany(""); setFGst(""); setFBillingDay("1"); setFErr(""); }

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fName.trim()) { setFErr("Owner name is required."); return; }
    if (!fMobile.trim() || fMobile.trim().replace(/\D/g, "").length < 10) { setFErr("Valid mobile number is required."); return; }
    setFBusy(true); setFErr(""); setFOk(false);
    try {
      const owner = await apiFetch<Owner>("/owners", {
        method: "POST",
        body: JSON.stringify({ name: fName.trim(), primary_mobile: fMobile.trim().replace(/\D/g, ""), company: fCompany.trim() || null, gst_number: fGst.trim() || null }),
      });
      ownerCache.current[owner.id] = owner;
      const khata = await apiFetch<Khata>("/khatas", {
        method: "POST",
        body: JSON.stringify({ owner_id: owner.id, billing_day: Number(fBillingDay) || 1 }),
      });
      setFOk(true);
      pushToast("success", `Khata account created for ${owner.name}.`);
      setHighlightId(khata.id);
      setTimeout(() => setHighlightId(null), 2500);
      setTimeout(() => setFOk(false), 2500);
      resetForm();
      setPagination(p => ({ ...p, pageIndex: 0 }));
      fetchList(); fetchStats();
    } catch (e) { setFErr(e instanceof Error ? e.message : "Failed to create khata."); }
    finally { setFBusy(false); }
  }

  // ── edit ──
  function openEdit(row: Enriched) {
    setEditRow(row); setEditBillingDay(String(row.billing_day)); setEditGraceDays(String(row.grace_days)); setEditErr("");
    setMenuId(null);
  }
  async function handleSaveEdit() {
    if (!editRow) return;
    setEditBusy(true); setEditErr("");
    try {
      const payload = buildUpdatePayload(editRow, { billing_day: Number(editBillingDay) || 1, grace_days: Number(editGraceDays) || 0 });
      await apiFetch(`/khatas/${editRow.id}`, { method: "PUT", body: JSON.stringify(payload) });
      setRows(prev => prev.map(r => r.id === editRow.id ? { ...r, billing_day: Number(editBillingDay) || 1, grace_days: Number(editGraceDays) || 0 } : r));
      pushToast("success", "Changes saved.");
      setEditRow(null);
    } catch (e) { setEditErr(e instanceof Error ? e.message : "Failed to save."); }
    finally { setEditBusy(false); }
  }

  // ── toggle active/inactive ──
  async function toggleActive(row: Enriched) {
    setMenuId(null);
    const nextActive = !row.is_active;
    try {
      await apiFetch(`/khatas/${row.id}/${nextActive ? "reopen" : "close"}`, { method: "PATCH" });
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: nextActive } : r));
      pushToast("success", `${row.ownerName}'s account is now ${nextActive ? "active" : "suspended"}.`);
      fetchStats();
    } catch (e) { pushToast("error", e instanceof Error ? e.message : "Failed to update."); }
  }

  // ── delete ──
  function openDelete(row: Enriched) { setDeleteRow(row); setMenuId(null); }
  async function handleDelete() {
    if (!deleteRow) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/khatas/${deleteRow.id}`, { method: "DELETE" });
      setRows(prev => prev.filter(r => r.id !== deleteRow.id));
      setTotal(t => Math.max(0, t - 1));
      pushToast("success", `${deleteRow.ownerName}'s account deleted.`);
      setDeleteRow(null);
      fetchStats();
    } catch (e) { pushToast("error", e instanceof Error ? e.message : "Failed to delete."); }
    finally { setDeleteBusy(false); }
  }

  // ── bulk actions ──
  async function bulkDeactivate() {
    setBulkBusy(true);
    try {
      const targets = rows.filter(r => selected[r.id]);
      await Promise.allSettled(targets.map(r => apiFetch(`/khatas/${r.id}/close`, { method: "PATCH" })));
      setRows(prev => prev.map(r => selected[r.id] ? { ...r, is_active: false } : r));
      pushToast("success", `${targets.length} account(s) suspended.`);
      setSelected({}); fetchStats();
    } catch { pushToast("error", "Some updates failed."); }
    finally { setBulkBusy(false); }
  }
  async function bulkDelete() {
    setBulkBusy(true);
    try {
      const targets = rows.filter(r => selected[r.id]);
      await Promise.allSettled(targets.map(r => apiFetch(`/khatas/${r.id}`, { method: "DELETE" })));
      setRows(prev => prev.filter(r => !selected[r.id]));
      setTotal(t => Math.max(0, t - targets.length));
      pushToast("success", `${targets.length} account(s) deleted.`);
      setSelected({}); setBulkDeleteConfirm(false); fetchStats();
    } catch { pushToast("error", "Some deletions failed."); }
    finally { setBulkBusy(false); }
  }
  function exportSelectedOrPage() {
    const targets = selectedIds.length ? rows.filter(r => selected[r.id]) : rows;
    if (!targets.length) return;
    const headers = ["Account", "Owner", "Company", "Mobile", "Linked Trucks", "Billing Day", "Total Amount", "Status", "Last Updated"];
    const csvRows = targets.map((r, i) => {
      const status = deriveStatus(r);
      return [khataRef(pagination.pageIndex * pagination.pageSize + i), r.ownerName, r.ownerCompany ?? "—", r.ownerMobile, String(r.khataTrucks.length), String(r.billing_day), String(r.total_amount), STATUS_META[status].label, fmtDateTime(r.updated_at ?? r.created_at)];
    });
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv]));
    a.download = `parkos-khatas-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  // ── link / unlink truck (for the expanded row) ──
  async function resolveTruckId(num: string): Promise<string> {
    const trimmed = num.trim().toUpperCase();
    const existing = Object.values(truckCache.current).find(t => t.truck_number === trimmed);
    if (existing) return existing.id;
    const res = await apiFetch<{ count: number; list: TruckObj[] }>(`/trucks?search=${encodeURIComponent(trimmed)}&limit=10`);
    const match = res.list.find(t => t.truck_number.toUpperCase() === trimmed);
    if (!match) throw new Error(`Truck "${trimmed}" not found in system.`);
    truckCache.current[match.id] = match;
    return match.id;
  }
  async function handleLink(row: Enriched) {
    const num = linkInput.trim().toUpperCase();
    if (!num) return;
    setLinkBusy(true); setLinkErr("");
    try {
      let truck_id: string;
      try {
        truck_id = await resolveTruckId(num);
        setLinkNewType(null);
      } catch {
        if (!linkNewType) { setLinkNewType("heavy"); setLinkErr(`"${num}" is not registered yet. Pick a type below and click Link to register & link it.`); return; }
        const newTruck = await apiFetch<TruckObj>("/trucks", { method: "POST", body: JSON.stringify({ truck_number: num, truck_type: linkNewType, owner_id: row.owner_id }) });
        truckCache.current[newTruck.id] = newTruck;
        truck_id = newTruck.id;
        setLinkNewType(null);
      }
      const kt = await apiFetch<KhataTruckLink>("/khata-trucks", { method: "POST", body: JSON.stringify({ khata_id: row.id, truck_id }) });
      const newKt = { ...kt, truck_number: truckCache.current[truck_id]?.truck_number ?? num };
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, khataTrucks: [...r.khataTrucks, newKt] } : r));
      setLinkInput(""); setLinkErr("");
      fetchStats();
    } catch (e) { setLinkErr(e instanceof Error ? e.message : "Failed."); }
    finally { setLinkBusy(false); }
  }
  async function handleUnlink(row: Enriched, ktId: string) {
    setUnlinkBusyId(ktId);
    try {
      await apiFetch(`/khata-trucks/${ktId}`, { method: "DELETE" });
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, khataTrucks: r.khataTrucks.filter(t => t.id !== ktId) } : r));
      fetchStats();
    } catch { pushToast("error", "Failed to unlink truck."); }
    finally { setUnlinkBusyId(null); }
  }

  // ── edit a linked truck's own number/type ──
  function openEditTruck(row: Enriched, kt: KhataTruckLink & { truck_number?: string; truck_type?: string }) {
    setEditTruckTarget({ row, kt });
    setETruckNumber(kt.truck_number ?? "");
    setETruckType(kt.truck_type ?? "heavy");
    setETruckErr("");
  }
  async function handleSaveTruckEdit() {
    if (!editTruckTarget) return;
    if (!eTruckNumber.trim()) { setETruckErr("Truck number is required."); return; }
    setETruckBusy(true); setETruckErr("");
    try {
      const { row, kt } = editTruckTarget;
      const updated = await apiFetch<TruckObj>(`/trucks/${kt.truck_id}`, {
        method: "PUT",
        body: JSON.stringify({ truck_number: eTruckNumber.trim().toUpperCase(), truck_type: eTruckType, owner_id: row.owner_id }),
      });
      truckCache.current[kt.truck_id] = updated;
      setRows(prev => prev.map(r => r.id === row.id
        ? { ...r, khataTrucks: r.khataTrucks.map(t => t.id === kt.id ? { ...t, truck_number: updated.truck_number, truck_type: updated.truck_type } : t) }
        : r
      ));
      pushToast("success", `${updated.truck_number} updated.`);
      setEditTruckTarget(null);
    } catch (e) { setETruckErr(e instanceof Error ? e.message : "Failed to update truck."); }
    finally { setETruckBusy(false); }
  }

  // ── details drawer ──
  async function openDetails(row: Enriched) {
    setDetailRow(row); setDetailBill("loading"); setMenuId(null);
    setLinkInput(""); setLinkErr(""); setLinkNewType(null);
    try {
      const bill = await apiFetch<KhataBill>(`/khatas/${row.id}/bill`);
      setDetailBill(bill);
    } catch { setDetailBill("error"); }
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => {
      if (prev === id) return null;
      setLinkInput(""); setLinkErr(""); setLinkNewType(null);
      return id;
    });
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 space-y-5 w-full">

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500 mb-2">
            <Link href="/dashboard" className="hover:text-violet-600 dark:hover:text-violet-400 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-700 dark:text-slate-300 font-semibold">Khata Master</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Khata Master</h1>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Manage monthly account holders and linked vehicles.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <button onClick={refreshAll} disabled={loading}
            className="flex items-center gap-2 bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={exportSelectedOrPage} disabled={!rows.length}
            className="flex items-center gap-2 bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-40">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button disabled title="CSV import — coming soon"
            className="flex items-center gap-2 bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 text-gray-400 dark:text-slate-500 px-3.5 py-2.5 rounded-xl text-sm font-semibold shadow-sm opacity-50 cursor-not-allowed">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <button onClick={toggleAddForm}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm shadow-violet-200 dark:shadow-none">
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span className="hidden sm:inline">{showAddForm ? "Close" : "Add Khata Account"}</span>
          </button>
        </div>
      </motion.div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <KPICard delay={0} label="Total Accounts" value={stats?.total_accounts ?? 0} sub="all-time"
          icon={<Users className="w-4 h-4 text-violet-600 dark:text-violet-300" />} iconBg="bg-violet-100 dark:bg-violet-500/15"
          trend={{ kind: "sparkline", data: weeklyTrend, color: "#7C3AED" }} />
        <KPICard delay={0.06} label="Active Accounts" value={stats?.active_accounts ?? 0}
          sub={stats ? `${stats.total_accounts ? ((stats.active_accounts / stats.total_accounts) * 100).toFixed(0) : 0}% of total` : undefined}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />} iconBg="bg-emerald-100 dark:bg-emerald-500/15"
          trend={{ kind: "ring", percent: stats?.total_accounts ? (stats.active_accounts / stats.total_accounts) * 100 : 0, color: "#10B981" }} />
        <KPICard delay={0.12} label="Linked Trucks" value={stats?.linked_trucks ?? 0} sub="across all accounts"
          icon={<TruckIcon className="w-4 h-4 text-sky-600 dark:text-sky-300" />} iconBg="bg-sky-100 dark:bg-sky-500/15" />
        <KPICard delay={0.18} label="Pending Bills" value={stats?.pending_bills ?? 0} sub="have an outstanding balance"
          subColor={stats && stats.pending_bills > 0 ? "text-amber-500" : "text-gray-400 dark:text-slate-500"}
          icon={<Receipt className="w-4 h-4 text-amber-600 dark:text-amber-300" />} iconBg="bg-amber-100 dark:bg-amber-500/15" />
        <KPICard delay={0.24} label="Revenue This Month" value={stats?.revenue_this_month ?? 0} format={fmtRupee} sub="billed this cycle, active accounts"
          icon={<Wallet className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />} iconBg="bg-cyan-100 dark:bg-cyan-500/15" />
        <KPICard delay={0.3} label="Overdue Payments" value={stats?.overdue_payments ?? 0} sub={stats && stats.overdue_payments > 0 ? "past grace period" : "all clear"}
          subColor={stats && stats.overdue_payments > 0 ? "text-red-500" : "text-emerald-500"}
          icon={<AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-300" />} iconBg="bg-red-100 dark:bg-red-500/15" />
      </div>

      {/* ── 30/70 layout when the add form is open, full-width table otherwise ── */}
      <div className={`grid grid-cols-1 gap-5 items-start ${formColumnMounted ? "lg:grid-cols-10" : ""}`}>

        {/* ── Left: Create Account (30%) ── */}
        <AnimatePresence initial={false} onExitComplete={() => setFormColumnMounted(false)}>
          {showAddForm && (
            <motion.div key="add-form-column" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }} className="lg:col-span-3 overflow-hidden">
              <GlassCard className="overflow-hidden">
                <div className="flex items-center justify-between gap-2.5 px-5 py-4 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-violet-100 dark:bg-violet-500/15 rounded-xl flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-300" />
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Create Account</p>
                  </div>
                  <button onClick={() => setShowAddForm(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreate} className="px-5 py-4 space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Owner name <span className="text-red-400">*</span></label>
                    <input ref={nameInputRef} value={fName} onChange={e => { setFName(e.target.value); setFErr(""); }} placeholder="Full name" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Mobile <span className="text-red-400">*</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">+91</span>
                        <input value={fMobile} onChange={e => { setFMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setFErr(""); }} placeholder="98765 43210" type="tel" maxLength={10} className={inputCls + " pl-9"} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Billing day</label>
                      <input value={fBillingDay} onChange={e => setFBillingDay(e.target.value.replace(/\D/g, "").slice(0, 2))} type="number" min={1} max={31} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Company / Firm</label>
                    <input value={fCompany} onChange={e => setFCompany(e.target.value)} placeholder="Firm name" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">GST Number</label>
                    <input value={fGst} onChange={e => setFGst(e.target.value.toUpperCase())} placeholder="Optional" className={inputCls + " font-mono uppercase"} />
                  </div>

                  {fErr && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /><p className="text-sm text-red-700 dark:text-red-300">{fErr}</p>
                    </div>
                  )}
                  <AnimatePresence>
                    {fOk && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-3.5 py-2.5 overflow-hidden">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300 shrink-0" /><p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">Khata created successfully.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex gap-3">
                    <button type="button" onClick={resetForm} className="px-4 py-3 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold rounded-xl transition text-sm">Reset</button>
                    <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={fBusy}
                      className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl shadow-sm shadow-violet-200 dark:shadow-none transition text-sm min-h-11">
                      {fBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</> : <><Plus className="w-4 h-4" />Create Account</>}
                    </motion.button>
                  </div>

                  <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl px-4 py-3">
                    <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">A truck linked here is treated as a Khata vehicle automatically at check-in, with its owner auto-filled.</p>
                  </div>
                </form>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Right: Accounts table (70% while form open, full width otherwise) ── */}
        <div className={`space-y-4 ${formColumnMounted ? "lg:col-span-7" : ""}`}>

          {/* Toolbar */}
          <GlassCard className="p-3.5">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative w-full sm:flex-1 sm:min-w-48">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search owner, mobile, company, truck…"
                  className="w-full pl-10 pr-9 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-400 focus:bg-white dark:focus:bg-slate-800 transition" />
                {searchInput && <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"><X className="w-3.5 h-3.5" /></button>}
              </div>

              <LocationSelect
                className="w-full sm:w-auto"
                value={locationId}
                onChange={(v) => { setLocationId(v); setPagination(p => ({ ...p, pageIndex: 0 })); }}
                locations={locations}
                allowAll={isAdmin}
                locked={!isAdmin}
              />

              <EnumFilterSelect
                className="w-full sm:w-auto"
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v as typeof statusFilter); setPagination(p => ({ ...p, pageIndex: 0 })); }}
                options={STATUS_FILTER_OPTIONS}
                allLabel="All statuses"
              />

              <EnumFilterSelect
                className="w-full sm:w-auto"
                value={sortKey}
                onChange={(v) => { setSortKey(v as typeof sortKey); setPagination(p => ({ ...p, pageIndex: 0 })); }}
                options={SORT_OPTIONS}
                showDot={false}
              />

              <div className="flex items-center gap-2 w-full sm:w-auto sm:contents">
                <div className="relative flex-1 sm:flex-none">
                  <button onClick={() => setShowColMenu(v => !v)}
                    className="w-full sm:w-auto flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800/60 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
                    <Columns3 className="w-3.5 h-3.5" />Columns
                  </button>
                  <AnimatePresence>
                    {showColMenu && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl z-20 py-1.5">
                        {OPTIONAL_COLS.map(c => (
                          <label key={c.key} className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer">
                            <input type="checkbox" checked={isColVisible(c.key)} onChange={() => setColumnVisibility(v => ({ ...v, [c.key]: !isColVisible(c.key) }))} className="accent-violet-600" />
                            {c.label}
                          </label>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="relative shrink-0">
                  <select value={pagination.pageSize} onChange={e => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })} className={selectCls}>
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
                </div>

                {filtersActive && (
                  <button onClick={clearFilters} className="flex-1 sm:flex-none text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/20 hover:bg-red-100 px-3 py-2 rounded-xl flex items-center justify-center sm:justify-start gap-1.5 transition">
                    <RotateCcw className="w-3.5 h-3.5" />Reset
                  </button>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Bulk action bar */}
          <AnimatePresence>
            {selectedIds.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-2xl px-4 py-3">
                  <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">{selectedIds.length} selected</span>
                  <div className="flex-1" />
                  <button onClick={exportSelectedOrPage} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-slate-700 transition flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />Export selected
                  </button>
                  <button onClick={bulkDeactivate} disabled={bulkBusy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-slate-700 transition flex items-center gap-1.5 disabled:opacity-50">
                    <PauseCircle className="w-3.5 h-3.5" />Deactivate
                  </button>
                  <button onClick={() => setBulkDeleteConfirm(true)} disabled={bulkBusy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition flex items-center gap-1.5 disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </button>
                  <button onClick={() => setSelected({})} className="p-1.5 text-violet-400 hover:text-violet-700 dark:hover:text-violet-200 transition"><X className="w-4 h-4" /></button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Data grid */}
          <GlassCard className="overflow-hidden">
            <div className="md:overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
              <div className="md:min-w-[760px]">

                <div className="hidden md:grid sticky top-0 z-10 bg-gray-50/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800" style={{ gridTemplateColumns: GRID_COLS }}>
                  <div className="px-2 flex items-center">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} className="accent-violet-600" />
                  </div>
                  <div />
                  <div className="px-2 py-3"><span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Acct</span></div>
                  <div className="px-2 py-3"><span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Owner</span></div>
                  {isColVisible("trucks") && <div className="px-2 py-3"><span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Linked Trucks</span></div>}
                  <div className="px-2 py-3"><span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Total Amount</span></div>
                  <div className="px-2 py-3"><span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Status</span></div>
                  {isColVisible("updated") && <div className="px-2 py-3"><span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Updated</span></div>}
                  <div className="px-2 py-3"><span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Actions</span></div>
                </div>

                {listErr && (
                  <div className="flex items-center gap-2.5 px-5 py-4 bg-red-50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" /><p className="text-sm text-red-700 dark:text-red-300">{listErr}</p>
                  </div>
                )}

                <div className="p-2.5 space-y-2">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)
                  ) : rows.length === 0 ? (
                    <EmptyState
                      icon={filtersActive ? <PackageSearch className="w-8 h-8 text-gray-300 dark:text-slate-600" /> : <BookOpen className="w-8 h-8 text-gray-300 dark:text-slate-600" />}
                      title="No Khata accounts found." sub={filtersActive ? "Try clearing some filters" : "Create the first one to get started."}
                      ctaLabel={!filtersActive ? "Create First Account" : undefined} onCta={!filtersActive ? openAddForm : undefined} />
                  ) : (
                    <AnimatePresence initial={false}>
                      {rows.map((row, i) => (
                        <KhataRow
                          key={row.id} row={row} index={i} globalIndex={pagination.pageIndex * pagination.pageSize + i}
                          selected={!!selected[row.id]} onToggleSelect={() => toggleSelectRow(row.id)}
                          expanded={expandedId === row.id} onToggleExpand={() => toggleExpand(row.id)}
                          highlighted={highlightId === row.id}
                          colVisible={isColVisible}
                          menuOpen={menuId === row.id} onToggleMenu={() => setMenuId(prev => prev === row.id ? null : row.id)} onCloseMenu={() => setMenuId(null)}
                          onView={() => openDetails(row)} onEdit={() => openEdit(row)} onToggleActive={() => toggleActive(row)} onDelete={() => openDelete(row)}
                          linkInput={linkInput} setLinkInput={setLinkInput} linkBusy={linkBusy} linkErr={linkErr} linkNewType={linkNewType} setLinkNewType={setLinkNewType}
                          onLink={() => handleLink(row)} onUnlink={(ktId) => handleUnlink(row, ktId)} unlinkBusyId={unlinkBusyId} onEditTruck={openEditTruck}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            </div>

            {!loading && totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/40 dark:bg-slate-800/20">
                <p className="text-xs text-gray-400 dark:text-slate-500 order-2 sm:order-1">
                  Showing {pagination.pageIndex * pagination.pageSize + 1}–{Math.min((pagination.pageIndex + 1) * pagination.pageSize, total)} of <span className="font-semibold text-gray-600 dark:text-slate-300">{total.toLocaleString("en-IN")}</span> accounts
                </p>
                <div className="flex items-center gap-1 order-1 sm:order-2">
                  <PagBtn disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}>«</PagBtn>
                  <PagBtn disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft className="w-4 h-4" /></PagBtn>
                  {paginationWindow(pagination.pageIndex, totalPages).map((n, i) => n === "…" ? (
                    <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-300 dark:text-slate-600 text-sm">…</span>
                  ) : (
                    <button key={n} onClick={() => table.setPageIndex((n as number) - 1)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition ${pagination.pageIndex === (n as number) - 1 ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white border border-transparent hover:border-gray-200 dark:hover:border-slate-700"}`}>
                      {n}
                    </button>
                  ))}
                  <PagBtn disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight className="w-4 h-4" /></PagBtn>
                  <PagBtn disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(totalPages - 1)}>»</PagBtn>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* ── Edit modal ── */}
      <Overlay open={!!editRow} onClose={() => setEditRow(null)} variant="modal" title="Edit Khata" widthClass="max-w-md">
        {editRow && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400 dark:text-slate-500 -mt-2">{editRow.ownerName}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Billing day (1–31)</label>
                <input type="number" min={1} max={31} value={editBillingDay} onChange={e => setEditBillingDay(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Grace days</label>
                <input type="number" min={0} value={editGraceDays} onChange={e => setEditGraceDays(e.target.value)} className={inputCls} />
              </div>
            </div>
            {editErr && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" /><p className="text-sm text-red-700 dark:text-red-300">{editErr}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setEditRow(null)} className="flex-1 min-h-11 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold rounded-xl transition text-sm">Cancel</button>
              <button onClick={handleSaveEdit} disabled={editBusy} className="flex-1 min-h-11 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {editBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </Overlay>

      {/* ── Delete confirmation ── */}
      <Overlay open={!!deleteRow} onClose={() => setDeleteRow(null)} variant="modal" title="Delete account" widthClass="max-w-sm">
        {deleteRow && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3.5">
              <Trash2 className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">Delete <span className="font-bold">{deleteRow.ownerName}</span>&apos;s khata account? This cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteRow(null)} className="flex-1 min-h-11 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold rounded-xl transition text-sm">Cancel</button>
              <button onClick={handleDelete} disabled={deleteBusy} className="flex-1 min-h-11 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Delete
              </button>
            </div>
          </div>
        )}
      </Overlay>

      {/* ── Bulk delete confirmation ── */}
      <Overlay open={bulkDeleteConfirm} onClose={() => setBulkDeleteConfirm(false)} variant="modal" title="Delete accounts" widthClass="max-w-sm">
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3.5">
            <Trash2 className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">Delete <span className="font-bold">{selectedIds.length}</span> selected account(s)? This cannot be undone.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setBulkDeleteConfirm(false)} className="flex-1 min-h-11 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold rounded-xl transition text-sm">Cancel</button>
            <button onClick={bulkDelete} disabled={bulkBusy} className="flex-1 min-h-11 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Delete all
            </button>
          </div>
        </div>
      </Overlay>

      {/* ── Edit truck modal ── */}
      <Overlay open={!!editTruckTarget} onClose={() => setEditTruckTarget(null)} variant="modal" title="Edit Truck" widthClass="max-w-sm">
        {editTruckTarget && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400 dark:text-slate-500 -mt-2">Linked to {editTruckTarget.row.ownerName}&apos;s khata</p>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Truck number</label>
              <input value={eTruckNumber} onChange={e => setETruckNumber(e.target.value.toUpperCase())} maxLength={20} className={inputCls + " font-mono uppercase tracking-wider"} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Truck type</label>
              <div className="flex flex-wrap gap-1.5">
                {TRUCK_TYPES.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setETruckType(opt.value)}
                    className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition ${eTruckType === opt.value ? "bg-violet-600 text-white border-violet-600" : "bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-violet-300"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {eTruckErr && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" /><p className="text-sm text-red-700 dark:text-red-300">{eTruckErr}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setEditTruckTarget(null)} className="flex-1 min-h-11 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold rounded-xl transition text-sm">Cancel</button>
              <button onClick={handleSaveTruckEdit} disabled={eTruckBusy} className="flex-1 min-h-11 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {eTruckBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </Overlay>

      {/* ── View drawer ── */}
      <Overlay open={!!detailRow} onClose={() => setDetailRow(null)} variant="drawer" title="Account Profile" widthClass="max-w-lg">
        {detailRow && (
          <DetailsDrawerBody
            row={detailRow} bill={detailBill}
            linkInput={linkInput} setLinkInput={setLinkInput} linkBusy={linkBusy} linkErr={linkErr}
            linkNewType={linkNewType} setLinkNewType={setLinkNewType}
            onLink={() => handleLink(detailRow)} onUnlink={(ktId) => handleUnlink(detailRow, ktId)} unlinkBusyId={unlinkBusyId}
            onEditTruck={openEditTruck}
          />
        )}
      </Overlay>

      <ToastStack toasts={toasts} />
    </div>
  );
}

function paginationWindow(pageIndex: number, totalPages: number): (number | "…")[] {
  const current = pageIndex + 1;
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  if (current > 3) items.push("…");
  for (let n = Math.max(2, current - 1); n <= Math.min(totalPages - 1, current + 1); n++) items.push(n);
  if (current < totalPages - 2) items.push("…");
  items.push(totalPages);
  return items;
}

// ── row ───────────────────────────────────────────────────────────────────────
interface RowProps {
  row: Enriched; index: number; globalIndex: number;
  selected: boolean; onToggleSelect: () => void;
  expanded: boolean; onToggleExpand: () => void; highlighted: boolean;
  colVisible: (key: ColKey) => boolean;
  menuOpen: boolean; onToggleMenu: () => void; onCloseMenu: () => void;
  onView: () => void; onEdit: () => void; onToggleActive: () => void; onDelete: () => void;
  linkInput: string; setLinkInput: (v: string) => void; linkBusy: boolean; linkErr: string;
  linkNewType: string | null; setLinkNewType: (v: string | null) => void;
  onLink: () => void; onUnlink: (ktId: string) => void; unlinkBusyId: string | null;
  onEditTruck: (row: Enriched, kt: KhataTruckLink & { truck_number?: string; truck_type?: string }) => void;
}
function KhataRow({
  row, index, globalIndex, selected, onToggleSelect, expanded, onToggleExpand, highlighted, colVisible,
  menuOpen, onToggleMenu, onCloseMenu, onView, onEdit, onToggleActive, onDelete,
  linkInput, setLinkInput, linkBusy, linkErr, linkNewType, setLinkNewType, onLink, onUnlink, unlinkBusyId, onEditTruck,
}: RowProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const mobileMenuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuDirection, setMenuDirection] = useState<"up" | "down">("down");
  const status = deriveStatus(row);
  const overdue = isOverdue(row);
  const priority = priorityFor(status, overdue);
  const meta = STATUS_META[status];

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const insideDesktop = menuRef.current?.contains(target);
      const insideMobile = mobileMenuRef.current?.contains(target);
      if (!insideDesktop && !insideMobile) onCloseMenu();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen, onCloseMenu]);

  // Decide up/down before opening — whichever side actually has room, so the
  // menu never renders off the top (first rows) or bottom (last rows) of the screen.
  const ESTIMATED_MENU_HEIGHT = 280;
  function handleToggleMenu(btnRef: React.RefObject<HTMLButtonElement | null>) {
    if (!menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setMenuDirection(spaceBelow >= ESTIMATED_MENU_HEIGHT || spaceBelow >= spaceAbove ? "down" : "up");
    }
    onToggleMenu();
  }

  const menuContent = (
    <>
      <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} label="Edit" onClick={onEdit} />
      <MenuItem icon={<Link2 className="w-3.5 h-3.5" />} label="Manage Trucks" onClick={onToggleExpand} />
      <MenuItem icon={<Receipt className="w-3.5 h-3.5" />} label="Payment History" onClick={onView} />
      <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
      <MenuItem icon={row.is_active ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />} label={row.is_active ? "Deactivate" : "Reactivate"} onClick={onToggleActive} disabled={row.is_deleted} />
      <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" onClick={onDelete} danger />
    </>
  );

  return (
    <motion.div
      layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, backgroundColor: highlighted ? "rgba(124,58,237,0.08)" : "rgba(0,0,0,0)" }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 10) * 0.015 }} whileHover={{ y: -1 }} style={{ zIndex: menuOpen ? 30 : undefined }}
      className={`relative rounded-2xl border overflow-visible transition-shadow hover:shadow-md ${highlighted ? "border-violet-200 dark:border-violet-500/30" : "border-gray-100 dark:border-slate-800"} ${index % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/20" : "bg-white/80 dark:bg-slate-900/50"}`}
    >
      <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${PRIORITY_BAR[priority]}`} />

      {/* Desktop row */}
      <div className="hidden md:grid items-center" style={{ gridTemplateColumns: GRID_COLS }}>
        <div className="px-2 flex items-center" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="accent-violet-600" />
        </div>
        <button onClick={onToggleExpand} className="flex items-center justify-center text-gray-300 dark:text-slate-600">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <div className="px-2 py-3.5 min-w-0 cursor-pointer" onClick={onToggleExpand}>
          <span className="text-[11px] font-bold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full font-mono">{khataRef(globalIndex)}</span>
        </div>

        <div className="px-2 py-3.5 flex items-center gap-2.5 min-w-0 cursor-pointer" onClick={onToggleExpand}>
          <Avatar name={row.ownerName} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{row.ownerName}</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate flex items-center gap-1 mt-0.5">
              <Phone className="w-2.5 h-2.5 shrink-0" />{fmtMobile(row.ownerMobile)}
            </p>
            <p className="text-[11px] text-gray-300 dark:text-slate-600 truncate flex items-center gap-1 mt-0.5">
              <Building2 className="w-2.5 h-2.5 shrink-0" />{row.ownerCompany ?? <span className="italic">No firm</span>}
            </p>
          </div>
        </div>

        {colVisible("trucks") && (
          <div className="px-2 py-3.5 min-w-0">
            {row.khataTrucks.length === 0 ? (
              <span className="text-xs text-gray-300 dark:text-slate-600 italic">None linked</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {row.khataTrucks.slice(0, 3).map(kt => (
                  <span key={kt.id} title={kt.truck_type ? TRUCK_TYPES.find(t => t.value === kt.truck_type)?.label ?? kt.truck_type : undefined}
                    className="text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded cursor-help">
                    {kt.truck_number ?? kt.truck_id.slice(0, 6)}
                  </span>
                ))}
                {row.khataTrucks.length > 3 && <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">+{row.khataTrucks.length - 3}</span>}
              </div>
            )}
          </div>
        )}

        <div className="px-2 py-3.5 min-w-0">
          <p className={`text-sm font-bold ${row.total_amount > 0 ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-slate-500"}`}>{fmtRupee(row.total_amount)}</p>
          {overdue && <p className="text-[10px] font-semibold text-red-500">overdue</p>}
        </div>

        <div className="px-2 py-3.5">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${meta.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
          </span>
        </div>

        {colVisible("updated") && (
          <div className="px-2 py-3.5 min-w-0">
            <p className="text-[11px] text-gray-400 dark:text-slate-500">{relativeTime(row.updated_at ?? row.created_at)}</p>
          </div>
        )}

        <div className="px-2 py-3.5 flex items-center gap-1">
          <button onClick={onView} className="p-2 text-gray-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition"><Eye className="w-3.5 h-3.5" /></button>
          <div className="relative" ref={menuRef}>
            <button ref={menuBtnRef} onClick={() => handleToggleMenu(menuBtnRef)} className="p-2 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"><MoreVertical className="w-4 h-4" /></button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.12 }}
                  className={`absolute right-0 w-48 max-h-[60vh] bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl z-20 py-1.5 overflow-y-auto ${menuDirection === "down" ? "top-full mt-1" : "bottom-full mb-1"}`}>
                  {menuContent}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile card — tap anywhere except the controls below to expand */}
      <div className="md:hidden flex flex-col gap-3 px-4 py-4 pl-5" onClick={onToggleExpand}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="accent-violet-600" />
            <span className="text-[11px] font-bold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-mono">{khataRef(globalIndex)}</span>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Avatar name={row.ownerName} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{row.ownerName}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{row.ownerCompany ?? "No firm"} · {fmtMobile(row.ownerMobile)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-gray-500 dark:text-slate-400">{row.khataTrucks.length} truck{row.khataTrucks.length !== 1 ? "s" : ""} linked</span>
          <span className={`font-bold ${row.total_amount > 0 ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-slate-500"}`}>{fmtRupee(row.total_amount)}{overdue && <span className="text-red-500 font-semibold"> · overdue</span>}</span>
        </div>
        <div className="flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
          <p className="text-xs text-gray-400 dark:text-slate-500">Updated {relativeTime(row.updated_at ?? row.created_at)}</p>
          <div className="flex items-center gap-1">
            <button onClick={onView} className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition"><Eye className="w-4 h-4" /></button>
            <div className="relative" ref={mobileMenuRef}>
              <button ref={mobileMenuBtnRef} onClick={() => handleToggleMenu(mobileMenuBtnRef)} className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"><MoreVertical className="w-4 h-4" /></button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.12 }}
                    className={`absolute right-0 w-48 max-h-[60vh] bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl z-20 py-1.5 overflow-y-auto ${menuDirection === "down" ? "top-full mt-1" : "bottom-full mb-1"}`}>
                    {menuContent}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Expansion panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeOut" }} className="overflow-hidden">
            <div className="relative border-t border-gray-100 dark:border-slate-800 px-4 py-4 pl-5 grid grid-cols-1 lg:grid-cols-3 gap-4 bg-gray-50/50 dark:bg-slate-800/20">
              <button onClick={onToggleExpand} title="Close"
                className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition z-10">
                <X className="w-4 h-4" />
              </button>
              <div>
                <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Billing Information</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-400 dark:text-slate-500">Billing day</span><span className="font-semibold text-gray-700 dark:text-slate-200">Day {row.billing_day}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400 dark:text-slate-500">Grace days</span><span className="font-semibold text-gray-700 dark:text-slate-200">{row.grace_days} days</span></div>
                  <div className="flex justify-between"><span className="text-gray-400 dark:text-slate-500">Total amount</span><span className="font-bold text-gray-900 dark:text-white">{fmtRupee(row.total_amount)}</span></div>
                  {row.ownerGst && <div className="flex justify-between"><span className="text-gray-400 dark:text-slate-500">GST</span><span className="font-mono font-semibold text-gray-700 dark:text-slate-200">{row.ownerGst}</span></div>}
                </div>
              </div>

              <div className="lg:col-span-2">
                <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><TruckIcon className="w-3 h-3" />Linked Trucks ({row.khataTrucks.length})</p>
                {row.khataTrucks.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {row.khataTrucks.map(kt => (
                      <TruckChip key={kt.id} kt={kt} onEdit={() => onEditTruck(row, kt)} onUnlink={() => onUnlink(kt.id)} unlinkBusy={unlinkBusyId === kt.id} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-slate-500 italic mb-3">No trucks linked yet — link one below</p>
                )}
                <div className="flex gap-2">
                  <input value={linkInput} onChange={e => setLinkInput(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onLink(); } }}
                    placeholder="+ Link Truck — truck number…"
                    className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-slate-200 transition font-mono uppercase" />
                  <button onClick={onLink} disabled={!linkInput.trim() || linkBusy}
                    className="flex items-center gap-1 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-xs font-bold rounded-lg transition whitespace-nowrap">
                    {linkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}Link
                  </button>
                </div>
                {linkNewType !== null && (
                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3 space-y-2 mt-2">
                    <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{linkErr}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TRUCK_TYPES.map(opt => (
                        <button key={opt.value} type="button" onClick={() => setLinkNewType(opt.value)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${linkNewType === opt.value ? "bg-violet-600 text-white border-violet-600" : "bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-violet-300"}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <button onClick={onLink} disabled={linkBusy} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-xs font-bold rounded-lg transition">
                      {linkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}Register &amp; link
                    </button>
                  </div>
                )}
                {linkErr && linkNewType === null && <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mt-1.5"><AlertCircle className="w-3 h-3" />{linkErr}</p>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── details drawer body ──────────────────────────────────────────────────────
interface DetailsDrawerProps {
  row: Enriched; bill: KhataBill | "loading" | "error" | null;
  linkInput: string; setLinkInput: (v: string) => void; linkBusy: boolean; linkErr: string;
  linkNewType: string | null; setLinkNewType: (v: string | null) => void;
  onLink: () => void; onUnlink: (ktId: string) => void; unlinkBusyId: string | null;
  onEditTruck: (row: Enriched, kt: KhataTruckLink & { truck_number?: string; truck_type?: string }) => void;
}
function DetailsDrawerBody({
  row, bill, linkInput, setLinkInput, linkBusy, linkErr, linkNewType, setLinkNewType, onLink, onUnlink, unlinkBusyId, onEditTruck,
}: DetailsDrawerProps) {
  const status = deriveStatus(row);
  const overdue = isOverdue(row);
  const meta = STATUS_META[status];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Avatar name={row.ownerName} size="md" />
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{row.ownerName}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">{row.ownerCompany ?? "No firm"}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
        </span>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">Contact Details</p>
        <div className="grid grid-cols-2 gap-3">
          <DetailField label="Mobile" value={fmtMobile(row.ownerMobile)} mono />
          <DetailField label="Company" value={row.ownerCompany} />
          <DetailField label="GST Number" value={row.ownerGst} mono />
          <DetailField label="Account created" value={fmtDate(row.created_at)} />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5" />Billing Summary</p>
        <div className="grid grid-cols-2 gap-3">
          <DetailField label="Billing day" value={`Day ${row.billing_day}`} />
          <DetailField label="Grace period" value={`${row.grace_days} days`} />
          <DetailField label="Total Amount" value={<span className={row.total_amount > 0 ? "text-red-600 dark:text-red-400 font-bold" : ""}>{fmtRupee(row.total_amount)}</span>} />
          <DetailField label="Payment status" value={overdue ? <span className="text-red-600 dark:text-red-400 font-bold">Overdue</span> : row.total_amount > 0 ? "Within grace period" : "Settled"} />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" />Current Invoice</p>
        {bill === "loading" && <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</div>}
        {bill === "error" && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Failed to load billing data.</p>}
        {bill && typeof bill === "object" && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Since {fmtDate(bill.period_start)}</p>
            {bill.trucks.length === 0 && <p className="text-xs text-gray-400 dark:text-slate-500 italic">No sessions in this billing period.</p>}
            {bill.trucks.map(t => (
              <div key={t.truck_number} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono font-bold text-gray-800 dark:text-slate-200">{t.truck_number}</span>
                <span className="text-gray-400 dark:text-slate-500">{t.session_count} session{t.session_count !== 1 ? "s" : ""} · {t.total_days}d</span>
                <span className="font-semibold text-gray-700 dark:text-slate-200">{fmtRupee(t.total_amount)}</span>
              </div>
            ))}
            {bill.trucks.length > 0 && (
              <div className="border-t border-gray-100 dark:border-slate-800 pt-2 flex justify-between">
                <span className="text-sm font-bold text-gray-700 dark:text-slate-200">Total payable</span>
                <span className="text-lg font-extrabold text-gray-900 dark:text-white">{fmtRupee(bill.grand_total)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><TruckIcon className="w-3.5 h-3.5" />Linked Trucks ({row.khataTrucks.length})</p>
        {row.khataTrucks.length ? (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {row.khataTrucks.map(kt => (
              <TruckChip key={kt.id} kt={kt} onEdit={() => onEditTruck(row, kt)} onUnlink={() => onUnlink(kt.id)} unlinkBusy={unlinkBusyId === kt.id} />
            ))}
          </div>
        ) : <p className="text-sm text-gray-400 dark:text-slate-500 mb-3">No trucks linked yet — link one below.</p>}

        <div className="flex gap-2">
          <input value={linkInput} onChange={e => setLinkInput(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onLink(); } }}
            placeholder="+ Link Truck — truck number…"
            className="flex-1 px-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-slate-200 transition font-mono uppercase" />
          <button onClick={onLink} disabled={!linkInput.trim() || linkBusy}
            className="flex items-center gap-1 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-xs font-bold rounded-lg transition whitespace-nowrap">
            {linkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}Link
          </button>
        </div>
        {linkNewType !== null && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3 space-y-2 mt-2">
            <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{linkErr}</p>
            <div className="flex flex-wrap gap-1.5">
              {TRUCK_TYPES.map(opt => (
                <button key={opt.value} type="button" onClick={() => setLinkNewType(opt.value)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${linkNewType === opt.value ? "bg-violet-600 text-white border-violet-600" : "bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-violet-300"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={onLink} disabled={linkBusy} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-xs font-bold rounded-lg transition">
              {linkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}Register &amp; link
            </button>
          </div>
        )}
        {linkErr && linkNewType === null && <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mt-1.5"><AlertCircle className="w-3 h-3" />{linkErr}</p>}
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5" />Timeline</p>
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0"><BookOpen className="w-3.5 h-3.5 text-violet-600 dark:text-violet-300" /></div>
          <div><p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Account created</p><p className="text-xs text-gray-400 dark:text-slate-500">{fmtDateTime(row.created_at)}</p></div>
        </div>
        {row.updated_at && row.updated_at !== row.created_at && (
          <div className="flex gap-3 mt-3">
            <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><User className="w-3.5 h-3.5 text-gray-500 dark:text-slate-300" /></div>
            <div><p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Last updated</p><p className="text-xs text-gray-400 dark:text-slate-500">{fmtDateTime(row.updated_at)}</p></div>
          </div>
        )}
      </div>
    </div>
  );
}
