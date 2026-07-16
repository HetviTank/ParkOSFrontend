"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight, ChevronLeft, ChevronDown, Search, X, Loader2, AlertCircle,
  Download, RefreshCw, Receipt, Phone, Printer, FileDown, Send, CheckCircle2,
  TrendingUp, Banknote, CreditCard, Smartphone, Clock, Wallet, IndianRupee,
  Eye, MoreVertical, CheckCircle, SlidersHorizontal, RotateCcw, Truck as TruckIcon,
  Building2, Calendar, History, FileText, PackageSearch,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { Overlay } from "@/components/ui/Overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
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
async function downloadPDF(url: string, filename: string) {
  const res = await fetch(`${BASE_URL}${url}`, { headers: { token: getToken() } });
  if (!res.ok) return;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = filename; a.click();
  URL.revokeObjectURL(href);
}

// ── types ─────────────────────────────────────────────────────────────────────
interface LocationObj { id: string; name: string; city: string | null }
interface TruckObj { id: string; truck_number: string; truck_type: string | null }
interface OwnerObj { id: string; name: string; primary_mobile: string }
interface DivisionObj { id: string; name: string }
interface SlotObj { id: string; code: string }
interface SessionObj {
  id: string; truck_id: string; owner_id: string | null; location_id: string;
  division_id: string | null; slot_id: string | null;
  check_in_time: string | null; check_out_time: string | null;
  days: number | null; rate_per_day: number | null; gst_percent: number | null;
  subtotal: number | null; gst_amount: number | null; total_amount: number | null;
  status: string; created_at: string | null;
}
interface PaymentObj {
  id: string; session_id: string; receipt_no: string | null;
  subtotal: number | null; gst_amount: number | null; total_amount: number | null;
  method: string | null; amount_received: number | null; change_due: number | null;
  status: string; paid_at: string | null;
}
interface Enriched {
  session: SessionObj; payment: PaymentObj | null;
  truckNumber: string; ownerName: string; ownerMobile: string; locationName: string;
}
interface Stats {
  total_revenue: number; cash_collected: number; card_upi_collected: number;
  outstanding: number; avg_ticket: number; today_collection: number;
  paid_count: number; pending_count: number; revenue_trend: number[];
}

const PAGE_SIZE = 20;

// ── sort / date-preset config ───────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: "check_in_desc", label: "Newest",         sort_by: "check_in_time", order: "desc" },
  { value: "check_in_asc",  label: "Oldest",          sort_by: "check_in_time", order: "asc"  },
  { value: "amount_desc",   label: "Highest Amount",  sort_by: "total_amount",  order: "desc" },
  { value: "amount_asc",    label: "Lowest Amount",   sort_by: "total_amount",  order: "asc"  },
] as const;
type SortValue = typeof SORT_OPTIONS[number]["value"];

const DATE_PRESETS = [
  { value: "today",      label: "Today" },
  { value: "this_week",  label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "all",        label: "All time" },
  { value: "custom",     label: "Custom range" },
] as const;
type DatePreset = typeof DATE_PRESETS[number]["value"];

function presetRange(preset: DatePreset, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  if (preset === "today") {
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to: now.toISOString() };
  }
  if (preset === "this_week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (preset === "this_month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
  }
  if (preset === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (preset === "custom") {
    return {
      from: customFrom ? new Date(customFrom).toISOString() : undefined,
      to: customTo ? new Date(`${customTo}T23:59:59`).toISOString() : undefined,
    };
  }
  return {};
}
function presetLabel(preset: DatePreset): string {
  const now = new Date();
  if (preset === "this_month") return now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  if (preset === "last_month") { const d = new Date(now.getFullYear(), now.getMonth() - 1); return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }); }
  return DATE_PRESETS.find(p => p.value === preset)?.label ?? "All time";
}

// ── status / method visuals — real fields only (session.status + payment.status/method) ──
type UiStatus = "paid" | "pending" | "draft" | "active" | "overdue";
const STATUS_META: Record<UiStatus, { label: string; dot: string; chip: string }> = {
  paid:    { label: "Paid",     dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20" },
  pending: { label: "Pending",  dot: "bg-red-500",     chip: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20" },
  draft:   { label: "Draft",    dot: "bg-gray-400",    chip: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" },
  active:  { label: "Active",   dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20" },
  overdue: { label: "Overdue",  dot: "bg-rose-500",    chip: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20" },
};
function deriveUiStatus(session: SessionObj, payment: PaymentObj | null): UiStatus {
  if (payment?.status === "paid") return "paid";
  if (payment?.status === "draft") return "draft";
  if (session.status === "overdue") return "overdue";
  if (session.status === "parked") return "active";
  return "pending";
}
const METHOD_META: Record<string, { label: string; chip: string; Icon: typeof Banknote }> = {
  cash: { label: "Cash", chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20", Icon: Banknote },
  card: { label: "Card", chip: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20",       Icon: CreditCard },
  upi:  { label: "UPI",  chip: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20", Icon: Smartphone },
};

// ── formatters ────────────────────────────────────────────────────────────────
function fmtRupees(n: number) { return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`; }
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })} ${d.getFullYear()}`;
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })} · ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}
function fmtMobile(m: string) { const d = m.replace(/\D/g, ""); return d ? `+91 ${d.slice(-10, -5)} ${d.slice(-5)}` : "—"; }
function calcDuration(ci: string | null, co: string | null): string {
  if (!ci) return "—";
  const end = co ? new Date(co) : new Date();
  const ms = end.getTime() - new Date(ci).getTime();
  if (ms <= 0) return "< 1m";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 transition";
const selectCls = "pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 transition appearance-none cursor-pointer";

// ── KPI card (mirrors established Trucks/Khata/Owners convention) ────────────
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
function RatioRing({ percent, color }: { percent: number; color: string }) {
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
              {trend.kind === "ring" && <RatioRing percent={trend.percent} color={trend.color} />}
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ── small building blocks ────────────────────────────────────────────────────
function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition">
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
function StatusBadge({ status }: { status: UiStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${meta.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
    </span>
  );
}
function PaymentChip({ method }: { method: string | null }) {
  if (!method || !METHOD_META[method]) return <span className="text-gray-300 dark:text-slate-600 text-xs">—</span>;
  const m = METHOD_META[method];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${m.chip}`}>
      <m.Icon className="w-3 h-3" />{m.label}
    </span>
  );
}
function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <PackageSearch className="w-8 h-8 text-gray-300 dark:text-slate-600" />
      </div>
      <p className="text-sm font-medium text-gray-500 dark:text-slate-400">No transactions found</p>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
        {hasFilters ? "Try adjusting or clearing your filters." : "Transactions will appear here once trucks check in."}
      </p>
      {hasFilters && (
        <button onClick={onClear} className="inline-flex items-center gap-2 mt-4 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition">
          <RotateCcw className="w-3.5 h-3.5" />Clear filters
        </button>
      )}
    </div>
  );
}
function RowSkeleton() {
  return (
    <div className="hidden md:grid items-center px-2 py-4 gap-2" style={{ gridTemplateColumns: GRID_COLS }}>
      {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-3.5 rounded-full w-4/5" />)}
    </div>
  );
}
function CardSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between"><Skeleton className="h-4 w-28 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /></div>
      <Skeleton className="h-3 w-40 rounded-full" />
      <div className="flex items-center justify-between"><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-6 w-16 rounded-lg" /></div>
    </div>
  );
}

const GRID_COLS = "minmax(110px,0.9fr) minmax(150px,1.3fr) minmax(120px,1fr) minmax(110px,0.9fr) minmax(110px,0.9fr) minmax(100px,0.8fr) minmax(110px,0.9fr) 48px";

function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

// ── row action menu (dynamic up/down direction, matching established pattern) ─
function RowActionMenu({ row, onView, onSendReceipt, onMarkPaid, sendBusy, markBusy }: {
  row: Enriched; onView: () => void; onSendReceipt: () => void; onMarkPaid: () => void;
  sendBusy: boolean; markBusy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"up" | "down">("down");
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const status  = deriveUiStatus(row.session, row.payment);
  const isPaid  = status === "paid";

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setDirection(spaceBelow >= 260 || spaceBelow >= spaceAbove ? "down" : "up");
    }
    setOpen(o => !o);
  }

  return (
    <div ref={wrapRef} className="relative" onClick={e => e.stopPropagation()}>
      <button ref={btnRef} onClick={toggle} className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
        <MoreVertical className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: direction === "down" ? -4 : 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={`absolute right-0 w-48 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl z-30 py-1.5 ${direction === "down" ? "top-full mt-1" : "bottom-full mb-1"}`}
          >
            <MenuItem icon={<Eye className="w-3.5 h-3.5" />} label="View details" onClick={() => { onView(); setOpen(false); }} />
            {isPaid && row.payment && (
              <>
                <MenuItem icon={<Receipt className="w-3.5 h-3.5" />} label="Download receipt"
                  onClick={() => { window.open(`/dashboard/billing/receipt?payment_id=${row.payment!.id}`, "_blank", "width=700,height=900"); setOpen(false); }} />
                <MenuItem icon={<FileDown className="w-3.5 h-3.5" />} label="Download PDF"
                  onClick={() => { downloadPDF(`/payments/${row.payment!.id}/receipt/pdf`, `receipt-${row.payment!.receipt_no || row.payment!.id.slice(0, 8)}.pdf`); setOpen(false); }} />
                <MenuItem icon={sendBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} label="Send receipt" disabled={sendBusy}
                  onClick={() => { onSendReceipt(); setOpen(false); }} />
              </>
            )}
            {row.ownerMobile && (
              <MenuItem icon={<Phone className="w-3.5 h-3.5" />} label="Call owner"
                onClick={() => { window.location.href = `tel:${row.ownerMobile}`; setOpen(false); }} />
            )}
            {row.payment && (status === "pending" || status === "draft") && (
              <>
                <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
                <MenuItem icon={markBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} label="Mark as paid" disabled={markBusy}
                  onClick={() => { onMarkPaid(); setOpen(false); }} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── transaction row (desktop grid + mobile card) ─────────────────────────────
function TransactionRow({ row, index, onView, onSendReceipt, onMarkPaid, sendBusy, markBusy }: {
  row: Enriched; index: number;
  onView: () => void; onSendReceipt: () => void; onMarkPaid: () => void;
  sendBusy: boolean; markBusy: boolean;
}) {
  const { session, payment } = row;
  const status = deriveUiStatus(session, payment);
  const amount = payment?.total_amount ?? session.total_amount ?? 0;

  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      className={`group border-b border-gray-50 dark:border-slate-800/60 last:border-0 hover:bg-gray-50/60 dark:hover:bg-slate-800/30 transition-colors cursor-pointer ${index % 2 === 1 ? "bg-slate-50/40 dark:bg-slate-800/10" : ""}`}
      onClick={onView}
    >
      {/* desktop row */}
      <div className="hidden md:grid items-center px-5 py-3.5" style={{ gridTemplateColumns: GRID_COLS }}>
        <div className="min-w-0" onClick={e => e.stopPropagation()}>
          <Link href={`/dashboard/trucks/profile?q=${encodeURIComponent(row.truckNumber)}`} className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline truncate block">
            {row.truckNumber}
          </Link>
        </div>
        <div className="min-w-0 flex items-center gap-2">
          <Avatar name={row.ownerName} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate" title={row.ownerName}>{row.ownerName}</p>
            {row.ownerMobile && <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{fmtMobile(row.ownerMobile)}</p>}
          </div>
        </div>
        <div className="min-w-0 text-sm text-gray-600 dark:text-slate-300 truncate" title={row.locationName}>{row.locationName}</div>
        <div className="min-w-0">
          <p className="text-sm text-gray-700 dark:text-slate-300 font-medium">{calcDuration(session.check_in_time, session.check_out_time)}</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500">{fmtDate(session.check_in_time)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{amount ? fmtRupees(amount) : "—"}</p>
          {payment?.receipt_no && <p className="text-[11px] text-gray-400 dark:text-slate-500 font-mono truncate">{payment.receipt_no}</p>}
        </div>
        <div><PaymentChip method={payment?.method ?? null} /></div>
        <div><StatusBadge status={status} /></div>
        <div className="flex justify-end">
          <RowActionMenu row={row} onView={onView} onSendReceipt={onSendReceipt} onMarkPaid={onMarkPaid} sendBusy={sendBusy} markBusy={markBusy} />
        </div>
      </div>

      {/* mobile card */}
      <div className="md:hidden flex flex-col gap-2.5 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TruckIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400 truncate">{row.truckNumber}</span>
          </div>
          <div onClick={e => e.stopPropagation()}>
            <RowActionMenu row={row} onView={onView} onSendReceipt={onSendReceipt} onMarkPaid={onMarkPaid} sendBusy={sendBusy} markBusy={markBusy} />
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <Avatar name={row.ownerName} size="sm" />
          <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{row.ownerName}</p>
          <span className="text-gray-300 dark:text-slate-600">·</span>
          <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{row.locationName}</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{amount ? fmtRupees(amount) : "—"}</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500">{calcDuration(session.check_in_time, session.check_out_time)} · {fmtDate(session.check_in_time)}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={status} />
            <PaymentChip method={payment?.method ?? null} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const [rows,    setRows]    = useState<Enriched[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [listErr, setListErr] = useState("");
  const [stats,   setStats]   = useState<Stats | null>(null);

  // Non-admin roles are locked to their assigned location — no "All locations" escape hatch.
  const { isAdmin, locationId, setLocationId } = useLocationFilter();

  const [locations, setLocations] = useState<LocationObj[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [payStatusFilter, setPayStatusFilter] = useState("");
  const [sortValue, setSortValue] = useState<SortValue>("check_in_desc");
  const [datePreset, setDatePreset] = useState<DatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sendBusyId, setSendBusyId] = useState<string | null>(null);
  const [markBusyId, setMarkBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const truckCache = useRef<Record<string, TruckObj>>({});
  const ownerCache = useRef<Record<string, OwnerObj>>({});
  const locCache   = useRef<Record<string, LocationObj>>({});

  useEffect(() => {
    apiFetch<{ count: number; list: LocationObj[] }>("/locations?limit=50")
      .then(r => { setLocations(r.list ?? []); (r.list ?? []).forEach(l => { locCache.current[l.id] = l; }); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const enrich = useCallback(async (sessions: SessionObj[]): Promise<Enriched[]> => {
    const truckIds = [...new Set(sessions.map(s => s.truck_id))].filter(id => !truckCache.current[id]);
    const ownerIds = [...new Set(sessions.map(s => s.owner_id).filter(Boolean) as string[])].filter(id => !ownerCache.current[id]);
    const locIds   = [...new Set(sessions.map(s => s.location_id))].filter(id => !locCache.current[id]);

    await Promise.allSettled([
      ...truckIds.map(id => apiFetch<TruckObj>(`/trucks/${id}`).then(t => { truckCache.current[id] = t; }).catch(() => {})),
      ...ownerIds.map(id => apiFetch<OwnerObj>(`/owners/${id}`).then(o => { ownerCache.current[id] = o; }).catch(() => {})),
      ...locIds.map(id => apiFetch<LocationObj>(`/locations/${id}`).then(l => { locCache.current[id] = l; }).catch(() => {})),
    ]);

    const paymentResults = await Promise.allSettled(
      sessions.map(s => apiFetch<{ count: number; list: PaymentObj[] }>(`/payments?session_id=${s.id}&limit=1&sort_by=paid_at&order=desc`))
    );

    return sessions.map((s, i) => ({
      session: s,
      payment: paymentResults[i].status === "fulfilled" ? ((paymentResults[i] as PromiseFulfilledResult<{ count: number; list: PaymentObj[] }>).value.list[0] ?? null) : null,
      truckNumber:  truckCache.current[s.truck_id]?.truck_number ?? "—",
      ownerName:    s.owner_id ? (ownerCache.current[s.owner_id]?.name ?? "—") : "—",
      ownerMobile:  s.owner_id ? (ownerCache.current[s.owner_id]?.primary_mobile ?? "") : "",
      locationName: locCache.current[s.location_id]?.name ?? "—",
    }));
  }, []);

  function buildQuery(startOverride?: number, limitOverride?: number) {
    const opt = SORT_OPTIONS.find(o => o.value === sortValue) ?? SORT_OPTIONS[0];
    const { from, to } = presetRange(datePreset, customFrom, customTo);
    const start = startOverride ?? (page - 1) * PAGE_SIZE;
    const limit = limitOverride ?? PAGE_SIZE;
    let url = `/parking-sessions?start=${start}&limit=${limit}&sort_by=${opt.sort_by}&order=${opt.order}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (locationId) url += `&location_id=${locationId}`;
    if (methodFilter) url += `&method=${methodFilter}`;
    if (payStatusFilter) url += `&payment_status=${payStatusFilter}`;
    if (from) url += `&date_from=${encodeURIComponent(from)}`;
    if (to) url += `&date_to=${encodeURIComponent(to)}`;
    if (minAmount) url += `&min_amount=${encodeURIComponent(minAmount)}`;
    if (maxAmount) url += `&max_amount=${encodeURIComponent(maxAmount)}`;
    return url;
  }

  const fetchList = useCallback(async () => {
    setLoading(true); setListErr("");
    try {
      const data = await apiFetch<{ count: number; list: SessionObj[] }>(buildQuery());
      setTotal(data.count ?? 0);
      const enriched = await enrich(data.list ?? []);
      setRows(enriched);
    } catch (e) { setListErr(e instanceof Error ? e.message : "Failed to load transactions."); }
    finally { setLoading(false); }
    // buildQuery is a plain function re-created every render from the same state
    // values already listed below — it needs no separate dependency entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, locationId, methodFilter, payStatusFilter, sortValue, datePreset, customFrom, customTo, minAmount, maxAmount, enrich]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchStats = useCallback(async () => {
    try {
      const { from, to } = presetRange(datePreset, customFrom, customTo);
      let url = "/payments/stats?";
      if (locationId) url += `location_id=${locationId}&`;
      if (from) url += `date_from=${encodeURIComponent(from)}&`;
      if (to) url += `date_to=${encodeURIComponent(to)}&`;
      const s = await apiFetch<Stats>(url);
      setStats(s);
    } catch { /* KPI cards just show 0 */ }
  }, [locationId, datePreset, customFrom, customTo]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const refreshAll = useCallback(() => { fetchList(); fetchStats(); }, [fetchList, fetchStats]);

  const filtersActive = !!search || (isAdmin && !!locationId) || !!methodFilter || !!payStatusFilter || !!minAmount || !!maxAmount || datePreset !== "this_month";
  function clearFilters() {
    setSearchInput(""); setSearch(""); setLocationId(""); setMethodFilter(""); setPayStatusFilter("");
    setSortValue("check_in_desc"); setDatePreset("this_month"); setCustomFrom(""); setCustomTo("");
    setMinAmount(""); setMaxAmount(""); setPage(1);
  }

  async function handleSendReceipt(row: Enriched) {
    if (!row.payment || !row.session.owner_id) return;
    setSendBusyId(row.payment.id);
    try {
      await apiFetch("/notices", {
        method: "POST",
        body: JSON.stringify({
          notice_type: "receipt_sent",
          message: `Receipt ${row.payment.receipt_no ?? row.payment.id.slice(0, 8).toUpperCase()} for truck ${row.truckNumber} — ${fmtRupees(row.payment.total_amount ?? 0)}. Thank you for using ParkOS.`,
          owner_id: row.session.owner_id, session_id: row.session.id, status: "open",
        }),
      });
    } catch { /* silent, matches existing ReceiptDrawer behavior */ }
    finally { setSendBusyId(null); }
  }

  async function handleMarkPaid(row: Enriched) {
    if (!row.payment) return;
    setMarkBusyId(row.payment.id);
    try {
      const updated = await apiFetch<PaymentObj>(`/payments/${row.payment.id}`, {
        method: "PUT",
        body: JSON.stringify({
          session_id: row.payment.session_id,
          receipt_no: row.payment.receipt_no,
          subtotal: row.payment.subtotal ?? 0,
          gst_amount: row.payment.gst_amount ?? 0,
          total_amount: row.payment.total_amount ?? 0,
          method: row.payment.method ?? "cash",
          amount_received: row.payment.amount_received,
          change_due: row.payment.change_due,
          status: "paid",
          paid_at: new Date().toISOString(),
        }),
      });
      setRows(prev => prev.map(r => r.session.id === row.session.id ? { ...r, payment: updated } : r));
      fetchStats();
    } catch { /* silent */ }
    finally { setMarkBusyId(null); }
  }

  async function exportCSV() {
    setExporting(true);
    try {
      const url = buildQuery(0, 2000);
      const data = await apiFetch<{ count: number; list: SessionObj[] }>(url);
      const enriched = await enrich(data.list ?? []);
      const header = "Truck,Owner,Mobile,Location,Check-in,Check-out,Duration,Amount,Method,Status,Receipt No\n";
      const body = enriched.map(r => {
        const amount = r.payment?.total_amount ?? r.session.total_amount ?? "";
        const status = STATUS_META[deriveUiStatus(r.session, r.payment)].label;
        return [
          r.truckNumber, r.ownerName, r.ownerMobile, r.locationName,
          fmtDateTime(r.session.check_in_time), fmtDateTime(r.session.check_out_time),
          calcDuration(r.session.check_in_time, r.session.check_out_time),
          amount, r.payment?.method ? METHOD_META[r.payment.method]?.label ?? r.payment.method : "",
          status, r.payment?.receipt_no ?? "",
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
      }).join("\n");
      const blob = new Blob([header + body], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `billing-${datePreset}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch { /* silent */ }
    finally { setExporting(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const revenueTrend = stats?.revenue_trend ?? [];
  const cashPct = stats && stats.total_revenue > 0 ? Math.round((stats.cash_collected / stats.total_revenue) * 100) : 0;
  const cardPct = stats && stats.total_revenue > 0 ? Math.round((stats.card_upi_collected / stats.total_revenue) * 100) : 0;
  const outstandingPct = stats && (stats.paid_count + stats.pending_count) > 0 ? Math.round((stats.pending_count / (stats.paid_count + stats.pending_count)) * 100) : 0;

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* ── header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500 mb-2">
            <Link href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-700 dark:text-slate-300 font-semibold">Billing</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Billing &amp; transactions</h1>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">All payment records across locations and dates.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button onClick={refreshAll} disabled={loading}
            className="flex items-center gap-2 bg-white/70 dark:bg-slate-800/60 border border-white/60 dark:border-slate-700/60 text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={exportCSV} disabled={exporting}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-md shadow-indigo-200 dark:shadow-none disabled:opacity-60">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </motion.div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <KPICard delay={0} label="Total Revenue" value={stats?.total_revenue ?? 0} format={n => fmtRupees(Math.round(n))}
          sub={presetLabel(datePreset)} icon={<TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />} iconBg="bg-indigo-100 dark:bg-indigo-500/15"
          trend={revenueTrend.length ? { kind: "sparkline", data: revenueTrend, color: "#4F46E5" } : undefined} />
        <KPICard delay={0.06} label="Cash Collected" value={stats?.cash_collected ?? 0} format={n => fmtRupees(Math.round(n))}
          sub={`${cashPct}% of total`} icon={<Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />} iconBg="bg-emerald-100 dark:bg-emerald-500/15"
          trend={{ kind: "ring", percent: cashPct, color: "#10B981" }} />
        <KPICard delay={0.12} label="Card / UPI" value={stats?.card_upi_collected ?? 0} format={n => fmtRupees(Math.round(n))}
          sub={`${cardPct}% of total`} icon={<CreditCard className="w-4 h-4 text-violet-600 dark:text-violet-300" />} iconBg="bg-violet-100 dark:bg-violet-500/15"
          trend={{ kind: "ring", percent: cardPct, color: "#7C3AED" }} />
        <KPICard delay={0.18} label="Outstanding" value={stats?.outstanding ?? 0} format={n => fmtRupees(Math.round(n))}
          sub={`${stats?.pending_count ?? 0} pending`} subColor={stats && stats.pending_count > 0 ? "text-red-500" : "text-emerald-500"}
          icon={<Clock className="w-4 h-4 text-red-500" />} iconBg="bg-red-100 dark:bg-red-500/15"
          trend={{ kind: "ring", percent: outstandingPct, color: "#EF4444" }} />
        <KPICard delay={0.24} label="Average Ticket" value={stats?.avg_ticket ?? 0} format={n => fmtRupees(Math.round(n))}
          sub={`${stats?.paid_count ?? 0} paid transactions`} icon={<Wallet className="w-4 h-4 text-amber-600 dark:text-amber-300" />} iconBg="bg-amber-100 dark:bg-amber-500/15" />
        <KPICard delay={0.3} label="Today's Collection" value={stats?.today_collection ?? 0} format={n => fmtRupees(Math.round(n))}
          sub="Paid today" icon={<IndianRupee className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />} iconBg="bg-cyan-100 dark:bg-cyan-500/15" />
      </div>

      {/* ── toolbar ── */}
      <GlassCard className="p-3.5">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search truck, owner, mobile…"
              className="w-full pl-10 pr-9 py-2 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition" />
            {searchInput && (
              <button onClick={() => setSearchInput("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="h-6 w-px bg-gray-100 dark:bg-slate-700 hidden sm:block" />

          <LocationSelect
            value={locationId}
            onChange={(v) => { setLocationId(v); setPage(1); }}
            locations={locations}
            allowAll={isAdmin}
            locked={!isAdmin}
          />

          <div className="relative">
            <select value={datePreset} onChange={e => { setDatePreset(e.target.value as DatePreset); setPage(1); }} className={selectCls}>
              {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
          </div>
          {datePreset === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPage(1); }} className={`${inputCls} w-auto`} />
              <span className="text-xs text-gray-400 dark:text-slate-500">to</span>
              <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPage(1); }} className={`${inputCls} w-auto`} />
            </div>
          )}

          <div className="relative">
            <select value={payStatusFilter} onChange={e => { setPayStatusFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All statuses</option>
              <option value="paid">Paid only</option>
              <option value="pending">Outstanding only</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
          </div>

          <div className="relative">
            <select value={methodFilter} onChange={e => { setMethodFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All methods</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
          </div>

          <div className="relative">
            <select value={sortValue} onChange={e => { setSortValue(e.target.value as SortValue); setPage(1); }} className={selectCls}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500 pointer-events-none" />
          </div>

          <button onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition ${showAdvanced ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" : "bg-gray-50 dark:bg-slate-800/60 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"}`}>
            <SlidersHorizontal className="w-3.5 h-3.5" />Amount
          </button>

          {filtersActive && (
            <button onClick={clearFilters} className="text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/20 hover:bg-red-100 px-3 py-2 rounded-xl flex items-center gap-1.5 transition">
              <RotateCcw className="w-3.5 h-3.5" />Reset
            </button>
          )}
        </div>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 pt-3 mt-3 border-t border-gray-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">Amount range</p>
                <input type="number" min={0} value={minAmount} onChange={e => { setMinAmount(e.target.value); setPage(1); }} placeholder="Min ₹" className={`${inputCls} w-28`} />
                <span className="text-xs text-gray-400 dark:text-slate-500">to</span>
                <input type="number" min={0} value={maxAmount} onChange={e => { setMaxAmount(e.target.value); setPage(1); }} placeholder="Max ₹" className={`${inputCls} w-28`} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {listErr && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{listErr}</p>
        </div>
      )}

      {/* ── transaction table ── */}
      <GlassCard className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">
            {loading ? "Loading…" : `${total.toLocaleString("en-IN")} transaction${total !== 1 ? "s" : ""}`}
          </p>
          {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>

        {/* desktop header */}
        <div className="hidden md:grid items-center px-5 py-3 border-b border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/30 sticky top-0 z-10" style={{ gridTemplateColumns: GRID_COLS }}>
          {["Truck", "Owner", "Location", "Duration", "Amount", "Method", "Status", ""].map(h => (
            <span key={h} className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide truncate">{h}</span>
          ))}
        </div>

        {loading && rows.length === 0 && (
          <>
            {Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={`sk-d-${i}`} />)}
            <div className="md:hidden divide-y divide-gray-50 dark:divide-slate-800">
              {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={`sk-m-${i}`} />)}
            </div>
          </>
        )}

        {!loading && rows.length === 0 && <EmptyState hasFilters={filtersActive} onClear={clearFilters} />}

        <div>
          {rows.map((r, i) => (
            <TransactionRow
              key={r.session.id}
              row={r}
              index={i}
              onView={() => setSelectedSessionId(r.session.id)}
              onSendReceipt={() => handleSendReceipt(r)}
              onMarkPaid={() => handleMarkPaid(r)}
              sendBusy={sendBusyId === r.payment?.id}
              markBusy={markBusyId === r.payment?.id}
            />
          ))}
        </div>

        {/* pagination */}
        {!loading && total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-gray-100 dark:border-slate-800 bg-gray-50/40 dark:bg-slate-800/20">
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Showing <span className="font-semibold text-gray-600 dark:text-slate-300">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</span>{" "}
              of <span className="font-semibold text-gray-600 dark:text-slate-300">{total.toLocaleString("en-IN")}</span>
            </p>

            <div className="flex sm:hidden items-center gap-2">
              <PagBtn disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-300 px-2 whitespace-nowrap">Page {page} of {totalPages}</span>
              <PagBtn disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></PagBtn>
            </div>

            <div className="hidden sm:flex items-center gap-1">
              <PagBtn disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
              {pageWindow(page, totalPages).map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-300 dark:text-slate-600 text-sm">…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-semibold transition ${page === p ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"}`}>
                    {p}
                  </button>
                )
              )}
              <PagBtn disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></PagBtn>
            </div>
          </div>
        )}
      </GlassCard>

      {/* ── transaction details drawer ── */}
      {selectedSessionId && (
        <TransactionDrawer sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} onChanged={refreshAll} />
      )}
    </div>
  );
}

// ── Transaction Details Drawer ────────────────────────────────────────────────
interface DrawerData {
  session: SessionObj; payment: PaymentObj | null;
  truck: TruckObj | null; owner: OwnerObj | null; location: LocationObj | null;
  division: DivisionObj | null; slot: SlotObj | null;
}

function TransactionDrawer({ sessionId, onClose, onChanged }: { sessionId: string; onClose: () => void; onChanged: () => void }) {
  const [data,    setData]    = useState<DrawerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [sending, setSending] = useState(false);
  const [sentOk,  setSentOk]  = useState(false);
  const [markBusy, setMarkBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const session = await apiFetch<SessionObj>(`/parking-sessions/${sessionId}`);
        const [payR, trR, owR, loR, diR, slR] = await Promise.allSettled([
          apiFetch<{ count: number; list: PaymentObj[] }>(`/payments?session_id=${sessionId}&limit=1&sort_by=paid_at&order=desc`),
          apiFetch<TruckObj>(`/trucks/${session.truck_id}`),
          session.owner_id ? apiFetch<OwnerObj>(`/owners/${session.owner_id}`) : Promise.resolve(null),
          apiFetch<LocationObj>(`/locations/${session.location_id}`),
          session.division_id ? apiFetch<DivisionObj>(`/divisions/${session.division_id}`) : Promise.resolve(null),
          session.slot_id ? apiFetch<SlotObj>(`/slots/${session.slot_id}`) : Promise.resolve(null),
        ]);
        if (!live) return;
        setData({
          session,
          payment: payR.status === "fulfilled" ? (payR.value.list[0] ?? null) : null,
          truck: trR.status === "fulfilled" ? trR.value : null,
          owner: owR.status === "fulfilled" ? owR.value : null,
          location: loR.status === "fulfilled" ? loR.value : null,
          division: diR.status === "fulfilled" ? diR.value : null,
          slot: slR.status === "fulfilled" ? slR.value : null,
        });
      } catch (e) { if (live) setErr(e instanceof Error ? e.message : "Failed to load transaction."); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [sessionId]);

  async function handleSend() {
    if (!data?.payment || !data.session.owner_id) return;
    setSending(true);
    try {
      await apiFetch("/notices", {
        method: "POST",
        body: JSON.stringify({
          notice_type: "receipt_sent",
          message: `Receipt ${data.payment.receipt_no ?? data.payment.id.slice(0, 8).toUpperCase()} for truck ${data.truck?.truck_number ?? ""} — ${fmtRupees(data.payment.total_amount ?? 0)}. Thank you for using ParkOS.`,
          owner_id: data.session.owner_id, session_id: data.session.id, status: "open",
        }),
      });
      setSentOk(true); setTimeout(() => setSentOk(false), 3000);
    } catch { /* silent */ }
    finally { setSending(false); }
  }

  async function handleMarkPaid() {
    if (!data?.payment) return;
    setMarkBusy(true);
    try {
      const updated = await apiFetch<PaymentObj>(`/payments/${data.payment.id}`, {
        method: "PUT",
        body: JSON.stringify({
          session_id: data.payment.session_id,
          receipt_no: data.payment.receipt_no,
          subtotal: data.payment.subtotal ?? 0,
          gst_amount: data.payment.gst_amount ?? 0,
          total_amount: data.payment.total_amount ?? 0,
          method: data.payment.method ?? "cash",
          amount_received: data.payment.amount_received,
          change_due: data.payment.change_due,
          status: "paid",
          paid_at: new Date().toISOString(),
        }),
      });
      setData(prev => prev ? { ...prev, payment: updated } : prev);
      onChanged();
    } catch { /* silent */ }
    finally { setMarkBusy(false); }
  }

  const status = data ? deriveUiStatus(data.session, data.payment) : null;

  return (
    <Overlay open onClose={onClose} variant="drawer" title="Transaction details" widthClass="max-w-lg">
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      )}

      {!loading && err && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{err}</p>
        </div>
      )}

      {!loading && data && status && (() => {
        const { session, payment, truck, owner, location, division, slot } = data;
        const isPaid = status === "paid";
        return (
          <div className="space-y-4">
            {/* header */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-blue-900 rounded-2xl px-5 py-6 text-center relative overflow-hidden">
              <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
              <div className="absolute -right-4 -bottom-8 w-28 h-28 rounded-full bg-white/5" />
              <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1.5 relative">Truck Number</p>
              <p className="text-3xl font-black text-white tracking-widest font-mono relative">{truck?.truck_number ?? "—"}</p>
              {(division || slot || truck?.truck_type) && (
                <p className="text-xs text-indigo-300 mt-2 font-medium relative">
                  {[division?.name, slot ? `Slot ${slot.code}` : null, truck?.truck_type].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="flex justify-center relative mt-3"><StatusBadge status={status} /></div>
            </div>

            {/* owner + location */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-800">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" />Owner</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{owner?.name ?? "—"}</p>
                {owner?.primary_mobile && (
                  <a href={`tel:${owner.primary_mobile}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">{fmtMobile(owner.primary_mobile)}</a>
                )}
              </div>
              <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-800">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><TruckIcon className="w-3 h-3" />Location</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{location?.name ?? "—"}</p>
                {location?.city && <p className="text-xs text-gray-400 dark:text-slate-500">{location.city}</p>}
              </div>
            </div>

            {/* timeline */}
            <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl px-4 py-3.5 border border-gray-100 dark:border-slate-800">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-2.5 flex items-center gap-1"><History className="w-3 h-3" />Timeline</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mb-0.5">Check-in</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{fmtDateTime(session.check_in_time)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mb-0.5">Check-out</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{fmtDateTime(session.check_out_time)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mb-0.5">Duration</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{calcDuration(session.check_in_time, session.check_out_time)}</p>
                </div>
              </div>
            </div>

            {/* charges / payment */}
            {session.total_amount != null ? (
              <div className="border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                {session.days != null && session.days > 0 && session.rate_per_day != null && (
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-slate-800">
                    <p className="text-sm text-gray-600 dark:text-slate-300">{session.days} day{session.days !== 1 ? "s" : ""} × ₹{session.rate_per_day.toLocaleString("en-IN")}</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">₹{(session.subtotal ?? 0).toLocaleString("en-IN")}</p>
                  </div>
                )}
                {(session.gst_percent ?? 0) > 0 && (
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-slate-800">
                    <p className="text-sm text-gray-600 dark:text-slate-300">GST {session.gst_percent}%</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">₹{(session.gst_amount ?? 0).toLocaleString("en-IN")}</p>
                  </div>
                )}
                <div className="flex items-center justify-between px-5 py-4 bg-gray-50/60 dark:bg-slate-800/40">
                  <p className="text-base font-bold text-gray-900 dark:text-white">{isPaid ? "Total paid" : "Total due"}</p>
                  <p className="text-2xl font-black text-indigo-700 dark:text-indigo-400">₹{session.total_amount.toLocaleString("en-IN")}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl px-4 py-3">
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">Billing finalizes automatically at checkout.</p>
              </div>
            )}

            {payment && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-800">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Payment method</p>
                  <PaymentChip method={payment.method} />
                </div>
                {payment.receipt_no && (
                  <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-800">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><FileText className="w-3 h-3" />Receipt No.</p>
                    <p className="text-sm font-mono font-bold text-gray-800 dark:text-slate-200">{payment.receipt_no}</p>
                  </div>
                )}
                {payment.paid_at && (
                  <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-800">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" />Paid at</p>
                    <p className="text-xs font-semibold text-gray-600 dark:text-slate-300">{fmtDateTime(payment.paid_at)}</p>
                  </div>
                )}
              </div>
            )}

            {sentOk && (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-4 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">Receipt sent to owner.</p>
              </div>
            )}

            {/* actions */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {isPaid && payment ? (
                <>
                  <button onClick={() => window.open(`/dashboard/billing/receipt?payment_id=${payment.id}`, "_blank", "width=700,height=900")}
                    className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-xl shadow-sm shadow-indigo-200 dark:shadow-none transition">
                    <Printer className="w-3.5 h-3.5" />Print receipt
                  </button>
                  <button onClick={() => downloadPDF(`/payments/${payment.id}/receipt/pdf`, `receipt-${payment.receipt_no || payment.id.slice(0, 8)}.pdf`)}
                    className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800/60 hover:bg-gray-50 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700 px-4 py-2.5 rounded-xl shadow-sm transition">
                    <FileDown className="w-3.5 h-3.5" />Download PDF
                  </button>
                  <button onClick={handleSend} disabled={sending}
                    className="col-span-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800/60 hover:bg-gray-50 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700 px-4 py-2.5 rounded-xl shadow-sm transition disabled:opacity-60">
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Send receipt to owner
                  </button>
                </>
              ) : payment ? (
                <button onClick={handleMarkPaid} disabled={markBusy}
                  className="col-span-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 rounded-xl shadow-sm shadow-emerald-200 dark:shadow-none transition disabled:opacity-60">
                  {markBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}Mark as paid
                </button>
              ) : null}
              {owner?.primary_mobile && (
                <a href={`tel:${owner.primary_mobile}`}
                  className={`${isPaid || !payment ? "col-span-2" : ""} flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 px-4 py-2.5 rounded-xl transition`}>
                  <Phone className="w-3.5 h-3.5" />Call owner
                </a>
              )}
            </div>
          </div>
        );
      })()}
    </Overlay>
  );
}
