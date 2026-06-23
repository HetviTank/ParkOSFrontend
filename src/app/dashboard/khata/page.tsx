"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight, BookOpen, Phone, Building2, Truck,
  Plus, X, Loader2, AlertCircle, Link2, ShieldCheck,
  ChevronLeft, ChevronRight as Next, Info, IndianRupee, RefreshCw,
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
interface Khata { id: string; owner_id: string; monthly_rate: number; billing_day: number; grace_days: number; is_active: boolean; created_at: string | null }
interface KhataTruck { id: string; khata_id: string; truck_id: string }
interface TruckObj { id: string; truck_number: string }
interface EnrichedKhata { khata: Khata; owner: Owner | null; khataTrucks: (KhataTruck & { truck_number?: string })[] }

const PAGE_SIZE = 8;
const AVATAR_COLORS = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-amber-500","bg-red-500","bg-teal-500","bg-pink-500","bg-indigo-500"];
function avatarColor(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
function initials(n: string) { return n.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase(); }
function fmtMobile(m: string) { return m.startsWith("+91") ? m : `+91 ${m}`; }
function fmtRate(r: number) { return `₹${r.toLocaleString("en-IN")} / month`; }
function khataRef(createdAt: string | null, idx: number) {
  const n = idx + 1;
  return `KH-${String(n).padStart(3, "0")}`;
}
function statusFor(k: Khata): { label: string; cls: string } {
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
  const [fRate,    setFRate]    = useState("");
  const [fTrucks,  setFTrucks]  = useState("");
  const [fErr,     setFErr]     = useState("");
  const [fBusy,    setFBusy]    = useState(false);
  const [fOk,      setFOk]      = useState(false);

  // per-card link-truck state
  const [linkInput,   setLinkInput]   = useState<Record<string, string>>({});
  const [linkBusy,    setLinkBusy]    = useState<Record<string, boolean>>({});
  const [linkErr,     setLinkErr]     = useState<Record<string, string>>({});
  const [unlinkBusy,  setUnlinkBusy]  = useState<Record<string, boolean>>({});

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
    if (!fRate || isNaN(Number(fRate)) || Number(fRate) <= 0) { setFErr("Monthly rate must be a positive number."); return; }
    setFBusy(true); setFErr(""); setFOk(false);
    try {
      // 1. create owner
      const owner = await apiFetch<Owner>("/owners", {
        method: "POST",
        body: JSON.stringify({ name: fName.trim(), primary_mobile: fMobile.trim().replace(/\D/g,""), company: fCompany.trim() || null }),
      });
      ownerCache.current[owner.id] = owner;

      // 2. create khata
      const khata = await apiFetch<Khata>("/khatas", {
        method: "POST",
        body: JSON.stringify({ owner_id: owner.id, monthly_rate: Number(fRate) }),
      });

      // 3. link trucks
      if (fTrucks.trim()) {
        const nums = fTrucks.split(",").map(s => s.trim()).filter(Boolean);
        await Promise.allSettled(nums.map(async num => {
          const truck_id = await resolveTruckId(num);
          await apiFetch("/khata-trucks", { method: "POST", body: JSON.stringify({ khata_id: khata.id, truck_id }) });
        }));
      }

      setFName(""); setFMobile(""); setFCompany(""); setFRate(""); setFTrucks("");
      setFOk(true); setTimeout(() => setFOk(false), 3000);
      fetchList(1); setPage(1);
    } catch (e) { setFErr(e instanceof Error ? e.message : "Failed to create khata."); }
    finally { setFBusy(false); }
  }

  async function handleLink(khataId: string) {
    const num = (linkInput[khataId] ?? "").trim().toUpperCase();
    if (!num) return;
    setLinkBusy(p => ({ ...p, [khataId]: true }));
    setLinkErr(p => ({ ...p, [khataId]: "" }));
    try {
      const truck_id = await resolveTruckId(num);
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Company / Firm</label>
                <input value={fCompany} onChange={e => setFCompany(e.target.value)}
                  placeholder="Firm name" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Monthly rate <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input value={fRate} onChange={e => { setFRate(e.target.value.replace(/[^\d.]/g, "")); setFErr(""); }}
                    placeholder="3500" className={inputCls + " pl-8"} />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Link trucks now <span className="text-gray-400 font-normal">(optional, comma separated)</span>
              </label>
              <input value={fTrucks} onChange={e => setFTrucks(e.target.value.toUpperCase())}
                placeholder="GJ11AB1234, GJ09CD5678" className={inputCls} />
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
            const ref = khataRef(khata.created_at, (page - 1) * PAGE_SIZE + idx);
            const name = owner?.name ?? "Unknown";
            const linkVal = linkInput[khata.id] ?? "";
            const isLinkBusy = linkBusy[khata.id] ?? false;
            const linkErrMsg = linkErr[khata.id] ?? "";

            return (
              <div key={khata.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* owner header */}
                <div className="flex items-start gap-3 px-5 pt-4 pb-3">
                  <div className={`w-11 h-11 ${avatarColor(name)} rounded-xl flex items-center justify-center shrink-0 shadow-sm`}>
                    <span className="text-sm font-bold text-white tracking-wider">{initials(name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{name}</p>
                    <p className="text-xs text-gray-400 truncate">{owner?.company ?? "—"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{owner ? fmtMobile(owner.primary_mobile) : "—"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-mono">
                      {ref}
                    </span>
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* rate */}
                <div className="flex items-center gap-1.5 px-5 pb-3">
                  <IndianRupee className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-600">{fmtRate(khata.monthly_rate)}</span>
                  <span className="text-gray-300 mx-1">·</span>
                  <span className="text-xs text-gray-400">Billing on day {khata.billing_day}</span>
                  <span className="text-gray-300 mx-1">·</span>
                  <span className="text-xs text-gray-400">{khata.grace_days}d grace</span>
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
                      onChange={e => setLinkInput(p => ({ ...p, [khata.id]: e.target.value.toUpperCase() }))}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleLink(khata.id); } }}
                      placeholder="Truck number to link..."
                      className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white transition font-mono"
                    />
                    <button
                      onClick={() => handleLink(khata.id)}
                      disabled={!linkVal.trim() || isLinkBusy}
                      className="flex items-center gap-1 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-xs font-bold rounded-lg transition whitespace-nowrap">
                      {isLinkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                      Link
                    </button>
                  </div>
                  {linkErrMsg && (
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
