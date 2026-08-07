"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ChevronRight, ChevronLeft, Search, X, Loader2, AlertCircle,
  Truck, Plus, Pencil, Trash2, RefreshCw, RotateCcw, Check, CheckCircle2,
} from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { Overlay } from "@/components/ui/Overlay";
import { Badge } from "@/components/ui/Badge";
import { EnumFilterSelect } from "@/components/ui/EnumFilterSelect";
import { handleUnauthorized } from "@/lib/auth";

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
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Your session has expired. Redirecting to login…");
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error((e as { detail?: string }).detail ?? "Request failed");
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

interface TruckTypeRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

const PAGE_SIZE = 10;

const STATUS_FILTER_OPTIONS = [
  { value: "true", label: "Active", dot: "bg-emerald-500" },
  { value: "false", label: "Inactive", dot: "bg-gray-400" },
];

const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white dark:focus:bg-slate-800 transition";

function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition">
      {children}
    </button>
  );
}

function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export default function TruckTypesPage() {
  const [rows,    setRows]    = useState<TruckTypeRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [listErr, setListErr] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "" | "true" | "false"

  // add / edit drawer
  const [drawer,   setDrawer]   = useState<"add" | "edit" | null>(null);
  const [editRow,  setEditRow]  = useState<TruckTypeRow | null>(null);
  const [fName,        setFName]        = useState("");
  const [fCode,         setFCode]         = useState("");
  const [fDescription,  setFDescription]  = useState("");
  const [fIsActive,     setFIsActive]     = useState(true);
  const [fErr,   setFErr]   = useState("");
  const [fBusy,  setFBusy]  = useState(false);
  const [fOk,    setFOk]    = useState(false);

  // delete modal
  const [delTarget, setDelTarget] = useState<TruckTypeRow | null>(null);
  const [delErr,    setDelErr]    = useState("");
  const [deleting,  setDeleting]  = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(async (p: number, q: string, status: string) => {
    setLoading(true); setListErr("");
    try {
      const start = (p - 1) * PAGE_SIZE;
      let url = `/truck-types?start=${start}&limit=${PAGE_SIZE}&sort_by=name&order=asc`;
      if (q) url += `&search=${encodeURIComponent(q)}`;
      if (status) url += `&is_active=${status}`;
      const data = await apiFetch<{ count: number; list: TruckTypeRow[] }>(url);
      setRows(data.list ?? []); setTotal(data.count ?? 0);
    } catch (err) {
      setListErr(err instanceof Error ? err.message : "Failed to load truck types.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(page, search, statusFilter); }, [page, search, statusFilter, fetchList]);

  const filtersActive = !!search || !!statusFilter;
  function clearFilters() { setSearchInput(""); setSearch(""); setStatusFilter(""); setPage(1); }

  function resetForm() {
    setFName(""); setFCode(""); setFDescription(""); setFIsActive(true);
    setFErr(""); setFOk(false);
  }

  function openAdd() { setEditRow(null); resetForm(); setDrawer("add"); }
  function openEdit(row: TruckTypeRow) {
    setEditRow(row);
    setFName(row.name); setFCode(row.code); setFDescription(row.description ?? ""); setFIsActive(row.is_active);
    setFErr(""); setFOk(false);
    setDrawer("edit");
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fName.trim()) { setFErr("Truck type name is required."); return; }
    if (!fCode.trim()) { setFErr("Truck type code is required."); return; }
    setFBusy(true); setFErr(""); setFOk(false);
    const body = JSON.stringify({
      name: fName.trim(),
      code: fCode.trim(),
      description: fDescription.trim() || null,
      is_active: fIsActive,
    });
    try {
      if (drawer === "add") {
        await apiFetch("/truck-types", { method: "POST", body });
      } else if (editRow) {
        await apiFetch(`/truck-types/${editRow.id}`, { method: "PUT", body });
      }
      setFOk(true);
      setTimeout(() => { setDrawer(null); fetchList(page, search, statusFilter); }, 900);
    } catch (err) {
      setFErr(err instanceof Error ? err.message : "Failed to save truck type.");
    } finally { setFBusy(false); }
  }

  async function handleDelete() {
    if (!delTarget) return;
    setDeleting(true); setDelErr("");
    try {
      await apiFetch(`/truck-types/${delTarget.id}`, { method: "DELETE" });
      setDelTarget(null);
      const goPage = rows.length === 1 && page > 1 ? page - 1 : page;
      setPage(goPage);
      if (goPage === page) fetchList(page, search, statusFilter);
    } catch (err) {
      setDelErr(err instanceof Error ? err.message : "Failed to delete truck type.");
    } finally { setDeleting(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* ── header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500 mb-2">
            <Link href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-700 dark:text-slate-300 font-semibold">Truck Types</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Truck types</h1>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Manage the truck type categories used across check-in, khata, and owner forms.</p>
        </div>
        <button onClick={openAdd}
          className="self-start sm:self-auto flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:-translate-y-0.5 text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-indigo-200 dark:shadow-none transition-all duration-200 text-sm">
          <Plus className="w-4 h-4" />
          New truck type
        </button>
      </motion.div>

      {/* ── toolbar ── */}
      <GlassCard className="p-3.5">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative w-full sm:flex-1 sm:min-w-52">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by name or code…"
              className="w-full pl-10 pr-9 py-2.5 text-sm bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition"
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <EnumFilterSelect
            className="w-full sm:w-auto"
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={STATUS_FILTER_OPTIONS}
            allLabel="All statuses"
          />

          <div className="flex items-center gap-2 w-full sm:w-auto sm:contents">
            {filtersActive && (
              <button onClick={clearFilters} className="flex-1 sm:flex-none text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/20 hover:bg-red-100 px-3 py-2 rounded-xl flex items-center justify-center sm:justify-start gap-1.5 transition">
                <RotateCcw className="w-3.5 h-3.5" />Reset
              </button>
            )}

            <div className="flex-1 hidden lg:block" />

            <button onClick={() => fetchList(page, search, statusFilter)} disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center p-2.5 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl transition">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </GlassCard>

      {listErr && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{listErr}</p>
        </div>
      )}

      {/* ── table / card list ── */}
      <GlassCard className="overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/30">
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Name</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Code</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Description</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4" colSpan={5}>
                      <div className="h-4 bg-gray-100 dark:bg-slate-800 rounded-full animate-pulse max-w-sm" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <div className="w-14 h-14 bg-gray-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Truck className="w-7 h-7 text-gray-300 dark:text-slate-600" />
                    </div>
                    <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
                      {filtersActive ? "No truck types match your filters" : "No truck types yet"}
                    </p>
                    {filtersActive && <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Try a different search term or filter.</p>}
                  </td>
                </tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{r.name}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono font-semibold text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 px-2 py-1 rounded-lg">
                      {r.code}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm text-gray-500 dark:text-slate-400 truncate max-w-xs">
                      {r.description || <span className="text-gray-300 dark:text-slate-600 italic">No description</span>}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    {r.is_active
                      ? <Badge color="emerald">Active</Badge>
                      : <Badge color="gray">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Edit" onClick={() => openEdit(r)}
                        className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button title="Delete" onClick={() => { setDelTarget(r); setDelErr(""); }}
                        className="p-2 rounded-lg text-gray-400 dark:text-slate-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-4 border-b border-gray-50 dark:border-slate-800">
                <div className="h-4 bg-gray-100 dark:bg-slate-800 rounded-full animate-pulse w-2/3" />
              </div>
            ))
          ) : rows.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="w-12 h-12 bg-gray-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Truck className="w-6 h-6 text-gray-300 dark:text-slate-600" />
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
                {filtersActive ? "No truck types match your filters" : "No truck types yet"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-slate-800">
              {rows.map(r => (
                <div key={r.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.name}</p>
                        <span className="text-xs font-mono text-gray-400 dark:text-slate-500">{r.code}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button title="Edit" onClick={() => openEdit(r)} className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button title="Delete" onClick={() => { setDelTarget(r); setDelErr(""); }} className="p-2 rounded-lg text-gray-400 dark:text-slate-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <p className="text-xs text-gray-400 dark:text-slate-500 truncate">
                      {r.description || <span className="italic text-gray-300 dark:text-slate-600">No description</span>}
                    </p>
                    {r.is_active
                      ? <Badge color="emerald">Active</Badge>
                      : <Badge color="gray">Inactive</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/40 dark:bg-slate-800/20">
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Showing <span className="font-semibold text-gray-600 dark:text-slate-300">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</span>{" "}
              of <span className="font-semibold text-gray-600 dark:text-slate-300">{total}</span> truck types
            </p>
            <div className="flex items-center gap-1">
              <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
              {pageWindow(page, totalPages).map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-300 dark:text-slate-600 text-sm">…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-semibold transition ${page === p ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"}`}>
                    {p}
                  </button>
                )
              )}
              <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></PagBtn>
            </div>
          </div>
        )}
      </GlassCard>

      {/* ── Add / Edit drawer ── */}
      <Overlay open={!!drawer} onClose={() => !fBusy && setDrawer(null)} variant="drawer"
        title={drawer === "add" ? "New truck type" : `Edit — ${editRow?.name ?? ""}`} widthClass="max-w-md">
        <form id="truck-type-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              value={fName}
              onChange={e => { setFName(e.target.value); setFErr(""); }}
              placeholder="e.g. Heavy (20T+)"
              maxLength={50}
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
              Code <span className="text-red-400">*</span>
            </label>
            <input
              value={fCode}
              onChange={e => { setFCode(e.target.value); setFErr(""); }}
              placeholder="e.g. heavy_20_plus"
              maxLength={30}
              className={inputCls + " font-mono"}
            />
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">A unique short identifier used internally — cannot be reused across truck types.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">Description</label>
            <textarea
              value={fDescription}
              onChange={e => setFDescription(e.target.value)}
              placeholder="Optional notes about this truck type…"
              maxLength={255}
              rows={3}
              className={inputCls + " resize-none"}
            />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <button
              type="button"
              onClick={() => setFIsActive(v => !v)}
              className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${fIsActive ? "bg-indigo-600" : "bg-gray-200 dark:bg-slate-700"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${fIsActive ? "translate-x-4" : ""}`} />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-slate-200">
              {fIsActive ? "Active — shown in truck type dropdowns" : "Inactive — hidden from dropdowns"}
            </span>
          </label>

          {fErr && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{fErr}</p>
            </div>
          )}
          {fOk && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-3.5 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">
                Truck type {drawer === "add" ? "created" : "updated"} successfully!
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setDrawer(null)} disabled={fBusy}
              className="flex-1 min-h-11 text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={fBusy}
              className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 rounded-xl shadow-sm shadow-indigo-200 dark:shadow-none transition">
              {fBusy
                ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                : <><Check className="w-4 h-4" />{drawer === "add" ? "Create truck type" : "Save changes"}</>}
            </button>
          </div>
        </form>
      </Overlay>

      {/* ── Delete confirmation ── */}
      <Overlay open={!!delTarget} onClose={() => !deleting && setDelTarget(null)} variant="modal" title="Delete truck type" widthClass="max-w-sm">
        {delTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-3.5">
              <Trash2 className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Delete <span className="font-bold">{delTarget.name}</span>? This cannot be undone.
              </p>
            </div>
            {delErr && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{delErr}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setDelTarget(null)} disabled={deleting}
                className="flex-1 min-h-11 text-sm font-semibold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 transition">
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="flex-1 min-h-11 flex items-center justify-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-xl shadow-sm shadow-red-200 dark:shadow-none transition">
                {deleting ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</> : <><Trash2 className="w-4 h-4" />Delete</>}
              </button>
            </div>
          </div>
        )}
      </Overlay>
    </div>
  );
}
