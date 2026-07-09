"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ChevronRight, ChevronLeft, ChevronRight as ChevronRightIcon,
  Plus, Search, Loader2, AlertCircle, Pencil, Trash2, Eye, X, Check,
  Shield, Lock, RefreshCw, ShieldCheck, ShieldOff,
  Layers, Settings,
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

interface OpItem  { id: string; name: string }
interface OpGroup { id: string; name: string; operations: OpItem[] }
interface Role    { id: string; name: string; editable: boolean; operations?: OpItem[] }

const PAGE_SIZE = 10;

const GROUP_COLORS = [
  "bg-blue-100 text-blue-700",     "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700","bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",     "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",     "bg-orange-100 text-orange-700",
];
const groupColor = (idx: number) => GROUP_COLORS[idx % GROUP_COLORS.length];

export default function RolesPage() {
  const [roles,     setRoles]     = useState<Role[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [listError, setListError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  const [opGroups,  setOpGroups]  = useState<OpGroup[]>([]);

  // drawer
  const [drawer,      setDrawer]      = useState<"add" | "edit" | null>(null);
  const [editRole,    setEditRole]    = useState<Role | null>(null);
  const [fName,       setFName]       = useState("");
  const [selectedOps, setSelectedOps] = useState<Set<string>>(new Set());
  const [fError,      setFError]      = useState("");
  const [fLoading,    setFLoading]    = useState(false);
  const [loadingOps,  setLoadingOps]  = useState(false);

  // view modal
  const [viewRole,    setViewRole]    = useState<Role | null>(null);
  const [viewOps,     setViewOps]     = useState<string[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  // delete modal
  const [delTarget, setDelTarget] = useState<Role | null>(null);
  const [delError,  setDelError]  = useState("");
  const [deleting,  setDeleting]  = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    apiFetch<OpGroup[]>("/operations/all").then(setOpGroups).catch(() => {});
  }, []);

  const fetchRoles = useCallback(async (p: number, q: string) => {
    setLoading(true); setListError("");
    try {
      const start = (p - 1) * PAGE_SIZE;
      let url = `/roles?start=${start}&limit=${PAGE_SIZE}&sort_by=name&order=asc`;
      if (q) url += `&search=${encodeURIComponent(q)}`;
      const data = await apiFetch<{ count: number; list: Role[] }>(url);
      setRoles(data.list); setTotal(data.count);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load roles.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRoles(page, search); }, [page, search, fetchRoles]);

  function openAdd() {
    setEditRole(null);
    setFName(""); setSelectedOps(new Set()); setFError(""); setDrawer("add");
  }

  async function openEdit(r: Role) {
    setEditRole(r); setFName(r.name); setFError(""); setLoadingOps(true); setDrawer("edit");
    try {
      const full = await apiFetch<{ id: string; name: string; editable: boolean; operations: OpItem[] }>(`/roles/${r.id}`);
      setSelectedOps(new Set((full.operations ?? []).map(o => o.id)));
    } catch { setSelectedOps(new Set()); }
    finally { setLoadingOps(false); }
  }

  async function openView(r: Role) {
    setViewRole(r); setViewOps([]); setViewLoading(true);
    try {
      const full = await apiFetch<{ operations: OpItem[] }>(`/roles/${r.id}`);
      setViewOps((full.operations ?? []).map(o => o.id));
    } catch { setViewOps([]); }
    finally { setViewLoading(false); }
  }

  function toggleOp(id: string) {
    setSelectedOps(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroup(group: OpGroup) {
    const ids = group.operations.map(o => o.id);
    const allOn = ids.every(id => selectedOps.has(id));
    setSelectedOps(prev => {
      const next = new Set(prev);
      ids.forEach(id => allOn ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function groupState(group: OpGroup): "all" | "some" | "none" {
    const ids = group.operations.map(o => o.id);
    const count = ids.filter(id => selectedOps.has(id)).length;
    if (count === 0)          return "none";
    if (count === ids.length) return "all";
    return "some";
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fName.trim()) { setFError("Role name is required."); return; }
    setFLoading(true); setFError("");
    try {
      if (drawer === "add") {
        await apiFetch("/roles", { method: "POST", body: JSON.stringify({ name: fName.trim(), operations: Array.from(selectedOps) }) });
      } else if (editRole) {
        await apiFetch(`/roles/${editRole.id}`, { method: "PUT", body: JSON.stringify({ name: fName.trim(), operations: Array.from(selectedOps) }) });
      }
      setDrawer(null); fetchRoles(page, search);
    } catch (err) { setFError(err instanceof Error ? err.message : "Failed to save role."); }
    finally { setFLoading(false); }
  }

  async function handleDelete() {
    if (!delTarget) return;
    setDeleting(true); setDelError("");
    try {
      await apiFetch(`/roles/${delTarget.id}`, { method: "DELETE" });
      setDelTarget(null);
      const goPage = roles.length === 1 && page > 1 ? page - 1 : page;
      setPage(goPage);
      if (goPage === page) fetchRoles(page, search);
    } catch (err) { setDelError(err instanceof Error ? err.message : "Failed to delete role."); }
    finally { setDeleting(false); }
  }

  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalOps    = opGroups.reduce((s, g) => s + g.operations.length, 0);
  const selectedCnt = selectedOps.size;

  const STATS = [
    { label: "Roles defined",     value: total,          icon: Shield,   bg: "bg-blue-50",    ic: "text-blue-600"    },
    { label: "Total operations",  value: totalOps,       icon: Layers,   bg: "bg-violet-50",  ic: "text-violet-600"  },
    { label: "Permission groups", value: opGroups.length, icon: Settings, bg: "bg-emerald-50", ic: "text-emerald-600" },
  ];

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 font-medium">Roles & Permissions</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Roles & Permissions</h1>
          <p className="text-sm text-gray-400 mt-0.5">Define what each staff role can see and do</p>
        </div>
        <button
          onClick={openAdd}
          className="self-start sm:self-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-blue-200 transition text-sm"
        >
          <Plus className="w-4 h-4" />
          New role
        </button>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-3 gap-3">
        {STATS.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.ic}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-gray-900 leading-none">{s.value}</p>
              <p className="text-xs text-gray-400 mt-1 truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search roles…"
            className={inputCls + " pl-9 py-2"}
          />
          {searchInput && (
            <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => fetchRoles(page, search)}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-xl hover:bg-gray-100 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* ── Table / Card list ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {listError && (
          <div className="flex items-center gap-2.5 px-5 py-4 bg-red-50 border-b border-red-100">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{listError}</p>
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className={thCls}>Role</th>
                <th className={thCls}>Type</th>
                <th className={thCls}>Operations</th>
                <th className={thCls + " text-right"}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4" colSpan={4}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2 max-w-sm">
                          <div className="h-3.5 bg-gray-100 rounded-full animate-pulse" />
                          <div className="h-3 bg-gray-100 rounded-full animate-pulse w-1/2" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center">
                    <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Shield className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">No roles found</p>
                    {search && <p className="text-xs text-gray-400 mt-1">Try a different search term</p>}
                  </td>
                </tr>
              ) : roles.map(r => (
                <tr key={r.id} className="hover:bg-blue-50/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.editable ? "bg-blue-50" : "bg-gray-100"}`}>
                        {r.editable ? <Shield className="w-4 h-4 text-blue-500" /> : <Lock className="w-4 h-4 text-gray-400" />}
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {r.editable
                      ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100"><ShieldCheck className="w-3 h-3" />Custom</span>
                      : <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full border border-gray-200"><Lock className="w-3 h-3" />System</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-gray-400">{r.operations?.length ?? "—"} operations</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="View permissions" color="gray" onClick={() => openView(r)}><Eye className="w-3.5 h-3.5" /></IconBtn>
                      {r.editable && (
                        <>
                          <IconBtn title="Edit role" color="blue" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Delete role" color="red" onClick={() => { setDelTarget(r); setDelError(""); }}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                        </>
                      )}
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
              <div key={i} className="px-4 py-4 border-b border-gray-50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded-full animate-pulse w-28" />
                  <div className="h-3 bg-gray-100 rounded-full animate-pulse w-20" />
                </div>
              </div>
            ))
          ) : roles.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">No roles found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {roles.map(r => (
                <div key={r.id} className="px-4 py-4 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.editable ? "bg-blue-50" : "bg-gray-100"}`}>
                      {r.editable ? <Shield className="w-4 h-4 text-blue-500" /> : <Lock className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <IconBtn title="View" color="gray" onClick={() => openView(r)}><Eye className="w-3.5 h-3.5" /></IconBtn>
                          {r.editable && (
                            <>
                              <IconBtn title="Edit" color="blue" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                              <IconBtn title="Delete" color="red" onClick={() => { setDelTarget(r); setDelError(""); }}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5">
                        {r.editable
                          ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100"><ShieldCheck className="w-2.5 h-2.5" />Custom</span>
                          : <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200"><Lock className="w-2.5 h-2.5" />System</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/40">
            <p className="text-xs text-gray-400 order-2 sm:order-1">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of <span className="font-semibold text-gray-600">{total}</span>
            </p>
            <div className="flex items-center gap-1 order-1 sm:order-2">
              <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></PagBtn>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const n = i + 1;
                return (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition ${page === n ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200"}`}>
                    {n}
                  </button>
                );
              })}
              <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRightIcon className="w-4 h-4" /></PagBtn>
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit Drawer ── */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" onClick={() => !fLoading && setDrawer(null)} />
          <div className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-50 w-full sm:w-full sm:max-w-lg bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">{drawer === "add" ? "Create new role" : "Edit role"}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{drawer === "add" ? "Choose a name and assign permissions" : `Editing — ${editRole?.name}`}</p>
              </div>
              <button onClick={() => !fLoading && setDrawer(null)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="role-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              {/* Role name */}
              <div className="px-5 py-4 border-b border-gray-50">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Role name <span className="text-red-400">*</span>
                </label>
                <input
                  value={fName}
                  onChange={e => setFName(e.target.value)}
                  placeholder="e.g. Gate Manager"
                  maxLength={80}
                  className={inputCls}
                />
              </div>

              {/* Permission matrix */}
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Permissions</p>
                  {loadingOps ? (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />Loading…
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {selectedCnt} / {totalOps} selected
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {totalOps > 0 && (
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((selectedCnt / totalOps) * 100)}%` }}
                    />
                  </div>
                )}

                {/* Select all toggle */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCnt === totalOps) setSelectedOps(new Set());
                    else setSelectedOps(new Set(opGroups.flatMap(g => g.operations.map(o => o.id))));
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1.5"
                >
                  {selectedCnt === totalOps
                    ? <><ShieldOff className="w-3.5 h-3.5" />Deselect all</>
                    : <><ShieldCheck className="w-3.5 h-3.5" />Select all</>}
                </button>

                {/* Group cards — permission pill matrix */}
                {opGroups.map((group, gi) => {
                  const state   = groupState(group);
                  const selected = group.operations.filter(o => selectedOps.has(o.id)).length;
                  return (
                    <div key={group.id} className="bg-gray-50/70 rounded-2xl border border-gray-100 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100/60 transition text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${groupColor(gi)}`}>
                            {group.name.charAt(0)}
                          </div>
                          <span className="text-sm font-semibold text-gray-700">{group.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{selected}/{group.operations.length}</span>
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${state === "all" ? "bg-blue-600 border-blue-600" : state === "some" ? "bg-blue-100 border-blue-400" : "border-gray-300 bg-white"}`}>
                            {state === "all" && <Check className="w-3 h-3 text-white" />}
                            {state === "some" && <div className="w-2 h-0.5 bg-blue-600 rounded-full" />}
                          </div>
                        </div>
                      </button>
                      <div className="px-4 pb-4 flex flex-wrap gap-2">
                        {group.operations.map(op => {
                          const on = selectedOps.has(op.id);
                          return (
                            <button
                              key={op.id}
                              type="button"
                              onClick={() => toggleOp(op.id)}
                              className={`text-xs px-3 py-1.5 rounded-full font-medium transition border ${
                                on
                                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                  : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                              }`}
                            >
                              {on && <span className="mr-1">✓</span>}{op.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {fError && (
                <div className="mx-5 mb-4 flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{fError}</p>
                </div>
              )}
            </form>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={() => !fLoading && setDrawer(null)}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl transition text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="role-form"
                disabled={fLoading}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl shadow-sm shadow-blue-200 transition text-sm"
              >
                {fLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                  : <><Check className="w-4 h-4" />{drawer === "add" ? "Create role" : "Save changes"}</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── View Modal ── */}
      {viewRole && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setViewRole(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${viewRole.editable ? "bg-blue-50" : "bg-gray-100"}`}>
                  {viewRole.editable ? <Shield className="w-5 h-5 text-blue-500" /> : <Lock className="w-5 h-5 text-gray-400" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">{viewRole.name}</h3>
                  <p className="text-xs text-gray-400">{viewRole.editable ? "Custom role" : "System role"} · {viewOps.length} permissions</p>
                </div>
              </div>
              <button onClick={() => setViewRole(null)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {viewLoading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading permissions…</span>
                </div>
              ) : viewOps.length === 0 ? (
                <div className="py-10 text-center">
                  <ShieldOff className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No permissions assigned</p>
                </div>
              ) : opGroups.map((group, gi) => {
                const granted = group.operations.filter(o => viewOps.includes(o.id));
                if (!granted.length) return null;
                return (
                  <div key={group.id} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-2.5">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${groupColor(gi)}`}>
                        {group.name.charAt(0)}
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{group.name}</span>
                      <span className="ml-auto text-xs text-gray-400">{granted.length}/{group.operations.length}</span>
                    </div>
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      {granted.map(op => (
                        <span key={op.id} className="text-xs px-2.5 py-1 rounded-full bg-blue-600 text-white font-medium">
                          ✓ {op.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3.5 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setViewRole(null)}
                className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl transition text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {delTarget && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => !deleting && setDelTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete role</h3>
                <p className="text-xs text-gray-400 mt-0.5">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Delete <span className="font-semibold text-gray-900">{delTarget.name}</span>? Users assigned this role will lose their permissions.
            </p>
            {delError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{delError}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDelTarget(null)}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2.5 rounded-xl transition text-sm"
              >
                {deleting
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</>
                  : <><Trash2 className="w-4 h-4" />Delete role</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── small reusable pieces ─────────────────────────────────────────────────────
function IconBtn({ title, color, onClick, children }: {
  title: string; color: "blue" | "red" | "gray"; onClick: () => void; children: React.ReactNode
}) {
  const cls = {
    blue: "text-blue-500 hover:bg-blue-50 hover:text-blue-700",
    red:  "text-gray-400 hover:bg-red-50 hover:text-red-600",
    gray: "text-gray-400 hover:bg-gray-100 hover:text-gray-700",
  };
  return (
    <button title={title} onClick={onClick} className={`p-2 rounded-lg transition ${cls[color]}`}>
      {children}
    </button>
  );
}

function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition border border-transparent hover:border-gray-200"
    >
      {children}
    </button>
  );
}

const thCls    = "px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-widest";
const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition";
