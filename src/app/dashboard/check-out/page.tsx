"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Truck as TruckIcon, User, Clock, Search, Check,
  AlertCircle, Loader2, CheckCircle2, ArrowLeft, ChevronRight,
  IndianRupee, MapPin, Calendar, RefreshCw, ShieldCheck, ShieldAlert,
  Banknote, CreditCard, Smartphone, Receipt,
} from "lucide-react";

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
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error((e as { detail?: string }).detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── types ─────────────────────────────────────────────────────────────────────
interface TruckItem { id: string; truck_number: string; truck_type: string; owner_id: string | null }
interface OwnerItem { id: string; name: string; primary_mobile: string; company: string | null }
interface DivItem   { id: string; name: string; rate_per_day: number; gst_percent: number | null }
interface SlotItem  { id: string; code: string }
interface LocItem   { id: string; name: string; city: string | null }
interface SessionItem {
  id: string; truck_id: string; owner_id: string; location_id: string; division_id: string;
  slot_id: string | null; entry_type: string;
  checkin_driver_name: string; checkin_driver_mobile: string;
  checkin_driver_licence: string | null; checkin_id_proof_type: string | null;
  check_in_time: string | null; checkin_remarks: string | null;
  rate_per_day: number; gst_percent: number; status: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function billableDays(checkInTime: string | null): number {
  if (!checkInTime) return 1;
  const ms = Date.now() - new Date(checkInTime).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
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
  const [coDriverMobile, setCoDriverMobile] = useState("");
  const [driverMatch,    setDriverMatch]    = useState<"match" | "mismatch" | null>(null);
  const [payMethod,      setPayMethod]      = useState<"cash" | "card" | "upi">("cash");
  const [amtReceived,    setAmtReceived]    = useState("");
  const [coRemarks,      setCoRemarks]      = useState("");

  // submit
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done,        setDone]        = useState<{ sessionId: string; total: number } | null>(null);

  // live duration tick
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [session]);

  // pre-fill amount received when session first loads
  useEffect(() => {
    if (!session) return;
    const d   = billableDays(session.check_in_time);
    const sub = d * session.rate_per_day;
    const gst = Math.round(sub * session.gst_percent / 100 * 100) / 100;
    setAmtReceived(String(Math.ceil(sub + gst)));
  }, [session]);

  // computed billing (live — re-derived on tick)
  const days     = billableDays(session?.check_in_time ?? null);
  const rate     = session?.rate_per_day ?? 0;
  const gstPct   = session?.gst_percent ?? 18;
  const subtotal = days * rate;
  const gstAmt   = Math.round(subtotal * gstPct / 100 * 100) / 100;
  const totalAmt = subtotal + gstAmt;
  const received = parseFloat(amtReceived) || 0;
  const changeDue = Math.max(0, received - totalAmt);

  // ── search ──────────────────────────────────────────────────────────────────
  async function handleSearch() {
    const q = searchNumber.trim().toUpperCase();
    if (!q) return;
    setSearchError(""); setSearching(true);
    setSession(null); setTruck(null); setOwner(null); setDivision(null); setSlot(null); setLocation(null);
    setDriverMatch(null); setCoDriverName(""); setCoDriverMobile(""); setSubmitError("");
    try {
      const truckRes = await apiFetch<{ list: TruckItem[] }>(
        `/trucks?search=${encodeURIComponent(q)}&limit=5`
      );
      const t = truckRes.list.find((x) => x.truck_number.toLowerCase() === q.toLowerCase());
      if (!t) { setSearchError(`Truck "${q}" not found in the system.`); return; }
      setTruck(t);

      const sessRes = await apiFetch<{ list: SessionItem[] }>(
        `/parking-sessions?truck_id=${t.id}&status=parked&limit=1`
      );
      if (!sessRes.list.length) {
        setSearchError(`No active parking session found for truck "${q}".`);
        return;
      }
      const s = sessRes.list[0];
      setSession(s);

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
    if (!coDriverMobile.trim()) { setSubmitError("Checkout driver mobile is required.");      return; }
    if (driverMatch === null)   { setSubmitError("Please verify the driver before completing."); return; }

    const nowISO      = new Date().toISOString();
    const finalDays   = billableDays(session.check_in_time);
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

      setDone({ sessionId: session.id, total: finalTotal });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Checkout failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetAll() {
    setDone(null); setSession(null); setTruck(null); setOwner(null);
    setDivision(null); setSlot(null); setLocation(null);
    setSearchNumber(""); setSearchError(""); setDriverMatch(null);
    setCoDriverName(""); setCoDriverMobile(""); setCoRemarks(""); setSubmitError("");
  }

  // ── success screen ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-screen-xl mx-auto flex items-center justify-center min-h-[70vh]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Check-out Complete!</h2>
          <p className="text-gray-500 mb-4">
            Truck <span className="font-semibold text-gray-800">{truck?.truck_number}</span> has been released successfully.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-6 py-5 mb-6">
            <p className="text-sm text-blue-500 mb-1">Total collected</p>
            <p className="text-3xl font-bold text-blue-700">{fmt(done.total)}</p>
          </div>
          <p className="text-xs text-gray-400 mb-1">Session ID</p>
          <p className="font-mono text-xs bg-gray-100 text-gray-700 rounded-lg px-4 py-2 mb-8 break-all">
            {done.sessionId}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={resetAll}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl transition shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              New Check-out
            </button>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold px-5 py-2.5 rounded-xl transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── active step for step indicator ───────────────────────────────────────────
  const activeStep = !session ? 1 : driverMatch === null ? 2 : 3;

  // ── main render ───────────────────────────────────────────────────────────────
  return (
    <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-5">

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
            onClick={handleSearch}
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
          <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{searchError}</p>
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

              {/* Check-in driver */}
              <div className="pt-1">
                <SectionHeading>Check-in driver</SectionHeading>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoBox icon={<User className="w-3.5 h-3.5" />} label="Name"    value={session.checkin_driver_name}   />
                  <InfoBox icon={<User className="w-3.5 h-3.5" />} label="Mobile"  value={session.checkin_driver_mobile} mono />
                  {session.checkin_driver_licence && (
                    <InfoBox icon={<User className="w-3.5 h-3.5" />} label="Licence" value={session.checkin_driver_licence} mono />
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

              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  The check-out driver should match the check-in driver.
                  Verify identity before releasing the truck.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Driver name <span className="text-red-400">*</span></label>
                  <input
                    value={coDriverName}
                    onChange={(e) => setCoDriverName(e.target.value)}
                    placeholder="Full name"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Driver mobile <span className="text-red-400">*</span></label>
                  <input
                    value={coDriverMobile}
                    onChange={(e) => setCoDriverMobile(e.target.value)}
                    placeholder="+91 XXXXX XXXXX"
                    type="tel"
                    maxLength={15}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Verify action buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDriverMatch("match")}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                    driverMatch === "match"
                      ? "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Verify match
                </button>
                <button
                  type="button"
                  onClick={() => setDriverMatch("mismatch")}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                    driverMatch === "mismatch"
                      ? "border-rose-500 bg-rose-500 text-white shadow-sm shadow-rose-200"
                      : "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100"
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  Mismatch — hold
                </button>
              </div>

              {/* Verification status badge */}
              {driverMatch === "match" && (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <p className="text-sm font-medium text-emerald-700">
                    Driver verified. Proceed to collect payment.
                  </p>
                </div>
              )}
              {driverMatch === "mismatch" && (
                <div className="flex items-center gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                  <p className="text-sm font-medium text-rose-700">
                    Mismatch flagged. Admin override will be recorded on release.
                  </p>
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
            </FormCard>

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
