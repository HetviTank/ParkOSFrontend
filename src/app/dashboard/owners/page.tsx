"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight, Users, Phone, Building2, Truck, Plus,
  Search, X, Loader2, AlertCircle, ChevronLeft,
  ChevronRight as Next, Info, RefreshCw, CheckCircle2,
  Clock, UserPlus, MapPin, Mail, Pencil, Trash2,
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
interface Session { id: string; check_in_time: string | null; check_out_time: string | null; total_amount: number | null; status: string }
interface EnrichedOwner { owner: Owner; trucks: TruckObj[]; sessions: Session[]; totalSpend: number; lastSession: Session | null }

const PAGE_SIZE = 10;

// ── utils ─────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500","bg-red-500","bg-teal-500","bg-pink-500","bg-indigo-500","bg-orange-500","bg-cyan-500"];
function avatarColor(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function initials(n: string) { return n.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase(); }
function fmtMobile(m: string) { const d = m.replace(/\D/g, ""); return `+91 ${d.slice(-10, -5)} ${d.slice(-5)}`; }
function fmtRupees(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
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

const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition";

// ── page ──────────────────────────────────────────────────────────────────────
export default function OwnersPage() {
  const [rows,    setRows]    = useState<EnrichedOwner[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [listErr, setListErr] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");

  // drawer
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

  // truck edit / delete / add
  const [editTruck,   setEditTruck]   = useState<{ ownerId: string; truckId: string; currentNumber: string } | null>(null);
  const [deleteTruck, setDeleteTruck] = useState<{ ownerId: string; truckId: string; truckNumber: string } | null>(null);
  const [addTruck,    setAddTruck]    = useState<{ ownerId: string } | null>(null);
  const [editValue,   setEditValue]   = useState("");
  const [addTruckValue, setAddTruckValue] = useState("");
  const [addTruckType,  setAddTruckType]  = useState("");
  const [actionBusy,  setActionBusy]  = useState(false);
  const [actionErr,   setActionErr]   = useState("");

  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setDrawerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [drawerOpen]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  const enrich = useCallback(async (owners: Owner[]): Promise<EnrichedOwner[]> => {
    const results = await Promise.allSettled(owners.map(async owner => {
      const [truckRes, sessRes] = await Promise.allSettled([
        apiFetch<{ count: number; list: TruckObj[] }>(`/trucks?owner_id=${owner.id}&limit=20`),
        apiFetch<{ count: number; list: Session[] }>(`/parking-sessions?owner_id=${owner.id}&limit=50&sort_by=created_at&order=desc`),
      ]);
      const trucks   = truckRes.status  === "fulfilled" ? truckRes.value.list  : [];
      const sessions = sessRes.status   === "fulfilled" ? sessRes.value.list   : [];
      const totalSpend = sessions.reduce((s, ss) => s + (ss.total_amount ?? 0), 0);
      const lastSession = sessions[0] ?? null;
      return { owner, trucks, sessions, totalSpend, lastSession };
    }));
    return results.map((r, i) =>
      r.status === "fulfilled" ? r.value
        : { owner: owners[i], trucks: [], sessions: [], totalSpend: 0, lastSession: null }
    );
  }, []);

  const fetchList = useCallback(async (p: number, q: string) => {
    setLoading(true); setListErr("");
    try {
      const start = (p - 1) * PAGE_SIZE;
      let url = `/owners?start=${start}&limit=${PAGE_SIZE}&sort_by=created_at&order=desc`;
      if (q) url += `&search=${encodeURIComponent(q)}`;
      const data = await apiFetch<{ count: number; list: Owner[] }>(url);
      setTotal(data.count ?? 0);
      const enriched = await enrich(data.list ?? []);
      setRows(enriched);
    } catch (e) { setListErr(e instanceof Error ? e.message : "Failed to load owners."); }
    finally { setLoading(false); }
  }, [enrich]);

  useEffect(() => { fetchList(page, search); }, [page, search, fetchList]);

  function resetForm() {
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
      setTimeout(() => { setDrawerOpen(false); resetForm(); fetchList(1, search); setPage(1); }, 1200);
    } catch (err) { setFErr(err instanceof Error ? err.message : "Failed to create owner."); }
    finally { setFBusy(false); }
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

      {/* header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600 font-medium">Owners</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Truck owners</h1>
        <p className="text-sm text-gray-400 mt-0.5">Owner profiles auto-fill when a returning truck checks in.</p>
      </div>

      {/* info tip */}
      <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">
          When a linked truck checks in next time, its owner&apos;s details fill automatically — no re-entry needed.
        </p>
      </div>

      {/* search + add button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name, mobile, truck..."
            className="w-full pl-10 pr-9 py-2.5 text-sm bg-white border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
          {searchInput && (
            <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button onClick={() => { setDrawerOpen(true); resetForm(); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold px-4 py-2.5 rounded-xl shadow-sm shadow-blue-200 transition text-sm whitespace-nowrap">
          <UserPlus className="w-4 h-4" />
          Add owner
        </button>
        <button onClick={() => fetchList(page, search)} disabled={loading}
          className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-white border border-gray-200 rounded-xl shadow-sm transition">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* error */}
      {listErr && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{listErr}</p>
        </div>
      )}

      {/* skeletons */}
      {loading && rows.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded-full w-48" />
                  <div className="h-3 bg-gray-100 rounded-full w-32" />
                </div>
                <div className="w-16 h-6 bg-gray-100 rounded-full" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="space-y-2"><div className="h-3 bg-gray-100 rounded-full w-24" /><div className="h-4 bg-gray-100 rounded-full w-36" /></div>
                <div className="space-y-2"><div className="h-3 bg-gray-100 rounded-full w-24" /><div className="flex gap-1.5"><div className="h-6 bg-gray-100 rounded-lg w-20" /><div className="h-6 bg-gray-100 rounded-lg w-20" /></div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* empty */}
      {!loading && rows.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Users className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-500">No owners found</p>
          <p className="text-xs text-gray-400 mt-1">
            {search ? "No results match your search." : "Add the first owner using the button above."}
          </p>
        </div>
      )}

      {/* owner list */}
      <div className="space-y-3">
        {rows.map(({ owner, trucks, totalSpend, lastSession }) => {
          const currentlyParked = lastSession?.status === "parked";
          const lastVisitTime = currentlyParked ? lastSession?.check_in_time : lastSession?.check_out_time;
          const lastVisitLabel = relativeTime(lastVisitTime ?? null);
          const isActive = owner.is_active;

          const cardBg = currentlyParked
            ? "bg-amber-50 border-amber-200"
            : !isActive
            ? "bg-gray-50 border-gray-200"
            : "bg-white border-gray-100";

          const statusBadge = !isActive
            ? { label: "Inactive", cls: "bg-gray-100 text-gray-500 border border-gray-200" }
            : currentlyParked
            ? { label: "Currently parked", cls: "bg-amber-100 text-amber-700 border border-amber-200" }
            : { label: "Active", cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" };

          return (
            <div key={owner.id} className={`rounded-2xl border shadow-sm overflow-hidden transition-colors ${cardBg}`}>
              {/* owner header row */}
              <div className="flex items-start gap-4 px-5 pt-5 pb-4">
                <div className={`w-12 h-12 ${avatarColor(owner.name)} rounded-xl flex items-center justify-center shrink-0 shadow-sm`}>
                  <span className="text-sm font-bold text-white tracking-wider">{initials(owner.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/dashboard/owners/profile?id=${owner.id}`}
                    className="font-bold text-gray-900 text-base leading-tight truncate hover:text-blue-600 transition block">
                    {owner.name}
                  </Link>
                  <p className="text-sm text-gray-400 truncate mt-0.5">{owner.company ?? <span className="italic text-gray-300">No firm</span>}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusBadge.cls}`}>
                    {statusBadge.label}
                  </span>
                  <Link href={`/dashboard/owners/profile?id=${owner.id}`}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition whitespace-nowrap">
                    View profile →
                  </Link>
                </div>
              </div>

              {/* detail grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-t border-gray-100/60 divide-y sm:divide-y-0 sm:divide-x divide-gray-100/60">

                {/* left: mobile + total spend */}
                <div className="px-5 py-4 space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 font-medium mb-1">Primary mobile</p>
                    <a href={`tel:${owner.primary_mobile}`}
                      className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-blue-600 transition group">
                      <Phone className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500" />
                      {fmtMobile(owner.primary_mobile)}
                    </a>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium mb-1">Total spend</p>
                    <p className="text-sm font-bold text-gray-800">
                      {totalSpend > 0 ? fmtRupees(totalSpend) : <span className="text-gray-300 font-normal">—</span>}
                    </p>
                  </div>
                </div>

                {/* right: trucks + last visit */}
                <div className="px-5 py-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs text-gray-400 font-medium">
                        Trucks linked <span className="text-gray-300">({trucks.length})</span>
                      </p>
                      <button
                        onClick={() => { setAddTruck({ ownerId: owner.id }); setAddTruckValue(""); setAddTruckType(""); setActionErr(""); }}
                        title="Add truck"
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-lg transition">
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    </div>
                    {trucks.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {trucks.map(t => (
                          <div key={t.id}
                            className="group flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg font-mono overflow-hidden">
                            <Link
                              href={`/dashboard/trucks/profile?q=${encodeURIComponent(t.truck_number)}`}
                              className="flex items-center gap-1 px-2.5 py-1 hover:bg-blue-100 transition">
                              <Truck className="w-3 h-3 shrink-0" />
                              {t.truck_number}
                            </Link>
                            <div className="flex items-center gap-0 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => { setEditTruck({ ownerId: owner.id, truckId: t.id, currentNumber: t.truck_number }); setEditValue(t.truck_number); setActionErr(""); }}
                                title="Edit truck number"
                                className="p-1 rounded hover:bg-blue-200 text-blue-500 hover:text-blue-700 transition">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => { setDeleteTruck({ ownerId: owner.id, truckId: t.id, truckNumber: t.truck_number }); setActionErr(""); }}
                                title="Delete truck"
                                className="p-1 rounded hover:bg-red-100 text-blue-400 hover:text-red-600 transition">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-300 italic">No trucks linked</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium mb-1">Last visit</p>
                    {lastSession ? (
                      <p className={`text-sm font-semibold flex items-center gap-1.5 ${currentlyParked ? "text-amber-600" : "text-gray-700"}`}>
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        {lastVisitLabel}
                        {currentlyParked && (
                          <span className="text-xs font-bold bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-md">active</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-300 italic">No visits yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3">
          <p className="text-xs text-gray-400">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
            <span className="font-semibold text-gray-600">{total}</span> owners
          </p>
          <div className="flex items-center gap-1">
            <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
              <button key={i + 1} onClick={() => setPage(i + 1)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition ${page === i + 1 ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"}`}>
                {i + 1}
              </button>
            ))}
            <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><Next className="w-4 h-4" /></PagBtn>
          </div>
        </div>
      )}

      {/* ── Add truck modal ── */}
      {addTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !actionBusy && setAddTruck(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Truck className="w-4 h-4 text-blue-600" />
                </div>
                <p className="font-bold text-gray-900">Add truck</p>
              </div>
              <button onClick={() => setAddTruck(null)} disabled={actionBusy}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Truck number <span className="text-red-400">*</span></label>
                <input
                  value={addTruckValue}
                  onChange={e => { setAddTruckValue(e.target.value.toUpperCase()); setActionErr(""); }}
                  placeholder="e.g. HR 38 CZ 8521"
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Truck type <span className="text-red-400">*</span></label>
                <select
                  value={addTruckType}
                  onChange={e => { setAddTruckType(e.target.value); setActionErr(""); }}
                  className={inputCls}>
                  <option value="">Select type…</option>
                  {["Heavy (20T+)", "Heavy (10-20T)", "Medium (5-10T)", "Light (<5T)", "Trailer", "Tanker"].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {actionErr && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{actionErr}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setAddTruck(null)} disabled={actionBusy}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition">
                Cancel
              </button>
              <button type="button" onClick={handleAddTruck} disabled={actionBusy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl shadow-sm shadow-blue-200 transition">
                {actionBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Adding…</> : <><Plus className="w-4 h-4" />Add truck</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit truck modal ── */}
      {editTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !actionBusy && setEditTruck(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-blue-600" />
                </div>
                <p className="font-bold text-gray-900">Edit truck number</p>
              </div>
              <button onClick={() => setEditTruck(null)} disabled={actionBusy}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Truck number</label>
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
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{actionErr}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setEditTruck(null)} disabled={actionBusy}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition">
                Cancel
              </button>
              <button type="button" onClick={handleEditTruck} disabled={actionBusy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl shadow-sm shadow-blue-200 transition">
                {actionBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete truck confirmation ── */}
      {deleteTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !actionBusy && setDeleteTruck(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Delete truck</p>
                <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete{" "}
              <span className="font-bold text-gray-900 font-mono">{deleteTruck.truckNumber}</span>?
            </p>
            {actionErr && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 mb-4">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{actionErr}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteTruck(null)} disabled={actionBusy}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition">
                Cancel
              </button>
              <button type="button" onClick={handleDeleteTruck} disabled={actionBusy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-xl shadow-sm shadow-red-200 transition">
                {actionBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</> : <><Trash2 className="w-4 h-4" />Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add owner drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div ref={drawerRef}
            className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-base font-bold text-gray-900">Add owner</p>
              </div>
              <button onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="owner-form" onSubmit={handleAdd} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full name <span className="text-red-400">*</span></label>
                <input value={fName} onChange={e => { setFName(e.target.value); setFErr(""); }}
                  placeholder="e.g. Ramesh Patel" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Primary mobile <span className="text-red-400">*</span></label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">+91</span>
                  <input value={fMobile} onChange={e => { setFMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setFErr(""); }}
                    placeholder="98765 43210" maxLength={10}
                    className={inputCls + " pl-9"} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Company / Firm</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input value={fCompany} onChange={e => setFCompany(e.target.value)}
                    placeholder="Patel Transport" className={inputCls + " pl-9"} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input value={fEmail} onChange={e => setFEmail(e.target.value)} type="email"
                    placeholder="owner@example.com" className={inputCls + " pl-9"} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">GST number</label>
                <input value={fGst} onChange={e => setFGst(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5" maxLength={20} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-3 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <textarea value={fAddress} onChange={e => setFAddress(e.target.value)}
                    placeholder="Full address..." rows={2}
                    className={inputCls + " pl-9 resize-none"} />
                </div>
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
                  <p className="text-sm text-emerald-700 font-semibold">Owner added successfully!</p>
                </div>
              )}
            </form>

            <div className="border-t border-gray-100 px-6 py-4 flex gap-3 bg-gray-50/50">
              <button type="button" onClick={() => setDrawerOpen(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                Cancel
              </button>
              <button type="submit" form="owner-form" disabled={fBusy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl shadow-sm shadow-blue-200 transition">
                {fBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><Plus className="w-4 h-4" />Add owner</>}
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
