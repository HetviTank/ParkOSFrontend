"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight, BookOpen, Truck,
  Plus, X, Loader2, AlertCircle, Link2, ShieldCheck,
  ChevronLeft, ChevronRight as Next, Info, IndianRupee, RefreshCw,
  Pencil, Trash2, CheckCircle2,
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
interface Owner { id: string; name: string; company: string | null; primary_mobile: string }
interface Khata { id: string; owner_id: string; billing_day: number; grace_days: number; is_active: boolean; is_deleted: boolean; created_at: string | null }
interface KhataTruck { id: string; khata_id: string; truck_id: string }
interface TruckObj { id: string; truck_number: string }
interface EnrichedKhata { khata: Khata; owner: Owner | null; khataTrucks: (KhataTruck & { truck_number?: string })[] }
interface BillSession {
  session_id: string; status: string;
  check_in_time: string; check_out_time: string | null;
  days: number; rate_per_day: number;
  subtotal: number; gst_percent: number; gst_amount: number; total_amount: number;
}
interface BillTruck {
  truck_id: string; truck_number: string;
  session_count: number; total_days: number; total_amount: number;
  sessions: BillSession[];
}
interface KhataBill {
  khata_id: string; period_start: string; billing_day: number;
  trucks: BillTruck[]; grand_total: number;
}

const PAGE_SIZE = 8;
const AVATAR_COLORS = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-amber-500","bg-red-500","bg-teal-500","bg-pink-500","bg-indigo-500"];
function avatarColor(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function initials(n: string) { return n.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase(); }
function fmtMobile(m: string) { return m.startsWith("+91") ? m : `+91 ${m}`; }
function fmtRupee(n: number) { return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`; }
function fmtPeriodLabel(periodStart: string): string {
  const from = new Date(periodStart);
  const to = new Date();
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  return `${fmt(from)} – ${fmt(to)}`;
}
function khataRef(idx: number) {
  return `KH-${String(idx + 1).padStart(3, "0")}`;
}
function statusFor(k: Khata): { label: string; cls: string } {
  if (k.is_deleted) return { label: "Deleted", cls: "bg-red-100 text-red-500 border border-red-200" };
  if (!k.is_active) return { label: "Inactive", cls: "bg-gray-100 text-gray-500 border border-gray-200" };
  const days = k.created_at ? Math.floor((Date.now() - new Date(k.created_at).getTime()) / 86400000) : 999;
  if (days < 30) return { label: "New account", cls: "bg-teal-100 text-teal-700 border border-teal-200" };
  return { label: "Active", cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" };
}

const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white transition";

// ── main page ─────────────────────────────────────────────────────────────────
export default function KhataMasterPage() {
  const [rows,     setRows]     = useState<EnrichedKhata[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [listErr,  setListErr]  = useState("");

  // caches
  const ownerCache = useRef<Record<string, Owner>>({});
  const truckCache = useRef<Record<string, TruckObj>>({});

  // form
  const [fName,    setFName]    = useState("");
  const [fMobile,  setFMobile]  = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fErr,     setFErr]     = useState("");
  const [fBusy,    setFBusy]    = useState(false);
  const [fOk,      setFOk]      = useState(false);

  // billing
  const [billingExpanded, setBillingExpanded] = useState<Record<string, boolean>>({});
  const [billingData,     setBillingData]     = useState<Record<string, KhataBill | "loading" | "error">>({});

  // per-card link-truck state
  const [linkInput,   setLinkInput]   = useState<Record<string, string>>({});
  const [linkBusy,    setLinkBusy]    = useState<Record<string, boolean>>({});
  const [linkErr,     setLinkErr]     = useState<Record<string, string>>({});
  const [unlinkBusy,  setUnlinkBusy]  = useState<Record<string, boolean>>({});
  // when truck not found: holds the selected truck_type for registration
  const [linkNewType, setLinkNewType] = useState<Record<string, string>>({});

  // ── edit drawer
  const [editRow,        setEditRow]        = useState<EnrichedKhata | null>(null);
  const [editBillingDay, setEditBillingDay] = useState("");
  const [editGraceDays,  setEditGraceDays]  = useState("");
  const [editBusy,       setEditBusy]       = useState(false);
  const [editErr,        setEditErr]        = useState("");
  const [editOk,         setEditOk]         = useState(false);
  const editDrawerRef = useRef<HTMLDivElement>(null);

  // ── delete confirm & busy per card
  const [deleteConfirm, setDeleteConfirm] = useState<Record<string, boolean>>({});
  const [deleteBusy,    setDeleteBusy]    = useState<Record<string, boolean>>({});

  const enrich = useCallback(async (khatas: Khata[]): Promise<EnrichedKhata[]> => {
    // collect missing owner IDs
    const missingOwners = [...new Set(khatas.map(k => k.owner_id).filter(id => !ownerCache.current[id]))];
    await Promise.allSettled(missingOwners.map(id =>
      apiFetch<Owner>(`/owners/${id}`).then(o => { ownerCache.current[id] = o; }).catch(() => {})
    ));

    // fetch khata-trucks for each khata
    const ktResults = await Promise.allSettled(
      khatas.map(k => apiFetch<{ count: number; list: KhataTruck[] }>(`/khata-trucks?khata_id=${k.id}&limit=50`))
    );

    // collect missing truck IDs
    const allTruckIds = ktResults.flatMap(r => r.status === "fulfilled" ? r.value.list.map(t => t.truck_id) : []);
    const missingTrucks = [...new Set(allTruckIds.filter(id => !truckCache.current[id]))];
    await Promise.allSettled(missingTrucks.map(id =>
      apiFetch<TruckObj>(`/trucks/${id}`).then(t => { truckCache.current[id] = t; }).catch(() => {})
    ));

    return khatas.map((k, i) => {
      const kt = ktResults[i].status === "fulfilled" ? ktResults[i].value.list : [];
      return {
        khata: k,
        owner: ownerCache.current[k.owner_id] ?? null,
        khataTrucks: kt.map(t => ({ ...t, truck_number: truckCache.current[t.truck_id]?.truck_number })),
      };
    });
  }, []);

  const fetchList = useCallback(async (p: number) => {
    setLoading(true); setListErr("");
    try {
      const start = (p - 1) * PAGE_SIZE;
      const data = await apiFetch<{ count: number; list: Khata[] }>(
        `/khatas?start=${start}&limit=${PAGE_SIZE}&sort_by=created_at&order=desc`
      );
      setTotal(data.count ?? 0);
      const enriched = await enrich(data.list ?? []);
      setRows(enriched);
    } catch (e) { setListErr(e instanceof Error ? e.message : "Failed to load."); }
    finally { setLoading(false); }
  }, [enrich]);

  useEffect(() => { fetchList(page); }, [page, fetchList]);

  // resolve truck number → truck_id
  async function resolveTruckId(num: string): Promise<string> {
    const trimmed = num.trim().toUpperCase();
    const existing = Object.values(truckCache.current).find(t => t.truck_number === trimmed);
    if (existing) return existing.id;
    const res = await apiFetch<{ count: number; list: TruckObj[] }>(`/trucks?search=${encodeURIComponent(trimmed)}&limit=10`);
    const match = res.list.find(t => t.truck_number.toUpperCase() === trimmed);
    if (!match) throw new Error(`Truck "${trimmed}" not found in system.`);
    truckCache.current[match.id] = match;
    return match.id;
  }

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fName.trim()) { setFErr("Owner name is required."); return; }
    if (!fMobile.trim() || fMobile.trim().replace(/\D/g,"").length < 10) { setFErr("Valid mobile number is required."); return; }
    setFBusy(true); setFErr(""); setFOk(false);
    try {
      const owner = await apiFetch<Owner>("/owners", {
        method: "POST",
        body: JSON.stringify({ name: fName.trim(), primary_mobile: fMobile.trim().replace(/\D/g,""), company: fCompany.trim() || null }),
      });
      ownerCache.current[owner.id] = owner;
      await apiFetch<Khata>("/khatas", {
        method: "POST",
        body: JSON.stringify({ owner_id: owner.id }),
      });
      setFName(""); setFMobile(""); setFCompany("");
      setFOk(true); setTimeout(() => setFOk(false), 3000);
      fetchList(1); setPage(1);
    } catch (e) { setFErr(e instanceof Error ? e.message : "Failed to create khata."); }
    finally { setFBusy(false); }
  }

  async function loadBilling(khataId: string) {
    setBillingData(p => ({ ...p, [khataId]: "loading" }));
    try {
      const bill = await apiFetch<KhataBill>(`/khatas/${khataId}/bill`);
      setBillingData(p => ({ ...p, [khataId]: bill }));
    } catch {
      setBillingData(p => ({ ...p, [khataId]: "error" }));
    }
  }

  async function handleLink(khataId: string) {
    const num = (linkInput[khataId] ?? "").trim().toUpperCase();
    if (!num) return;
    const pendingType = linkNewType[khataId];
    setLinkBusy(p => ({ ...p, [khataId]: true }));
    setLinkErr(p => ({ ...p, [khataId]: "" }));
    try {
      let truck_id: string;
      try {
        truck_id = await resolveTruckId(num);
        // truck found — clear any pending-register state
        setLinkNewType(p => { const n = { ...p }; delete n[khataId]; return n; });
      } catch {
        if (!pendingType) {
          // first attempt — truck not found, show type selector
          setLinkNewType(p => ({ ...p, [khataId]: "heavy" }));
          setLinkErr(p => ({ ...p, [khataId]: `"${num}" is not registered yet. Pick a type below and click Link to register & link it.` }));
          return;
        }
        // second attempt — user picked a type, register truck now
        const row = rows.find(r => r.khata.id === khataId);
        const newTruck = await apiFetch<TruckObj>("/trucks", {
          method: "POST",
          body: JSON.stringify({
            truck_number: num,
            truck_type: pendingType,
            owner_id: row?.owner?.id ?? null,
          }),
        });
        truckCache.current[newTruck.id] = newTruck;
        truck_id = newTruck.id;
        setLinkNewType(p => { const n = { ...p }; delete n[khataId]; return n; });
      }
      const kt = await apiFetch<KhataTruck>("/khata-trucks", {
        method: "POST",
        body: JSON.stringify({ khata_id: khataId, truck_id }),
      });
      const newKt = { ...kt, truck_number: truckCache.current[truck_id]?.truck_number ?? num };
      setRows(prev => prev.map(r => r.khata.id === khataId
        ? { ...r, khataTrucks: [...r.khataTrucks, newKt] }
        : r
      ));
      setLinkInput(p => ({ ...p, [khataId]: "" }));
      setLinkErr(p => ({ ...p, [khataId]: "" }));
    } catch (e) { setLinkErr(p => ({ ...p, [khataId]: e instanceof Error ? e.message : "Failed." })); }
    finally { setLinkBusy(p => ({ ...p, [khataId]: false })); }
  }

  async function handleUnlink(khataId: string, ktId: string) {
    setUnlinkBusy(p => ({ ...p, [ktId]: true }));
    try {
      await apiFetch(`/khata-trucks/${ktId}`, { method: "DELETE" });
      setRows(prev => prev.map(r => r.khata.id === khataId
        ? { ...r, khataTrucks: r.khataTrucks.filter(t => t.id !== ktId) }
        : r
      ));
    } catch { /* silent */ }
    finally { setUnlinkBusy(p => ({ ...p, [ktId]: false })); }
  }

  // ── edit drawer handlers ─────────────────────────────────────────────────────
  function openEdit(row: EnrichedKhata) {
    setEditRow(row);
    setEditBillingDay(String(row.khata.billing_day));
    setEditGraceDays(String(row.khata.grace_days));
    setEditErr(""); setEditOk(false);
  }

  async function handleSaveEdit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!editRow) return;
    setEditBusy(true); setEditErr(""); setEditOk(false);
    try {
      const updated = await apiFetch<Khata>(`/khatas/${editRow.khata.id}`, {
        method: "PUT",
        body: JSON.stringify({
          owner_id:    editRow.khata.owner_id,
          billing_day:  Number(editBillingDay) || 1,
          grace_days:   Number(editGraceDays)  || 0,
          is_active:    editRow.khata.is_active,
        }),
      });
      setRows(prev => prev.map(r =>
        r.khata.id === editRow.khata.id ? { ...r, khata: updated } : r
      ));
      setEditOk(true);
      setTimeout(() => { setEditRow(null); setEditOk(false); }, 1200);
    } catch (e) { setEditErr(e instanceof Error ? e.message : "Failed to save."); }
    finally { setEditBusy(false); }
  }

  // ── delete handlers ──────────────────────────────────────────────────────────
  async function handleDelete(khataId: string) {
    setDeleteBusy(p => ({ ...p, [khataId]: true }));
    try {
      await apiFetch(`/khatas/${khataId}`, { method: "DELETE" });
      setRows(prev => prev.filter(r => r.khata.id !== khataId));
      setTotal(p => Math.max(0, p - 1));
      setDeleteConfirm(p => { const n = { ...p }; delete n[khataId]; return n; });
    } catch { /* silent */ }
    finally { setDeleteBusy(p => ({ ...p, [khataId]: false })); }
  }

  // click-outside for edit drawer
  useEffect(() => {
    if (!editRow) return;
    const h = (e: MouseEvent) => {
      if (editDrawerRef.current && !editDrawerRef.current.contains(e.target as Node)) setEditRow(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [editRow]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-5">

      {/* header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/dashboard" className="hover:text-violet-600 transition">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600 font-medium">Khata Master</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Khata Master</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Monthly-account owners and their linked trucks. A truck linked here is treated as a Khata vehicle automatically at check-in, with its owner auto-filled.
        </p>
      </div>

      {/* two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ── left: create form ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
            <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-violet-600" />
            </div>
            <p className="text-sm font-bold text-gray-900">Create new khata</p>
          </div>

          <form onSubmit={handleCreate} className="px-5 py-5 space-y-4">
            {/* owner name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Owner name <span className="text-red-400">*</span>
                </label>
                <input value={fName} onChange={e => { setFName(e.target.value); setFErr(""); }}
                  placeholder="Full name" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Mobile <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">+91</span>
                  <input value={fMobile} onChange={e => { setFMobile(e.target.value); setFErr(""); }}
                    placeholder="XXXXX XXXXX" maxLength={15}
                    className={inputCls + " pl-9"} />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Company / Firm</label>
              <input value={fCompany} onChange={e => setFCompany(e.target.value)}
                placeholder="Firm name" className={inputCls} />
            </div>

            {fErr && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{fErr}</p>
              </div>
            )}
            {fOk && (
              <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3.5 py-2.5">
                <ShieldCheck className="w-4 h-4 text-violet-600 shrink-0" />
                <p className="text-sm text-violet-700 font-semibold">Khata created successfully.</p>
              </div>
            )}

            <button type="submit" disabled={fBusy}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl shadow-sm shadow-violet-200 transition text-sm">
              {fBusy
                ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</>
                : <><Plus className="w-4 h-4" />Create khata</>}
            </button>

            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                At check-in: a linked truck auto-fills its khata owner; an unlinked truck marked &quot;Khata&quot; shows this list to pick from.
              </p>
            </div>
          </form>
        </div>

        {/* ── right: khata list ── */}
        <div className="lg:col-span-3 space-y-3">

          {/* list header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-gray-700">Khata accounts</p>
              {total > 0 && (
                <span className="text-xs font-bold text-violet-700 bg-violet-100 border border-violet-200 px-2.5 py-0.5 rounded-full">
                  {total}
                </span>
              )}
            </div>
            <button onClick={() => fetchList(page)} disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {listErr && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{listErr}</p>
            </div>
          )}

          {/* skeletons */}
          {loading && rows.length === 0 && (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded-full w-40" />
                    <div className="h-3 bg-gray-100 rounded-full w-28" />
                  </div>
                  <div className="w-20 h-7 bg-gray-100 rounded-full" />
                </div>
                <div className="h-3 bg-gray-100 rounded-full w-full" />
              </div>
            ))
          )}

          {!loading && rows.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-16 text-center">
              <div className="w-14 h-14 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <BookOpen className="w-7 h-7 text-violet-400" />
              </div>
              <p className="text-sm font-semibold text-gray-500">No khata accounts yet</p>
              <p className="text-xs text-gray-400 mt-1">Create the first one using the form on the left.</p>
            </div>
          )}

          {rows.map((row, idx) => {
            const { khata, owner, khataTrucks } = row;
            const status = statusFor(khata);
            const ref = khataRef((page - 1) * PAGE_SIZE + idx);
            const name = owner?.name ?? "Unknown";
            const linkVal = linkInput[khata.id] ?? "";
            const isLinkBusy = linkBusy[khata.id] ?? false;
            const linkErrMsg = linkErr[khata.id] ?? "";
            const isDeleted = khata.is_deleted;
            const cardCls = isDeleted
              ? "bg-gray-50 rounded-2xl border border-gray-200 shadow-sm overflow-hidden opacity-70"
              : "bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden";
            const billCls = isDeleted
              ? "mx-5 mb-3 rounded-xl border border-violet-100 bg-violet-50/50 overflow-hidden hidden"
              : "mx-5 mb-3 rounded-xl border border-violet-100 bg-violet-50/50 overflow-hidden";
            const nameCls = isDeleted
              ? "font-bold text-sm truncate text-gray-400 line-through"
              : "font-bold text-gray-900 text-sm truncate";
            const avatarCls = isDeleted
              ? "w-11 h-11 bg-gray-300 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              : "w-11 h-11 " + avatarColor(name) + " rounded-xl flex items-center justify-center shrink-0 shadow-sm";

            return (
              <div key={khata.id} className={cardCls}>

                {/* owner header */}
                <div className="flex items-start gap-3 px-5 pt-4 pb-3">
                  <div className={`w-11 h-11 ${khata.is_deleted ? "bg-gray-300" : avatarColor(name)} rounded-xl flex items-center justify-center shrink-0 shadow-sm`}>
                    <span className="text-sm font-bold text-white tracking-wider">{initials(name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${khata.is_deleted ? "text-gray-400 line-through" : "text-gray-900"}`}>{name}</p>
                    <p className="text-xs text-gray-400 truncate">{owner?.company ?? "—"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{owner ? fmtMobile(owner.primary_mobile) : "—"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-mono">
                        {ref}
                      </span>
                      {!khata.is_deleted && (
                        <>
                          <button
                            onClick={() => openEdit(row)}
                            className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition"
                            title="Edit khata">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(p => ({ ...p, [khata.id]: true }))}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Delete khata">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* delete confirmation */}
                {!khata.is_deleted && deleteConfirm[khata.id] && (
                  <div className="mx-5 mb-3 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700 font-medium flex-1">Delete this khata account? This cannot be undone.</p>
                    <button
                      onClick={() => handleDelete(khata.id)}
                      disabled={deleteBusy[khata.id]}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-lg transition">
                      {deleteBusy[khata.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(p => { const n = { ...p }; delete n[khata.id]; return n; })}
                      className="p-1 text-gray-400 hover:text-gray-700 transition">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* billing summary */}
                <div className={`mx-5 mb-3 rounded-xl border border-violet-100 bg-violet-50/50 overflow-hidden${khata.is_deleted ? " hidden" : ""}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !billingExpanded[khata.id];
                      setBillingExpanded(p => ({ ...p, [khata.id]: next }));
                      if (next && !billingData[khata.id]) {
                        loadBilling(khata.id);
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-violet-50 transition"
                  >
                    <div className="flex items-center gap-2">
                      <IndianRupee className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-xs font-semibold text-violet-700">This month&apos;s bill</span>
                      <span className="text-[10px] text-violet-400">Billing day {khata.billing_day}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-violet-500">
                      {billingExpanded[khata.id] ? "▲ Hide" : "▼ View"}
                    </span>
                  </button>

                  {billingExpanded[khata.id] && (
                    <div className="border-t border-violet-100 px-4 py-3 space-y-2">
                      {billingData[khata.id] === "loading" && (
                        <div className="flex items-center gap-2 text-xs text-violet-500 py-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />Loading sessions…
                        </div>
                      )}
                      {billingData[khata.id] === "error" && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />Failed to load billing data.
                        </p>
                      )}
                      {typeof billingData[khata.id] === "object" && billingData[khata.id] !== null && billingData[khata.id] !== "loading" && billingData[khata.id] !== "error" && (() => {
                        const bill = billingData[khata.id] as KhataBill;
                        return (
                          <>
                            <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">
                              Period: {fmtPeriodLabel(bill.period_start)}
                            </p>
                            {bill.trucks.length === 0 && (
                              <p className="text-xs text-gray-400 italic">No sessions in this billing period.</p>
                            )}
                            {bill.trucks.map(t => (
                              <div key={t.truck_number} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Truck className="w-3 h-3 text-blue-400 shrink-0" />
                                  <span className="text-xs font-mono font-bold text-gray-800 truncate">{t.truck_number}</span>
                                  <span className="text-[10px] text-gray-400 shrink-0">
                                    {t.session_count} session{t.session_count !== 1 ? "s" : ""} · {t.total_days}d
                                  </span>
                                </div>
                                <span className="text-xs font-semibold text-gray-700 shrink-0">{fmtRupee(t.total_amount)}</span>
                              </div>
                            ))}
                            {bill.trucks.length > 0 && (
                              <div className="border-t border-violet-200 pt-2 flex items-center justify-between">
                                <span className="text-xs font-bold text-violet-800">Total payable</span>
                                <span className="text-sm font-extrabold text-violet-700">{fmtRupee(bill.grand_total)}</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => loadBilling(khata.id)}
                              className="text-[10px] text-violet-400 hover:text-violet-600 flex items-center gap-1 pt-0.5 transition"
                            >
                              <RefreshCw className="w-3 h-3" />Refresh
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* trucks */}
                <div className="border-t border-gray-50 px-5 py-3 space-y-2.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Linked trucks ({khataTrucks.length})
                  </p>

                  {khataTrucks.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {khataTrucks.map(kt => (
                        <div key={kt.id}
                          className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-lg font-mono">
                          <Truck className="w-3 h-3 shrink-0" />
                          {kt.truck_number ?? kt.truck_id.slice(0, 8)}
                          <button
                            onClick={() => handleUnlink(khata.id, kt.id)}
                            disabled={unlinkBusy[kt.id]}
                            className="ml-0.5 text-blue-400 hover:text-red-500 transition disabled:opacity-40">
                            {unlinkBusy[kt.id]
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <X className="w-3 h-3" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No trucks linked yet — link one below</p>
                  )}

                  {/* link new truck */}
                  <div className="flex gap-2 pt-0.5">
                    <input
                      value={linkVal}
                      onChange={e => {
                        setLinkInput(p => ({ ...p, [khata.id]: e.target.value.toUpperCase() }));
                        // reset type selector if truck number changes
                        setLinkNewType(p => { const n = { ...p }; delete n[khata.id]; return n; });
                        setLinkErr(p => ({ ...p, [khata.id]: "" }));
                      }}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleLink(khata.id); } }}
                      placeholder="Truck number to link..."
                      className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white transition font-mono uppercase"
                    />
                    <button
                      onClick={() => handleLink(khata.id)}
                      disabled={!linkVal.trim() || isLinkBusy}
                      className="flex items-center gap-1 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-xs font-bold rounded-lg transition whitespace-nowrap">
                      {isLinkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                      Link
                    </button>
                  </div>

                  {/* truck-not-found: inline type selector */}
                  {linkNewType[khata.id] !== undefined && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs text-amber-700 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {linkErrMsg}
                      </p>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Select truck type</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { value: "heavy",   label: "Heavy (20T+)"  },
                          { value: "medium",  label: "Medium (10-20T)"},
                          { value: "light",   label: "Light (<10T)"  },
                          { value: "trailer", label: "Trailer"       },
                          { value: "tanker",  label: "Tanker"        },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setLinkNewType(p => ({ ...p, [khata.id]: opt.value }))}
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
                              linkNewType[khata.id] === opt.value
                                ? "bg-violet-600 text-white border-violet-600"
                                : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => handleLink(khata.id)}
                          disabled={isLinkBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-xs font-bold rounded-lg transition">
                          {isLinkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                          Register &amp; link
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLinkNewType(p => { const n = { ...p }; delete n[khata.id]; return n; });
                            setLinkErr(p => ({ ...p, [khata.id]: "" }));
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* generic error (not the not-found prompt) */}
                  {linkErrMsg && linkNewType[khata.id] === undefined && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />{linkErrMsg}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3">
              <p className="text-xs text-gray-400">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
                <span className="font-semibold text-gray-600">{total}</span>
              </p>
              <div className="flex items-center gap-1">
                <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </PagBtn>
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
                  <button key={i + 1} onClick={() => setPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition ${page === i + 1 ? "bg-violet-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                    {i + 1}
                  </button>
                ))}
                <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <Next className="w-4 h-4" />
                </PagBtn>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit drawer ─────────────────────────────────────────────────────── */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setEditRow(null)} />
          <div ref={editDrawerRef} className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full">

            {/* header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Edit khata</p>
                  <p className="text-xs text-gray-400">{editRow.owner?.name ?? "Unknown owner"}</p>
                </div>
              </div>
              <button onClick={() => setEditRow(null)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* form */}
            <form id="edit-khata-form" onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* billing day + grace days */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Billing day (1–31)</label>
                  <input
                    type="number" min={1} max={31} value={editBillingDay}
                    onChange={e => setEditBillingDay(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Grace days</label>
                  <input
                    type="number" min={0} value={editGraceDays}
                    onChange={e => setEditGraceDays(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {editErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{editErr}</p>
                </div>
              )}
              {editOk && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-700 font-semibold">Saved!</p>
                </div>
              )}
            </form>

            {/* footer */}
            <div className="border-t border-gray-100 px-6 py-4 flex gap-3 bg-gray-50/50">
              <button type="button" onClick={() => setEditRow(null)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                Cancel
              </button>
              <button type="submit" form="edit-khata-form" disabled={editBusy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 rounded-xl shadow-sm transition">
                {editBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:pointer-events-none transition">
      {children}
    </button>
  );
}
