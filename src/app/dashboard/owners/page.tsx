"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight, ChevronLeft, ChevronDown, Search, X, Loader2, AlertCircle,
  Users, Phone, Building2, Truck as TruckIcon, Plus, UserPlus,
  Mail, MapPin, Pencil, Trash2, CheckCircle2, Clock, IndianRupee,
  RotateCcw, RefreshCw, Info, Check,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { Overlay } from "@/components/ui/Overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { EnumFilterSelect } from "@/components/ui/EnumFilterSelect";

import { handleUnauthorized } from "@/lib/auth";

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
interface Owner {
  id: string; name: string; company: string | null;
  primary_mobile: string; alternate_mobile: string | null;
  email: string | null; gst_number: string | null; address: string | null;
  owner_since: string | null; is_active: boolean; created_at: string | null;
}
interface TruckObj { id: string; truck_number: string; truck_type: string | null }
interface SessionObj { id: string; check_in_time: string | null; check_out_time: string | null; total_amount: number | null; status: string }
interface Enriched { owner: Owner; trucks: TruckObj[]; totalSpend: number; lastSession: SessionObj | null }

const PAGE_SIZE = 12;

const TRUCK_TYPE_OPTIONS = ["Heavy (20T+)", "Heavy (10-20T)", "Medium (5-10T)", "Light (<5T)", "Trailer", "Tanker"];
const TRUCK_TYPE_META: Record<string, { color: string; abbr: string }> = {
  "Heavy (20T+)":   { color: "from-red-500 to-rose-600",      abbr: "H+" },
  "Heavy (10-20T)": { color: "from-orange-500 to-red-500",    abbr: "H"  },
  "Medium (5-10T)": { color: "from-amber-500 to-orange-500",  abbr: "M"  },
  "Light (<5T)":    { color: "from-emerald-500 to-teal-600",  abbr: "L"  },
  "Trailer":        { color: "from-indigo-500 to-violet-600", abbr: "Tr" },
  "Tanker":         { color: "from-cyan-500 to-blue-600",     abbr: "Tk" },
};

const SORT_OPTIONS = [
  { value: "last_visit_desc",   label: "Recently Active",  sort_by: "last_visit",   order: "desc" },
  { value: "trucks_count_desc", label: "Most Trucks",      sort_by: "trucks_count", order: "desc" },
  { value: "total_spend_desc",  label: "Highest Spend",    sort_by: "total_spend",  order: "desc" },
  { value: "created_at_desc",   label: "Newest",           sort_by: "created_at",   order: "desc" },
  { value: "created_at_asc",    label: "Oldest",           sort_by: "created_at",   order: "asc"  },
] as const;
type SortValue = typeof SORT_OPTIONS[number]["value"];

// ── status derivation (real fields only: is_active + latest session status) ───
type StatusKey = "active" | "parked" | "inactive" | "no_visit";
const STATUS_META: Record<StatusKey, { label: string; dot: string; chip: string }> = {
  active:   { label: "Active",            dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20" },
  parked:   { label: "Currently Parked",  dot: "bg-blue-500",    chip: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20" },
  inactive: { label: "Inactive",          dot: "bg-gray-400",    chip: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" },
  no_visit: { label: "No Recent Visit",   dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20" },
};
function deriveStatus(owner: Owner, lastSession: SessionObj | null): StatusKey {
  if (!owner.is_active) return "inactive";
  if (lastSession?.status === "parked") return "parked";
  if (!lastSession) return "no_visit";
  return "active";
}

// Filter dropdown options — the backend only supports filtering by is_active
// (true/false), so this reuses STATUS_META's active/inactive dot colors
// rather than the full 4-way derived status shown on each row.
const STATUS_FILTER_OPTIONS = [
  { value: "true", label: STATUS_META.active.label, dot: STATUS_META.active.dot },
  { value: "false", label: STATUS_META.inactive.label, dot: STATUS_META.inactive.dot },
];

// ── formatters ────────────────────────────────────────────────────────────────
function fmtMobile(m: string) { const d = m.replace(/\D/g, ""); return `+91 ${d.slice(-10, -5)} ${d.slice(-5)}`; }
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 transition";

// ── small building blocks ────────────────────────────────────────────────────
function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition">
      {children}
    </button>
  );
}

function TruckChip({ truck, onEdit, onDelete }: { truck: TruckObj; onEdit: () => void; onDelete: () => void }) {
  return (
    <div title={truck.truck_type ?? undefined}
      className="group flex items-center gap-1 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-lg font-mono overflow-hidden transition-transform duration-150 hover:scale-105">
      <Link href={`/dashboard/trucks/profile?q=${encodeURIComponent(truck.truck_number)}`} className="flex items-center gap-1 pl-2.5 pr-1 py-1 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 transition">
        <TruckIcon className="w-3 h-3 shrink-0" />{truck.truck_number}
      </Link>
      <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} title="Edit truck" className="p-1 rounded hover:bg-indigo-200 dark:hover:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 transition">
          <Pencil className="w-3 h-3" />
        </button>
        <button onClick={onDelete} title="Delete truck" className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-indigo-400 dark:text-indigo-500 hover:text-red-600 dark:hover:text-red-400 transition">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function TruckTypeSelect({ value, onChange, placeholder = "Select type…" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect,  setRect]  = useState<DOMRect | null>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  function openDropdown() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function reposition() { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()); }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const meta = value ? TRUCK_TYPE_META[value] : null;
  const estimatedPanelHeight = 300;
  const openUp = rect ? rect.bottom + estimatedPanelHeight > window.innerHeight && rect.top > window.innerHeight - rect.bottom : false;
  const panelStyle: React.CSSProperties = rect ? {
    position: "fixed", left: rect.left, width: rect.width, zIndex: 10000,
    ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
  } : { display: "none" };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm text-left transition-all ${
          open
            ? "border-indigo-500 ring-4 ring-indigo-50 dark:ring-indigo-500/10 bg-white dark:bg-slate-800"
            : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-500/40"
        }`}
      >
        {meta ? (
          <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center shrink-0 shadow-sm`}>
            <span className="text-[10px] font-black text-white">{meta.abbr}</span>
          </span>
        ) : (
          <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
            <TruckIcon className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
          </span>
        )}
        <span className={`flex-1 truncate ${value ? "font-semibold text-gray-900 dark:text-white" : "font-medium text-gray-400 dark:text-slate-500"}`}>
          {value || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <AnimatePresence>
          <motion.ul
            ref={panelRef}
            style={panelStyle}
            initial={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-black/40 overflow-hidden py-1.5 max-h-72 overflow-y-auto"
          >
            {TRUCK_TYPE_OPTIONS.map(t => {
              const m = TRUCK_TYPE_META[t];
              const isSelected = t === value;
              return (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => { onChange(t); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition ${isSelected ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-gray-50 dark:hover:bg-slate-800"}`}
                  >
                    <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${m.color} flex items-center justify-center shrink-0 shadow-sm`}>
                      <span className="text-[10px] font-black text-white">{m.abbr}</span>
                    </span>
                    <span className={`flex-1 text-sm font-semibold truncate ${isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-slate-200"}`}>
                      {t}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

// ── owner card ────────────────────────────────────────────────────────────────
function OwnerCard({ data, onAddTruck, onEditTruck, onDeleteTruck, onEditOwner }: {
  data: Enriched;
  onAddTruck: () => void;
  onEditTruck: (t: TruckObj) => void;
  onDeleteTruck: (t: TruckObj) => void;
  onEditOwner: () => void;
}) {
  const { owner, trucks, totalSpend, lastSession } = data;
  const status = deriveStatus(owner, lastSession);
  const meta = STATUS_META[status];
  const currentlyParked = status === "parked";
  const lastVisitIso = currentlyParked ? lastSession?.check_in_time : (lastSession?.check_out_time ?? lastSession?.check_in_time);
  const visibleTrucks = trucks.slice(0, 2);
  const extraTrucks = trucks.length - visibleTrucks.length;

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="h-full">
      <GlassCard hoverLift className="h-full flex flex-col p-5">
        {/* header */}
        <div className="flex items-start gap-3">
          <Avatar name={owner.name} size="lg" />
          <div className="flex-1 min-w-0">
            <Link href={`/dashboard/owners/profile?id=${owner.id}`}
              className="font-bold text-gray-900 dark:text-white text-base leading-tight truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition block">
              {owner.name}
            </Link>
            <p className="text-sm text-gray-400 dark:text-slate-500 truncate mt-0.5">
              {owner.company ?? <span className="italic text-gray-300 dark:text-slate-600">No firm</span>}
            </p>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${meta.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
          </span>
        </div>

        {/* phone + spend */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Phone</p>
            <a href={`tel:${owner.primary_mobile}`}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition truncate">
              <Phone className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 shrink-0" />{fmtMobile(owner.primary_mobile)}
            </a>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Total Spend</p>
            <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800 dark:text-slate-100">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              {totalSpend > 0 ? totalSpend.toLocaleString("en-IN") : <span className="text-gray-300 dark:text-slate-600 font-normal">—</span>}
            </p>
          </div>
        </div>

        {/* linked trucks */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">
              Linked Trucks <span className="text-gray-300 dark:text-slate-600">({trucks.length})</span>
            </p>
            <button onClick={onAddTruck} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition">
              <Plus className="w-3 h-3" />Add
            </button>
          </div>
          {trucks.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleTrucks.map(t => (
                <TruckChip key={t.id} truck={t} onEdit={() => onEditTruck(t)} onDelete={() => onDeleteTruck(t)} />
              ))}
              {extraTrucks > 0 && (
                <span className="inline-flex items-center text-xs font-bold text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 px-2.5 py-1 rounded-lg">
                  +{extraTrucks} More
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-300 dark:text-slate-600 italic">No trucks linked</p>
          )}
        </div>

        {/* last visit */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Last Visit</p>
          {lastSession ? (
            <p className={`flex items-center gap-1.5 text-sm font-semibold ${currentlyParked ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-slate-200"}`}>
              <Clock className="w-3.5 h-3.5 shrink-0" />{relativeTime(lastVisitIso ?? null)}
            </p>
          ) : (
            <p className="text-xs text-gray-300 dark:text-slate-600 italic">No visits yet</p>
          )}
        </div>

        {/* footer actions — pinned to bottom regardless of content above */}
        <div className="pt-4 mt-auto border-t border-gray-100 dark:border-slate-800 grid grid-cols-3 gap-2">
          <Link href={`/dashboard/owners/profile?id=${owner.id}`}
            className="flex items-center justify-center text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-gray-50 dark:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-slate-800 py-2 rounded-xl transition">
            View Profile
          </Link>
          <button onClick={onEditOwner}
            className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-gray-50 dark:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-slate-800 py-2 rounded-xl transition">
            <Pencil className="w-3.5 h-3.5" />Edit
          </button>
          <button onClick={onAddTruck}
            className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 py-2 rounded-xl transition shadow-sm shadow-indigo-200 dark:shadow-none">
            <Plus className="w-3.5 h-3.5" />Truck
          </button>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function CardSkeleton() {
  return (
    <GlassCard className="p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="w-12 h-12 rounded-full shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-32 rounded-full" />
          <Skeleton className="h-3 w-20 rounded-full" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
        <div className="space-y-1.5"><Skeleton className="h-2.5 w-14 rounded-full" /><Skeleton className="h-4 w-24 rounded-full" /></div>
        <div className="space-y-1.5"><Skeleton className="h-2.5 w-16 rounded-full" /><Skeleton className="h-4 w-16 rounded-full" /></div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-2.5 w-24 rounded-full" />
        <div className="flex gap-1.5"><Skeleton className="h-6 w-24 rounded-lg" /><Skeleton className="h-6 w-24 rounded-lg" /></div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 grid grid-cols-3 gap-2">
        <Skeleton className="h-8 rounded-xl" /><Skeleton className="h-8 rounded-xl" /><Skeleton className="h-8 rounded-xl" />
      </div>
    </GlassCard>
  );
}

function EmptyState({ hasFilters, onAdd }: { hasFilters: boolean; onAdd: () => void }) {
  return (
    <div className="col-span-full">
      <GlassCard className="px-5 py-16 text-center">
        <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-gray-300 dark:text-slate-600" />
        </div>
        <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">
          {hasFilters ? "No owners match your filters" : "No truck owners yet"}
        </p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
          {hasFilters ? "Try a different name, mobile number, or truck." : "Start by adding your first truck owner."}
        </p>
        {!hasFilters && (
          <button onClick={onAdd}
            className="inline-flex items-center gap-2 mt-5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-indigo-200 dark:shadow-none">
            <UserPlus className="w-4 h-4" />Add Owner
          </button>
        )}
      </GlassCard>
    </div>
  );
}

function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

function Pagination({ page, total, totalPages, onPage }: { page: number; total: number; totalPages: number; onPage: (p: number) => void }) {
  return (
    <GlassCard className="px-4 py-3">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-gray-400 dark:text-slate-500">
          Showing <span className="font-semibold text-gray-600 dark:text-slate-300">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</span>{" "}
          of <span className="font-semibold text-gray-600 dark:text-slate-300">{total}</span> owners
        </p>

        {/* mobile: prev / current / next */}
        <div className="flex sm:hidden items-center gap-2">
          <PagBtn disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
          <span className="text-xs font-semibold text-gray-600 dark:text-slate-300 px-2 whitespace-nowrap">Page {page} of {totalPages}</span>
          <PagBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight className="w-4 h-4" /></PagBtn>
        </div>

        {/* desktop: page numbers */}
        <div className="hidden sm:flex items-center gap-1">
          <PagBtn disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
          {pageWindow(page, totalPages).map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-300 dark:text-slate-600 text-sm">…</span>
            ) : (
              <button key={p} onClick={() => onPage(p)}
                className={`w-8 h-8 rounded-lg text-sm font-semibold transition ${page === p ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"}`}>
                {p}
              </button>
            )
          )}
          <PagBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight className="w-4 h-4" /></PagBtn>
        </div>
      </div>
    </GlassCard>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function OwnersPage() {
  const [rows,    setRows]    = useState<Enriched[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [listErr, setListErr] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "" | "true" | "false"
  const [sortValue,    setSortValue]    = useState<SortValue>("created_at_desc");

  // add-owner drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fName,    setFName]    = useState("");
  const [fMobile,  setFMobile]  = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fEmail,   setFEmail]   = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fGst,     setFGst]     = useState("");
  const [fErr,     setFErr]     = useState("");
  const [fBusy,    setFBusy]    = useState(false);
  const [fOk,      setFOk]      = useState(false);

  // edit-owner drawer
  const [editOwner, setEditOwner] = useState<Owner | null>(null);
  const [efName,    setEfName]    = useState("");
  const [efMobile,  setEfMobile]  = useState("");
  const [efAlt,     setEfAlt]     = useState("");
  const [efCompany, setEfCompany] = useState("");
  const [efEmail,   setEfEmail]   = useState("");
  const [efGst,     setEfGst]     = useState("");
  const [efAddress, setEfAddress] = useState("");
  const [efErr,     setEfErr]     = useState("");
  const [efBusy,    setEfBusy]    = useState(false);
  const [efOk,      setEfOk]      = useState(false);

  // truck edit / delete / add
  const [editTruck,   setEditTruck]   = useState<{ ownerId: string; truckId: string; currentNumber: string } | null>(null);
  const [deleteTruck, setDeleteTruck] = useState<{ ownerId: string; truckId: string; truckNumber: string } | null>(null);
  const [addTruck,    setAddTruck]    = useState<{ ownerId: string } | null>(null);
  const [editValue,   setEditValue]   = useState("");
  const [addTruckValue, setAddTruckValue] = useState("");
  const [addTruckType,  setAddTruckType]  = useState("");
  const [actionBusy,  setActionBusy]  = useState(false);
  const [actionErr,   setActionErr]   = useState("");

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  const enrich = useCallback(async (owners: Owner[]): Promise<Enriched[]> => {
    const results = await Promise.allSettled(owners.map(async owner => {
      const [truckRes, sessRes] = await Promise.allSettled([
        apiFetch<{ count: number; list: TruckObj[] }>(`/trucks?owner_id=${owner.id}&limit=20`),
        apiFetch<{ count: number; list: SessionObj[] }>(`/parking-sessions?owner_id=${owner.id}&limit=50&sort_by=created_at&order=desc`),
      ]);
      const trucks   = truckRes.status === "fulfilled" ? truckRes.value.list  : [];
      const sessions = sessRes.status  === "fulfilled" ? sessRes.value.list   : [];
      const totalSpend = sessions.reduce((s, ss) => s + (ss.total_amount ?? 0), 0);
      const lastSession = sessions[0] ?? null;
      return { owner, trucks, totalSpend, lastSession };
    }));
    return results.map((r, i) =>
      r.status === "fulfilled" ? r.value
        : { owner: owners[i], trucks: [], totalSpend: 0, lastSession: null }
    );
  }, []);

  const fetchList = useCallback(async (p: number, q: string, status: string, sortVal: SortValue) => {
    setLoading(true); setListErr("");
    try {
      const opt = SORT_OPTIONS.find(o => o.value === sortVal) ?? SORT_OPTIONS[3];
      const start = (p - 1) * PAGE_SIZE;
      let url = `/owners?start=${start}&limit=${PAGE_SIZE}&sort_by=${opt.sort_by}&order=${opt.order}`;
      if (q) url += `&search=${encodeURIComponent(q)}`;
      if (status) url += `&is_active=${status}`;
      const data = await apiFetch<{ count: number; list: Owner[] }>(url);
      setTotal(data.count ?? 0);
      const enriched = await enrich(data.list ?? []);
      setRows(enriched);
    } catch (e) { setListErr(e instanceof Error ? e.message : "Failed to load owners."); }
    finally { setLoading(false); }
  }, [enrich]);

  useEffect(() => { fetchList(page, search, statusFilter, sortValue); }, [page, search, statusFilter, sortValue, fetchList]);

  const filtersActive = !!search || !!statusFilter;
  function clearFilters() { setSearchInput(""); setSearch(""); setStatusFilter(""); setPage(1); }

  function resetAddForm() {
    setFName(""); setFMobile(""); setFCompany(""); setFEmail(""); setFAddress(""); setFGst("");
    setFErr(""); setFOk(false);
  }

  async function handleAdd(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fName.trim()) { setFErr("Owner name is required."); return; }
    const mobile = fMobile.trim().replace(/\D/g, "");
    if (mobile.length < 10) { setFErr("Enter a valid 10-digit mobile number."); return; }
    setFBusy(true); setFErr(""); setFOk(false);
    try {
      await apiFetch<Owner>("/owners", {
        method: "POST",
        body: JSON.stringify({
          name: fName.trim(),
          primary_mobile: mobile,
          company: fCompany.trim() || null,
          email: fEmail.trim() || null,
          address: fAddress.trim() || null,
          gst_number: fGst.trim() || null,
        }),
      });
      setFOk(true);
      setTimeout(() => { setDrawerOpen(false); resetAddForm(); setPage(1); fetchList(1, search, statusFilter, sortValue); }, 1200);
    } catch (err) { setFErr(err instanceof Error ? err.message : "Failed to create owner."); }
    finally { setFBusy(false); }
  }

  function openEditOwner(owner: Owner) {
    setEditOwner(owner);
    setEfName(owner.name);
    setEfMobile(owner.primary_mobile.replace(/\D/g, ""));
    setEfAlt(owner.alternate_mobile?.replace(/\D/g, "") ?? "");
    setEfCompany(owner.company ?? "");
    setEfEmail(owner.email ?? "");
    setEfGst(owner.gst_number ?? "");
    setEfAddress(owner.address ?? "");
    setEfErr(""); setEfOk(false);
  }

  async function handleEditOwner(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!editOwner) return;
    if (!efName.trim()) { setEfErr("Owner name is required."); return; }
    const mobile = efMobile.trim().replace(/\D/g, "");
    if (mobile.length < 10) { setEfErr("Enter a valid 10-digit mobile number."); return; }
    setEfBusy(true); setEfErr(""); setEfOk(false);
    try {
      const updated = await apiFetch<Owner>(`/owners/${editOwner.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: efName.trim(),
          primary_mobile: mobile,
          alternate_mobile: efAlt.trim() || null,
          company: efCompany.trim() || null,
          email: efEmail.trim() || null,
          gst_number: efGst.trim() || null,
          address: efAddress.trim() || null,
          owner_since: editOwner.owner_since,
          is_active: editOwner.is_active,
        }),
      });
      setRows(prev => prev.map(r => r.owner.id === updated.id ? { ...r, owner: updated } : r));
      setEfOk(true);
      setTimeout(() => setEditOwner(null), 1200);
    } catch (err) { setEfErr(err instanceof Error ? err.message : "Failed to update owner."); }
    finally { setEfBusy(false); }
  }

  async function handleAddTruck() {
    if (!addTruck) return;
    const num = addTruckValue.trim().toUpperCase();
    if (!num) { setActionErr("Truck number is required."); return; }
    if (!addTruckType) { setActionErr("Truck type is required."); return; }
    setActionBusy(true); setActionErr("");
    try {
      const created = await apiFetch<TruckObj>("/trucks", {
        method: "POST",
        body: JSON.stringify({ truck_number: num, truck_type: addTruckType, owner_id: addTruck.ownerId }),
      });
      setRows(prev => prev.map(row =>
        row.owner.id === addTruck.ownerId
          ? { ...row, trucks: [...row.trucks, created] }
          : row
      ));
      setAddTruck(null);
      setAddTruckValue("");
      setAddTruckType("");
    } catch (err) { setActionErr(err instanceof Error ? err.message : "Failed to add truck."); }
    finally { setActionBusy(false); }
  }

  async function handleEditTruck() {
    if (!editTruck) return;
    const num = editValue.trim().toUpperCase();
    if (!num) { setActionErr("Truck number is required."); return; }
    setActionBusy(true); setActionErr("");
    try {
      await apiFetch(`/trucks/${editTruck.truckId}`, {
        method: "PATCH",
        body: JSON.stringify({ truck_number: num }),
      });
      setRows(prev => prev.map(row =>
        row.owner.id === editTruck.ownerId
          ? { ...row, trucks: row.trucks.map(t => t.id === editTruck.truckId ? { ...t, truck_number: num } : t) }
          : row
      ));
      setEditTruck(null);
    } catch (err) { setActionErr(err instanceof Error ? err.message : "Failed to update truck."); }
    finally { setActionBusy(false); }
  }

  async function handleDeleteTruck() {
    if (!deleteTruck) return;
    setActionBusy(true); setActionErr("");
    try {
      await apiFetch(`/trucks/${deleteTruck.truckId}`, { method: "DELETE" });
      setRows(prev => prev.map(row =>
        row.owner.id === deleteTruck.ownerId
          ? { ...row, trucks: row.trucks.filter(t => t.id !== deleteTruck.truckId) }
          : row
      ));
      setDeleteTruck(null);
    } catch (err) { setActionErr(err instanceof Error ? err.message : "Failed to delete truck."); }
    finally { setActionBusy(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* ── header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}>
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500 mb-2">
          <Link href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-700 dark:text-slate-300 font-semibold">Owners</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Truck owners</h1>
        <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Owner profiles auto-fill when a returning truck checks in.</p>
      </motion.div>

      {/* info tip */}
      <div className="flex items-center gap-2.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl px-4 py-3">
        <Info className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          When a linked truck checks in next time, its owner&apos;s details fill automatically — no re-entry needed.
        </p>
      </div>

      {/* ── toolbar ── */}
      <GlassCard className="p-3.5">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative w-full sm:flex-1 sm:min-w-52">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search owner, phone, truck…"
              className="w-full pl-10 pr-9 py-2.5 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition"
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="h-6 w-px bg-gray-100 dark:bg-slate-700 hidden sm:block" />

          <EnumFilterSelect
            className="w-full sm:w-auto"
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={STATUS_FILTER_OPTIONS}
            allLabel="All statuses"
          />

          <EnumFilterSelect
            className="w-full sm:w-auto"
            value={sortValue}
            onChange={(v) => { setSortValue(v as SortValue); setPage(1); }}
            options={SORT_OPTIONS}
            showDot={false}
          />

          <div className="flex items-center gap-2 w-full sm:w-auto sm:contents">
            {filtersActive && (
              <button onClick={clearFilters} className="flex-1 sm:flex-none text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/20 hover:bg-red-100 px-3 py-2 rounded-xl flex items-center justify-center sm:justify-start gap-1.5 transition">
                <RotateCcw className="w-3.5 h-3.5" />Reset
              </button>
            )}

            <div className="flex-1 hidden lg:block" />

            <button onClick={() => fetchList(page, search, statusFilter, sortValue)} disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center p-2.5 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl transition">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button onClick={() => { setDrawerOpen(true); resetAddForm(); }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:-translate-y-0.5 text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-indigo-200 dark:shadow-none transition-all duration-200 text-sm whitespace-nowrap">
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Owner</span>
            </button>
          </div>
        </div>
      </GlassCard>

      {/* error */}
      {listErr && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{listErr}</p>
        </div>
      )}

      {/* ── owner card grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
        <AnimatePresence mode="popLayout">
          {loading && rows.length === 0 && Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={`sk-${i}`} />)}
          {!loading && rows.length === 0 && <EmptyState hasFilters={filtersActive} onAdd={() => { setDrawerOpen(true); resetAddForm(); }} />}
          {rows.map(r => (
            <OwnerCard
              key={r.owner.id}
              data={r}
              onAddTruck={() => { setAddTruck({ ownerId: r.owner.id }); setAddTruckValue(""); setAddTruckType(""); setActionErr(""); }}
              onEditTruck={(t) => { setEditTruck({ ownerId: r.owner.id, truckId: t.id, currentNumber: t.truck_number }); setEditValue(t.truck_number); setActionErr(""); }}
              onDeleteTruck={(t) => { setDeleteTruck({ ownerId: r.owner.id, truckId: t.id, truckNumber: t.truck_number }); setActionErr(""); }}
              onEditOwner={() => openEditOwner(r.owner)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* pagination */}
      {!loading && total > 0 && (
        <Pagination page={page} total={total} totalPages={totalPages} onPage={setPage} />
      )}

      {/* ── Add truck modal ── */}
      <Overlay open={!!addTruck} onClose={() => !actionBusy && setAddTruck(null)} variant="modal" title="Add truck" widthClass="max-w-sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Truck number <span className="text-red-400">*</span></label>
            <input
              value={addTruckValue}
              onChange={e => { setAddTruckValue(e.target.value.toUpperCase()); setActionErr(""); }}
              placeholder="e.g. HR 38 CZ 8521"
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Truck type <span className="text-red-400">*</span></label>
            <TruckTypeSelect value={addTruckType} onChange={(v) => { setAddTruckType(v); setActionErr(""); }} />
          </div>
          {actionErr && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{actionErr}</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setAddTruck(null)} disabled={actionBusy}
              className="flex-1 min-h-11 text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 transition">
              Cancel
            </button>
            <button type="button" onClick={handleAddTruck} disabled={actionBusy}
              className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-xl shadow-sm shadow-indigo-200 dark:shadow-none transition">
              {actionBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Adding…</> : <><Plus className="w-4 h-4" />Add truck</>}
            </button>
          </div>
        </div>
      </Overlay>

      {/* ── Edit truck modal ── */}
      <Overlay open={!!editTruck} onClose={() => !actionBusy && setEditTruck(null)} variant="modal" title="Edit truck number" widthClass="max-w-sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Truck number</label>
            <input
              value={editValue}
              onChange={e => { setEditValue(e.target.value.toUpperCase()); setActionErr(""); }}
              placeholder="e.g. HR 38 CZ 8521"
              className={inputCls}
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleEditTruck()}
            />
          </div>
          {actionErr && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{actionErr}</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setEditTruck(null)} disabled={actionBusy}
              className="flex-1 min-h-11 text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 transition">
              Cancel
            </button>
            <button type="button" onClick={handleEditTruck} disabled={actionBusy}
              className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-xl shadow-sm shadow-indigo-200 dark:shadow-none transition">
              {actionBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
            </button>
          </div>
        </div>
      </Overlay>

      {/* ── Delete truck confirmation ── */}
      <Overlay open={!!deleteTruck} onClose={() => !actionBusy && setDeleteTruck(null)} variant="modal" title="Delete truck" widthClass="max-w-sm">
        {deleteTruck && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3.5">
              <Trash2 className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Delete <span className="font-bold font-mono">{deleteTruck.truckNumber}</span>? This cannot be undone.
              </p>
            </div>
            {actionErr && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{actionErr}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteTruck(null)} disabled={actionBusy}
                className="flex-1 min-h-11 text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 transition">
                Cancel
              </button>
              <button type="button" onClick={handleDeleteTruck} disabled={actionBusy}
                className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-xl shadow-sm shadow-red-200 dark:shadow-none transition">
                {actionBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</> : <><Trash2 className="w-4 h-4" />Delete</>}
              </button>
            </div>
          </div>
        )}
      </Overlay>

      {/* ── Add owner drawer ── */}
      <Overlay open={drawerOpen} onClose={() => setDrawerOpen(false)} variant="drawer" title="Add owner" widthClass="max-w-md">
        <form id="owner-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Full name <span className="text-red-400">*</span></label>
            <input value={fName} onChange={e => { setFName(e.target.value); setFErr(""); }}
              placeholder="e.g. Ramesh Patel" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Primary mobile <span className="text-red-400">*</span></label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-slate-500 font-medium pointer-events-none">+91</span>
              <input value={fMobile} onChange={e => { setFMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setFErr(""); }}
                placeholder="98765 43210" maxLength={10}
                className={inputCls + " pl-9"} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Company / Firm</label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
              <input value={fCompany} onChange={e => setFCompany(e.target.value)}
                placeholder="Patel Transport" className={inputCls + " pl-9"} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
              <input value={fEmail} onChange={e => setFEmail(e.target.value)} type="email"
                placeholder="owner@example.com" className={inputCls + " pl-9"} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">GST number</label>
            <input value={fGst} onChange={e => setFGst(e.target.value.toUpperCase())}
              placeholder="22AAAAA0000A1Z5" maxLength={20} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Address</label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-3 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
              <textarea value={fAddress} onChange={e => setFAddress(e.target.value)}
                placeholder="Full address..." rows={2}
                className={inputCls + " pl-9 resize-none"} />
            </div>
          </div>

          {fErr && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{fErr}</p>
            </div>
          )}
          {fOk && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-3.5 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">Owner added successfully!</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setDrawerOpen(false)}
              className="flex-1 min-h-11 text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition">
              Cancel
            </button>
            <button type="submit" disabled={fBusy}
              className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 rounded-xl shadow-sm shadow-indigo-200 dark:shadow-none transition">
              {fBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><Plus className="w-4 h-4" />Add owner</>}
            </button>
          </div>
        </form>
      </Overlay>

      {/* ── Edit owner drawer ── */}
      <Overlay open={!!editOwner} onClose={() => setEditOwner(null)} variant="drawer" title="Edit owner" widthClass="max-w-md">
        <form id="edit-owner-form" onSubmit={handleEditOwner} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Full name <span className="text-red-400">*</span></label>
            <input value={efName} onChange={e => { setEfName(e.target.value); setEfErr(""); }} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Primary mobile <span className="text-red-400">*</span></label>
              <input value={efMobile} onChange={e => { setEfMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setEfErr(""); }}
                placeholder="10 digits" maxLength={10} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Alternate mobile</label>
              <input value={efAlt} onChange={e => setEfAlt(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Optional" maxLength={10} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Company / Firm</label>
            <input value={efCompany} onChange={e => setEfCompany(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Email</label>
            <input value={efEmail} onChange={e => setEfEmail(e.target.value)} type="email" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">GST number</label>
            <input value={efGst} onChange={e => setEfGst(e.target.value.toUpperCase())} maxLength={20} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Address</label>
            <textarea value={efAddress} onChange={e => setEfAddress(e.target.value)} rows={2} className={inputCls + " resize-none"} />
          </div>

          {efErr && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{efErr}</p>
            </div>
          )}
          {efOk && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-3.5 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">Owner updated successfully!</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditOwner(null)}
              className="flex-1 min-h-11 text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition">
              Cancel
            </button>
            <button type="submit" disabled={efBusy}
              className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 rounded-xl shadow-sm shadow-indigo-200 dark:shadow-none transition">
              {efBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
            </button>
          </div>
        </form>
      </Overlay>
    </div>
  );
}
