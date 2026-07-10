"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight, ChevronLeft, ChevronRight as ChevronNextIcon,
  ShieldX, ShieldCheck, Search, X, Loader2, AlertCircle,
  Trash2, Plus, RefreshCw, Info,
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
interface Blacklist {
  id: string;
  truck_number: string;
  truck_id: string | null;
  reason: string;
  added_by: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}
interface AdminUser { id: string; name: string }

const PAGE_SIZE = 10;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── component ─────────────────────────────────────────────────────────────────
export default function BlacklistPage() {
  const [list,      setList]      = useState<Blacklist[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [listError, setListError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");

  // form
  const [fTruck,   setFTruck]   = useState("");
  const [fReason,  setFReason]  = useState("");
  const [fError,   setFError]   = useState("");
  const [fLoading, setFLoading] = useState(false);
  const [fSuccess, setFSuccess] = useState(false);

  // remove
  const [removing,       setRemoving]       = useState<string | null>(null);
  const [removeError,    setRemoveError]    = useState("");
  const [removeSuccess,  setRemoveSuccess]  = useState("");

  // admin name cache
  const adminCache = useRef<Record<string, string>>({});
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(async (p: number, q: string) => {
    setLoading(true); setListError("");
    try {
      const start = (p - 1) * PAGE_SIZE;
      let url = `/blacklists?start=${start}&limit=${PAGE_SIZE}&sort_by=created_at&order=desc`;
      if (q) url += `&search=${encodeURIComponent(q)}`;
      const data = await apiFetch<{ count: number; list: Blacklist[] }>(url);
      setList(data.list ?? []);
      setTotal(data.count ?? 0);

      // enrich admin names for unique added_by IDs
      const ids = [...new Set((data.list ?? []).map(b => b.added_by).filter(Boolean) as string[])]
        .filter(id => !adminCache.current[id]);
      if (ids.length) {
        const results = await Promise.allSettled(ids.map(id => apiFetch<AdminUser>(`/admin-users/${id}`)));
        const newNames: Record<string, string> = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            adminCache.current[ids[i]] = r.value.name;
            newNames[ids[i]] = r.value.name;
          }
        });
        setAdminNames(prev => ({ ...prev, ...newNames }));
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load blacklist.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(page, search); }, [page, search, fetchList]);

  async function handleAdd(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fTruck.trim()) { setFError("Truck number is required."); return; }
    if (!fReason.trim()) { setFError("Reason is required."); return; }
    setFLoading(true); setFError(""); setFSuccess(false);
    try {
      await apiFetch("/blacklists", {
        method: "POST",
        body: JSON.stringify({ truck_number: fTruck.trim().toUpperCase(), reason: fReason.trim() }),
      });
      setFTruck(""); setFReason(""); setFSuccess(true);
      setTimeout(() => setFSuccess(false), 3000);
      fetchList(1, search); setPage(1);
    } catch (err) { setFError(err instanceof Error ? err.message : "Failed to add to blacklist."); }
    finally { setFLoading(false); }
  }

  async function handleRemove(item: Blacklist) {
    setRemoving(item.id); setRemoveError(""); setRemoveSuccess("");
    try {
      await apiFetch(`/blacklists/${item.id}`, { method: "DELETE" });
      setRemoveSuccess(`${item.truck_number} removed from blacklist successfully.`);
      setTimeout(() => setRemoveSuccess(""), 4000);
      const goPage = list.length === 1 && page > 1 ? page - 1 : page;
      setPage(goPage);
      if (goPage === page) fetchList(page, search);
    } catch (err) { setRemoveError(err instanceof Error ? err.message : "Failed to remove."); }
    finally { setRemoving(null); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const getAdminName = (id: string | null) => id ? (adminCache.current[id] ?? adminNames[id] ?? "Admin") : "System";

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600 font-medium">Blacklist</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Blacklist</h1>
        <p className="text-sm text-gray-400 mt-0.5">Blacklisted trucks are blocked with an alert at check-in. Removing a truck restores normal work for it immediately.</p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ── Left: Add form ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
            <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <ShieldX className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-sm font-bold text-gray-900">Add truck to blacklist</p>
          </div>

          <form onSubmit={handleAdd} className="px-5 py-5 space-y-4">
            {/* Truck number */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Truck number <span className="text-red-400">*</span>
              </label>
              <input
                value={fTruck}
                onChange={e => { setFTruck(e.target.value.toUpperCase()); setFError(""); }}
                placeholder="e.g. RJ14CD9001"
                maxLength={20}
                className={inputCls}
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                value={fReason}
                onChange={e => { setFReason(e.target.value); setFError(""); }}
                placeholder="e.g. Repeated non-payment, security issue, fake documents..."
                rows={3}
                maxLength={255}
                className={inputCls + " resize-none"}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{fReason.length}/255</p>
            </div>

            {/* Error */}
            {fError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{fError}</p>
              </div>
            )}

            {/* Success */}
            {fSuccess && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-700 font-semibold">Truck added to blacklist successfully.</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={fLoading}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 text-white font-bold py-3 rounded-xl shadow-sm shadow-red-200 transition text-sm"
            >
              {fLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Adding…</>
                : <><Plus className="w-4 h-4" />Add to blacklist</>}
            </button>

            {/* Tip */}
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Try it: type a blacklisted number in the Check-in screen — a red alert appears and entry is blocked until it&apos;s removed here.
              </p>
            </div>
          </form>
        </div>

        {/* ── Right: Blacklisted trucks list ── */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                <ShieldX className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-sm font-bold text-gray-900">Blacklisted trucks</p>
            </div>
            <div className="flex items-center gap-2">
              {total > 0 && (
                <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                  {total} restricted
                </span>
              )}
              <button
                onClick={() => fetchList(page, search)}
                disabled={loading}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-gray-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search by truck number…"
                className="w-full pl-9 pr-9 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition"
              />
              {searchInput && (
                <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {listError && (
            <div className="flex items-center gap-2.5 mx-4 my-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{listError}</p>
            </div>
          )}

          {/* Remove success */}
          {removeSuccess && (
            <div className="flex items-center gap-2.5 mx-4 my-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700 font-semibold">{removeSuccess}</p>
            </div>
          )}

          {/* Remove error */}
          {removeError && (
            <div className="flex items-center gap-2.5 mx-4 my-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{removeError}</p>
            </div>
          )}

          {/* List */}
          <div className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center gap-3">
                  <div className="w-28 h-9 bg-gray-100 rounded-xl animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-100 rounded-full animate-pulse w-48" />
                    <div className="h-3 bg-gray-100 rounded-full animate-pulse w-36" />
                  </div>
                  <div className="w-28 h-8 bg-gray-100 rounded-xl animate-pulse" />
                </div>
              ))
            ) : list.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">No trucks blacklisted</p>
                <p className="text-xs text-gray-400 mt-1">
                  {search ? "No results for this search." : "All trucks are currently allowed through."}
                </p>
              </div>
            ) : list.map(item => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-red-50/20 transition-colors">

                {/* Truck badge */}
                <span className="inline-flex items-center justify-center min-w-28 px-3 py-2 rounded-xl text-xs font-bold tracking-widest text-white font-mono bg-red-600 shadow-sm shadow-red-200 shrink-0">
                  {item.truck_number}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{item.reason}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Added {fmtDate(item.created_at)} · by {getAdminName(item.added_by)}
                  </p>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemove(item)}
                  disabled={removing === item.id}
                  className="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 active:bg-red-300 disabled:opacity-50 text-red-700 text-xs font-bold px-3.5 py-2 rounded-xl border border-red-200 transition shrink-0 whitespace-nowrap"
                >
                  {removing === item.id
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Removing…</>
                    : <><Trash2 className="w-3.5 h-3.5" />Remove</>}
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/40">
              <p className="text-xs text-gray-400 order-2 sm:order-1">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
                <span className="font-semibold text-gray-600">{total}</span>
              </p>
              <div className="flex items-center gap-1 order-1 sm:order-2">
                <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </PagBtn>
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  const n = i + 1;
                  return (
                    <button key={n} onClick={() => setPage(n)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition ${page === n ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200"}`}>
                      {n}
                    </button>
                  );
                })}
                <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronNextIcon className="w-4 h-4" />
                </PagBtn>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── small pieces ──────────────────────────────────────────────────────────────
function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition border border-transparent hover:border-gray-200">
      {children}
    </button>
  );
}

const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition";
