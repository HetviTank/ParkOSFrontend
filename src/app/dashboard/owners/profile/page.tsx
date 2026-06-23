"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, ArrowLeft, Phone, Building2, Mail, MapPin,
  Truck, IndianRupee, Calendar, BarChart2, Clock, X,
  Loader2, AlertCircle, CheckCircle2, Edit2, Plus, Users,
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
interface Owner {
  id: string; name: string; company: string | null;
  primary_mobile: string; alternate_mobile: string | null;
  email: string | null; gst_number: string | null; address: string | null;
  is_active: boolean; created_at: string | null;
}
interface TruckObj { id: string; truck_number: string; truck_type: string | null }
interface Session {
  id: string; truck_id: string; division_id: string | null;
  check_in_time: string | null; check_out_time: string | null;
  days: number | null; total_amount: number | null;
  subtotal: number | null; status: string; entry_type: string;
}
interface Payment { id: string; method: string; total_amount: number | null; status: string }
interface Division { id: string; name: string }

interface EnrichedSession extends Session {
  truck_number?: string;
  division_name?: string;
  payment?: Payment;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500","bg-red-500","bg-teal-500","bg-pink-500","bg-indigo-500"];
function avatarColor(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function initials(n: string) { return n.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase(); }
function fmtMobile(m: string) { const d = m.replace(/\D/g,""); return `+91 ${d.slice(-10,-5)} ${d.slice(-5)}`; }
function fmtRupees(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
function fmtMonthYear(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
function fmtRange(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn) return "—";
  const inn = new Date(checkIn);
  const inDay = inn.getDate();
  const inMon = inn.toLocaleDateString("en-IN", { month: "short" });
  if (!checkOut) return `In ${inDay} ${inMon}`;
  const out = new Date(checkOut);
  const outDay = out.getDate();
  const outMon = out.toLocaleDateString("en-IN", { month: "short" });
  if (inMon === outMon && inn.getFullYear() === out.getFullYear())
    return `${inDay}–${outDay} ${outMon}`;
  return `${inDay} ${inMon} – ${outDay} ${outMon}`;
}
function methodLabel(m: string | undefined): string {
  if (!m) return "";
  return { cash: "Cash", card: "Card", upi: "UPI", online: "Online" }[m.toLowerCase()] ?? m;
}

const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition";

// ── Suspense wrapper ──────────────────────────────────────────────────────────
export default function OwnerProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto animate-pulse space-y-5">
      <div className="h-4 bg-gray-100 rounded-full w-48" />
      <div className="h-32 bg-gray-100 rounded-2xl" />
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-40 bg-gray-100 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <div className="h-20 bg-gray-100 rounded-2xl" />
          <div className="h-20 bg-gray-100 rounded-2xl" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ── main content ──────────────────────────────────────────────────────────────
function ProfileContent() {
  const params = useSearchParams();
  const ownerId = params.get("id");

  const [owner,    setOwner]    = useState<Owner | null>(null);
  const [trucks,   setTrucks]   = useState<TruckObj[]>([]);
  const [sessions, setSessions] = useState<EnrichedSession[]>([]);
  const [sessTotal, setSessTotal] = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const divCache = useRef<Record<string, Division>>({});

  // edit drawer
  const [editOpen, setEditOpen] = useState(false);
  const [fName,    setFName]    = useState("");
  const [fMobile,  setFMobile]  = useState("");
  const [fAlt,     setFAlt]     = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fEmail,   setFEmail]   = useState("");
  const [fGst,     setFGst]     = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fErr,     setFErr]     = useState("");
  const [fBusy,    setFBusy]    = useState(false);
  const [fOk,      setFOk]      = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editOpen) return;
    const h = (e: MouseEvent) => { if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setEditOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [editOpen]);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true); setError("");
    try {
      const [ownerRes, truckRes, sessRes] = await Promise.all([
        apiFetch<Owner>(`/owners/${ownerId}`),
        apiFetch<{ count: number; list: TruckObj[] }>(`/trucks?owner_id=${ownerId}&limit=50`),
        apiFetch<{ count: number; list: Session[] }>(`/parking-sessions?owner_id=${ownerId}&limit=100&sort_by=created_at&order=desc`),
      ]);

      setOwner(ownerRes);
      setTrucks(truckRes.list ?? []);
      setSessTotal(sessRes.count ?? 0);

      const rawSessions = sessRes.list ?? [];

      // enrich: divisions + payments in parallel per session
      const missingDivIds = [...new Set(rawSessions.map(s => s.division_id).filter(Boolean) as string[])]
        .filter(id => !divCache.current[id]);
      await Promise.allSettled(missingDivIds.map(id =>
        apiFetch<Division>(`/divisions/${id}`).then(d => { divCache.current[id] = d; }).catch(() => {})
      ));

      const truckMap: Record<string, string> = {};
      (truckRes.list ?? []).forEach(t => { truckMap[t.id] = t.truck_number; });

      // fetch payments for each session (first 20 for display)
      const displaySessions = rawSessions.slice(0, 20);
      const payResults = await Promise.allSettled(
        displaySessions.map(s => apiFetch<{ count: number; list: Payment[] }>(`/payments?session_id=${s.id}&limit=1`))
      );

      const enriched: EnrichedSession[] = rawSessions.map((s, i) => ({
        ...s,
        truck_number: truckMap[s.truck_id] ?? undefined,
        division_name: s.division_id ? divCache.current[s.division_id]?.name : undefined,
        payment: i < 20 && payResults[i].status === "fulfilled"
          ? payResults[i].value.list[0] ?? undefined
          : undefined,
      }));

      setSessions(enriched);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load profile."); }
    finally { setLoading(false); }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  function openEdit() {
    if (!owner) return;
    setFName(owner.name); setFMobile(owner.primary_mobile.replace(/\D/g,""));
    setFAlt(owner.alternate_mobile?.replace(/\D/g,"") ?? "");
    setFCompany(owner.company ?? ""); setFEmail(owner.email ?? "");
    setFGst(owner.gst_number ?? ""); setFAddress(owner.address ?? "");
    setFErr(""); setFOk(false); setEditOpen(true);
  }

  async function handleEdit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fName.trim()) { setFErr("Name is required."); return; }
    if (fMobile.length < 10) { setFErr("Enter a valid 10-digit mobile."); return; }
    setFBusy(true); setFErr(""); setFOk(false);
    try {
      const updated = await apiFetch<Owner>(`/owners/${ownerId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: fName.trim(), primary_mobile: fMobile,
          alternate_mobile: fAlt || null, company: fCompany || null,
          email: fEmail || null, gst_number: fGst || null, address: fAddress || null,
        }),
      });
      setOwner(updated); setFOk(true);
      setTimeout(() => setEditOpen(false), 1200);
    } catch (e) { setFErr(e instanceof Error ? e.message : "Failed to update."); }
    finally { setFBusy(false); }
  }

  // ── stats ──
  const totalSpend = sessions.reduce((s, ss) => s + (ss.total_amount ?? 0), 0);
  const stayDays   = sessions.map(s => s.days).filter((d): d is number => d != null && d > 0);
  const avgStay    = stayDays.length ? (stayDays.reduce((a, b) => a + b, 0) / stayDays.length) : 0;
  const parkedNow  = sessions.filter(s => s.status === "parked");
  const outstanding = parkedNow.reduce((s, ss) => s + (ss.subtotal ?? ss.total_amount ?? 0), 0);

  if (!ownerId) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Users className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-500">No owner selected</p>
          <Link href="/dashboard/owners" className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to owners
          </Link>
        </div>
      </div>
    );
  }

  if (loading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!owner) return null;

  const isActive = owner.is_active;
  const sinceTxt = `Owner since ${fmtMonthYear(owner.created_at)}`;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-5">

      {/* breadcrumb + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/owners"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/dashboard/owners" className="hover:text-blue-600 transition">Owners</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 font-medium">Owner profile</span>
          </div>
        </div>
        <button onClick={openEdit}
          className="flex items-center gap-1.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 px-4 py-1.5 rounded-xl shadow-sm hover:bg-gray-50 transition">
          <Edit2 className="w-3.5 h-3.5" /> Edit
        </button>
      </div>

      {/* owner header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 ${avatarColor(owner.name)} rounded-2xl flex items-center justify-center shrink-0 shadow-sm`}>
            <span className="text-xl font-bold text-white tracking-wider">{initials(owner.name)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{owner.name}</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {owner.company ? `${owner.company} · ` : ""}{sinceTxt}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${isActive ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                {isActive ? "Active" : "Inactive"}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-100">
                {sessTotal} visits
              </span>
              {totalSpend > 0 && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">
                  {fmtRupees(totalSpend)} total
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ── left: contact + trucks ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* contact details */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide px-5 py-3.5 border-b border-gray-100">
              Contact details
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
              <DetailBox label="Primary mobile">
                <a href={`tel:${owner.primary_mobile}`} className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-blue-600 transition">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />{fmtMobile(owner.primary_mobile)}
                </a>
              </DetailBox>
              <DetailBox label="Alternate mobile">
                {owner.alternate_mobile
                  ? <a href={`tel:${owner.alternate_mobile}`} className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-blue-600 transition">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />{fmtMobile(owner.alternate_mobile)}
                    </a>
                  : <span className="text-sm text-gray-300 italic">Not provided</span>}
              </DetailBox>
              <DetailBox label="Email">
                {owner.email
                  ? <a href={`mailto:${owner.email}`} className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-blue-600 transition truncate">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />{owner.email}
                    </a>
                  : <span className="text-sm text-gray-300 italic">Not provided</span>}
              </DetailBox>
              <DetailBox label="GST number">
                {owner.gst_number
                  ? <span className="text-sm font-mono font-semibold text-gray-800">{owner.gst_number}</span>
                  : <span className="text-sm text-gray-300 italic">Not provided</span>}
              </DetailBox>
            </div>
            {owner.address && (
              <div className="border-t border-gray-100 px-5 py-3.5">
                <p className="text-xs text-gray-400 font-medium mb-1">Address</p>
                <p className="flex items-start gap-1.5 text-sm text-gray-700">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />{owner.address}
                </p>
              </div>
            )}
          </div>

          {/* registered trucks */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide px-5 py-3.5 border-b border-gray-100">
              Registered trucks
            </p>
            {trucks.length === 0 ? (
              <p className="text-sm text-gray-300 italic px-5 py-4">No trucks registered yet.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {trucks.map(t => {
                  const currentSess = sessions.find(s => s.truck_id === t.id && s.status === "parked");
                  const lastOut = sessions.find(s => s.truck_id === t.id && s.check_out_time);
                  const isParked = !!currentSess;
                  return (
                    <div key={t.id}
                      className={`flex items-center gap-3 px-5 py-3.5 ${isParked ? "bg-amber-50/50" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <Link href={`/dashboard/trucks/profile?q=${encodeURIComponent(t.truck_number)}`}
                          className="font-bold text-blue-600 hover:underline text-sm font-mono">
                          {t.truck_number}
                        </Link>
                        <span className="text-gray-300 mx-2">·</span>
                        <span className="text-sm text-gray-400">
                          {t.truck_type ? (t.truck_type.charAt(0).toUpperCase() + t.truck_type.slice(1)) : "Unknown"}
                        </span>
                        <span className="text-gray-300 mx-2">·</span>
                        <span className="text-xs text-gray-400">
                          {isParked ? "Parked now" : lastOut ? `Last out ${fmtRange(null, lastOut.check_out_time)}` : "No visits yet"}
                        </span>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${isParked ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {isParked ? "Parked" : "Checked out"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── right: stats + history ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* 2×2 stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Total visits" value={String(sessTotal)}
              sub={`Since ${fmtMonthYear(owner.created_at)}`}
              subCls="text-blue-500" bg="bg-blue-50/60 border-blue-100"
              icon={<BarChart2 className="w-4 h-4 text-blue-400" />}
            />
            <StatCard
              label="Total spend" value={fmtRupees(totalSpend)}
              sub="Lifetime" subCls="text-emerald-500"
              bg="bg-emerald-50/60 border-emerald-100"
              icon={<IndianRupee className="w-4 h-4 text-emerald-400" />}
            />
            <StatCard
              label="Avg. stay" value={avgStay > 0 ? `${avgStay.toFixed(1)} days` : "—"}
              sub="Per visit" subCls="text-amber-500"
              bg="bg-amber-50/60 border-amber-100"
              icon={<Clock className="w-4 h-4 text-amber-400" />}
            />
            <StatCard
              label="Outstanding" value={fmtRupees(outstanding)}
              sub={outstanding === 0 ? "All paid" : `${parkedNow.length} inside`}
              subCls={outstanding === 0 ? "text-emerald-500" : "text-red-500"}
              bg={outstanding === 0 ? "bg-emerald-50/60 border-emerald-100" : "bg-red-50/60 border-red-100"}
              icon={<IndianRupee className={`w-4 h-4 ${outstanding === 0 ? "text-emerald-400" : "text-red-400"}`} />}
            />
          </div>

          {/* visit history */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide px-5 py-3.5 border-b border-gray-100">
              Visit history
            </p>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-300 italic px-5 py-4">No visits yet.</p>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
                {sessions.slice(0, 20).map(s => {
                  const range = fmtRange(s.check_in_time, s.check_out_time);
                  const isParked = s.status === "parked";
                  const pay = s.payment;
                  const payLine = pay
                    ? `${fmtRupees(pay.total_amount ?? 0)} ${methodLabel(pay.method)}`
                    : isParked ? "Still parked" : "—";

                  const badge = isParked
                    ? { label: "Parked", cls: "bg-amber-100 text-amber-700 border-amber-200" }
                    : pay
                    ? { label: "Paid",   cls: "bg-emerald-100 text-emerald-700 border-emerald-200" }
                    : { label: "Done",   cls: "bg-gray-100 text-gray-500 border-gray-200" };

                  return (
                    <div key={s.id} className={`px-5 py-3 flex items-start gap-3 ${isParked ? "bg-amber-50/40" : ""}`}>
                      <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-gray-300" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 leading-tight">
                          {s.truck_number ?? "—"} · {range}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {s.division_name ? `${s.division_name} · ` : ""}
                          {s.days ? `${s.days} day${s.days !== 1 ? "s" : ""} · ` : ""}
                          {payLine}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── edit drawer ── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setEditOpen(false)} />
          <div ref={drawerRef} className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Edit2 className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-base font-bold text-gray-900">Edit owner</p>
              </div>
              <button onClick={() => setEditOpen(false)} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form id="edit-form" onSubmit={handleEdit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full name <span className="text-red-400">*</span></label>
                <input value={fName} onChange={e => { setFName(e.target.value); setFErr(""); }} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Primary mobile <span className="text-red-400">*</span></label>
                  <input value={fMobile} onChange={e => { setFMobile(e.target.value.replace(/\D/g,"").slice(0,10)); setFErr(""); }}
                    placeholder="10 digits" maxLength={10} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Alternate mobile</label>
                  <input value={fAlt} onChange={e => setFAlt(e.target.value.replace(/\D/g,"").slice(0,10))}
                    placeholder="Optional" maxLength={10} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Company / Firm</label>
                <input value={fCompany} onChange={e => setFCompany(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
                <input value={fEmail} onChange={e => setFEmail(e.target.value)} type="email" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">GST number</label>
                <input value={fGst} onChange={e => setFGst(e.target.value.toUpperCase())} maxLength={20} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Address</label>
                <textarea value={fAddress} onChange={e => setFAddress(e.target.value)} rows={2} className={inputCls + " resize-none"} />
              </div>
              {fErr && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{fErr}</p>
                </div>
              )}
              {fOk && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-700 font-semibold">Owner updated successfully!</p>
                </div>
              )}
            </form>
            <div className="border-t border-gray-100 px-6 py-4 flex gap-3 bg-gray-50/50">
              <button type="button" onClick={() => setEditOpen(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                Cancel
              </button>
              <button type="submit" form="edit-form" disabled={fBusy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl shadow-sm shadow-blue-200 transition">
                {fBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <>Save changes</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── small pieces ──────────────────────────────────────────────────────────────
function DetailBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5">
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, subCls, bg, icon }: {
  label: string; value: string; sub: string; subCls: string; bg: string; icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${bg}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        {icon}
      </div>
      <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
      <p className={`text-xs font-medium mt-1 ${subCls}`}>{sub}</p>
    </div>
  );
}
