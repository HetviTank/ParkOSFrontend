"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Printer, FileDown, Send, Loader2,
  AlertCircle, CheckCircle2, Clock, MapPin,
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

// ── types ─────────────────────────────────────────────────────────────────────
interface Payment {
  id: string; session_id: string; receipt_no: string | null;
  subtotal: number | null; gst_amount: number | null; total_amount: number | null;
  method: string; amount_received: number | null; change_due: number | null;
  status: string; paid_at: string | null;
}
interface Session {
  id: string; truck_id: string; owner_id: string | null;
  location_id: string; division_id: string | null; slot_id: string | null;
  check_in_time: string | null; check_out_time: string | null;
  days: number | null; rate_per_day: number | null; gst_percent: number | null;
  subtotal: number | null; gst_amount: number | null; total_amount: number | null;
}
interface Truck    { id: string; truck_number: string; truck_type: string | null }
interface Owner    { id: string; name: string; primary_mobile: string }
interface Location { id: string; name: string; city: string | null; address: string | null }
interface Division { id: string; name: string; truck_type: string | null }
interface Slot     { id: string; code: string }

interface ReceiptData {
  payment: Payment;
  session: Session;
  truck: Truck | null;
  owner: Owner | null;
  location: Location | null;
  division: Division | null;
  slot: Slot | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtRupees(n: number | null | undefined) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = d.getDate();
  const mon = d.toLocaleDateString("en-IN", { month: "short" });
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${mon} · ${time}`;
}
function calcDuration(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return "—";
  const diffMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (diffMs <= 0) return "—";
  const totalMins  = Math.floor(diffMs / 60000);
  const days       = Math.floor(totalMins / 1440);
  const hrs        = Math.floor((totalMins % 1440) / 60);
  const mins       = totalMins % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hrs)  parts.push(`${hrs} hr${hrs !== 1 ? "s" : ""}`);
  if (mins) parts.push(`${mins} min`);
  return parts.join(" ") || "< 1 min";
}
function methodLabel(m: string) {
  return { cash: "Cash", card: "Card", upi: "UPI", online: "Online" }[m.toLowerCase()] ?? m;
}
function receiptNo(payment: Payment) {
  return payment.receipt_no ?? `PKG-${payment.id.slice(0, 6).toUpperCase()}`;
}

// ── Suspense wrapper ──────────────────────────────────────────────────────────
export default function ReceiptViewPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ReceiptContent />
    </Suspense>
  );
}

function LoadingSkeleton() {
  return (
    <div className="px-4 py-6 max-w-2xl mx-auto animate-pulse space-y-4">
      <div className="h-4 bg-gray-100 rounded-full w-40" />
      <div className="h-80 bg-gray-100 rounded-2xl" />
    </div>
  );
}

// ── main content ──────────────────────────────────────────────────────────────
function ReceiptContent() {
  const params    = useSearchParams();
  const paymentId = params.get("payment_id");

  const [data,    setData]    = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [sending, setSending] = useState(false);
  const [sentOk,  setSentOk]  = useState(false);

  const load = useCallback(async () => {
    if (!paymentId) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const payment = await apiFetch<Payment>(`/payments/${paymentId}`);
      const session = await apiFetch<Session>(`/parking-sessions/${payment.session_id}`);

      const [truckRes, ownerRes, locRes, divRes, slotRes] = await Promise.allSettled([
        apiFetch<Truck>(`/trucks/${session.truck_id}`),
        session.owner_id   ? apiFetch<Owner>(`/owners/${session.owner_id}`) : Promise.resolve(null),
        apiFetch<Location>(`/locations/${session.location_id}`),
        session.division_id ? apiFetch<Division>(`/divisions/${session.division_id}`) : Promise.resolve(null),
        session.slot_id     ? apiFetch<Slot>(`/slots/${session.slot_id}`) : Promise.resolve(null),
      ]);

      setData({
        payment,
        session,
        truck:    truckRes.status  === "fulfilled" ? truckRes.value : null,
        owner:    ownerRes.status  === "fulfilled" ? ownerRes.value : null,
        location: locRes.status    === "fulfilled" ? locRes.value : null,
        division: divRes.status    === "fulfilled" ? divRes.value : null,
        slot:     slotRes.status   === "fulfilled" ? slotRes.value : null,
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load receipt."); }
    finally { setLoading(false); }
  }, [paymentId]);

  useEffect(() => { load(); }, [load]);

  async function handleSendToOwner() {
    if (!data?.session.owner_id) return;
    setSending(true);
    try {
      await apiFetch("/notices", {
        method: "POST",
        body: JSON.stringify({
          notice_type: "receipt_sent",
          message: `Receipt ${receiptNo(data.payment)} for truck ${data.truck?.truck_number ?? ""} — ₹${data.payment.total_amount}. Thank you for using ParkOS.`,
          owner_id: data.session.owner_id,
          session_id: data.session.id,
          status: "open",
        }),
      });
      setSentOk(true);
      setTimeout(() => setSentOk(false), 3000);
    } catch { /* silent */ }
    finally { setSending(false); }
  }

  if (loading) return <LoadingSkeleton />;

  if (!paymentId || error) {
    return (
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error || "No payment ID provided."}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { payment, session, truck, owner, location, division, slot } = data;
  const duration  = calcDuration(session.check_in_time, session.check_out_time);
  const truckType = truck?.truck_type
    ? truck.truck_type.charAt(0).toUpperCase() + truck.truck_type.slice(1)
    : null;

  const subtotal  = payment.subtotal ?? session.subtotal ?? 0;
  const gstAmt    = payment.gst_amount ?? session.gst_amount ?? 0;
  const total     = payment.total_amount ?? session.total_amount ?? 0;
  const gstPct    = session.gst_percent ?? 0;
  const days      = session.days ?? 0;
  const rate      = session.rate_per_day ?? (days > 0 ? Math.round(subtotal / days) : 0);

  return (
    <>
      {/* print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .receipt-card { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto space-y-5">

        {/* top bar */}
        <div className="no-print flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/billing"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm transition">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Link>
            <p className="text-sm font-bold text-gray-900">Receipt</p>
          </div>
          <div className="flex items-center gap-2">
            {sentOk && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                <CheckCircle2 className="w-3.5 h-3.5" />Sent to owner
              </span>
            )}
            {data.session.owner_id && (
              <button onClick={handleSendToOwner} disabled={sending}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl shadow-sm transition">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send to owner
              </button>
            )}
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl shadow-sm shadow-blue-200 transition">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={() => { document.title = `Receipt-${receiptNo(payment)}`; window.print(); }}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl shadow-sm transition">
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>

        {/* ── receipt card ── */}
        <div className="receipt-card bg-white rounded-3xl shadow-xl shadow-gray-200/80 overflow-hidden border border-gray-100 max-w-md mx-auto">

          {/* dark header */}
          <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-blue-900 px-6 py-7 text-center relative overflow-hidden">
            {/* decorative circles */}
            <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
            <div className="absolute -right-4 -bottom-8 w-28 h-28 rounded-full bg-white/5" />

            <p className="text-xl font-black text-white tracking-wide relative">ParkOS</p>
            {location && (
              <>
                <p className="text-sm text-indigo-300 mt-1 font-medium relative">
                  {location.name}{location.city ? ` — ${location.city}` : ""}
                </p>
                {location.address && (
                  <p className="text-xs text-indigo-400 mt-0.5 relative">{location.address}</p>
                )}
              </>
            )}
            <div className="inline-flex items-center gap-1.5 mt-3 bg-white/10 border border-white/20 rounded-full px-3 py-1 relative">
              <span className="text-xs font-bold text-indigo-200 font-mono tracking-wider">
                Receipt No: {receiptNo(payment)}
              </span>
            </div>
          </div>

          {/* truck section */}
          <div className="mx-5 mt-5 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl px-5 py-4 text-center">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5">Truck Number</p>
            <p className="text-3xl font-black text-indigo-700 tracking-widest font-mono">
              {truck?.truck_number ?? "—"}
            </p>
            {(division || slot || truckType) && (
              <p className="text-xs text-indigo-400 mt-1.5 font-medium">
                {[
                  division?.name,
                  slot ? `Slot ${slot.code}` : null,
                  truckType,
                ].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* owner + dates grid */}
          <div className="mx-5 mt-3 grid grid-cols-2 gap-2">
            <InfoCell label="Owner">
              <p className="text-sm font-bold text-gray-900">{owner?.name ?? "—"}</p>
            </InfoCell>
            <InfoCell label="Check-in">
              <p className="text-sm font-semibold text-gray-700">{fmtDateTime(session.check_in_time)}</p>
            </InfoCell>
            <InfoCell label="Check-out">
              <p className="text-sm font-semibold text-gray-700">{fmtDateTime(session.check_out_time)}</p>
            </InfoCell>
            <InfoCell label="Duration">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />{duration}
              </p>
            </InfoCell>
          </div>

          {/* charges */}
          <div className="mx-5 mt-4 border border-gray-100 rounded-2xl overflow-hidden">
            {days > 0 && rate > 0 && (
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <p className="text-sm text-gray-600">
                  {days} day{days !== 1 ? "s" : ""} × {fmtRupees(rate)}
                </p>
                <p className="text-sm font-semibold text-gray-800">{fmtRupees(subtotal)}</p>
              </div>
            )}
            {gstPct > 0 && (
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <p className="text-sm text-gray-600">GST {gstPct}%</p>
                <p className="text-sm font-semibold text-gray-800">{fmtRupees(gstAmt)}</p>
              </div>
            )}
            <div className="flex items-center justify-between px-5 py-4 bg-gray-50/60">
              <p className="text-base font-bold text-gray-900">Total paid</p>
              <p className="text-2xl font-black text-indigo-700">{fmtRupees(total)}</p>
            </div>
          </div>

          {/* payment footer */}
          <div className="mx-5 mt-3 grid grid-cols-2 gap-2">
            <InfoCell label="Payment method">
              <p className="text-sm font-bold text-gray-900">{methodLabel(payment.method)}</p>
            </InfoCell>
            {(payment.change_due ?? 0) > 0 && (
              <InfoCell label="Change given">
                <p className="text-sm font-bold text-indigo-600">{fmtRupees(payment.change_due)}</p>
              </InfoCell>
            )}
            {payment.paid_at && (
              <InfoCell label="Paid at">
                <p className="text-xs font-semibold text-gray-600">{fmtDateTime(payment.paid_at)}</p>
              </InfoCell>
            )}
          </div>

          {/* thank you */}
          <p className="text-center text-xs text-gray-400 italic py-5">
            Thank you for using ParkOS. Drive safe!
          </p>
        </div>
      </div>
    </>
  );
}

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  );
}
