"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ChevronRight, ChevronLeft, ChevronRight as Next, ChevronUp, ChevronDown, RefreshCw,
  AlertTriangle, ShieldAlert, ShieldCheck, ShieldX,
  User, Phone, MapPin, Clock, Loader2,
  AlertCircle, BadgeCheck, Search, Download, Eye, Truck,
} from "lucide-react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  createColumnHelper, flexRender,
} from "@tanstack/react-table";
import type { SortingState, PaginationState } from "@tanstack/react-table";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Overlay } from "@/components/ui/Overlay";

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

// ── types ────────────────────────────────────────────────────────────────────
interface Session {
  id: string;
  truck_id: string;
  owner_id: string;
  location_id: string;
  division_id: string;
  slot_id: string | null;
  status: string;
  driver_match: string;
  checkin_driver_name: string;
  checkin_driver_mobile: string;
  checkout_driver_name: string | null;
  checkout_driver_mobile: string | null;
  check_in_time: string;
  check_out_time: string | null;
  rate_per_day: number;
  gst_percent: number;
  days: number | null;
  subtotal: number | null;
  gst_amount: number | null;
  total_amount: number | null;
  checkin_remarks: string | null;
  checkout_remarks: string | null;
  checkin_driver_licence: string | null;
  checkin_id_proof_type: string | null;
  entry_type: string;
  override_by: string | null;
}

interface Enriched extends Session {
  truckNumber: string;
  ownerName: string;
  ownerMobile: string;
  divisionName: string;
  slotLabel: string;
  locationName: string;
  verifiedByName: string | null;
}

type DateFilter = "today" | "yesterday" | "7days" | "custom";
type StatusFilter = "all" | "match" | "mismatch" | "override" | "pending";

// ── status config (shared by table, mobile cards, CSV, drawer) ───────────────
const STATUS_CFG = {
  match:    { icon: ShieldCheck, label: "Matched",           color: "emerald" as const },
  mismatch: { icon: ShieldAlert, label: "Mismatch",          color: "red" as const },
  override: { icon: BadgeCheck,  label: "Override approved", color: "amber" as const },
  pending:  { icon: Clock,       label: "Pending",           color: "gray" as const },
};

function statusOf(value: string): keyof typeof STATUS_CFG {
  return (value as keyof typeof STATUS_CFG) in STATUS_CFG ? (value as keyof typeof STATUS_CFG) : "pending";
}

function StatusBadge({ value }: { value: string }) {
  const c = STATUS_CFG[statusOf(value)];
  const Icon = c.icon;
  return (
    <Badge color={c.color} className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );
}

function ReleasedBadge({ item }: { item: Enriched }) {
  if (item.status === "released") return <Badge color="emerald">Released</Badge>;
  if (item.driver_match === "mismatch") return <Badge color="red">On hold</Badge>;
  return <span className="text-xs text-gray-400 dark:text-slate-500">In yard</span>;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  if (isToday)     return `${time} today`;
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${time}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function matchesDateFilter(iso: string | null, filter: DateFilter, customFrom: string, customTo: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  if (filter === "today") return isSameDay(d, now);
  if (filter === "yesterday") {
    const y = new Date(now); y.setDate(now.getDate() - 1);
    return isSameDay(d, y);
  }
  if (filter === "7days") {
    const from = new Date(now); from.setDate(now.getDate() - 7); from.setHours(0, 0, 0, 0);
    return d.getTime() >= from.getTime();
  }
  // custom
  if (!customFrom && !customTo) return true;
  const t = d.getTime();
  if (customFrom && t < new Date(customFrom).setHours(0, 0, 0, 0)) return false;
  if (customTo && t > new Date(customTo).setHours(23, 59, 59, 999)) return false;
  return true;
}

function mapById<T>(ids: string[], results: PromiseSettledResult<T>[]): Record<string, T> {
  const map: Record<string, T> = {};
  results.forEach((r, i) => { if (r.status === "fulfilled") map[ids[i]] = r.value; });
  return map;
}

async function enrich(sessions: Session[]): Promise<Enriched[]> {
  const truckIds      = [...new Set(sessions.map(s => s.truck_id))];
  const ownerIds       = [...new Set(sessions.map(s => s.owner_id))];
  const divisionIds    = [...new Set(sessions.map(s => s.division_id))];
  const slotIds        = [...new Set(sessions.map(s => s.slot_id).filter((id): id is string => !!id))];
  const locationIds    = [...new Set(sessions.map(s => s.location_id))];
  const overrideByIds  = [...new Set(sessions.map(s => s.override_by).filter((id): id is string => !!id))];

  const [trucks, owners, divisions, slots, locations, overrideUsers] = await Promise.all([
    Promise.allSettled(truckIds.map(id => apiFetch<Record<string, string>>(`/trucks/${id}`))),
    Promise.allSettled(ownerIds.map(id => apiFetch<Record<string, string>>(`/owners/${id}`))),
    Promise.allSettled(divisionIds.map(id => apiFetch<Record<string, string>>(`/divisions/${id}`))),
    Promise.allSettled(slotIds.map(id => apiFetch<Record<string, string>>(`/slots/${id}`))),
    Promise.allSettled(locationIds.map(id => apiFetch<Record<string, string>>(`/locations/${id}`))),
    Promise.allSettled(overrideByIds.map(id => apiFetch<Record<string, string>>(`/users/${id}`))),
  ]);

  const truckMap        = mapById(truckIds, trucks);
  const ownerMap         = mapById(ownerIds, owners);
  const divisionMap      = mapById(divisionIds, divisions);
  const slotMap          = mapById(slotIds, slots);
  const locationMap      = mapById(locationIds, locations);
  const overrideUserMap  = mapById(overrideByIds, overrideUsers);

  return sessions.map((s) => {
    const truck = truckMap[s.truck_id] ?? {};
    const owner = ownerMap[s.owner_id] ?? {};
    const div   = divisionMap[s.division_id] ?? {};
    const slot  = s.slot_id ? slotMap[s.slot_id] ?? null : null;
    const loc   = locationMap[s.location_id] ?? {};
    const overrideUser = s.override_by ? overrideUserMap[s.override_by] : undefined;

    return {
      ...s,
      truckNumber: truck.truck_number ?? truck.vehicle_number ?? truck.number ?? s.truck_id.slice(0, 8).toUpperCase(),
      ownerName:   owner.name ?? "—",
      ownerMobile: owner.primary_mobile ?? owner.mobile ?? owner.phone ?? "",
      divisionName: div.name ?? "—",
      slotLabel: slot ? `${div.name ?? "Div"} · ${slot.name ?? slot.number ?? "—"}` : "—",
      locationName: loc.name ?? "—",
      verifiedByName: overrideUser
        ? (overrideUser.name ?? overrideUser.full_name ?? overrideUser.username ?? overrideUser.email ?? "Admin")
        : null,
    };
  });
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function exportCsv(rows: Enriched[]) {
  const headers = ["Time", "Truck", "Driver", "Status", "Released", "Verified By", "Override Note"];
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    const driver = r.checkout_driver_name ?? r.checkin_driver_name ?? "";
    const status = STATUS_CFG[statusOf(r.driver_match)].label;
    const released = r.status === "released" ? "Released" : r.driver_match === "mismatch" ? "On hold" : "In yard";
    const note = r.driver_match === "override" ? r.checkout_remarks ?? "" : "";
    lines.push(
      [fmtTime(r.check_out_time ?? r.check_in_time), r.truckNumber, driver, status, released, r.verifiedByName ?? "", note]
        .map(v => csvCell(String(v)))
        .join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `driver-verification-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── stat card ──────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, iconBg, iconColor, label, value }: {
  icon: React.ElementType; iconBg: string; iconColor: string; label: string; value: number;
}) {
  return (
    <GlassCard className="p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{label}</p>
      </div>
    </GlassCard>
  );
}

// ── mismatch review (verbatim existing resolution flow, moved into a modal) ──
function MismatchReview({
  mismatch, mismatches, activeIdx, setActiveIdx,
  overrideNote, setOverrideNote, approving, approveError, setApproveError,
  onApprove, onKeepHold,
}: {
  mismatch: Enriched;
  mismatches: Enriched[];
  activeIdx: number;
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
  overrideNote: string;
  setOverrideNote: (v: string) => void;
  approving: boolean;
  approveError: string;
  setApproveError: (v: string) => void;
  onApprove: () => void;
  onKeepHold: () => void;
}) {
  return (
    <div className="space-y-4">
      {mismatches.length > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Mismatch alert — truck on hold</p>
          <div className="flex items-center gap-1">
            <button disabled={activeIdx === 0} onClick={() => { setActiveIdx(i => i - 1); setOverrideNote(""); setApproveError(""); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 px-2">{activeIdx + 1} / {mismatches.length}</span>
            <button disabled={activeIdx === mismatches.length - 1} onClick={() => { setActiveIdx(i => i + 1); setOverrideNote(""); setApproveError(""); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 transition">
              <Next className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-red-50 dark:bg-red-500/10 border-2 border-red-200 dark:border-red-500/30 rounded-2xl px-6 py-5 text-center">
        <p className="text-lg font-extrabold text-red-700 dark:text-red-400 tracking-wide">{mismatch.truckNumber} — EXIT BLOCKED</p>
        <p className="text-sm text-red-500 dark:text-red-400/80 mt-1">Driver at gate does not match the registered check-in driver</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-5">
          <p className="text-xs font-bold text-blue-500 dark:text-blue-300 uppercase tracking-wider mb-3">Registered check-in driver</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-200 dark:bg-blue-500/25 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-900 dark:text-blue-200">{mismatch.checkin_driver_name}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                <Phone className="w-3 h-3" />{mismatch.checkin_driver_mobile}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-5">
          <p className="text-xs font-bold text-red-500 dark:text-red-300 uppercase tracking-wider mb-3">Driver presented at gate</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-200 dark:bg-red-500/25 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-red-700 dark:text-red-300" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-900 dark:text-red-200">{mismatch.checkout_driver_name ?? "Unknown"}</p>
              <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 flex items-center gap-1">
                <Phone className="w-3 h-3" />{mismatch.checkout_driver_mobile ?? "Not provided"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700 shadow-sm rounded-2xl p-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-gray-500 dark:text-slate-300" />
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">Truck owner</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{mismatch.ownerName}</p>
            {mismatch.ownerMobile && (
              <a href={`tel:${mismatch.ownerMobile}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 flex items-center gap-1 mt-0.5 transition">
                <Phone className="w-3 h-3" />{mismatch.ownerMobile}
              </a>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700 shadow-sm rounded-2xl p-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-gray-500 dark:text-slate-300" />
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">Location / Slot</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{mismatch.locationName}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{mismatch.slotLabel}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={`tel:${mismatch.ownerMobile}`}
          className="flex items-center justify-center gap-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold py-3.5 rounded-2xl shadow-sm shadow-amber-200 dark:shadow-none transition text-sm"
        >
          <Phone className="w-4 h-4" />
          Call owner
        </a>
        <a
          href={`tel:${mismatch.checkin_driver_mobile}`}
          className="flex items-center justify-center gap-2.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-3.5 rounded-2xl shadow-sm shadow-orange-200 dark:shadow-none transition text-sm"
        >
          <Phone className="w-4 h-4" />
          Call check-in driver
        </a>
      </div>

      <div className="bg-white dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700 shadow-sm rounded-2xl p-5 space-y-3">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Admin override</p>
        <textarea
          value={overrideNote}
          onChange={e => { setOverrideNote(e.target.value); setApproveError(""); }}
          rows={3}
          placeholder="Enter reason for override and admin confirmation code…"
          className="w-full px-3.5 py-3 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
        />
        {approveError && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-3.5 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{approveError}</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={onApprove}
            disabled={approving}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300 text-white font-bold py-3.5 rounded-2xl shadow-sm shadow-emerald-200 dark:shadow-none transition text-sm"
          >
            {approving ? <><Loader2 className="w-4 h-4 animate-spin" />Approving…</> : <><BadgeCheck className="w-4 h-4" />Approve &amp; checkout</>}
          </button>
          <button
            onClick={onKeepHold}
            disabled={approving}
            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 text-white font-bold py-3.5 rounded-2xl shadow-sm shadow-red-200 dark:shadow-none transition text-sm"
          >
            <ShieldX className="w-4 h-4" />
            Keep hold
          </button>
        </div>
      </div>
    </div>
  );
}

// ── detail drawer content ────────────────────────────────────────────────────
function DetailDrawer({ item }: { item: Enriched }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Status</p>
        <div className="flex items-center gap-2">
          <StatusBadge value={item.driver_match} />
          <ReleasedBadge item={item} />
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-slate-800/60 rounded-2xl p-4">
        <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Truck</p>
        <p className="text-sm font-bold font-mono text-gray-900 dark:text-white">{item.truckNumber}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{item.locationName} · {item.slotLabel}</p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Owner: {item.ownerName}{item.ownerMobile ? ` · ${item.ownerMobile}` : ""}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 dark:bg-slate-800/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Avatar name={item.checkin_driver_name} />
            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Check-in driver</p>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.checkin_driver_name}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{item.checkin_driver_mobile}</p>
        </div>
        <div className="bg-gray-50 dark:bg-slate-800/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Avatar name={item.checkout_driver_name ?? "—"} />
            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Check-out driver</p>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.checkout_driver_name ?? "—"}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{item.checkout_driver_mobile ?? "—"}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Timeline</p>
        <div className="space-y-3 pl-1">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm text-gray-900 dark:text-white font-medium">Checked in</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{fmtTime(item.check_in_time)}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.check_out_time ? "bg-emerald-500" : "bg-gray-300 dark:bg-slate-700"}`} />
            <div>
              <p className="text-sm text-gray-900 dark:text-white font-medium">{item.status === "released" ? "Released" : "Checked out"}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{item.check_out_time ? fmtTime(item.check_out_time) : "Still in yard"}</p>
            </div>
          </div>
        </div>
      </div>

      {item.driver_match === "override" && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5">Override note</p>
          <p className="text-sm text-amber-900 dark:text-amber-200">{item.checkout_remarks || "No note provided"}</p>
          <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-2">Approved by {item.verifiedByName ?? "Admin"}</p>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────
export default function VerificationPage() {
  const router = useRouter();

  // Safety-critical mismatch flow — unchanged logic, own 30s poll
  const [mismatches, setMismatches] = useState<Enriched[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [overrideNote, setOverrideNote] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [adminId, setAdminId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Table dataset — separate fetch, manual refresh only
  const [tableRows, setTableRows] = useState<Enriched[]>([]);
  const [drawerRow, setDrawerRow] = useState<Enriched | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("7days");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [sorting, setSorting] = useState<SortingState>([{ id: "time", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (user) {
      try { setAdminId((JSON.parse(user) as { id?: string }).id ?? null); }
      catch { /* ignore */ }
    }
  }, []);

  const loadMismatches = useCallback(async () => {
    try {
      const parkedRes = await apiFetch<{ list: Session[] }>("/parking-sessions?status=parked&limit=100&start=0");
      const list = parkedRes.list ?? [];
      const mismatchSessions = list.filter(s => s.driver_match === "mismatch");
      setPendingCount(list.filter(s => s.driver_match === "pending").length);
      const enrichedM = mismatchSessions.length ? await enrich(mismatchSessions) : [];
      setMismatches(enrichedM);
      setActiveIdx(i => Math.min(i, Math.max(enrichedM.length - 1, 0)));
    } catch { /* silent fail */ }
  }, []);

  const loadTable = useCallback(async () => {
    try {
      const recentRes = await apiFetch<{ list: Session[] }>("/parking-sessions?limit=300&start=0&sort_by=check_in_time&order=desc");
      const sessions = (recentRes.list ?? [])
        .filter(s => s.driver_match !== "pending")
        .sort((a, b) => {
          const ta = new Date(a.check_out_time ?? a.check_in_time).getTime();
          const tb = new Date(b.check_out_time ?? b.check_in_time).getTime();
          return tb - ta;
        });
      const enriched = sessions.length ? await enrich(sessions) : [];
      setTableRows(enriched);
    } catch { /* silent fail */ }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.allSettled([loadMismatches(), loadTable()]);
      setLoading(false);
    })();
  }, [loadMismatches, loadTable]);

  // Auto-refresh: mismatch flow only — the safety-critical path, kept fast and cheap.
  useEffect(() => {
    const t = setInterval(() => loadMismatches(), 30_000);
    return () => clearInterval(t);
  }, [loadMismatches]);

  // Auto-close the review modal once every mismatch is resolved.
  useEffect(() => {
    if (mismatches.length === 0) setReviewOpen(false);
  }, [mismatches.length]);

  async function handleRefreshAll() {
    setRefreshing(true);
    await Promise.allSettled([loadMismatches(), loadTable()]);
    setRefreshing(false);
  }

  async function handleApprove() {
    const m = mismatches[activeIdx];
    if (!m) return;
    if (!overrideNote.trim()) { setApproveError("Please enter a reason for the override."); return; }
    setApproving(true); setApproveError("");
    try {
      // Mark as admin-override approved (keep parked — payment happens on checkout page)
      await apiFetch(`/parking-sessions/${m.id}`, {
        method: "PUT",
        body: JSON.stringify({
          truck_id:               m.truck_id,
          owner_id:               m.owner_id,
          location_id:            m.location_id,
          division_id:            m.division_id,
          slot_id:                m.slot_id,
          entry_type:             m.entry_type,
          checkin_driver_name:    m.checkin_driver_name,
          checkin_driver_mobile:  m.checkin_driver_mobile,
          checkin_driver_licence: m.checkin_driver_licence,
          checkin_id_proof_type:  m.checkin_id_proof_type,
          check_in_time:          m.check_in_time,
          checkin_remarks:        m.checkin_remarks,
          checkout_driver_name:   m.checkout_driver_name,
          checkout_driver_mobile: m.checkout_driver_mobile,
          checkout_remarks:       overrideNote.trim(),
          driver_match:           "override",
          override_by:            adminId,
          status:                 "parked",
          rate_per_day:           m.rate_per_day,
          gst_percent:            m.gst_percent,
          days:                   m.days,
          subtotal:               m.subtotal,
          gst_amount:             m.gst_amount,
          total_amount:           m.total_amount,
        }),
      });
      // Redirect to checkout page — payment + final release happens there
      router.push(`/dashboard/check-out?truck=${encodeURIComponent(m.truckNumber)}`);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to approve override.");
      setApproving(false);
    }
  }

  function handleKeepHold() {
    if (mismatches.length > 1) {
      setActiveIdx(i => (i + 1) % mismatches.length);
      setOverrideNote(""); setApproveError("");
    } else {
      loadMismatches();
    }
  }

  const mismatch = mismatches[activeIdx] ?? null;

  // ── filtering + stats (client-side, over the fetched table window) ─────────
  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tableRows.filter(r => {
      const ts = r.check_out_time ?? r.check_in_time;
      if (!matchesDateFilter(ts, dateFilter, customFrom, customTo)) return false;
      if (statusFilter !== "all" && r.driver_match !== statusFilter) return false;
      if (q) {
        const driver = (r.checkout_driver_name ?? r.checkin_driver_name ?? "").toLowerCase();
        if (!`${r.truckNumber} ${driver}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tableRows, search, dateFilter, statusFilter, customFrom, customTo]);

  const stats = useMemo(() => {
    const now = new Date();
    const verifiedToday = tableRows.filter(r => {
      if (r.driver_match !== "match" && r.driver_match !== "override") return false;
      const ts = r.check_out_time ?? r.check_in_time;
      return ts ? isSameDay(new Date(ts), now) : false;
    }).length;
    const overrideApproved = tableRows.filter(r => r.driver_match === "override").length;
    const releasedToday = tableRows.filter(r => r.status === "released" && r.check_out_time && isSameDay(new Date(r.check_out_time), now)).length;
    return { verifiedToday, overrideApproved, releasedToday };
  }, [tableRows]);

  // ── table columns ────────────────────────────────────────────────────────────
  const columnHelper = useMemo(() => createColumnHelper<Enriched>(), []);
  const columns = useMemo(() => [
    columnHelper.accessor(row => new Date(row.check_out_time ?? row.check_in_time).getTime(), {
      id: "time",
      header: "Time",
      cell: info => (
        <span className="text-gray-500 dark:text-slate-400 text-xs whitespace-nowrap">
          {fmtTime(info.row.original.check_out_time ?? info.row.original.check_in_time)}
        </span>
      ),
    }),
    columnHelper.accessor("truckNumber", {
      header: "Truck",
      cell: info => <span className="font-mono font-bold text-gray-900 dark:text-white text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor(row => row.checkout_driver_name ?? row.checkin_driver_name, {
      id: "driver",
      header: "Driver",
      cell: info => {
        const name = info.getValue();
        return (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={name} />
            <span className="text-sm text-gray-700 dark:text-slate-300 truncate">{name}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("driver_match", {
      header: "Status",
      cell: info => <StatusBadge value={info.getValue()} />,
    }),
    columnHelper.display({
      id: "released",
      header: "Released",
      cell: info => <ReleasedBadge item={info.row.original} />,
    }),
    columnHelper.accessor("verifiedByName", {
      header: "Verified By",
      cell: info => <span className="text-sm text-gray-600 dark:text-slate-400">{info.getValue() ?? "—"}</span>,
    }),
    columnHelper.accessor("checkout_remarks", {
      id: "overrideNote",
      header: "Override Note",
      cell: info => (
        info.row.original.driver_match === "override" && info.getValue()
          ? <span className="text-xs text-gray-500 dark:text-slate-400 truncate block max-w-[180px]">{info.getValue()}</span>
          : <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: info => (
        <button
          onClick={() => setDrawerRow(info.row.original)}
          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 px-2.5 py-1.5 rounded-lg transition"
        >
          <Eye className="w-3 h-3" /> View
        </button>
      ),
    }),
  ], [columnHelper]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (loading) {
    return (
      <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-4">
        <div className="h-8 w-64 bg-gray-100 dark:bg-slate-800 rounded-full animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 dark:bg-slate-800 rounded-3xl animate-pulse" />)}
        </div>
        <div className="h-96 bg-gray-100 dark:bg-slate-800 rounded-3xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500 mb-2">
            <Link href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 dark:text-slate-300 font-medium">Driver Verification</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Driver Verification</h1>
            {mismatches.length === 0 && (
              <Badge color="emerald" className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> All Drivers Verified
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">Verify driver identity before releasing any truck from the yard</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search truck, driver…"
              className="pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 sm:w-52"
            />
          </div>

          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as DateFilter)}
            className="text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7days">Last 7 Days</option>
            <option value="custom">Custom</option>
          </select>

          {dateFilter === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 px-2.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 px-2.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </>
          )}

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All statuses</option>
            <option value="match">Matched</option>
            <option value="mismatch">Mismatch</option>
            <option value="override">Override approved</option>
            <option value="pending">Pending</option>
          </select>

          <button
            onClick={() => exportCsv(filteredData)}
            className="flex items-center gap-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <Download className="w-4 h-4" /> Export
          </button>

          <button
            onClick={handleRefreshAll}
            disabled={refreshing}
            className="flex items-center gap-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Compact mismatch alert ── */}
      {mismatches.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="w-8 h-8 bg-red-100 dark:bg-red-500/20 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-800 dark:text-red-300">
              {mismatches.length} Driver Verification{mismatches.length > 1 ? "s" : ""} Require Attention
            </p>
            <p className="text-xs text-red-500 dark:text-red-400/80 mt-0.5 truncate">
              {mismatches.map(m => m.truckNumber).join(", ")} on hold — owner and check-in driver notified automatically
            </p>
          </div>
          <button
            onClick={() => setReviewOpen(true)}
            className="shrink-0 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition"
          >
            Review Now
          </button>
        </motion.div>
      )}

      {/* ── Stats row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={ShieldCheck} iconBg="bg-emerald-100 dark:bg-emerald-500/15" iconColor="text-emerald-600" label="Verified Today" value={stats.verifiedToday} />
        <StatCard icon={AlertTriangle} iconBg="bg-amber-100 dark:bg-amber-500/15" iconColor="text-amber-600" label="Pending Verification" value={pendingCount} />
        <StatCard icon={BadgeCheck} iconBg="bg-orange-100 dark:bg-orange-500/15" iconColor="text-orange-600" label="Override Approved" value={stats.overrideApproved} />
        <StatCard icon={Truck} iconBg="bg-indigo-100 dark:bg-indigo-500/15" iconColor="text-indigo-600" label="Released Today" value={stats.releasedToday} />
      </div>

      {/* ── Verification log table ── */}
      <GlassCard className="overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/40">
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none"
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" && <ChevronUp className="w-3 h-3" />}
                        {header.column.getIsSorted() === "desc" && <ChevronDown className="w-3 h-3" />}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
              {table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors ${i % 2 === 1 ? "bg-gray-50/30 dark:bg-slate-800/20" : ""}`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-5 py-3.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-14 text-center text-gray-400 dark:text-slate-500">
                    No records match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile fallback */}
        <div className="md:hidden divide-y divide-gray-50 dark:divide-slate-800">
          {table.getRowModel().rows.map(row => {
            const r = row.original;
            const driver = r.checkout_driver_name ?? r.checkin_driver_name;
            return (
              <div key={row.id} className="px-4 py-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400 dark:text-slate-500">{fmtTime(r.check_out_time ?? r.check_in_time)}</p>
                  <p className="text-sm font-bold font-mono text-gray-900 dark:text-white mt-0.5">{r.truckNumber}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Avatar name={driver} />
                    <span className="text-xs text-gray-600 dark:text-slate-300 truncate">{driver}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <StatusBadge value={r.driver_match} />
                    <ReleasedBadge item={r} />
                  </div>
                </div>
                <button
                  onClick={() => setDrawerRow(r)}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1.5 rounded-lg transition"
                >
                  <Eye className="w-3 h-3" /> View
                </button>
              </div>
            );
          })}
          {table.getRowModel().rows.length === 0 && (
            <div className="px-5 py-14 text-center text-gray-400 dark:text-slate-500 text-sm">No records match your filters</div>
          )}
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-slate-800">
          <p className="text-xs text-gray-400 dark:text-slate-500">
            {filteredData.length} record{filteredData.length !== 1 ? "s" : ""} · Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <Next className="w-4 h-4" />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* ── Mismatch review modal ── */}
      <Overlay open={reviewOpen && !!mismatch} onClose={() => setReviewOpen(false)} variant="modal" widthClass="max-w-2xl" title="Mismatch Review">
        {mismatch && (
          <MismatchReview
            mismatch={mismatch}
            mismatches={mismatches}
            activeIdx={activeIdx}
            setActiveIdx={setActiveIdx}
            overrideNote={overrideNote}
            setOverrideNote={setOverrideNote}
            approving={approving}
            approveError={approveError}
            setApproveError={setApproveError}
            onApprove={handleApprove}
            onKeepHold={handleKeepHold}
          />
        )}
      </Overlay>

      {/* ── Row detail drawer ── */}
      <Overlay open={!!drawerRow} onClose={() => setDrawerRow(null)} variant="drawer" title="Verification Details">
        {drawerRow && <DetailDrawer item={drawerRow} />}
      </Overlay>
    </div>
  );
}
