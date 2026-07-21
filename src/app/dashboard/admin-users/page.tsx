"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight, ChevronLeft, ChevronRight as ChevronRightIcon, ChevronDown,
  UserPlus, Search, Loader2, AlertCircle,
  Pencil, Key, Trash2, X, Check, Eye, EyeOff, RefreshCw,
  Users, Shield, ShieldOff, MapPin, UserCog, Building2,
} from "lucide-react";

import { handleUnauthorized } from "@/lib/auth";
import { LocationSelect } from "@/components/ui/LocationSelect";

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

interface Role    { id: string; name: string; editable: boolean }
interface LocItem { id: string; name: string; city: string | null }
interface AdminUser {
  id: string; name: string; email: string;
  location_id: string | null; role: Role | null;
}
interface OpItem  { id: string; name: string }
interface OpGroup { id: string; name: string; operations: OpItem[] }

const PAGE_SIZE = 10;

const GROUP_COLORS = [
  "bg-blue-100 text-blue-700",     "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700","bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",     "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",     "bg-orange-100 text-orange-700",
];
const groupColor = (idx: number) => GROUP_COLORS[idx % GROUP_COLORS.length];

const AVATAR_GRADIENTS = [
  "from-blue-500 to-blue-700",
  "from-violet-500 to-purple-700",
  "from-emerald-500 to-green-700",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-red-700",
  "from-indigo-500 to-indigo-700",
];
const avatarGrad = (id: string) => AVATAR_GRADIENTS[id.charCodeAt(0) % AVATAR_GRADIENTS.length];

export default function AdminUsersPage() {
  const [users,     setUsers]     = useState<AdminUser[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [listError, setListError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  const [roles,     setRoles]     = useState<Role[]>([]);
  const [locations, setLocations] = useState<LocItem[]>([]);
  const [opGroups,  setOpGroups]  = useState<OpGroup[]>([]);

  // drawer
  const [drawer,    setDrawer]    = useState<"add" | "edit" | null>(null);
  const [editUser,  setEditUser]  = useState<AdminUser | null>(null);
  const [fName,       setFName]       = useState("");
  const [fEmail,      setFEmail]      = useState("");
  const [fPassword,   setFPassword]   = useState("");
  const [fRoleId,     setFRoleId]     = useState("");
  const [fLocationId, setFLocationId] = useState("");
  const [fError,      setFError]      = useState("");
  const [fLoading,    setFLoading]    = useState(false);
  const [showPwd,     setShowPwd]     = useState(false);
  const [roleDropOpen, setRoleDropOpen] = useState(false);
  const roleDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (roleDropRef.current && !roleDropRef.current.contains(e.target as Node)) {
        setRoleDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // modals
  const [pwdTarget,  setPwdTarget]  = useState<AdminUser | null>(null);
  const [newPwd,     setNewPwd]     = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [pwdError,   setPwdError]   = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [delTarget, setDelTarget] = useState<AdminUser | null>(null);
  const [delError,  setDelError]  = useState("");
  const [deleting,  setDeleting]  = useState(false);

  // view selected role's permissions (from the Role picker in the add/edit drawer)
  const [viewRole,    setViewRole]    = useState<Role | null>(null);
  const [viewOps,     setViewOps]     = useState<string[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    apiFetch<{ count: number; list: Role[] }>("/roles?start=0&limit=100&sort_by=name&order=asc").then(r => setRoles(r.list)).catch(() => {});
    apiFetch<{ list: LocItem[] }>("/locations?limit=100").then(r => setLocations(r.list)).catch(() => {});
    apiFetch<OpGroup[]>("/operations/all").then(setOpGroups).catch(() => {});
  }, []);

  async function openRoleView(role: Role) {
    setViewRole(role); setViewOps([]); setViewLoading(true);
    try {
      // GET /roles/{id} returns `operations` as a plain array of operation-ID
      // strings (not {id, name} objects) — see RoleDetails in the backend schema.
      const full = await apiFetch<{ operations?: string[] }>(`/roles/${role.id}`);
      setViewOps(full.operations ?? []);
    } catch { setViewOps([]); }
    finally { setViewLoading(false); }
  }

  const fetchUsers = useCallback(async (p: number, q: string) => {
    setLoading(true); setListError("");
    try {
      const start = (p - 1) * PAGE_SIZE;
      let url = `/admin-users?start=${start}&limit=${PAGE_SIZE}&sort_by=name&order=asc`;
      if (q) url += `&search=${encodeURIComponent(q)}`;
      const data = await apiFetch<{ count: number; list: AdminUser[] }>(url);
      setUsers(data.list); setTotal(data.count);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load users.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(page, search); }, [page, search, fetchUsers]);

  function openAdd() {
    setEditUser(null);
    setFName(""); setFEmail(""); setFPassword(""); setFRoleId(""); setFLocationId("");
    setFError(""); setShowPwd(false); setDrawer("add");
  }
  function openEdit(u: AdminUser) {
    setEditUser(u);
    setFName(u.name); setFEmail(u.email); setFPassword("");
    setFRoleId(u.role?.id ?? ""); setFLocationId(u.location_id ?? "");
    setFError(""); setShowPwd(false); setDrawer("edit");
  }

  async function handleFormSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fName.trim())                            { setFError("Full name is required."); return; }
    if (!fEmail.trim())                           { setFError("Email address is required."); return; }
    if (drawer === "add" && !fPassword.trim())    { setFError("Password is required."); return; }
    if (drawer === "add" && fPassword.length < 6) { setFError("Password must be at least 6 characters."); return; }
    if (!fRoleId)                                 { setFError("Role is required."); return; }
    setFLoading(true); setFError("");
    try {
      if (drawer === "add") {
        await apiFetch("/admin-users", { method: "POST", body: JSON.stringify({
          name: fName.trim(), email: fEmail.trim(), password: fPassword,
          role_id: fRoleId, location_id: fLocationId || null,
        })});
      } else if (editUser) {
        await apiFetch(`/admin-users/${editUser.id}`, { method: "PUT", body: JSON.stringify({
          name: fName.trim(), email: fEmail.trim(),
          role_id: fRoleId, location_id: fLocationId || null,
        })});
      }
      setDrawer(null); fetchUsers(page, search);
    } catch (err) { setFError(err instanceof Error ? err.message : "Failed to save user."); }
    finally { setFLoading(false); }
  }

  async function handlePwdReset(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!newPwd)           { setPwdError("New password is required."); return; }
    if (newPwd.length < 6) { setPwdError("Minimum 6 characters."); return; }
    if (!pwdTarget) return;
    setPwdLoading(true); setPwdError("");
    try {
      await apiFetch(`/admin-users/${pwdTarget.id}/reset-password`, {
        method: "PUT", body: JSON.stringify({ new_password: newPwd }),
      });
      setPwdTarget(null); setNewPwd(""); setShowNewPwd(false);
    } catch (err) { setPwdError(err instanceof Error ? err.message : "Failed to reset password."); }
    finally { setPwdLoading(false); }
  }

  async function handleDelete() {
    if (!delTarget) return;
    setDeleting(true); setDelError("");
    try {
      await apiFetch(`/admin-users/${delTarget.id}`, { method: "DELETE" });
      setDelTarget(null);
      const goPage = users.length === 1 && page > 1 ? page - 1 : page;
      setPage(goPage);
      if (goPage === page) fetchUsers(page, search);
    } catch (err) { setDelError(err instanceof Error ? err.message : "Failed to delete user."); }
    finally { setDeleting(false); }
  }

  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const locationMap = Object.fromEntries(locations.map(l => [l.id, l.name + (l.city ? `, ${l.city}` : "")]));

  const STATS = [
    { label: "Total users",    value: total,           icon: Users,    bg: "bg-blue-50",    ic: "text-blue-600"    },
    { label: "Roles defined",  value: roles.length,    icon: Shield,   bg: "bg-violet-50",  ic: "text-violet-600"  },
    { label: "Locations",      value: locations.length,icon: Building2,bg: "bg-emerald-50", ic: "text-emerald-600" },
    { label: "This page",      value: users.length,    icon: UserCog,  bg: "bg-amber-50",   ic: "text-amber-600"   },
  ];

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 font-medium">Admin Users</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Users</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage staff accounts, roles and location access</p>
        </div>
        <button
          onClick={openAdd}
          className="self-start sm:self-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-blue-200 transition text-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add user
        </button>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
            placeholder="Search by name or email…"
            className={inputCls + " pl-9 py-2"}
          />
          {searchInput && (
            <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => fetchUsers(page, search)}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-xl hover:bg-gray-100 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
        {search && (
          <p className="text-xs text-gray-400 w-full sm:w-auto sm:ml-auto">
            Results for <span className="font-semibold text-gray-600">&ldquo;{search}&rdquo;</span>
          </p>
        )}
      </div>

      {/* ── Table card ── */}
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
                <th className={thCls}>User</th>
                <th className={thCls}>Role</th>
                <th className={thCls}>Location</th>
                <th className={thCls + " text-right"}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4" colSpan={4}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2 max-w-xs">
                          <div className="h-3.5 bg-gray-100 rounded-full animate-pulse" />
                          <div className="h-3 bg-gray-100 rounded-full animate-pulse w-3/4" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center">
                    <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Users className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">No users found</p>
                    {search && <p className="text-xs text-gray-400 mt-1">Try a different search term</p>}
                  </td>
                </tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-blue-50/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarGrad(u.id)} text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {u.role ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                        <Shield className="w-3 h-3" />{u.role.name}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    {u.location_id ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                        <MapPin className="w-3 h-3" />{locationMap[u.location_id] ?? "Unknown"}
                      </span>
                    ) : <span className="text-xs text-gray-400 italic">All locations</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      {u.role?.name === "Super Admin" ? (
                        <span className="text-xs text-gray-300 italic pr-2">Protected</span>
                      ) : (
                        <>
                          <IconBtn title="Edit user"       color="blue"  onClick={() => openEdit(u)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Reset password"  color="amber" onClick={() => { setPwdTarget(u); setNewPwd(""); setPwdError(""); setShowNewPwd(false); }}><Key className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Delete user"     color="red"   onClick={() => { setDelTarget(u); setDelError(""); }}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
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
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-4 border-b border-gray-50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded-full animate-pulse w-36" />
                  <div className="h-3 bg-gray-100 rounded-full animate-pulse w-48" />
                </div>
              </div>
            ))
          ) : users.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">No users found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {users.map(u => (
                <div key={u.id} className="px-4 py-4 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGrad(u.id)} text-white flex items-center justify-center font-bold shrink-0 shadow-sm`}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {u.role?.name === "Super Admin" ? (
                            <span className="text-xs text-gray-300 italic">Protected</span>
                          ) : (
                            <>
                              <IconBtn title="Edit" color="blue" onClick={() => openEdit(u)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                              <IconBtn title="Reset password" color="amber" onClick={() => { setPwdTarget(u); setNewPwd(""); setPwdError(""); setShowNewPwd(false); }}><Key className="w-3.5 h-3.5" /></IconBtn>
                              <IconBtn title="Delete" color="red" onClick={() => { setDelTarget(u); setDelError(""); }}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {u.role && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                            <Shield className="w-2.5 h-2.5" />{u.role.name}
                          </span>
                        )}
                        {u.location_id ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                            <MapPin className="w-2.5 h-2.5" />{locationMap[u.location_id] ?? "Location"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">All locations</span>
                        )}
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

      {/* ── Drawer ── */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" onClick={() => !fLoading && setDrawer(null)} />
          <div className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-50 w-full sm:w-full sm:max-w-md bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">{drawer === "add" ? "Add new user" : "Edit user"}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{drawer === "add" ? "Create a new staff account" : `Editing — ${editUser?.name}`}</p>
              </div>
              <button onClick={() => !fLoading && setDrawer(null)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition"><X className="w-5 h-5" /></button>
            </div>

            <form id="user-form" onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              <Field label="Full name" required>
                <input value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. Rajesh Kumar" maxLength={100} className={inputCls} />
              </Field>
              <Field label="Email address" required>
                <input value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="user@company.com" type="email" maxLength={100} className={inputCls} />
              </Field>
              {drawer === "add" && (
                <Field label="Password" required hint="You can reset it later from the user list.">
                  <div className="relative">
                    <input value={fPassword} onChange={e => setFPassword(e.target.value)} type={showPwd ? "text" : "password"} placeholder="Min. 6 characters" maxLength={50} className={inputCls + " pr-10"} />
                    <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
              )}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-600">
                    Role<span className="text-red-400 ml-0.5">*</span>
                  </label>
                  {fRoleId && (
                    <button
                      type="button"
                      onClick={() => { const r = roles.find(x => x.id === fRoleId); if (r) openRoleView(r); }}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                    >
                      <Eye className="w-3.5 h-3.5" />View permissions
                    </button>
                  )}
                </div>
                <div className="relative" ref={roleDropRef}>
                  <button
                    type="button"
                    onClick={() => setRoleDropOpen(v => !v)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      fRoleId
                        ? "bg-blue-50/40 border-blue-200 text-gray-900"
                        : "bg-gray-50 border-gray-200 text-gray-400"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Shield className={`w-4 h-4 shrink-0 ${fRoleId ? "text-blue-500" : "text-gray-300"}`} />
                      {fRoleId
                        ? roles.find(r => r.id === fRoleId)?.name
                        : "Select a role…"}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${roleDropOpen ? "rotate-180" : ""}`} />
                  </button>

                  {roleDropOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-20 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                      {roles.filter(r => r.name !== "Super Admin").length === 0 ? (
                        <div className="px-4 py-5 text-center text-sm text-gray-400">
                          <Shield className="w-6 h-6 text-gray-200 mx-auto mb-1.5" />
                          No roles available
                        </div>
                      ) : roles.filter(r => r.name !== "Super Admin").map((r, i, arr) => {
                        const selected = fRoleId === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => { setFRoleId(r.id); setRoleDropOpen(false); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition ${
                              selected ? "bg-blue-50" : "hover:bg-gray-50"
                            } ${i < arr.length - 1 ? "border-b border-gray-100" : ""}`}
                          >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-blue-600 shadow-sm shadow-blue-200" : "bg-gray-100"}`}>
                              <Shield className={`w-4 h-4 ${selected ? "text-white" : "text-gray-400"}`} />
                            </div>
                            <span className={`flex-1 text-left font-semibold ${selected ? "text-blue-700" : "text-gray-800"}`}>
                              {r.name}
                            </span>
                            {selected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <Field label="Location" hint="Leave empty to allow access to all locations.">
                <LocationSelect
                  value={fLocationId}
                  onChange={setFLocationId}
                  locations={locations}
                  allowAll
                  allLabel="All locations (no restriction)"
                  className="w-full"
                />
              </Field>
              {fError && <ErrorBanner>{fError}</ErrorBanner>}
            </form>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button type="button" onClick={() => !fLoading && setDrawer(null)} className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl transition text-sm">Cancel</button>
              <button type="submit" form="user-form" disabled={fLoading} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl shadow-sm shadow-blue-200 transition text-sm">
                {fLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> {drawer === "add" ? "Create user" : "Save changes"}</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Password Reset Modal ── */}
      {pwdTarget && (
        <Modal onClose={() => !pwdLoading && setPwdTarget(null)}>
          <ModalHeader icon={<Key className="w-5 h-5 text-amber-600" />} bg="bg-amber-100" title="Reset password" sub={pwdTarget.name} />
          <form onSubmit={handlePwdReset} className="space-y-4">
            <Field label="New password">
              <div className="relative">
                <input value={newPwd} onChange={e => setNewPwd(e.target.value)} type={showNewPwd ? "text" : "password"} placeholder="Min. 6 characters" maxLength={50} autoFocus className={inputCls + " pr-10"} />
                <button type="button" onClick={() => setShowNewPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">{showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </Field>
            {pwdError && <ErrorBanner>{pwdError}</ErrorBanner>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setPwdTarget(null)} className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl transition text-sm">Cancel</button>
              <button type="submit" disabled={pwdLoading} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold py-2.5 rounded-xl transition text-sm">
                {pwdLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</> : <><Key className="w-4 h-4" /> Reset password</>}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete Modal ── */}
      {delTarget && (
        <Modal onClose={() => !deleting && setDelTarget(null)}>
          <ModalHeader icon={<Trash2 className="w-5 h-5 text-red-600" />} bg="bg-red-100" title="Delete user" sub="This cannot be undone" />
          <p className="text-sm text-gray-600 mb-5">
            Delete <span className="font-semibold text-gray-900">{delTarget.name}</span>? Their account will be permanently deactivated.
          </p>
          {delError && <ErrorBanner className="mb-4">{delError}</ErrorBanner>}
          <div className="flex gap-3">
            <button onClick={() => setDelTarget(null)} className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl transition text-sm">Cancel</button>
            <button onClick={handleDelete} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2.5 rounded-xl transition text-sm">
              {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</> : <><Trash2 className="w-4 h-4" /> Delete user</>}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Role Permissions View Modal ── */}
      {viewRole && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setViewRole(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">{viewRole.name}</h3>
                  <p className="text-xs text-gray-400">{viewOps.length} permissions</p>
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
    </div>
  );
}

// ── small reusable pieces ─────────────────────────────────────────────────────
function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
}
function ErrorBanner({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 ${className}`}>
      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
      <p className="text-sm text-red-700">{children}</p>
    </div>
  );
}
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}
function ModalHeader({ icon, bg, title, sub }: { icon: React.ReactNode; bg: string; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center shrink-0`}>{icon}</div>
      <div><h3 className="text-base font-bold text-gray-900">{title}</h3><p className="text-xs text-gray-400 mt-0.5">{sub}</p></div>
    </div>
  );
}
function IconBtn({ title, color, onClick, children }: { title: string; color: "blue"|"amber"|"red"; onClick: () => void; children: React.ReactNode }) {
  const cls = { blue: "text-blue-500 hover:bg-blue-50 hover:text-blue-700", amber: "text-amber-500 hover:bg-amber-50 hover:text-amber-700", red: "text-gray-400 hover:bg-red-50 hover:text-red-600" };
  return <button title={title} onClick={onClick} className={`p-2 rounded-lg transition ${cls[color]}`}>{children}</button>;
}
function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button disabled={disabled} onClick={onClick} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition border border-transparent hover:border-gray-200">{children}</button>;
}

const thCls    = "px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-widest";
const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition";
