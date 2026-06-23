"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ChevronRight, ChevronLeft, ChevronRight as Next, RefreshCw,
  AlertTriangle, ShieldAlert, ShieldCheck, ShieldX,
  User, Phone, MapPin, Clock, Car, Loader2,
  AlertCircle, CheckCircle2, History, BadgeCheck, XCircle,
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

async function enrich(sessions: Session[]): Promise<Enriched[]> {
  const truckIds = [...new Set(sessions.map(s => s.truck_id))];
  const ownerIds = [...new Set(sessions.map(s => s.owner_id))];

  const [trucks, owners] = await Promise.all([
    Promise.allSettled(truckIds.map(id => apiFetch<Record<string, string>>(`/trucks/${id}`))),
    Promise.allSettled(ownerIds.map(id => apiFetch<Record<string, string>>(`/owners/${id}`))),
  ]);

  const truckMap: Record<string, Record<string, string>> = {};
  trucks.forEach((r, i) => { if (r.status === "fulfilled") truckMap[truckIds[i]] = r.value; });

  const ownerMap: Record<string, Record<string, string>> = {};
  owners.forEach((r, i) => { if (r.status === "fulfilled") ownerMap[ownerIds[i]] = r.value; });

  return Promise.all(sessions.map(async (s) => {
    const truck = truckMap[s.truck_id] ?? {};
    const owner = ownerMap[s.owner_id] ?? {};

    const [divRes, slotRes, locRes] = await Promise.allSettled([
      apiFetch<Record<string, string>>(`/divisions/${s.division_id}`),
      s.slot_id ? apiFetch<Record<string, string>>(`/slots/${s.slot_id}`) : Promise.resolve(null),
      apiFetch<Record<string, string>>(`/locations/${s.location_id}`),
    ]);

    const div = divRes.status === "fulfilled" ? divRes.value ?? {} : {};
    const slot = slotRes.status === "fulfilled" ? slotRes.value ?? null : null;
    const loc = locRes.status === "fulfilled" ? locRes.value ?? {} : {};

    return {
      ...s,
      truckNumber: truck.vehicle_number ?? truck.number ?? truck.registration_number ?? s.truck_id.slice(0, 8).toUpperCase(),
      ownerName:   owner.name ?? "—",
      ownerMobile: owner.mobile ?? owner.phone ?? "",
      divisionName: div.name ?? "—",
      slotLabel: slot ? `${div.name ?? "Div"} · ${slot.name ?? slot.number ?? "—"}` : "—",
      locationName: loc.name ?? "—",
    };
  }));
}

// ── component ─────────────────────────────────────────────────────────────────
export default function VerificationPage() {
  const [mismatches, setMismatches] = useState<Enriched[]>([]);
  const [history,    setHistory]    = useState<Enriched[]>([]);
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [approving,    setApproving]    = useState(false);
  const [approveError, setApproveError] = useState("");
  const [adminId, setAdminId] = useState<string | null>(null);

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (user) {
      try { setAdminId((JSON.parse(user) as { id?: string }).id ?? null); }
      catch { /* ignore */ }
    }
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [parkedRes, recentRes] = await Promise.all([
        apiFetch<{ list: Session[] }>("/parking-sessions?status=parked&limit=100&start=0"),
        apiFetch<{ list: Session[] }>("/parking-sessions?limit=50&start=0&sort_by=check_in_time&order=desc"),
      ]);

      const mismatchSessions = (parkedRes.list ?? []).filter(s => s.driver_match === "mismatch");
      const historySessions  = (recentRes.list ?? [])
        .filter(s => s.driver_match !== "pending")
        .sort((a, b) => {
          const ta = new Date(a.check_out_time ?? a.check_in_time).getTime();
          const tb = new Date(b.check_out_time ?? b.check_in_time).getTime();
          return tb - ta;
        })
        .slice(0, 12);

      const [enrichedM, enrichedH] = await Promise.all([
        mismatchSessions.length ? enrich(mismatchSessions) : Promise.resolve([]),
        historySessions.length  ? enrich(historySessions)  : Promise.resolve([]),
      ]);

      setMismatches(enrichedM);
      setHistory(enrichedH);
      setActiveIdx(0);
    } catch { /* silent fail — toast if needed */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => load(true), 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function handleApprove() {
    const m = mismatches[activeIdx];
    if (!m) return;
    if (!overrideNote.trim()) { setApproveError("Please enter a reason for the override."); return; }
    setApproving(true); setApproveError("");
    try {
      await apiFetch(`/parking-sessions/${m.id}`, {
        method: "PUT",
        body: JSON.stringify({
          truck_id:              m.truck_id,
          owner_id:              m.owner_id,
          location_id:           m.location_id,
          division_id:           m.division_id,
          slot_id:               m.slot_id,
          entry_type:            m.entry_type,
          checkin_driver_name:    m.checkin_driver_name,
          checkin_driver_mobile:  m.checkin_driver_mobile,
          checkin_driver_licence: m.checkin_driver_licence,
          checkin_id_proof_type:  m.checkin_id_proof_type,
          check_in_time:          m.check_in_time,
          checkin_remarks:        m.checkin_remarks,
          rate_per_day:           m.rate_per_day,
          gst_percent:            m.gst_percent,
          checkout_driver_name:   m.checkout_driver_name,
          checkout_driver_mobile: m.checkout_driver_mobile,
          check_out_time:         m.check_out_time ?? new Date().toISOString(),
          checkout_remarks:       overrideNote.trim(),
          driver_match:           "override",
          override_by:            adminId,
          status:                 "released",
          days:                   m.days     ?? 1,
          subtotal:               m.subtotal ?? m.rate_per_day,
          gst_amount:             m.gst_amount  ?? 0,
          total_amount:           m.total_amount ?? m.rate_per_day,
        }),
      });
      setOverrideNote("");
      await load(true);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to approve override.");
    } finally { setApproving(false); }
  }

  function handleKeepHold() {
    if (mismatches.length > 1) {
      setActiveIdx(i => (i + 1) % mismatches.length);
      setOverrideNote(""); setApproveError("");
    } else {
      load(true);
    }
  }

  const mismatch = mismatches[activeIdx] ?? null;

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto">
        <div className="h-6 w-48 bg-gray-100 rounded-full animate-pulse mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 font-medium">Driver Verification</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Driver Verification</h1>
          <p className="text-sm text-gray-400 mt-0.5">Verify driver identity before releasing any truck from the yard</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="self-start sm:self-auto flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Active mismatch banner ── */}
      {mismatches.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-800">
              {mismatches.length} active mismatch{mismatches.length > 1 ? "es" : ""} — {mismatches.map(m => m.truckNumber).join(", ")} on hold
            </p>
            <p className="text-xs text-red-500 mt-0.5">Owner and check-in driver have been notified automatically</p>
          </div>
          {mismatches.length > 1 && (
            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full shrink-0">
              {activeIdx + 1}/{mismatches.length}
            </span>
          )}
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: active mismatch card ── */}
        <div className="lg:col-span-2 space-y-4">
          {!mismatch ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-14 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
                <ShieldCheck className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">All clear</h2>
              <p className="text-sm text-gray-400 mt-1 max-w-xs">No active driver mismatches. All trucks in the yard have verified drivers.</p>
              <button
                onClick={() => load(true)}
                className="mt-5 flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Check again
              </button>
            </div>
          ) : (
            <>
              {/* Mismatch label + navigation */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mismatch alert — truck on hold</p>
                {mismatches.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button disabled={activeIdx === 0} onClick={() => { setActiveIdx(i => i - 1); setOverrideNote(""); setApproveError(""); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold text-gray-500 px-2">{activeIdx + 1} / {mismatches.length}</span>
                    <button disabled={activeIdx === mismatches.length - 1} onClick={() => { setActiveIdx(i => i + 1); setOverrideNote(""); setApproveError(""); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition">
                      <Next className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* EXIT BLOCKED banner */}
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl px-6 py-5 text-center">
                <p className="text-lg font-extrabold text-red-700 tracking-wide">{mismatch.truckNumber} — EXIT BLOCKED</p>
                <p className="text-sm text-red-500 mt-1">Driver at gate does not match the registered check-in driver</p>
              </div>

              {/* Driver comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                  <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-3">Registered check-in driver</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-200 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-blue-700" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-blue-900">{mismatch.checkin_driver_name}</p>
                      <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3" />{mismatch.checkin_driver_mobile}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                  <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3">Driver presented at gate</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-200 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-red-700" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-900">{mismatch.checkout_driver_name ?? "Unknown"}</p>
                      <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3" />{mismatch.checkout_driver_mobile ?? "Not provided"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Truck owner + slot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">Truck owner</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">{mismatch.ownerName}</p>
                    {mismatch.ownerMobile && (
                      <a href={`tel:${mismatch.ownerMobile}`} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-0.5 transition">
                        <Phone className="w-3 h-3" />{mismatch.ownerMobile}
                      </a>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">Location / Slot</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">{mismatch.locationName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{mismatch.slotLabel}</p>
                  </div>
                </div>
              </div>

              {/* Call action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={`tel:${mismatch.ownerMobile}`}
                  className="flex items-center justify-center gap-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold py-3.5 rounded-2xl shadow-sm shadow-amber-200 transition text-sm"
                >
                  <Phone className="w-4 h-4" />
                  Call owner
                </a>
                <a
                  href={`tel:${mismatch.checkin_driver_mobile}`}
                  className="flex items-center justify-center gap-2.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-3.5 rounded-2xl shadow-sm shadow-orange-200 transition text-sm"
                >
                  <Phone className="w-4 h-4" />
                  Call check-in driver
                </a>
              </div>

              {/* Admin override section */}
              <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Admin override</p>
                <textarea
                  value={overrideNote}
                  onChange={e => { setOverrideNote(e.target.value); setApproveError(""); }}
                  rows={3}
                  placeholder="Enter reason for override and admin confirmation code…"
                  className="w-full px-3.5 py-3 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition resize-none"
                />
                {approveError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-700">{approveError}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300 text-white font-bold py-3.5 rounded-2xl shadow-sm shadow-emerald-200 transition text-sm"
                  >
                    {approving ? <><Loader2 className="w-4 h-4 animate-spin" />Approving…</> : <><BadgeCheck className="w-4 h-4" />Approve &amp; checkout</>}
                  </button>
                  <button
                    onClick={handleKeepHold}
                    disabled={approving}
                    className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 text-white font-bold py-3.5 rounded-2xl shadow-sm shadow-red-200 transition text-sm"
                  >
                    <ShieldX className="w-4 h-4" />
                    Keep hold
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Right: Verification history ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center">
                <History className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-sm font-bold text-gray-900">Verification history</p>
            </div>
            {refreshing && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {history.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No verification history yet</p>
              </div>
            ) : history.map(h => (
              <HistoryRow key={h.id} item={h} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── history row ───────────────────────────────────────────────────────────────
function HistoryRow({ item }: { item: Enriched }) {
  const cfg = {
    match:    { dot: "bg-emerald-500", icon: ShieldCheck, iconCls: "text-emerald-600", label: "Matched",          labelCls: "text-emerald-700 bg-emerald-50 border-emerald-100" },
    mismatch: { dot: "bg-red-500",     icon: ShieldAlert, iconCls: "text-red-600",     label: "Mismatch",         labelCls: "text-red-700 bg-red-50 border-red-100" },
    override: { dot: "bg-amber-500",   icon: BadgeCheck,  iconCls: "text-amber-600",   label: "Override approved",labelCls: "text-amber-700 bg-amber-50 border-amber-100" },
    pending:  { dot: "bg-gray-300",    icon: Clock,       iconCls: "text-gray-400",    label: "Pending",          labelCls: "text-gray-500 bg-gray-50 border-gray-200" },
  } as const;

  const key   = (item.driver_match as keyof typeof cfg) in cfg ? (item.driver_match as keyof typeof cfg) : "pending";
  const c     = cfg[key];
  const Icon  = c.icon;
  const ts    = fmtTime(item.check_out_time ?? item.check_in_time);
  const driver = item.checkout_driver_name ?? item.checkin_driver_name;

  return (
    <div className="flex items-start gap-3 px-5 py-4 hover:bg-gray-50/60 transition-colors">
      <div className="flex flex-col items-center pt-1 shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
        <div className="w-px flex-1 bg-gray-100 mt-1.5" style={{ minHeight: 20 }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">{ts}</p>
            <p className="text-sm font-bold text-gray-900 leading-tight">
              {item.truckNumber}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
              <User className="w-3 h-3 shrink-0" />{driver}
            </p>
          </div>
          <div className="shrink-0 text-right space-y-1">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${c.labelCls}`}>
              <Icon className={`w-3 h-3 ${c.iconCls}`} />
              {c.label}
            </span>
            {item.status === "released" && (
              <span className="block text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full text-center">
                Released
              </span>
            )}
            {item.driver_match === "mismatch" && item.status !== "released" && (
              <span className="block text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full text-center">
                On hold
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
