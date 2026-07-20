"use client";

import { useState, useEffect, Suspense } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Truck as TruckIcon, User, Clock, Search, Check,
  AlertCircle, Loader2, CheckCircle2, ChevronRight,
  IndianRupee, MapPin, Calendar, ShieldCheck, ShieldAlert, ShieldX,
  Banknote, CreditCard, Smartphone, Receipt, BookOpen, Zap, Info, X as XIcon,
} from "lucide-react";

import { handleUnauthorized } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function getToken(): string {
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
  return res.json() as Promise<T>;
}

// ── types ─────────────────────────────────────────────────────────────────────
interface TruckItem { id: string; truck_number: string; truck_type: string; owner_id: string | null }
interface OwnerItem { id: string; name: string; primary_mobile: string; company: string | null }
interface DivItem   { id: string; name: string; rate_per_day: number; gst_percent: number | null; relaxation_hours?: number | null }
interface SlotItem  { id: string; code: string }
interface LocItem   { id: string; name: string; city: string | null }
interface SessionItem {
  id: string; truck_id: string; owner_id: string; location_id: string; division_id: string;
  slot_id: string | null; entry_type: string;
  checkin_driver_name: string; checkin_driver_mobile: string;
  checkin_driver_licence: string | null; checkin_id_proof_type: string | null;
  checkout_driver_name: string | null; checkout_driver_mobile: string | null;
  check_in_time: string | null; checkin_remarks: string | null;
  rate_per_day: number; gst_percent: number; status: string;
  driver_match: string | null; override_by: string | null;
  days: number | null; subtotal: number | null;
  gst_amount: number | null; total_amount: number | null;
}

interface TruckKhataBill {
  truck_id: string; truck_number: string; khata_id: string;
  billing_day: number; period_start: string;
  session_count: number; total_days: number; total_amount: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function normMobile(m: string): string {
  const digits = (m ?? "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function billableDays(checkInTime: string | null, relaxHours = 0): number {
  if (!checkInTime) return 1;
  const ms = Date.now() - new Date(checkInTime).getTime();
  const dayWindowMs = (86_400 + relaxHours * 3_600) * 1_000;
  return Math.max(1, Math.ceil(ms / dayWindowMs));
}

function durationLabel(checkInTime: string | null): string {
  if (!checkInTime) return "—";
  const ms = Math.max(0, Date.now() - new Date(checkInTime).getTime());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

const STEPS = [
  { n: 1, label: "Search"       },
  { n: 2, label: "Verify driver"},
  { n: 3, label: "Final bill"   },
  { n: 4, label: "Release"      },
];

// ── page ──────────────────────────────────────────────────────────────────────
export default function CheckOutPage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-center text-sm text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…</div>}>
      <CheckOutPageContent />
    </Suspense>
  );
}

function CheckOutPageContent() {
  const router = useRouter();

  // search
  const [searchNumber, setSearchNumber] = useState("");
  const [searching,    setSearching]    = useState(false);
  const [searchError,  setSearchError]  = useState("");

  // loaded data
  const [session,  setSession]  = useState<SessionItem | null>(null);
  const [truck,    setTruck]    = useState<TruckItem | null>(null);
  const [owner,    setOwner]    = useState<OwnerItem | null>(null);
  const [division, setDivision] = useState<DivItem | null>(null);
  const [slot,     setSlot]     = useState<SlotItem | null>(null);
  const [location, setLocation] = useState<LocItem | null>(null);

  // checkout form
  const [coDriverName,   setCoDriverName]   = useState("");
  const [coDriverMobile, setCoDriverMobile] = useState("+91");
  const [driverMatch,    setDriverMatch]    = useState<"match" | "mismatch" | null>(null);
  const [payMethod,      setPayMethod]      = useState<"cash" | "card" | "upi">("cash");
  const [amtReceived,    setAmtReceived]    = useState("");
  const [coRemarks,      setCoRemarks]      = useState("");

  // system relaxation hours
  const [sysRelaxHours, setSysRelaxHours] = useState(0);

  // khata bill
  const [khataBill,        setKhataBill]        = useState<TruckKhataBill | null>(null);
  const [khataBillLoading, setKhataBillLoading] = useState(false);

  // submit
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done,        setDone]        = useState<{ sessionId: string; total: number } | null>(null);
  const [flagging,        setFlagging]        = useState(false);
  const [mismatchError,   setMismatchError]   = useState("");
  const [showBlacklisted, setShowBlacklisted] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");

  // force checkout
  const [showForceModal,     setShowForceModal]     = useState(false);
  const [forceSessions,      setForceSessions]      = useState<SessionItem[]>([]);
  const [forceLoading,       setForceLoading]       = useState(false);
  const [forceSelected,      setForceSelected]      = useState<SessionItem | null>(null);
  const [forceReason,        setForceReason]        = useState("");
  const [forceBusy,          setForceBusy]          = useState(false);
  const [forceErr,           setForceErr]           = useState("");

  // fetch global relaxation hours on mount
  useEffect(() => {
    apiFetch<{ relaxation_hours: number }>("/system-preferences")
      .then(p => setSysRelaxHours(p.relaxation_hours ?? 0))
      .catch(() => {});
  }, []);

  // live duration tick
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [session]);

  // auto-search when ?truck= param present
  const searchParams = useSearchParams();
  useEffect(() => {
    const t = searchParams.get("truck");
    if (!t) return;
    setSearchNumber(t);
    handleSearch(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pre-fill amount received when session first loads
  useEffect(() => {
    if (!session) return;
    const d   = billableDays(session.check_in_time, sysRelaxHours);
    const sub = d * session.rate_per_day;
    const gst = Math.round(sub * session.gst_percent / 100 * 100) / 100;
    setAmtReceived(String(Math.ceil(sub + gst)));
  }, [session]);

  // computed billing (live — re-derived on tick)
  const days     = billableDays(session?.check_in_time ?? null, sysRelaxHours);
  const rate     = session?.rate_per_day ?? 0;
  const gstPct   = session?.gst_percent ?? 18;
  const subtotal = days * rate;
  const gstAmt   = Math.round(subtotal * gstPct / 100 * 100) / 100;
  const totalAmt = subtotal + gstAmt;
  const received = parseFloat(amtReceived) || 0;
  const changeDue = Math.max(0, received - totalAmt);

  // ── force checkout ──────────────────────────────────────────────────────────
  async function openForceCheckout() {
    if (!truck) return;
    setForceLoading(true); setForceErr(""); setForceSelected(null); setForceReason("");
    setShowForceModal(true);
    try {
      const res = await apiFetch<{ count: number; list: SessionItem[] }>(
        `/parking-sessions?truck_id=${truck.id}&limit=5&sort_by=created_at&order=desc`
      );
      setForceSessions(res.list ?? []);
      if (res.list?.length) setForceSelected(res.list[0]);
    } catch { setForceErr("Could not load sessions for this truck."); }
    finally { setForceLoading(false); }
  }

  async function submitForceCheckout() {
    if (!forceSelected) { setForceErr("Select a session to force-close."); return; }
    setForceBusy(true); setForceErr("");
    try {
      const nowISO   = new Date().toISOString();
      const finalDays = billableDays(forceSelected.check_in_time, sysRelaxHours);
      const finalSub   = finalDays * forceSelected.rate_per_day;
      const finalGst   = Math.round(finalSub * forceSelected.gst_percent / 100 * 100) / 100;
      const finalTotal = finalSub + finalGst;
      await apiFetch(`/parking-sessions/${forceSelected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          truck_id:               forceSelected.truck_id,
          owner_id:               forceSelected.owner_id,
          location_id:            forceSelected.location_id,
          division_id:            forceSelected.division_id,
          slot_id:                forceSelected.slot_id,
          entry_type:             forceSelected.entry_type,
          checkin_driver_name:    forceSelected.checkin_driver_name,
          checkin_driver_mobile:  forceSelected.checkin_driver_mobile,
          checkin_driver_licence: forceSelected.checkin_driver_licence,
          checkin_id_proof_type:  forceSelected.checkin_id_proof_type,
          check_in_time:          forceSelected.check_in_time,
          checkin_remarks:        forceSelected.checkin_remarks,
          checkout_driver_name:   "Force checkout",
          checkout_driver_mobile: forceSelected.checkin_driver_mobile,
          driver_match:           "match",
          check_out_time:         nowISO,
          checkout_remarks:       forceReason.trim() || "Force checkout by admin",
          rate_per_day:           forceSelected.rate_per_day,
          gst_percent:            forceSelected.gst_percent,
          days:                   finalDays,
          subtotal:               finalSub,
          gst_amount:             finalGst,
          total_amount:           finalTotal,
          status:                 "released",
        }),
      });
      setShowForceModal(false);
      setSearchError("");
      setDone({ sessionId: forceSelected.id, total: finalTotal });
      setTimeout(() => router.push("/dashboard/trucks"), 2500);
    } catch (err) {
      setForceErr(err instanceof Error ? err.message : "Force checkout failed.");
    } finally {
      setForceBusy(false);
    }
  }

  // ── search ──────────────────────────────────────────────────────────────────
  async function handleSearch(overrideQ?: string) {
    const q = (overrideQ ?? searchNumber).trim().toUpperCase();
    if (!q) return;
    setSearchError(""); setSearching(true);
    setSession(null); setTruck(null); setOwner(null); setDivision(null); setSlot(null); setLocation(null);
    setKhataBill(null); setKhataBillLoading(false);
    setDriverMatch(null); setCoDriverName(""); setCoDriverMobile("+91"); setSubmitError("");
    try {
      // ── blacklist check ───────────────────────────────────────────────────
      const blRes = await apiFetch<{ list: { truck_number: string; reason: string; is_active: boolean }[] }>(
        `/blacklists?search=${encodeURIComponent(q)}&limit=10`
      ).catch(() => ({ list: [] }));
      const blEntry = blRes.list?.find(b => b.is_active && b.truck_number.toUpperCase() === q);
      if (blEntry) {
        setBlacklistReason(blEntry.reason || "No reason provided.");
        setShowBlacklisted(true);
        return;
      }

      const truckRes = await apiFetch<{ list: TruckItem[] }>(
        `/trucks?search=${encodeURIComponent(q)}&limit=5`
      );
      const t = truckRes.list.find((x) => x.truck_number.toLowerCase() === q.toLowerCase());
      if (!t) { setSearchError(`Truck "${q}" not found in the system.`); return; }
      setTruck(t);

      // A truck still physically in the yard can be in either "parked" or
      // "overdue" status (the dashboard's overdue-rules feature moves a session
      // to "overdue" once it crosses a configured threshold) — both need to
      // flow through the exact same normal checkout process below.
      const [parkedRes, overdueRes] = await Promise.all([
        apiFetch<{ list: SessionItem[] }>(`/parking-sessions?truck_id=${t.id}&status=parked&limit=1`),
        apiFetch<{ list: SessionItem[] }>(`/parking-sessions?truck_id=${t.id}&status=overdue&limit=1`)
          .catch(() => ({ list: [] as SessionItem[] })),
      ]);
      const sessRes = parkedRes.list.length ? parkedRes : overdueRes;
      if (!sessRes.list.length) {
        // Diagnostic follow-up: check for ANY session on this truck (regardless of
        // status) so the operator can see *why* the lookup came up empty —
        // e.g. a stray status value, or a session that's already been released —
        // instead of a dead-end message.
        const anyRes = await apiFetch<{ list: SessionItem[] }>(
          `/parking-sessions?truck_id=${t.id}&limit=1&sort_by=check_in_time&order=desc`
        ).catch(() => ({ list: [] as SessionItem[] }));
        const last = anyRes.list[0];
        setSearchError(
          last
            ? `No active parking session found for truck "${q}". Its most recent session (checked in ${fmtDateTime(last.check_in_time)}) has status "${last.status}", not "parked" or "overdue".`
            : `No active parking session found for truck "${q}". This truck has no parking history.`
        );
        return;
      }
      const s = sessRes.list[0];
      setSession(s);

      // For khata trucks, load their account bill
      if (s.entry_type === "khata") {
        setKhataBillLoading(true);
        apiFetch<TruckKhataBill>(`/khata-trucks/truck-bill?truck_id=${t.id}`)
          .then(setKhataBill)
          .catch(() => setKhataBill(null))
          .finally(() => setKhataBillLoading(false));
      }

      // If admin already approved the override on verification page, auto-verify
      if (s.driver_match === "override") {
        setDriverMatch("match");
        if (s.checkout_driver_name)   setCoDriverName(s.checkout_driver_name);
        if (s.checkout_driver_mobile) setCoDriverMobile(s.checkout_driver_mobile);
      }

      // enrich in parallel — failures are silent (show "—")
      const [ownerRes, divRes, locRes] = await Promise.allSettled([
        s.owner_id ? apiFetch<OwnerItem>(`/owners/${s.owner_id}`) : Promise.resolve(null),
        apiFetch<DivItem>(`/divisions/${s.division_id}`),
        apiFetch<LocItem>(`/locations/${s.location_id}`),
      ]);
      if (ownerRes.status === "fulfilled" && ownerRes.value) setOwner(ownerRes.value as OwnerItem);
      if (divRes.status  === "fulfilled")                    setDivision(divRes.value as DivItem);
      if (locRes.status  === "fulfilled")                    setLocation(locRes.value as LocItem);
      if (s.slot_id) apiFetch<SlotItem>(`/slots/${s.slot_id}`).then(setSlot).catch(() => {});

    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  // ── checkout submit ──────────────────────────────────────────────────────────
  async function handleCheckout() {
    if (!session) return;
    if (!coDriverName.trim())   { setSubmitError("Checkout driver name is required.");        return; }
    if (!coDriverMobile.trim() || coDriverMobile.trim() === "+91") { setSubmitError("Checkout driver mobile is required.");      return; }
    if (driverMatch === null)      { setSubmitError("Please verify the driver before completing."); return; }
    if (driverMatch === "mismatch") { setSubmitError("Checkout blocked — driver mismatch is flagged. Resolve the identity before releasing the truck."); return; }

    // final blacklist guard before releasing
    try {
      const q = truck?.truck_number?.toUpperCase() ?? "";
      if (q) {
        const blRes = await apiFetch<{ list: { truck_number: string; reason: string; is_active: boolean }[] }>(
          `/blacklists?search=${encodeURIComponent(q)}&limit=10`
        ).catch(() => ({ list: [] as { truck_number: string; reason: string; is_active: boolean }[] }));
        const blEntry = blRes.list?.find(b => b.is_active && b.truck_number.toUpperCase() === q);
        if (blEntry) {
          setBlacklistReason(blEntry.reason || "No reason provided.");
          setShowBlacklisted(true);
          return;
        }
      }
    } catch { /* ignore — don't block checkout on blacklist fetch error */ }

    const nowISO      = new Date().toISOString();
    const finalDays   = billableDays(session.check_in_time, sysRelaxHours);
    const finalSub    = finalDays * session.rate_per_day;
    const finalGst    = Math.round(finalSub * session.gst_percent / 100 * 100) / 100;
    const finalTotal  = finalSub + finalGst;

    setSubmitting(true); setSubmitError("");
    try {
      // update parking session to released
      await apiFetch(`/parking-sessions/${session.id}`, {
        method: "PUT",
        body: JSON.stringify({
          truck_id:               session.truck_id,
          owner_id:               session.owner_id,
          location_id:            session.location_id,
          division_id:            session.division_id,
          slot_id:                session.slot_id,
          entry_type:             session.entry_type,
          checkin_driver_name:    session.checkin_driver_name,
          checkin_driver_mobile:  session.checkin_driver_mobile,
          checkin_driver_licence: session.checkin_driver_licence,
          checkin_id_proof_type:  session.checkin_id_proof_type,
          check_in_time:          session.check_in_time,
          checkin_remarks:        session.checkin_remarks,
          checkout_driver_name:   coDriverName.trim(),
          checkout_driver_mobile: coDriverMobile.trim(),
          driver_match:           driverMatch,
          // forward existing override approval so backend accepts the mismatch
          override_by:            session.driver_match === "override" ? session.override_by : undefined,
          check_out_time:         nowISO,
          checkout_remarks:       coRemarks.trim() || null,
          rate_per_day:           session.rate_per_day,
          gst_percent:            session.gst_percent,
          days:                   finalDays,
          subtotal:               finalSub,
          gst_amount:             finalGst,
          total_amount:           finalTotal,
          status:                 "released",
        }),
      });

      // record payment
      await apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          session_id:      session.id,
          subtotal:        finalSub,
          gst_amount:      finalGst,
          total_amount:    finalTotal,
          method:          payMethod,
          amount_received: received || finalTotal,
          change_due:      changeDue,
          status:          "paid",
          paid_at:         nowISO,
        }),
      });

      // Refresh khata bill amounts after checkout (silent — server also does this)
      if (session.entry_type === "khata") {
        apiFetch<TruckKhataBill>(
          `/khata-trucks/truck-bill?truck_id=${session.truck_id}`,
          { method: "PUT" }
        ).then(setKhataBill).catch(() => {});
      }

      setDone({ sessionId: session.id, total: finalTotal });
      setTimeout(() => { router.push("/dashboard/trucks"); }, 2500);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Checkout failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }


  // ── flag mismatch & redirect to verification ────────────────────────────────
  async function handleFlagMismatch() {
    if (!session) return;
    setFlagging(true); setMismatchError(""); setSubmitError("");
    try {
      await apiFetch(`/parking-sessions/${session.id}`, {
        method: "PUT",
        body: JSON.stringify({
          truck_id:               session.truck_id,
          owner_id:               session.owner_id,
          location_id:            session.location_id,
          division_id:            session.division_id,
          slot_id:                session.slot_id,
          entry_type:             session.entry_type,
          checkin_driver_name:    session.checkin_driver_name,
          checkin_driver_mobile:  session.checkin_driver_mobile,
          checkin_driver_licence: session.checkin_driver_licence,
          checkin_id_proof_type:  session.checkin_id_proof_type,
          check_in_time:          session.check_in_time,
          checkin_remarks:        session.checkin_remarks,
          checkout_driver_name:   coDriverName.trim() || null,
          checkout_driver_mobile: coDriverMobile.trim() === "+91" ? null : coDriverMobile.trim(),
          checkout_remarks:       coRemarks.trim() || null,
          driver_match:           "mismatch",
          status:                 "parked",
          rate_per_day:           session.rate_per_day,
          gst_percent:            session.gst_percent,
          days:                   session.days,
          subtotal:               session.subtotal,
          gst_amount:             session.gst_amount,
          total_amount:           session.total_amount,
        }),
      });
      router.push("/dashboard/verification");
    } catch (err) {
      setMismatchError(err instanceof Error ? err.message : "Failed to flag mismatch. Please try again.");
      setFlagging(false);
    }
  }

  function handleVerifySubmit() {
    if (!session) return;
    setMismatchError("");
    const nameFilled   = coDriverName.trim().length > 0;
    const mobileFilled = coDriverMobile.trim() !== "+91" && coDriverMobile.trim().length > 3;
    if (!nameFilled || !mobileFilled) {
      setMismatchError("Please enter both checkout driver name and mobile before submitting.");
      return;
    }
    const nameMatch   = coDriverName.trim().toLowerCase() === session.checkin_driver_name?.trim().toLowerCase();
    const mobileMatch = normMobile(coDriverMobile) === normMobile(session.checkin_driver_mobile ?? "");
    if (nameMatch && mobileMatch) {
      setDriverMatch("match");
    } else {
      handleFlagMismatch();
    }
  }

  // ── active step for step indicator ───────────────────────────────────────────
  const activeStep = !session ? 1 : driverMatch === null ? 2 : 3;

  // ── main render ───────────────────────────────────────────────────────────────
  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* Blacklisted truck blocking modal */}
      {showBlacklisted && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center text-center max-w-sm w-full mx-4">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-red-400 animate-ping absolute inset-0 opacity-20" />
              <div className="w-24 h-24 rounded-full border-4 border-red-300 bg-red-50 flex items-center justify-center">
                <ShieldX className="w-12 h-12 text-red-500" strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Truck Blacklisted</h2>
            <p className="text-sm text-gray-500 mb-4">This truck is on the blacklist and cannot be checked out.</p>
            <div className="w-full bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Reason</p>
              <p className="text-sm text-gray-700">{blacklistReason}</p>
            </div>
            <button
              onClick={() => setShowBlacklisted(false)}
              className="w-full py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition">
              Understood — Go back
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Force checkout modal ── */}
      {showForceModal && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !forceBusy && setShowForceModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-amber-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Zap className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Force checkout</p>
                  <p className="text-xs text-amber-600 font-mono font-semibold">{truck?.truck_number}</p>
                </div>
              </div>
              <button onClick={() => setShowForceModal(false)} disabled={forceBusy}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* explanation */}
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Force checkout manually closes an existing session. Use only when the truck physically left without a proper check-out.
                </p>
              </div>

              {/* session list */}
              {forceLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading sessions…</span>
                </div>
              ) : forceSessions.length === 0 ? (
                <div className="text-center py-6">
                  <AlertCircle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-500">No sessions found</p>
                  <p className="text-xs text-gray-400 mt-1">This truck has never been checked in via the system.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600">Select session to force-close</p>
                  {forceSessions.map(s => {
                    const sel = forceSelected?.id === s.id;
                    const isParked = s.status === "parked";
                    return (
                      <button key={s.id} type="button"
                        onClick={() => { setForceSelected(s); setForceErr(""); }}
                        className={`w-full text-left flex items-start gap-3 px-3.5 py-3 rounded-xl border transition ${
                          sel ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:border-amber-300 hover:bg-amber-50/50"
                        }`}>
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          sel ? "border-amber-500 bg-amber-500" : "border-gray-300"
                        }`}>
                          {sel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              isParked ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                            }`}>
                              {isParked ? "Parked" : s.status}
                            </span>
                            <span className="text-xs text-gray-400">
                              {s.check_in_time ? fmtDateTime(s.check_in_time) : "No check-in time"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Driver: {s.checkin_driver_name} · {s.checkin_driver_mobile}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* reason */}
              {forceSessions.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason / Note</label>
                  <textarea
                    value={forceReason}
                    onChange={e => setForceReason(e.target.value)}
                    placeholder="e.g. Truck left premises without check-out, system error…"
                    rows={2}
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none transition"
                  />
                </div>
              )}

              {forceErr && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{forceErr}</p>
                </div>
              )}
            </div>

            {/* footer */}
            <div className="px-6 pb-5 flex gap-3">
              <button type="button" onClick={() => setShowForceModal(false)} disabled={forceBusy}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition">
                Cancel
              </button>
              {forceSessions.length > 0 && (
                <button type="button" onClick={submitForceCheckout} disabled={forceBusy || !forceSelected}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-xl shadow-sm shadow-amber-200 transition">
                  {forceBusy
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</>
                    : <><Zap className="w-4 h-4" />Force checkout</>}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Check-out success modal */}
      {done && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center text-center max-w-sm w-full mx-4 animate-in zoom-in-95 fade-in duration-300">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-emerald-400 animate-ping absolute inset-0 opacity-20" />
              <div className="w-24 h-24 rounded-full border-4 border-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Check-out Complete!</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Truck <span className="font-semibold text-gray-800">{truck?.truck_number}</span> has been released successfully.
            </p>
            <div className="mt-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 w-full">
              <p className="text-xs text-blue-400 mb-0.5">Total collected</p>
              <p className="text-2xl font-bold text-blue-700">{fmt(done.total)}</p>
            </div>
            <p className="text-xs text-gray-400 mt-4">Redirecting to All Trucks…</p>
            <div className="w-full bg-gray-100 rounded-full h-1 mt-3 overflow-hidden">
              <div className="h-1 bg-emerald-500 rounded-full animate-[shrink_2.5s_linear_forwards]" />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Page title */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-600 font-medium">Truck Check-out</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Truck Check-out</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Search for an active session, verify the driver, and collect payment
        </p>
      </div>

      {/* Step indicator */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
        <div className="flex items-center">
          {STEPS.map((step, idx) => (
            <div key={step.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2.5 shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step.n < activeStep
                    ? "bg-emerald-500 text-white"
                    : step.n === activeStep
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                    : "bg-gray-100 text-gray-400"
                }`}>
                  {step.n < activeStep ? <Check className="w-3.5 h-3.5" /> : step.n}
                </div>
                <span className={`text-sm font-medium hidden sm:block ${
                  step.n === activeStep
                    ? "text-blue-700"
                    : step.n < activeStep
                    ? "text-emerald-600"
                    : "text-gray-400"
                }`}>
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 mx-3 h-px hidden sm:block transition-colors ${
                  step.n < activeStep ? "bg-emerald-300" : "bg-gray-200"
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Search card */}
      <FormCard icon={<Search className="w-4 h-4 text-blue-600" />} title="Search parked truck">
        <div className="flex gap-3">
          <input
            value={searchNumber}
            onChange={(e) => setSearchNumber(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && !searching && handleSearch()}
            placeholder="Enter truck number (e.g. GJ11AB1234)"
            className={inputCls + " font-mono uppercase tracking-wider flex-1"}
            maxLength={15}
          />
          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={searching || !searchNumber.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm shrink-0"
          >
            {searching
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching…</>
              : <><Search className="w-4 h-4" /> Find truck</>
            }
          </button>
        </div>

        {searchError && (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 flex-1">{searchError}</p>
            </div>
            {/* show force-checkout option only when the truck was found but has no active session */}
            {truck && searchError.includes("No active parking session") && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-700">Force checkout available</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Use this if the truck physically left but has no active session — an admin can manually close any existing session.
                  </p>
                </div>
                <button
                  onClick={openForceCheckout}
                  className="shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">
                  <Zap className="w-3.5 h-3.5" /> Force checkout
                </button>
              </div>
            )}
          </div>
        )}

        {session && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Check className="w-4 h-4 shrink-0" />
            Active session found for{" "}
            <span className="font-semibold font-mono">{truck?.truck_number}</span>
          </div>
        )}
      </FormCard>

      {/* Two-column layout — visible once a session is loaded */}
      {session && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

          {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
          <div className="xl:col-span-3 space-y-5">

            {/* Parked truck record */}
            <FormCard icon={<TruckIcon className="w-4 h-4 text-blue-600" />} title="Parked truck record">

              {/* Truck number + badges */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="px-4 py-2 bg-blue-600 text-white rounded-xl font-mono font-bold text-xl tracking-widest shadow-sm shadow-blue-200">
                  {truck?.truck_number}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full font-medium">
                    {truck?.truck_type ?? "—"}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    session.status === "overdue"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                  </span>
                  <span className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium capitalize">
                    {session.entry_type}
                  </span>
                </div>
              </div>

              {/* Location / Division / Slot */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <InfoBox
                  icon={<MapPin className="w-3.5 h-3.5" />}
                  label="Location"
                  value={location ? `${location.name}${location.city ? `, ${location.city}` : ""}` : "—"}
                />
                <InfoBox
                  icon={<TruckIcon className="w-3.5 h-3.5" />}
                  label="Division"
                  value={division?.name ?? "—"}
                />
                <InfoBox
                  icon={<MapPin className="w-3.5 h-3.5" />}
                  label="Slot"
                  value={slot?.code ?? (session.slot_id ? "Loading…" : "Auto")}
                />
              </div>

              {/* Owner */}
              <div className="pt-1">
                <SectionHeading>Owner</SectionHeading>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoBox icon={<User className="w-3.5 h-3.5" />} label="Name"   value={owner?.name             ?? "—"} />
                  <InfoBox icon={<User className="w-3.5 h-3.5" />} label="Mobile" value={owner?.primary_mobile   ?? "—"} mono />
                  {owner?.company && (
                    <InfoBox icon={<User className="w-3.5 h-3.5" />} label="Company" value={owner.company} />
                  )}
                </div>
              </div>

              {/* Timing */}
              <div className="pt-1">
                <SectionHeading>Timing</SectionHeading>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoBox
                    icon={<Calendar className="w-3.5 h-3.5" />}
                    label="Checked in"
                    value={fmtDateTime(session.check_in_time)}
                  />
                  <InfoBox
                    icon={<Clock className="w-3.5 h-3.5" />}
                    label="Duration parked"
                    value={durationLabel(session.check_in_time)}
                    accent
                  />
                </div>
              </div>
            </FormCard>

            {/* Driver verification */}
            <FormCard icon={<User className="w-4 h-4 text-violet-600" />} title="Check-out driver verification">

              {/* ── Check-in driver reference (read-only) ── */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 space-y-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Check-in driver (reference)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Name</p>
                    <p className="text-sm font-semibold text-gray-700">{session.checkin_driver_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Mobile</p>
                    <p className="text-sm font-semibold text-gray-700 font-mono">
                      {session.checkin_driver_mobile
                        ? `+91 ${normMobile(session.checkin_driver_mobile)}`
                        : "—"}
                    </p>
                  </div>
                  {session.checkin_driver_licence && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Licence</p>
                      <p className="text-sm font-semibold text-gray-700 font-mono">{session.checkin_driver_licence}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Checkout driver inputs ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Checkout driver name <span className="text-red-400">*</span></label>
                  <input
                    value={coDriverName}
                    onChange={(e) => { setCoDriverName(e.target.value); setDriverMatch(null); }}
                    placeholder="Full name"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Checkout driver mobile <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none select-none">+91</span>
                    <input
                      value={coDriverMobile.replace(/^\+91/, "")}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setCoDriverMobile("+91" + digits);
                        setDriverMatch(null);
                      }}
                      placeholder="98765 43210"
                      type="tel"
                      maxLength={10}
                      className={inputCls + " pl-9 font-mono"}
                    />
                  </div>
                </div>
              </div>

              {/* ── Auto-detect mismatch banner ── */}
              {(() => {
                const nameFilled   = coDriverName.trim().length > 0;
                const mobileFilled = coDriverMobile.trim().length > 0 && coDriverMobile.trim() !== "+91";
                if (!nameFilled && !mobileFilled) return null;
                const nameMatch   = coDriverName.trim().toLowerCase() === session.checkin_driver_name?.trim().toLowerCase();
                const mobileMatch = normMobile(coDriverMobile) === normMobile(session.checkin_driver_mobile ?? "");
                const bothFilled  = nameFilled && mobileFilled;
                if (bothFilled && nameMatch && mobileMatch) {
                  return (
                    <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <p className="text-sm font-medium text-emerald-700">Details match the check-in driver.</p>
                    </div>
                  );
                }
                const issues: string[] = [];
                if (nameFilled   && !nameMatch)   issues.push(`name differs from check-in driver "${session.checkin_driver_name}"`);
                if (mobileFilled && !mobileMatch) issues.push(`mobile differs from check-in driver "${session.checkin_driver_mobile}"`);
                if (!issues.length) return null;
                return (
                  <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-rose-700">Verification mismatch detected</p>
                      <ul className="mt-1 space-y-0.5">
                        {issues.map(i => (
                          <li key={i} className="text-xs text-rose-600 list-disc list-inside">{i}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-rose-500 mt-1.5">Verify ID physically. Select &quot;Mismatch — hold&quot; unless confirmed.</p>
                    </div>
                  </div>
                );
              })()}

              {/* ── Admin override approved banner (replaces decision UI) ── */}
              {session.driver_match === "override" ? (
                <div className="flex items-start gap-3 bg-blue-50 border-2 border-blue-300 rounded-xl px-4 py-3.5">
                  <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Admin Override Approved</p>
                    <p className="text-xs text-blue-600 mt-0.5">Driver mismatch was reviewed and approved by an admin. Proceed directly to payment collection.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* ── Submit button (system auto-decides match/mismatch) ── */}
                  {driverMatch !== "match" && (
                    <button
                      type="button"
                      onClick={handleVerifySubmit}
                      disabled={flagging}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-violet-600 text-white hover:bg-violet-700 transition-all shadow-sm disabled:opacity-60"
                    >
                      {flagging
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</>
                        : <><ShieldCheck className="w-4 h-4" />Verify &amp; Submit</>
                      }
                    </button>
                  )}

                  {/* ── Match confirmed badge ── */}
                  {driverMatch === "match" && (
                    <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <Check className="w-4 h-4 text-emerald-500" />
                      <p className="text-sm font-medium text-emerald-700">Driver verified. Proceed to collect payment.</p>
                    </div>
                  )}

                  {/* ── Error ── */}
                  {mismatchError && (
                    <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-sm text-red-700">{mismatchError}</p>
                    </div>
                  )}
                </div>
              )}
            </FormCard>
          </div>

          {/* ── RIGHT COLUMN ─────────────────────────────────────────────── */}
          <div className="xl:col-span-2 space-y-4">

            {/* Final bill */}
            <FormCard icon={<IndianRupee className="w-4 h-4 text-amber-600" />} title="Final bill">
              <div className="space-y-2.5">
                <BillRow label={`Rate (${division?.name ?? "Division"})`} value={`${fmt(rate)}/day`} />
                <BillRow label="Duration" value={`${days} day${days !== 1 ? "s" : ""}`} />
                <BillRow label="Subtotal" value={fmt(subtotal)} />
                <BillRow label={`GST (${gstPct}%)`} value={fmt(gstAmt)} />
              </div>
              <div className="border-t-2 border-blue-100 pt-3">
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <span className="font-bold text-blue-900">Total payable</span>
                  <span className="text-xl font-bold text-blue-700">{fmt(totalAmt)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 flex items-center gap-1.5 pt-1">
                <Clock className="w-3.5 h-3.5" />
                {durationLabel(session.check_in_time)} parked → {days} billing day{days !== 1 ? "s" : ""}
              </p>
              {sysRelaxHours > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {sysRelaxHours}h relaxation included · 1 billing day = {24 + sysRelaxHours}h
                </p>
              )}
            </FormCard>

            {/* Khata account bill — only for khata entry type */}
            {session.entry_type === "khata" && (
              <FormCard icon={<BookOpen className="w-4 h-4 text-violet-600" />} title="Khata account bill">
                {khataBillLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-1">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading khata bill…
                  </div>
                ) : khataBill ? (
                  <div className="space-y-2.5">
                    <BillRow
                      label="Period from"
                      value={new Date(khataBill.period_start).toLocaleDateString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    />
                    <BillRow label="Sessions this period" value={String(khataBill.session_count)} />
                    <BillRow
                      label="Total billing days"
                      value={`${khataBill.total_days} day${khataBill.total_days !== 1 ? "s" : ""}`}
                    />
                    <div className="border-t-2 border-violet-100 pt-3">
                      <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
                        <span className="font-bold text-violet-900">Period total</span>
                        <span className="text-lg font-bold text-violet-700">{fmt(khataBill.total_amount)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Billing cycle resets on day {khataBill.billing_day} of each month
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No khata billing data available.</p>
                )}
              </FormCard>
            )}

            {/* Payment */}
            <FormCard icon={<Banknote className="w-4 h-4 text-emerald-600" />} title="Payment collection">

              <div>
                <label className={labelCls}>Payment method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { v: "cash", label: "Cash", Icon: Banknote   },
                      { v: "card", label: "Card", Icon: CreditCard  },
                      { v: "upi",  label: "UPI",  Icon: Smartphone  },
                    ] as { v: "cash" | "card" | "upi"; label: string; Icon: React.ElementType }[]
                  ).map(({ v, label, Icon }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPayMethod(v)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 font-medium text-xs transition-all ${
                        payMethod === v
                          ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                          : "border-gray-200 text-gray-500 hover:border-gray-300 bg-gray-50"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Amount received (₹)</label>
                <input
                  type="number"
                  value={amtReceived}
                  onChange={(e) => setAmtReceived(e.target.value)}
                  placeholder={String(Math.ceil(totalAmt))}
                  min={0}
                  step={1}
                  className={inputCls}
                />
              </div>

              <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                changeDue > 0 ? "bg-amber-50 border border-amber-200" : "bg-gray-50 border border-gray-200"
              }`}>
                <span className={`text-sm font-semibold ${changeDue > 0 ? "text-amber-800" : "text-gray-700"}`}>
                  Change due
                </span>
                <span className={`text-base font-bold ${changeDue > 0 ? "text-amber-700" : "text-gray-900"}`}>
                  {fmt(changeDue)}
                </span>
              </div>
            </FormCard>

            {/* Checkout remarks */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <label className={labelCls}>Checkout remarks</label>
              <textarea
                value={coRemarks}
                onChange={(e) => setCoRemarks(e.target.value)}
                rows={3}
                placeholder="Damage notes, special instructions, or observations…"
                className={inputCls + " resize-none"}
              />
            </div>

            {/* Mismatch override warning */}
            {driverMatch === "mismatch" && (
              <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">
                  Driver mismatch will be permanently recorded. Proceeding releases the truck under admin override.
                </p>
              </div>
            )}

            {/* Submit error */}
            {submitError && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            {/* Complete checkout */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={submitting || driverMatch === null}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3.5 rounded-xl shadow-sm shadow-blue-200 transition text-sm"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing checkout…</>
              ) : (
                <><Receipt className="w-4 h-4" /> Complete checkout &amp; print receipt</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function FormCard({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2.5 pb-1 border-b border-gray-100">
        <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100">
          {icon}
        </div>
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{children}</p>
  );
}

function InfoBox({
  icon, label, value, mono, accent,
}: { icon: React.ReactNode; label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${mono ? "font-mono" : ""} ${accent ? "text-blue-700" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

function BillRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}

// ── shared class strings ──────────────────────────────────────────────────────
const labelCls = "block text-xs font-semibold text-gray-600 mb-1.5";
const inputCls =
  "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 " +
  "rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 " +
  "focus:border-transparent focus:bg-white transition";
