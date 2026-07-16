"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Search, X, Loader2, AlertCircle,
  ShieldX, ShieldCheck, ShieldAlert, ShieldOff, RefreshCw, Download, Plus, Info,
  Pencil, Trash2, Eye, MoreVertical, History, Building2, Phone,
  CheckCircle2, UserPlus, PauseCircle, PlayCircle, Clock, SlidersHorizontal,
  RotateCcw, PackageSearch, User,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Overlay } from "@/components/ui/Overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { EnumFilterSelect } from "@/components/ui/EnumFilterSelect";

import { handleUnauthorized } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const PAGE_SIZE = 10;
const RECENT_CAP = 100;

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
interface Blacklist {
  id: string; truck_number: string; truck_id: string | null;
  reason: string; added_by: string | null; is_active: boolean;
  created_at: string | null; updated_at: string | null;
}
interface AdminUser { id: string; name: string; full_name?: string }
interface TruckData { id: string; truck_number: string; truck_type: string; owner_id: string | null }
interface OwnerData { id: string; name: string; company: string | null; primary_mobile: string }
interface Enriched extends Blacklist {
  truckType: string | null;
  ownerName: string | null; ownerCompany: string | null; ownerMobile: string | null;
  addedByName: string;
}

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
function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function last7DaysBuckets(items: Blacklist[]): number[] {
  const buckets = Array.from({ length: 7 }, () => 0);
  const now = new Date();
  for (const it of items) {
    if (!it.created_at) continue;
    const d = new Date(it.created_at);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diffDays >= 0 && diffDays < 7) buckets[6 - diffDays] += 1;
  }
  return buckets;
}

// ── full-payload PUT builder — BlacklistUpdate requires all 4 fields ───────────
function buildUpdatePayload(b: Enriched, overrides: Record<string, unknown>) {
  return {
    truck_number: b.truck_number,
    truck_id: b.truck_id,
    reason: b.reason,
    is_active: b.is_active,
    ...overrides,
  };
}

// ── toasts ────────────────────────────────────────────────────────────────────
interface Toast { id: string; kind: "success" | "error"; message: string }
function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold max-w-sm ${
              t.kind === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
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
function AnimatedNumber({ value }: { value: number }) {
  const v = useCountUp(value);
  return <>{Math.round(v)}</>;
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
function KPICard({ label, value, sub, subColor = "text-gray-400 dark:text-slate-500", icon, iconBg, delay = 0, trend }: {
  label: string; value: number; sub?: string; subColor?: string;
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
            <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight tabular-nums truncate"><AnimatedNumber value={value} /></p>
            {sub && <p className={`text-xs font-medium mt-1.5 truncate ${subColor}`}>{sub}</p>}
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
const inputCls = "w-full px-3.5 py-3 text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 transition";

// Reuses the same dot colors as the row status badge (statusMeta below) so the
// filter chip reads consistently with the rest of the page.
const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "Active", dot: "bg-red-500" },
  { value: "inactive", label: "Inactive", dot: "bg-gray-400" },
];

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
function MenuItem({ icon, label, onClick, disabled, danger }: {
  icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; danger?: boolean;
}) {
  const cls = `w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold transition text-left ${
    disabled
      ? "text-gray-300 dark:text-slate-700 cursor-not-allowed"
      : danger
      ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
      : "text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
  }`;
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} className={cls}>{icon}{label}</button>;
}
function EmptyState({ icon, title, sub, ctaLabel, onCta }: {
  icon: React.ReactNode; title: string; sub: string; ctaLabel?: string; onCta?: () => void;
}) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-3">{icon}</div>
      <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{title}</p>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{sub}</p>
      {ctaLabel && onCta && (
        <button onClick={onCta} className="inline-flex items-center gap-2 mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm">
          <Plus className="w-4 h-4" />{ctaLabel}
        </button>
      )}
    </div>
  );
}
function RowSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-800 px-4 py-4 flex items-center gap-4">
      <Skeleton className="w-28 h-8 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-40 rounded-full" />
        <Skeleton className="h-3 w-56 rounded-full" />
      </div>
      <Skeleton className="w-20 h-6 rounded-full hidden sm:block" />
      <Skeleton className="w-9 h-9 rounded-xl hidden md:block" />
    </div>
  );
}

const GRID_COLS = "22px minmax(148px,1fr) minmax(125px,1.1fr) minmax(120px,1.4fr) minmax(78px,0.8fr) minmax(100px,0.9fr) minmax(90px,0.8fr) minmax(72px,0.8fr)";
const COL_LABELS = ["", "Truck", "Owner", "Reason", "Added By", "Added On", "Status", "Actions"];

// ── main page ─────────────────────────────────────────────────────────────────
export default function BlacklistPage() {
  const [list, setList] = useState<Enriched[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [kpi, setKpi] = useState({ total: 0, active: 0, addedToday: 0, weekly: [0, 0, 0, 0, 0, 0, 0] });
  const [removedTodaySession, setRemovedTodaySession] = useState(0);
  const [recentActivity, setRecentActivity] = useState<Blacklist[]>([]);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [detailItem, setDetailItem] = useState<Enriched | null>(null);
  const [editItem, setEditItem] = useState<Enriched | null>(null);
  const [removeItem, setRemoveItem] = useState<Enriched | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  // edit form
  const [eTruck, setETruck] = useState("");
  const [eReason, setEReason] = useState("");
  const [eBusy, setEBusy] = useState(false);
  const [eErr, setEErr] = useState("");

  // remove
  const [removeBusy, setRemoveBusy] = useState(false);

  // add form
  const truckInputRef = useRef<HTMLInputElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formColumnMounted, setFormColumnMounted] = useState(false);
  const [fTruck, setFTruck] = useState("");
  const [fTruckId, setFTruckId] = useState<string | null>(null);
  const [fReason, setFReason] = useState("");
  const [fError, setFError] = useState("");
  const [fLoading, setFLoading] = useState(false);
  const [fSuccess, setFSuccess] = useState(false);
  const [suggestions, setSuggestions] = useState<TruckData[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // caches
  const tCache = useRef<Record<string, TruckData>>({});
  const oCache = useRef<Record<string, OwnerData>>({});
  const aCache = useRef<Record<string, string>>({});

  const toastSeq = useRef(0);
  function pushToast(kind: Toast["kind"], message: string) {
    const id = `${kind}-${toastSeq.current++}`;
    setToasts(prev => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }

  const resolveAdminName = useCallback(async (id: string | null): Promise<string> => {
    if (!id) return "System";
    if (aCache.current[id]) return aCache.current[id];
    try {
      const u = await apiFetch<AdminUser>(`/admin-users/${id}`);
      const name = u.full_name || u.name || "Admin";
      aCache.current[id] = name;
      return name;
    } catch { return "Admin"; }
  }, []);

  const resolveTruck = useCallback(async (b: Blacklist): Promise<TruckData | null> => {
    if (b.truck_id) {
      if (tCache.current[b.truck_id]) return tCache.current[b.truck_id];
      const t = await apiFetch<TruckData>(`/trucks/${b.truck_id}`).catch(() => null);
      if (t) tCache.current[b.truck_id] = t;
      return t;
    }
    const key = `num:${b.truck_number.toUpperCase()}`;
    if (tCache.current[key]) return tCache.current[key];
    const res = await apiFetch<{ list: TruckData[] }>(`/trucks?search=${encodeURIComponent(b.truck_number)}&start=0&limit=10`).catch(() => ({ list: [] as TruckData[] }));
    const match = (res.list ?? []).find(t => t.truck_number.toUpperCase() === b.truck_number.toUpperCase()) ?? null;
    if (match) tCache.current[key] = match;
    return match;
  }, []);

  const resolveOwner = useCallback(async (ownerId: string | null): Promise<OwnerData | null> => {
    if (!ownerId) return null;
    if (oCache.current[ownerId]) return oCache.current[ownerId];
    const o = await apiFetch<OwnerData>(`/owners/${ownerId}`).catch(() => null);
    if (o) oCache.current[ownerId] = o;
    return o;
  }, []);

  const enrich = useCallback(async (items: Blacklist[]): Promise<Enriched[]> => {
    return Promise.all(items.map(async b => {
      const [truck, addedByName] = await Promise.all([resolveTruck(b), resolveAdminName(b.added_by)]);
      const owner = truck?.owner_id ? await resolveOwner(truck.owner_id) : null;
      return {
        ...b,
        truckType: truck?.truck_type ?? null,
        ownerName: owner?.name ?? null,
        ownerCompany: owner?.company ?? null,
        ownerMobile: owner?.primary_mobile ?? null,
        addedByName,
      };
    }));
  }, [resolveTruck, resolveAdminName, resolveOwner]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(async (p: number, q: string, status: typeof statusFilter, ord: typeof sortOrder) => {
    setLoading(true); setListError("");
    try {
      const start = (p - 1) * PAGE_SIZE;
      let url = `/blacklists?start=${start}&limit=${PAGE_SIZE}&sort_by=created_at&order=${ord}`;
      if (q) url += `&search=${encodeURIComponent(q)}`;
      if (status) url += `&is_active=${status === "active"}`;
      const data = await apiFetch<{ count: number; list: Blacklist[] }>(url);
      const enriched = await enrich(data.list ?? []);
      setList(enriched);
      setTotal(data.count ?? 0);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load blacklist.");
    } finally { setLoading(false); }
  }, [enrich]);

  useEffect(() => { fetchList(page, search, statusFilter, sortOrder); }, [page, search, statusFilter, sortOrder, fetchList]);

  const fetchKpis = useCallback(async () => {
    try {
      const [totalRes, activeRes, recentRes] = await Promise.all([
        apiFetch<{ count: number }>(`/blacklists?start=0&limit=1`),
        apiFetch<{ count: number }>(`/blacklists?start=0&limit=1&is_active=true`),
        apiFetch<{ list: Blacklist[] }>(`/blacklists?start=0&limit=${RECENT_CAP}&sort_by=created_at&order=desc`),
      ]);
      const recent = recentRes.list ?? [];
      setKpi({
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        addedToday: recent.filter(b => isToday(b.created_at)).length,
        weekly: last7DaysBuckets(recent),
      });
      setRecentActivity(recent.slice(0, 6));

      const ids = [...new Set(recent.map(b => b.added_by).filter(Boolean) as string[])];
      const names = await Promise.all(ids.map(id => resolveAdminName(id)));
      setAdminNames(prev => { const next = { ...prev }; ids.forEach((id, i) => { next[id] = names[i]; }); return next; });
    } catch { /* KPIs are non-critical — cards just show 0 */ }
  }, [resolveAdminName]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  const refreshAll = useCallback(() => {
    fetchList(page, search, statusFilter, sortOrder);
    fetchKpis();
  }, [fetchList, page, search, statusFilter, sortOrder, fetchKpis]);

  function clearFilters() {
    setSearchInput(""); setSearch(""); setStatusFilter(""); setPage(1);
  }

  // ── add form autocomplete ──
  useEffect(() => {
    if (!fTruck.trim() || fTruck.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const res = await apiFetch<{ list: TruckData[] }>(`/trucks?search=${encodeURIComponent(fTruck.trim())}&start=0&limit=6`);
        setSuggestions(res.list ?? []);
      } catch { setSuggestions([]); }
      finally { setSuggestLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [fTruck]);

  function selectSuggestion(t: TruckData) {
    setFTruck(t.truck_number);
    setFTruckId(t.id);
    setShowSuggestions(false);
    tCache.current[t.id] = t;
    tCache.current[`num:${t.truck_number.toUpperCase()}`] = t;
  }

  function resetForm() {
    setFTruck(""); setFTruckId(null); setFReason(""); setFError(""); setSuggestions([]);
  }

  async function handleAdd(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fTruck.trim()) { setFError("Truck number is required."); return; }
    if (!fReason.trim()) { setFError("Reason is required."); return; }
    setFLoading(true); setFError(""); setFSuccess(false);
    try {
      const created = await apiFetch<Blacklist>("/blacklists", {
        method: "POST",
        body: JSON.stringify({
          truck_number: fTruck.trim().toUpperCase(),
          truck_id: fTruckId,
          reason: fReason.trim(),
        }),
      });
      setFSuccess(true);
      pushToast("success", `${created.truck_number} added to blacklist.`);
      setHighlightId(created.id);
      setTimeout(() => setHighlightId(null), 2500);
      setTimeout(() => setFSuccess(false), 2500);
      resetForm();
      setPage(1);
      fetchList(1, search, statusFilter, sortOrder);
      fetchKpis();
    } catch (err) {
      setFError(err instanceof Error ? err.message : "Failed to add to blacklist.");
    } finally { setFLoading(false); }
  }

  function openAddForm() {
    setFormColumnMounted(true);
    setShowAddForm(true);
    setTimeout(() => {
      truckInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      truckInputRef.current?.focus();
    }, 250);
  }
  function toggleAddForm() {
    if (showAddForm) setShowAddForm(false);
    else openAddForm();
  }

  // ── edit ──
  function openEdit(item: Enriched) {
    setEditItem(item); setETruck(item.truck_number); setEReason(item.reason); setEErr("");
    setMenuId(null);
  }
  async function handleSaveEdit() {
    if (!editItem) return;
    if (!eTruck.trim() || !eReason.trim()) { setEErr("Truck number and reason are required."); return; }
    setEBusy(true); setEErr("");
    try {
      const payload = buildUpdatePayload(editItem, { truck_number: eTruck.trim().toUpperCase(), reason: eReason.trim() });
      await apiFetch(`/blacklists/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
      setList(prev => prev.map(b => b.id === editItem.id ? { ...b, truck_number: eTruck.trim().toUpperCase(), reason: eReason.trim() } : b));
      pushToast("success", "Changes saved.");
      setEditItem(null);
    } catch (err) {
      setEErr(err instanceof Error ? err.message : "Failed to save.");
    } finally { setEBusy(false); }
  }

  // ── toggle active/inactive ──
  async function toggleActive(item: Enriched) {
    setMenuId(null);
    const nextActive = !item.is_active;
    try {
      const payload = buildUpdatePayload(item, { is_active: nextActive });
      await apiFetch(`/blacklists/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
      setList(prev => prev.map(b => b.id === item.id ? { ...b, is_active: nextActive } : b));
      pushToast("success", `${item.truck_number} is now ${nextActive ? "active" : "inactive"}.`);
      fetchKpis();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Failed to update.");
    }
  }

  // ── remove ──
  function openRemove(item: Enriched) { setRemoveItem(item); setMenuId(null); }
  async function handleRemove() {
    if (!removeItem) return;
    setRemoveBusy(true);
    try {
      await apiFetch(`/blacklists/${removeItem.id}`, { method: "DELETE" });
      setList(prev => prev.filter(b => b.id !== removeItem.id));
      setTotal(t => Math.max(0, t - 1));
      setRemovedTodaySession(n => n + 1);
      pushToast("success", `${removeItem.truck_number} removed from blacklist.`);
      setRemoveItem(null);
      fetchKpis();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Failed to remove.");
    } finally { setRemoveBusy(false); }
  }

  function openDetails(item: Enriched) { setDetailItem(item); setMenuId(null); }

  function exportCSV() {
    if (!list.length) return;
    const headers = ["Truck Number", "Owner", "Reason", "Added By", "Added On", "Status"];
    const rows = list.map(b => [b.truck_number, b.ownerName ?? "—", b.reason, b.addedByName, fmtDateTime(b.created_at), b.is_active ? "Active" : "Inactive"]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv]));
    a.download = `parkos-blacklist-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = !!(searchInput || statusFilter);
  const activePercent = kpi.total ? (kpi.active / kpi.total) * 100 : 0;

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
            <Link href="/dashboard" className="hover:text-red-600 dark:hover:text-red-400 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-700 dark:text-slate-300 font-semibold">Blacklist</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Blacklist Management</h1>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Prevent restricted vehicles from entering the parking yard.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <button onClick={refreshAll} disabled={loading}
            className="flex items-center gap-2 bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={exportCSV} disabled={!list.length}
            className="flex items-center gap-2 bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-40">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={() => setActivityOpen(true)}
            className="flex items-center gap-2 bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm">
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Activity Logs</span>
          </button>
          <button onClick={toggleAddForm}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm shadow-red-200 dark:shadow-none">
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span className="hidden sm:inline">{showAddForm ? "Close" : "Add Blacklist"}</span>
          </button>
        </div>
      </motion.div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <KPICard
          delay={0}
          label="Restricted Trucks"
          value={kpi.total}
          sub="all-time records"
          icon={<ShieldX className="w-4 h-4 text-red-600 dark:text-red-300" />}
          iconBg="bg-red-100 dark:bg-red-500/15"
          trend={{ kind: "sparkline", data: kpi.weekly, color: "#EF4444" }}
        />
        <KPICard
          delay={0.06}
          label="Added Today"
          value={kpi.addedToday}
          sub="last 24 hours"
          icon={<UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />}
          iconBg="bg-indigo-100 dark:bg-indigo-500/15"
          trend={{ kind: "sparkline", data: kpi.weekly, color: "#4F46E5" }}
        />
        <KPICard
          delay={0.12}
          label="Removed Today"
          value={removedTodaySession}
          sub="this session"
          subColor="text-gray-400 dark:text-slate-500"
          icon={<ShieldOff className="w-4 h-4 text-amber-600 dark:text-amber-300" />}
          iconBg="bg-amber-100 dark:bg-amber-500/15"
        />
        <KPICard
          delay={0.18}
          label="Active Restrictions"
          value={kpi.active}
          sub={`${activePercent.toFixed(0)}% of records`}
          icon={<ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-300" />}
          iconBg="bg-red-100 dark:bg-red-500/15"
          trend={{ kind: "ring", percent: activePercent, color: "#EF4444" }}
        />
      </div>

      {/* ── 40/60 layout when the add form is open, full-width table otherwise ── */}
      <div className={`grid grid-cols-1 gap-5 items-start ${formColumnMounted ? "lg:grid-cols-5" : ""}`}>

        {/* ── Left: Add form (40%, only takes up space while open) ── */}
        <AnimatePresence initial={false} onExitComplete={() => setFormColumnMounted(false)}>
          {showAddForm && (
            <motion.div
              key="add-form-column"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="lg:col-span-2 overflow-hidden"
            >
          <GlassCard className="overflow-hidden">
            <div className="flex items-center justify-between gap-2.5 px-5 py-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-red-100 dark:bg-red-500/15 rounded-xl flex items-center justify-center shrink-0">
                  <ShieldX className="w-4 h-4 text-red-600 dark:text-red-300" />
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Add truck to blacklist</p>
              </div>
              <button onClick={() => setShowAddForm(false)}
                className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="px-5 py-5 space-y-4">
              <div className="relative">
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                  Truck number <span className="text-red-400">*</span>
                </label>
                <input
                  ref={truckInputRef}
                  value={fTruck}
                  onChange={e => { setFTruck(e.target.value.toUpperCase()); setFTruckId(null); setFError(""); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="e.g. RJ14CD9001"
                  maxLength={20}
                  className={inputCls + " font-mono uppercase tracking-wider"}
                />
                {suggestLoading && <Loader2 className="absolute right-3.5 top-[38px] w-4 h-4 text-gray-400 animate-spin" />}
                {fTruckId && (
                  <p className="mt-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Existing registered truck</p>
                )}
                {!fTruckId && fTruck.trim().length >= 2 && !suggestLoading && suggestions.length === 0 && (
                  <p className="mt-1.5 text-[11px] font-medium text-gray-400 dark:text-slate-500">New / unregistered truck — will still be blocked at check-in</p>
                )}
                <AnimatePresence>
                  {showSuggestions && suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden"
                    >
                      {suggestions.map(t => (
                        <button key={t.id} type="button" onMouseDown={() => selectSuggestion(t)}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition text-left">
                          <span className="font-mono font-bold text-gray-800 dark:text-slate-200">{t.truck_number}</span>
                          <span className="text-xs text-gray-400 dark:text-slate-500">{t.truck_type}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                  Reason <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={fReason}
                  onChange={e => { setFReason(e.target.value); setFError(""); }}
                  placeholder="e.g. Repeated non-payment, security issue, fake documents..."
                  rows={4}
                  maxLength={255}
                  className={inputCls + " resize-none"}
                />
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 text-right">{fReason.length}/255</p>
              </div>

              {fError && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{fError}</p>
                </div>
              )}

              <AnimatePresence>
                {fSuccess && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-3.5 py-2.5 overflow-hidden"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-300 shrink-0" />
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">Truck added to blacklist successfully.</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-3">
                <button type="button" onClick={resetForm}
                  className="px-4 py-3 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold rounded-xl transition text-sm">
                  Reset
                </button>
                <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={fLoading}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 text-white font-bold py-3 rounded-xl shadow-sm shadow-red-200 dark:shadow-none transition text-sm min-h-11">
                  {fLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Adding…</> : <><Plus className="w-4 h-4" />Add to blacklist</>}
                </motion.button>
              </div>

              <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl px-4 py-3">
                <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Try it: type a blacklisted number in the Check-in screen — a red alert appears and entry is blocked until it&apos;s removed here.
                </p>
              </div>
            </form>
          </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Right: Table (60% while the form is open, full width otherwise) ── */}
        <div className={`space-y-4 ${formColumnMounted ? "lg:col-span-3" : ""}`}>

          {/* Toolbar */}
          <GlassCard className="p-3.5">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative w-full sm:flex-1 sm:min-w-48">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search by truck number…"
                  className="w-full pl-10 pr-9 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-400 focus:bg-white dark:focus:bg-slate-800 transition"
                />
                {searchInput && (
                  <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <EnumFilterSelect
                className="w-full sm:w-auto"
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}
                options={STATUS_FILTER_OPTIONS}
                allLabel="All statuses"
              />

              <div className="flex items-center gap-2 w-full sm:w-auto sm:contents">
                <button onClick={() => setShowAdvanced(v => !v)}
                  className={`flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition ${showAdvanced ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-gray-50 dark:bg-slate-800/60 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"}`}>
                  <SlidersHorizontal className="w-3.5 h-3.5" />Sort
                </button>

                {filtersActive && (
                  <button onClick={clearFilters} className="flex-1 sm:flex-none text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/20 hover:bg-red-100 px-3 py-2 rounded-xl flex items-center justify-center sm:justify-start gap-1.5 transition">
                    <RotateCcw className="w-3.5 h-3.5" />Reset
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="pt-3 mt-3 border-t border-gray-100 dark:border-slate-800 flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Sort by added date</span>
                    <button onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800/60 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
                      {sortOrder === "desc" ? "Newest first" : "Oldest first"}
                      {sortOrder === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>

          {/* Data grid */}
          <GlassCard className="overflow-hidden">
            <div className="md:overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
              <div className="md:min-w-[750px]">

                <div className="hidden md:grid sticky top-0 z-10 bg-gray-50/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800"
                  style={{ gridTemplateColumns: GRID_COLS }}>
                  {COL_LABELS.map((label, i) => (
                    <div key={i} className="px-3 py-3 flex items-center">
                      {label && <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">{label}</span>}
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
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={i} />)
                  ) : list.length === 0 ? (
                    <EmptyState
                      icon={filtersActive ? <PackageSearch className="w-8 h-8 text-gray-300 dark:text-slate-600" /> : <ShieldCheck className="w-8 h-8 text-gray-300 dark:text-slate-600" />}
                      title="No restricted trucks."
                      sub={filtersActive ? "Try clearing some filters" : "All trucks are currently allowed through."}
                      ctaLabel={!filtersActive ? "Add Restriction" : undefined}
                      onCta={!filtersActive ? openAddForm : undefined}
                    />
                  ) : (
                    <AnimatePresence initial={false}>
                      {list.map((item, i) => (
                        <BlacklistRow
                          key={item.id}
                          item={item}
                          index={i}
                          highlighted={highlightId === item.id}
                          menuOpen={menuId === item.id}
                          onToggleMenu={() => setMenuId(prev => prev === item.id ? null : item.id)}
                          onCloseMenu={() => setMenuId(null)}
                          onView={() => openDetails(item)}
                          onEdit={() => openEdit(item)}
                          onToggleActive={() => toggleActive(item)}
                          onRemove={() => openRemove(item)}
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
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of <span className="font-semibold text-gray-600 dark:text-slate-300">{total}</span>
                </p>
                <div className="flex items-center gap-1 order-1 sm:order-2">
                  <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                    const n = i + 1;
                    return (
                      <button key={n} onClick={() => setPage(n)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition ${page === n ? "bg-red-600 text-white shadow-sm" : "text-gray-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white border border-transparent hover:border-gray-200 dark:hover:border-slate-700"}`}>
                        {n}
                      </button>
                    );
                  })}
                  <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></PagBtn>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* ── Edit modal (bottom sheet on mobile) ── */}
      <Overlay open={!!editItem} onClose={() => setEditItem(null)} variant="modal" title="Edit Restriction" widthClass="max-w-md">
        {editItem && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Truck number</label>
              <input value={eTruck} onChange={e => setETruck(e.target.value.toUpperCase())} className={inputCls + " font-mono uppercase"} maxLength={20} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Reason</label>
              <textarea value={eReason} onChange={e => setEReason(e.target.value)} rows={4} maxLength={255} className={inputCls + " resize-none"} />
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 text-right">{eReason.length}/255</p>
            </div>
            {eErr && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" /><p className="text-sm text-red-700 dark:text-red-300">{eErr}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setEditItem(null)} className="flex-1 min-h-11 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold rounded-xl transition text-sm">Cancel</button>
              <button onClick={handleSaveEdit} disabled={eBusy} className="flex-1 min-h-11 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {eBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </Overlay>

      {/* ── Remove confirmation (bottom sheet on mobile) ── */}
      <Overlay open={!!removeItem} onClose={() => setRemoveItem(null)} variant="modal" title="Remove restriction" widthClass="max-w-sm">
        {removeItem && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3.5">
              <ShieldOff className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Are you sure? <span className="font-bold font-mono">{removeItem.truck_number}</span> will immediately be allowed to enter the parking area.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRemoveItem(null)} className="flex-1 min-h-11 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold rounded-xl transition text-sm">Cancel</button>
              <button onClick={handleRemove} disabled={removeBusy} className="flex-1 min-h-11 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {removeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Remove
              </button>
            </div>
          </div>
        )}
      </Overlay>

      {/* ── Details drawer ── */}
      <Overlay open={!!detailItem} onClose={() => setDetailItem(null)} variant="drawer" title="Restriction Details" widthClass="max-w-lg">
        {detailItem && <DetailsDrawerBody item={detailItem} />}
      </Overlay>

      {/* ── Activity Logs drawer ── */}
      <Overlay open={activityOpen} onClose={() => setActivityOpen(false)} variant="drawer" title="Activity Logs" widthClass="max-w-md">
        <div className="space-y-1.5">
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">Most recent additions to the blacklist.</p>
          {recentActivity.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-10">No activity yet</p>
          ) : recentActivity.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800/60 transition">
              <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                <ShieldX className="w-4 h-4 text-red-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold font-mono text-gray-900 dark:text-white truncate">{a.truck_number}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 truncate">Added by {adminNames[a.added_by ?? ""] ?? (a.added_by ? "Admin" : "System")} · {fmtDateTime(a.created_at)}</p>
              </div>
              <span className="text-[11px] text-gray-400 dark:text-slate-500 shrink-0">{relativeTime(a.created_at)}</span>
            </div>
          ))}
        </div>
      </Overlay>

      <ToastStack toasts={toasts} />
    </div>
  );
}

// ── row ───────────────────────────────────────────────────────────────────────
interface RowProps {
  item: Enriched; index: number; highlighted: boolean;
  menuOpen: boolean; onToggleMenu: () => void; onCloseMenu: () => void;
  onView: () => void; onEdit: () => void; onToggleActive: () => void; onRemove: () => void;
}
function BlacklistRow({ item, index, highlighted, menuOpen, onToggleMenu, onCloseMenu, onView, onEdit, onToggleActive, onRemove }: RowProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

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

  const statusMeta = item.is_active
    ? { label: "Active", dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20" }
    : { label: "Inactive", dot: "bg-gray-400", chip: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" };
  const barColor = item.is_active ? "bg-red-500" : "bg-gray-300 dark:bg-slate-600";

  const menuContent = (
    <>
      <MenuItem icon={<Eye className="w-3.5 h-3.5" />} label="View Details" onClick={onView} />
      <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} label="Edit" onClick={onEdit} />
      <MenuItem
        icon={item.is_active ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
        label={item.is_active ? "Mark Inactive" : "Reactivate"}
        onClick={onToggleActive}
      />
      <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
      <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Remove Restriction" onClick={onRemove} danger />
    </>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, backgroundColor: highlighted ? "rgba(239,68,68,0.08)" : "rgba(0,0,0,0)" }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.02 }}
      whileHover={{ y: -1 }}
      style={{ zIndex: menuOpen ? 30 : undefined }}
      className={`relative rounded-2xl border overflow-visible transition-shadow hover:shadow-md ${
        highlighted ? "border-red-200 dark:border-red-500/30" : "border-gray-100 dark:border-slate-800"
      } ${index % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/20" : "bg-white/80 dark:bg-slate-900/50"}`}
    >
      <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${barColor}`} />

      {/* Desktop row */}
      <div className="hidden md:grid items-center" style={{ gridTemplateColumns: GRID_COLS }}>
        <div />

        <div className="px-3 py-3.5 min-w-0">
          <p className="text-sm font-bold font-mono text-gray-900 dark:text-white truncate flex items-center gap-1.5">
            <ShieldX className="w-3.5 h-3.5 text-red-400 shrink-0" />{item.truck_number}
          </p>
          {item.truckType && <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">{item.truckType}</p>}
        </div>

        <div className="px-3 py-3.5 min-w-0">
          {item.ownerName ? (
            <>
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.ownerName}</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate flex items-center gap-1 mt-0.5">
                {item.ownerMobile ? <><Phone className="w-2.5 h-2.5 shrink-0" />{item.ownerMobile}</> : <><Building2 className="w-2.5 h-2.5 shrink-0" />{item.ownerCompany ?? "No firm"}</>}
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-300 dark:text-slate-600 italic">Not registered</p>
          )}
        </div>

        <div className="px-3 py-3.5 min-w-0">
          <p className="text-sm text-gray-700 dark:text-slate-300 truncate" title={item.reason}>{item.reason}</p>
        </div>

        <div className="px-3 py-3.5 min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300 truncate">{item.addedByName}</p>
        </div>

        <div className="px-3 py-3.5 min-w-0">
          <p className="text-sm text-gray-700 dark:text-slate-300">{fmtDate(item.created_at)}</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{relativeTime(item.created_at)}</p>
        </div>

        <div className="px-3 py-3.5">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusMeta.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />{statusMeta.label}
          </span>
        </div>

        <div className="px-3 py-3.5 flex items-center gap-1">
          <button onClick={onView} className="p-2 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <div className="relative" ref={menuRef}>
            <button onClick={onToggleMenu} className="p-2 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition">
              <MoreVertical className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl z-20 py-1.5 overflow-hidden">
                  {menuContent}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile card */}
      <div className="md:hidden flex flex-col gap-3 px-4 py-4 pl-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold font-mono text-gray-900 dark:text-white flex items-center gap-1.5">
            <ShieldX className="w-3.5 h-3.5 text-red-400 shrink-0" />{item.truck_number}
          </p>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusMeta.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />{statusMeta.label}
          </span>
        </div>
        {item.ownerName && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
            <User className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 shrink-0" />{item.ownerName}
          </div>
        )}
        <p className="text-sm text-gray-700 dark:text-slate-300">{item.reason}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-400 dark:text-slate-500">Added {fmtDate(item.created_at)} · {item.addedByName}</p>
          <div className="flex items-center gap-1">
            <button onClick={onView} className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition">
              <Eye className="w-4 h-4" />
            </button>
            <div className="relative" ref={mobileMenuRef}>
              <button onClick={onToggleMenu} className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition">
                <MoreVertical className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.12 }}
                    className="absolute right-0 bottom-full mb-1 w-52 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl z-20 py-1.5 overflow-hidden">
                    {menuContent}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── details drawer body ──────────────────────────────────────────────────────
function DetailsDrawerBody({ item }: { item: Enriched }) {
  const statusMeta = item.is_active
    ? { label: "Active", dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20" }
    : { label: "Inactive", dot: "bg-gray-400", chip: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-lg font-bold font-mono text-gray-900 dark:text-white">{item.truck_number}</p>
          {item.truckType && <p className="text-xs text-gray-400 dark:text-slate-500">{item.truckType}</p>}
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusMeta.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />{statusMeta.label}
        </span>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">Owner Details</p>
        {item.ownerName ? (
          <div className="grid grid-cols-2 gap-3">
            <DetailField label="Owner" value={item.ownerName} />
            <DetailField label="Company" value={item.ownerCompany} />
            <DetailField label="Phone" value={item.ownerMobile} mono />
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-slate-500">This truck number isn&apos;t linked to a registered owner yet.</p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">Reason</p>
        <p className="text-sm text-gray-700 dark:text-slate-300">{item.reason}</p>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5" />Timeline</p>
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
            <ShieldX className="w-3.5 h-3.5 text-red-600 dark:text-red-300" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Added to blacklist</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">{fmtDateTime(item.created_at)} by {item.addedByName}</p>
          </div>
        </div>
        {item.updated_at && item.updated_at !== item.created_at && (
          <div className="flex gap-3 mt-3">
            <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5 text-gray-500 dark:text-slate-300" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Last updated</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{fmtDateTime(item.updated_at)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
