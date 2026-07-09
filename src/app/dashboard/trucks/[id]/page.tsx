"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, ArrowLeft, Truck as TruckIcon,
  User, MapPin, Clock, Phone, FileText,
  CheckCircle2, Loader2, AlertCircle,
  IndianRupee, Calendar, LogOut, Hash, ShieldCheck, ShieldAlert,
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}
async function apiFetch<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", token },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error((e as { detail?: string }).detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

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
interface TruckData { id: string; truck_number: string; truck_type: string }
interface OwnerData { id: string; name: string; mobile: string }
interface LocData   { id: string; name: string; city: string | null }
interface DivData   { id: string; name: string }
interface SlotData  { id: string; code: string }
interface UserData  { id: string; name?: string; full_name?: string; username?: string; email?: string }

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm text-gray-800 font-medium ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}

function SectionCard({ title, icon, children, accent = "blue" }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; accent?: string;
}) {
  const accents: Record<string, string> = {
    blue:    "bg-blue-50 text-blue-600",
    teal:    "bg-teal-50 text-teal-600",
    violet:  "bg-violet-50 text-violet-600",
    amber:   "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    slate:   "bg-slate-100 text-slate-500",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accents[accent] ?? accents.blue}`}>
          {icon}
        </div>
        <p className="text-sm font-bold text-gray-900">{title}</p>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [session,      setSession]      = useState<Session | null>(null);
  const [truck,        setTruck]        = useState<TruckData | null>(null);
  const [owner,        setOwner]        = useState<OwnerData | null>(null);
  const [loc,          setLoc]          = useState<LocData | null>(null);
  const [div,          setDiv]          = useState<DivData | null>(null);
  const [slot,         setSlot]         = useState<SlotData | null>(null);
  const [overrideUser, setOverrideUser] = useState<UserData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true); setError("");
      try {
        const s = await apiFetch<Session>(`/parking-sessions/${id}`);
        setSession(s);
        const [t, o, l, d] = await Promise.all([
          apiFetch<TruckData>(`/trucks/${s.truck_id}`).catch(() => null),
          apiFetch<OwnerData>(`/owners/${s.owner_id}`).catch(() => null),
          apiFetch<LocData>(`/locations/${s.location_id}`).catch(() => null),
          apiFetch<DivData>(`/divisions/${s.division_id}`).catch(() => null),
        ]);
        setTruck(t); setOwner(o); setLoc(l); setDiv(d);
        const extra: Promise<void>[] = [];
        if (s.slot_id) {
          extra.push(apiFetch<SlotData>(`/slots/${s.slot_id}`).then(sl => setSlot(sl)).catch(() => {}));
        }
        if (s.override_by) {
          extra.push(apiFetch<UserData>(`/users/${s.override_by}`).then(u => setOverrideUser(u)).catch(() => {}));
        }
        await Promise.allSettled(extra);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session.");
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-gray-400">Loading session details…</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="px-4 sm:px-5 lg:px-6 py-5 w-full">
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to load session</p>
            <p className="text-xs text-red-500 mt-1">{error || "Session not found."}</p>
          </div>
        </div>
        <Link href="/dashboard/trucks" className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-gray-600 hover:text-blue-600 transition">
          <ArrowLeft className="w-4 h-4" />Back to All Trucks
        </Link>
      </div>
    );
  }

  const isCheckedOut = session.status === "released";
  const isOverdue    = session.status === "overdue";
  const isKhata      = session.entry_type?.toLowerCase() === "khata";

  const statusCfg = isCheckedOut
    ? { label: "Checked out", cls: "bg-teal-50 text-teal-700 border-teal-200",   dot: "bg-teal-500"    }
    : isOverdue
    ? { label: "Overdue",     cls: "bg-red-50 text-red-700 border-red-200",       dot: "bg-red-500"     }
    : { label: "Parked",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };

  const truckBadgeBg = isCheckedOut ? "bg-teal-700" : isOverdue ? "bg-red-600" : isKhata ? "bg-violet-700" : "bg-blue-700";

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/dashboard/trucks" className="hover:text-blue-600 transition">All Trucks</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-700 font-semibold font-mono">{truck?.truck_number ?? id}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <div className={`px-4 py-2.5 rounded-xl text-sm font-extrabold tracking-widest text-white font-mono shadow-md ${truckBadgeBg}`}>
              {truck?.truck_number ?? "—"}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${statusCfg.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                  {statusCfg.label}
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${isKhata ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                  {session.entry_type?.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-400">{truck?.truck_type ?? "—"}</p>
            </div>
          </div>
          <Link href="/dashboard/trucks"
            className="self-start sm:self-auto flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm transition">
            <ArrowLeft className="w-4 h-4" />All Trucks
          </Link>
        </div>
      </div>

      {/* Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4">

          {/* Truck + Owner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionCard title="Truck" icon={<TruckIcon className="w-4 h-4" />} accent="slate">
              <div className="space-y-3">
                <Field label="Truck Number" value={<span className="font-mono">{truck?.truck_number}</span>} />
                <Field label="Truck Type"   value={truck?.truck_type} />
              </div>
            </SectionCard>

            <SectionCard title="Owner" icon={<User className="w-4 h-4" />} accent="violet">
              <div className="space-y-3">
                <Field label="Owner Name"   value={owner?.name} />
                <Field label="Mobile"       value={
                  owner?.mobile
                    ? <a href={`tel:${owner.mobile}`} className="text-blue-600 hover:underline flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />{owner.mobile}
                      </a>
                    : "—"
                } />
              </div>
            </SectionCard>
          </div>

          {/* Check-in Driver */}
          <SectionCard title="Check-in Driver" icon={<User className="w-4 h-4" />} accent="blue">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Driver Name"   value={session.checkin_driver_name} />
              <Field label="Mobile"        value={
                session.checkin_driver_mobile
                  ? <a href={`tel:${session.checkin_driver_mobile}`} className="text-blue-600 hover:underline flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />{session.checkin_driver_mobile}
                    </a>
                  : "—"
              } />
              <Field label="Licence No."  value={session.checkin_driver_licence} />
              <Field label="ID Proof Type" value={session.checkin_id_proof_type} />
              {session.checkin_remarks && (
                <div className="col-span-2">
                  <Field label="Remarks" value={session.checkin_remarks} />
                </div>
              )}
              <div className="col-span-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Verification Status</p>
                {session.driver_match === "match" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                    <ShieldCheck className="w-3.5 h-3.5" />Verified — driver matched
                  </span>
                ) : session.driver_match === "override" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                    <ShieldCheck className="w-3.5 h-3.5" />Admin override approved
                  </span>
                ) : session.driver_match === "mismatch" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                    <ShieldAlert className="w-3.5 h-3.5" />Mismatch flagged
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Check-out Driver — only if checked out */}
          {isCheckedOut && (
            <SectionCard title="Check-out Driver" icon={<LogOut className="w-4 h-4" />} accent="teal">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Driver Name" value={session.checkout_driver_name} />
                <Field label="Mobile" value={
                  session.checkout_driver_mobile
                    ? <a href={`tel:${session.checkout_driver_mobile}`} className="text-blue-600 hover:underline flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />{session.checkout_driver_mobile}
                      </a>
                    : "—"
                } />
                <div className="col-span-2">
                  <Field label="Checked out at" value={fmtDateTime(session.check_out_time)} />
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Verification</p>
                  {session.driver_match === "match" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                      <ShieldCheck className="w-3.5 h-3.5" />Verified — driver details matched check-in
                    </span>
                  ) : session.driver_match === "override" ? (
                    <div className="space-y-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg">
                        <ShieldCheck className="w-3.5 h-3.5" />Admin override — mismatch approved
                      </span>
                      {session.override_by && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 pl-0.5">
                          <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0" />
                          Approved by: <span className="font-semibold text-gray-700 ml-1">
                            {overrideUser?.name ?? overrideUser?.full_name ?? overrideUser?.username ?? overrideUser?.email ?? "Admin"}
                          </span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg">
                      <ShieldAlert className="w-3.5 h-3.5" />Mismatch flagged
                    </span>
                  )}
                </div>
                {session.checkout_remarks && (
                  <div className="col-span-2">
                    <Field label="Remarks / Override note" value={session.checkout_remarks} />
                  </div>
                )}
              </div>
            </SectionCard>
          )}

        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">

          {/* Session Info */}
          <SectionCard title="Session Info" icon={<Hash className="w-4 h-4" />} accent="slate">
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Session ID</p>
                <p className="text-xs font-mono text-gray-700 bg-gray-50 rounded-lg px-3 py-2 break-all">{session.id}</p>
              </div>
              {session.override_by && overrideUser && (
                <Field label="Override approved by" value={
                  overrideUser.name ?? overrideUser.full_name ?? overrideUser.username ?? overrideUser.email ?? "Admin"
                } />
              )}
            </div>
          </SectionCard>

          {/* Timeline */}
          <SectionCard title="Timeline" icon={<Clock className="w-4 h-4" />} accent="blue">
            <div className="space-y-4">
              {/* Check-in */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  {isCheckedOut && <div className="w-0.5 h-8 bg-gray-100 mt-1" />}
                </div>
                <div className="pt-1">
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Check-in</p>
                  <p className="text-sm font-bold text-gray-900">{fmtDate(session.check_in_time)}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />{fmtTime(session.check_in_time)}
                  </p>
                </div>
              </div>

              {/* Check-out */}
              {isCheckedOut ? (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                    <LogOut className="w-3.5 h-3.5 text-teal-600" />
                  </div>
                  <div className="pt-1">
                    <p className="text-xs font-semibold text-gray-500 mb-0.5">Check-out</p>
                    <p className="text-sm font-bold text-teal-700">{fmtDate(session.check_out_time)}</p>
                    <p className="text-xs text-teal-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />{fmtTime(session.check_out_time)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 opacity-40">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <LogOut className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div className="pt-1.5">
                    <p className="text-xs text-gray-400">Not yet checked out</p>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Location */}
          <SectionCard title="Location" icon={<MapPin className="w-4 h-4" />} accent="emerald">
            <div className="space-y-3">
              <Field label="Parking Lot"  value={loc ? `${loc.name}${loc.city ? ` — ${loc.city}` : ""}` : "—"} />
              <Field label="Division"     value={div?.name} />
              <Field label="Slot"         value={slot ? slot.code : session.slot_id ? "Loading…" : "—"} />
            </div>
          </SectionCard>

          {/* Billing */}
          {isCheckedOut && (
            <SectionCard title="Billing" icon={<IndianRupee className="w-4 h-4" />} accent="amber">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Rate / day</span>
                  <span className="font-semibold text-gray-800">₹{session.rate_per_day}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Days parked</span>
                  <span className="font-semibold text-gray-800">{session.days ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold text-gray-800">₹{session.subtotal?.toFixed(2) ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">GST ({session.gst_percent}%)</span>
                  <span className="font-semibold text-gray-800">₹{session.gst_amount?.toFixed(2) ?? "—"}</span>
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-700">Total</span>
                  <span className="text-xl font-extrabold text-gray-900">₹{session.total_amount?.toFixed(2) ?? "—"}</span>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Documents placeholder */}
          {(session.checkin_id_proof_type || session.checkin_driver_licence) && (
            <SectionCard title="Documents" icon={<FileText className="w-4 h-4" />} accent="slate">
              <div className="space-y-3">
                <Field label="ID Proof Type"  value={session.checkin_id_proof_type} />
                <Field label="Licence Number" value={session.checkin_driver_licence} />
              </div>
            </SectionCard>
          )}

        </div>
      </div>
    </div>
  );
}
