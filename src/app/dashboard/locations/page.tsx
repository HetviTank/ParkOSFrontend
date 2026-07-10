"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight, Plus, X, Loader2, AlertCircle, CheckCircle2,
  MapPin, Settings, Zap, ZapOff,
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
interface Location   { id: string; name: string; city: string | null; address: string | null; operator: string | { name?: string } | null; is_active: boolean }
interface Division   { id: string; name: string; location?: string | null; location_id?: string | null; truck_type: string; total_slots: number; rate_per_day: number; gst_percent: number; status: string }
interface SlotRecord { id: string; division_id: string; status: string }
interface SessRecord { id: string; location_id: string; status: string }

interface EnrichedLoc {
  loc: Location;
  divisions: Division[];
  totalSlots: number;
  occupied: number;
  free: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["bg-blue-500","bg-violet-500","bg-indigo-500","bg-teal-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-cyan-500"];
function avatarColor(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }

function operatorLabel(op: string | { name?: string } | null): string | null {
  if (!op) return null;
  if (typeof op === "object") return op.name ?? "Assigned";
  return op;
}

function divPill(type: string): { bg: string; text: string; border: string } {
  switch (type.toLowerCase()) {
    case "heavy":  return { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200" };
    case "medium": return { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200" };
    case "light":  return { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200" };
    default:       return { bg: "bg-gray-50",    text: "text-gray-600",    border: "border-gray-200" };
  }
}

const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition";

// ── page ──────────────────────────────────────────────────────────────────────
export default function LocationsPage() {
  const [rows,    setRows]    = useState<EnrichedLoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  // add-location drawer
  const [addOpen,  setAddOpen]  = useState(false);
  const [fName,    setFName]    = useState("");
  const [fCity,    setFCity]    = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fErr,     setFErr]     = useState("");
  const [fBusy,    setFBusy]    = useState(false);
  const [fOk,      setFOk]      = useState(false);

  // configure drawer
  const [cfgLoc,   setCfgLoc]   = useState<EnrichedLoc | null>(null);
  const [cfgName,  setCfgName]  = useState("");
  const [cfgCity,  setCfgCity]  = useState("");
  const [cfgAddr,  setCfgAddr]  = useState("");
  const [cfgErr,   setCfgErr]   = useState("");
  const [cfgBusy,  setCfgBusy]  = useState(false);
  const [cfgOk,    setCfgOk]    = useState(false);

  // activate busy
  const [activating, setActivating] = useState<string | null>(null);

  const addDrawerRef = useRef<HTMLDivElement>(null);
  const cfgDrawerRef = useRef<HTMLDivElement>(null);


  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [locRes, divRes, slotRes, sessRes] = await Promise.all([
        apiFetch<{ count: number; list: Location[] }>("/locations?limit=100&sort_by=created_at&order=asc"),
        apiFetch<{ count: number; list: Division[] }>("/divisions?limit=200"),
        apiFetch<{ count: number; list: SlotRecord[] }>("/slots?limit=1000").catch(() => ({ count: 0, list: [] as SlotRecord[] })),
        apiFetch<{ count: number; list: SessRecord[] }>("/parking-sessions?status=parked&limit=1000").catch(() => ({ count: 0, list: [] as SessRecord[] })),
      ]);

      const locs     = locRes.list  ?? [];
      const divs     = divRes.list  ?? [];
      const slots    = slotRes.list ?? [];
      const sessions = sessRes.list ?? [];

      // slot count per division_id
      const slotsByDiv: Record<string, number> = {};
      slots.forEach(s => { slotsByDiv[s.division_id] = (slotsByDiv[s.division_id] ?? 0) + 1; });

      // occupied (parked sessions) count per location_id
      const occupiedByLoc: Record<string, number> = {};
      sessions.forEach(s => { occupiedByLoc[s.location_id] = (occupiedByLoc[s.location_id] ?? 0) + 1; });

      const enriched: EnrichedLoc[] = locs.map(loc => {
        const myDivs     = divs.filter(d => (d.location_id ?? d.location) === loc.id);
        const totalSlots = myDivs.reduce((s, d) => s + (slotsByDiv[d.id] ?? d.total_slots ?? 0), 0);
        const occupied   = occupiedByLoc[loc.id] ?? 0;
        return { loc, divisions: myDivs, totalSlots, occupied, free: Math.max(0, totalSlots - occupied) };
      });

      setRows(enriched);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load locations."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // click-outside to close drawers
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (addOpen && addDrawerRef.current && !addDrawerRef.current.contains(e.target as Node)) setAddOpen(false);
      if (cfgLoc && cfgDrawerRef.current && !cfgDrawerRef.current.contains(e.target as Node)) setCfgLoc(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [addOpen, cfgLoc]);

  async function handleAdd(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fName.trim()) { setFErr("Location name is required."); return; }
    setFBusy(true); setFErr(""); setFOk(false);
    try {
      await apiFetch<Location>("/locations", {
        method: "POST",
        body: JSON.stringify({ name: fName.trim(), city: fCity.trim() || null, address: fAddress.trim() || null }),
      });
      setFOk(true); setFName(""); setFCity(""); setFAddress("");
      setTimeout(() => { setAddOpen(false); setFOk(false); load(); }, 1200);
    } catch (e) { setFErr(e instanceof Error ? e.message : "Failed."); }
    finally { setFBusy(false); }
  }

  function openConfigure(row: EnrichedLoc) {
    setCfgLoc(row); setCfgName(row.loc.name); setCfgCity(row.loc.city ?? "");
    setCfgAddr(row.loc.address ?? ""); setCfgErr(""); setCfgOk(false);
  }

  async function handleConfigure(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!cfgLoc) return;
    if (!cfgName.trim()) { setCfgErr("Name is required."); return; }
    setCfgBusy(true); setCfgErr(""); setCfgOk(false);
    try {
      await apiFetch<Location>(`/locations/${cfgLoc.loc.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: cfgName.trim(), city: cfgCity.trim() || null, address: cfgAddr.trim() || null, is_active: cfgLoc.loc.is_active }),
      });
      setCfgOk(true);
      setTimeout(() => { setCfgLoc(null); setCfgOk(false); load(); }, 1200);
    } catch (e) { setCfgErr(e instanceof Error ? e.message : "Failed."); }
    finally { setCfgBusy(false); }
  }

  async function handleActivate(loc: Location) {
    setActivating(loc.id);
    try {
      await apiFetch<Location>(`/locations/${loc.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: loc.name, city: loc.city, address: loc.address, is_active: true }),
      });
      load();
    } catch { /* silent */ }
    finally { setActivating(null); }
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
            <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 font-medium">Locations</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Locations</h1>
          <p className="text-sm text-gray-400 mt-0.5">Configure parking yards, assign operators, and manage divisions per site.</p>
        </div>
        <button onClick={() => { setAddOpen(true); setFName(""); setFCity(""); setFAddress(""); setFErr(""); setFOk(false); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-sm shadow-blue-200 transition whitespace-nowrap self-start sm:self-auto">
          <Plus className="w-4 h-4" />Add location
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* skeletons */}
      {loading && rows.length === 0 && (
        <div className="space-y-4">
          {[0,1].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse space-y-4">
              <div className="flex gap-3"><div className="w-10 h-10 bg-gray-100 rounded-xl" /><div className="flex-1 space-y-2"><div className="h-4 bg-gray-100 rounded w-48" /><div className="h-3 bg-gray-100 rounded w-36" /></div></div>
              <div className="grid grid-cols-3 gap-3"><div className="h-16 bg-gray-100 rounded-xl" /><div className="h-16 bg-gray-100 rounded-xl" /><div className="h-16 bg-gray-100 rounded-xl" /></div>
            </div>
          ))}
        </div>
      )}

      {/* location cards */}
      <div className="space-y-4">
        {rows.map(row => {
          const { loc, totalSlots, occupied, free } = row;
          const isActive = loc.is_active;

          return (
            <div key={loc.id}
              className={`rounded-2xl border shadow-sm overflow-hidden transition-opacity ${isActive ? "bg-white border-gray-100" : "bg-gray-50/60 border-gray-200 opacity-80"}`}>

              {/* location header */}
              <div className="flex items-center gap-3 px-5 py-4">
                <div className={`w-10 h-10 ${isActive ? avatarColor(loc.name) : "bg-gray-300"} rounded-xl flex items-center justify-center shrink-0 shadow-sm`}>
                  <span className="text-sm font-bold text-white">{loc.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-bold truncate ${isActive ? "text-gray-900" : "text-gray-500"}`}>{loc.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {[loc.city, loc.address].filter(Boolean).join(", ") || "No address"}
                    {operatorLabel(loc.operator) ? ` · Operator: ${operatorLabel(loc.operator)}` : " · No operator assigned"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isActive ? (
                    <>
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full">Active</span>
                      <button onClick={() => openConfigure(row)}
                        className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm transition">
                        <Settings className="w-3.5 h-3.5" />Configure
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">Inactive</span>
                      <button onClick={() => handleActivate(loc)} disabled={activating === loc.id}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 px-3 py-1.5 rounded-xl shadow-sm transition">
                        {activating === loc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        Activate
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isActive && (
                <div className="grid grid-cols-3 gap-0 border-t border-gray-100 divide-x divide-gray-100">
                  <div className="bg-blue-50/60 px-5 py-3.5">
                    <p className="text-xs font-semibold text-blue-500 mb-0.5">Total slots</p>
                    <p className="text-2xl font-black text-blue-700">{totalSlots}</p>
                  </div>
                  <div className="bg-red-50/60 px-5 py-3.5">
                    <p className="text-xs font-semibold text-red-500 mb-0.5">Occupied</p>
                    <p className="text-2xl font-black text-red-600">{occupied}</p>
                  </div>
                  <div className="bg-emerald-50/60 px-5 py-3.5">
                    <p className="text-xs font-semibold text-emerald-500 mb-0.5">Free</p>
                    <p className="text-2xl font-black text-emerald-600">{free >= 0 ? free : 0}</p>
                  </div>
                </div>
              )}

              {!isActive && (
                <div className="px-5 py-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 italic flex items-center gap-1.5">
                    <ZapOff className="w-3.5 h-3.5" />Activate this location to start tracking slots.
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {!loading && rows.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-16 text-center">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <MapPin className="w-7 h-7 text-blue-400" />
            </div>
            <p className="text-sm font-semibold text-gray-500">No locations yet</p>
            <p className="text-xs text-gray-400 mt-1">Add the first parking yard using the button above.</p>
          </div>
        )}
      </div>

      {/* ── Add location drawer ── */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div ref={addDrawerRef} className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-base font-bold text-gray-900">Add location</p>
              </div>
              <button onClick={() => setAddOpen(false)} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form id="add-loc-form" onSubmit={handleAdd} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Location name <span className="text-red-400">*</span></label>
                <input value={fName} onChange={e => { setFName(e.target.value); setFErr(""); }}
                  placeholder="e.g. Bhuj Gate — North Yard" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">City</label>
                <input value={fCity} onChange={e => setFCity(e.target.value)} placeholder="Bhuj" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Address</label>
                <textarea value={fAddress} onChange={e => setFAddress(e.target.value)} rows={2} placeholder="Plot 1, Industrial Zone…" className={inputCls + " resize-none"} />
              </div>
              {fErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{fErr}</p>
                </div>
              )}
              {fOk && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-700 font-semibold">Location added!</p>
                </div>
              )}
            </form>
            <div className="border-t border-gray-100 px-6 py-4 flex gap-3 bg-gray-50/50">
              <button type="button" onClick={() => setAddOpen(false)} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button type="submit" form="add-loc-form" disabled={fBusy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl shadow-sm transition">
                {fBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Add location"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Configure drawer ── */}
      {cfgLoc && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setCfgLoc(null)} />
          <div ref={cfgDrawerRef} className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Settings className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="text-base font-bold text-gray-900">Configure location</p>
              </div>
              <button onClick={() => setCfgLoc(null)} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form id="cfg-loc-form" onSubmit={handleConfigure} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Location name <span className="text-red-400">*</span></label>
                <input value={cfgName} onChange={e => { setCfgName(e.target.value); setCfgErr(""); }} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">City</label>
                <input value={cfgCity} onChange={e => setCfgCity(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Address</label>
                <textarea value={cfgAddr} onChange={e => setCfgAddr(e.target.value)} rows={2} className={inputCls + " resize-none"} />
              </div>

              {/* division overview */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current divisions</p>
                {cfgLoc.divisions.length === 0
                  ? <p className="text-xs text-gray-400 italic">No divisions yet.</p>
                  : <div className="space-y-1.5">
                      {cfgLoc.divisions.map(d => {
                        const p = divPill(d.truck_type);
                        return (
                          <div key={d.id} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${p.bg} ${p.border}`}>
                            <span className={`text-xs font-semibold ${p.text}`}>{d.name} · {d.truck_type} · {d.total_slots} slots</span>
                            <span className={`text-xs font-bold ${p.text}`}>₹{d.rate_per_day}/day</span>
                          </div>
                        );
                      })}
                    </div>
                }
              </div>

              {cfgErr && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5"><AlertCircle className="w-4 h-4 text-red-500 shrink-0" /><p className="text-sm text-red-700">{cfgErr}</p></div>}
              {cfgOk  && <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /><p className="text-sm text-emerald-700 font-semibold">Saved!</p></div>}
            </form>
            <div className="border-t border-gray-100 px-6 py-4 flex gap-3 bg-gray-50/50">
              <button type="button" onClick={() => setCfgLoc(null)} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button type="submit" form="cfg-loc-form" disabled={cfgBusy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-xl shadow-sm transition">
                {cfgBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
