"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight, Bell, BellOff, CheckCircle2, AlertTriangle,
  AlertCircle, Clock, Truck, X, Loader2, Plus, RefreshCw,
  ChevronDown, Phone, Info,
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
interface Notice {
  id: string;
  notice_type: string;
  message: string | null;
  truck_id: string | null;
  owner_id: string | null;
  session_id: string | null;
  created_by: string | null;
  is_system: boolean;
  status: string;
  resolved_at: string | null;
  created_at: string | null;
  // enriched
  truck_number?: string;
  owner_name?: string;
  owner_mobile?: string;
  created_by_name?: string;
}
interface AlertType { id: string; name: string | null; code: string; description: string | null }
interface TruckObj { id: string; truck_number: string }
interface Owner { id: string; name: string; primary_mobile: string }
interface AdminUser { id: string; name: string }

// ── notice type config ────────────────────────────────────────────────────────
function noticeConfig(type: string): {
  label: string; cardBg: string; cardBorder: string;
  dotBg: string; badgeCls: string; icon: React.ReactNode;
} {
  const t = type.toLowerCase();
  if (t.includes("mismatch") || t.includes("driver"))
    return { label: "Driver mismatch", cardBg: "bg-red-50", cardBorder: "border-red-200", dotBg: "bg-red-400", badgeCls: "bg-red-100 text-red-700 border-red-200", icon: <AlertCircle className="w-4 h-4 text-red-500" /> };
  if (t.includes("overdue") || t.includes("khata"))
    return { label: "Overdue", cardBg: "bg-rose-50", cardBorder: "border-rose-200", dotBg: "bg-rose-400", badgeCls: "bg-rose-100 text-rose-700 border-rose-200", icon: <AlertTriangle className="w-4 h-4 text-rose-500" /> };
  if (t.includes("capacity") || t.includes("full"))
    return { label: "Capacity warning", cardBg: "bg-amber-50", cardBorder: "border-amber-200", dotBg: "bg-amber-400", badgeCls: "bg-amber-100 text-amber-700 border-amber-200", icon: <AlertTriangle className="w-4 h-4 text-amber-500" /> };
  if (t.includes("remind") || t.includes("day"))
    return { label: "Reminder", cardBg: "bg-blue-50", cardBorder: "border-blue-200", dotBg: "bg-blue-400", badgeCls: "bg-blue-100 text-blue-700 border-blue-200", icon: <Clock className="w-4 h-4 text-blue-500" /> };
  if (t.includes("damage") || t.includes("note"))
    return { label: "Damage note", cardBg: "bg-orange-50", cardBorder: "border-orange-200", dotBg: "bg-orange-400", badgeCls: "bg-orange-100 text-orange-700 border-orange-200", icon: <Info className="w-4 h-4 text-orange-500" /> };
  return { label: type, cardBg: "bg-gray-50", cardBorder: "border-gray-200", dotBg: "bg-gray-300", badgeCls: "bg-gray-100 text-gray-600 border-gray-200", icon: <Bell className="w-4 h-4 text-gray-400" /> };
}

function isCritical(type: string) {
  const t = type.toLowerCase();
  return t.includes("mismatch") || t.includes("driver") || t.includes("overdue");
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (diffDays === 0) return time;
  const day = d.getDate();
  const mon = d.toLocaleDateString("en-IN", { month: "short" });
  return `${day} ${mon} ${time}`;
}

function relTime(iso: string | null) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const selectCls = "w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition pr-9";

// ── main page ─────────────────────────────────────────────────────────────────
export default function NoticesPage() {
  const [active,     setActive]     = useState<Notice[]>([]);
  const [activeErr,  setActiveErr]  = useState("");
  const [log,        setLog]        = useState<Notice[]>([]);
  const [logTotal,   setLogTotal]   = useState(0);
  const [loadingA,   setLoadingA]   = useState(false);
  const [loadingL,   setLoadingL]   = useState(false);
  const [resolving,  setResolving]  = useState<string | null>(null);

  // post notice form
  const [alertTypes, setAlertTypes] = useState<AlertType[]>([]);
  const [fTruck,     setFTruck]     = useState("");
  const [fType,      setFType]      = useState("");
  const [fMsg,       setFMsg]       = useState("");
  const [fErr,       setFErr]       = useState("");
  const [fBusy,      setFBusy]      = useState(false);
  const [fOk,        setFOk]        = useState(false);

  // enrichment caches
  const truckCache = useRef<Record<string, TruckObj>>({});
  const ownerCache = useRef<Record<string, Owner>>({});
  const adminCache = useRef<Record<string, string>>({});

  async function enrichNotices(notices: Notice[]): Promise<Notice[]> {
    const truckIds  = [...new Set(notices.map(n => n.truck_id).filter(Boolean) as string[])].filter(id => !truckCache.current[id]);
    const ownerIds  = [...new Set(notices.map(n => n.owner_id).filter(Boolean) as string[])].filter(id => !ownerCache.current[id]);
    const adminIds  = [...new Set(notices.map(n => n.created_by).filter(Boolean) as string[])].filter(id => !adminCache.current[id]);

    await Promise.allSettled([
      ...truckIds.map(id => apiFetch<TruckObj>(`/trucks/${id}`).then(t => { truckCache.current[id] = t; }).catch(() => {})),
      ...ownerIds.map(id => apiFetch<Owner>(`/owners/${id}`).then(o => { ownerCache.current[id] = o; }).catch(() => {})),
      ...adminIds.map(id => apiFetch<AdminUser>(`/admin-users/${id}`).then(a => { adminCache.current[id] = a.name; }).catch(() => {})),
    ]);

    return notices.map(n => ({
      ...n,
      truck_number:    n.truck_id    ? truckCache.current[n.truck_id]?.truck_number : undefined,
      owner_name:      n.owner_id    ? ownerCache.current[n.owner_id]?.name : undefined,
      owner_mobile:    n.owner_id    ? ownerCache.current[n.owner_id]?.primary_mobile : undefined,
      created_by_name: n.created_by  ? adminCache.current[n.created_by] : undefined,
    }));
  }

  const fetchActive = useCallback(async () => {
    setLoadingA(true); setActiveErr("");
    try {
      const data = await apiFetch<{ count: number; list: Notice[] }>(`/notices?status=open&sort_by=created_at&order=desc&limit=20`);
      const enriched = await enrichNotices(data.list ?? []);
      setActive(enriched);
    } catch (e) { setActiveErr(e instanceof Error ? e.message : "Failed to load alerts."); }
    finally { setLoadingA(false); }
  }, []); // eslint-disable-line

  const fetchLog = useCallback(async () => {
    setLoadingL(true);
    try {
      const data = await apiFetch<{ count: number; list: Notice[] }>(`/notices?sort_by=created_at&order=desc&limit=50`);
      setLogTotal(data.count ?? 0);
      const enriched = await enrichNotices(data.list ?? []);
      setLog(enriched);
    } catch { /* silent */ }
    finally { setLoadingL(false); }
  }, []); // eslint-disable-line

  useEffect(() => {
    fetchActive();
    fetchLog();
    apiFetch<{ count: number; list: AlertType[] }>("/alert-types/all")
      .then(r => { setAlertTypes(r.list ?? []); if (r.list?.length) setFType(r.list[0].code); })
      .catch(() => {});
    const interval = setInterval(() => { fetchActive(); fetchLog(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchActive, fetchLog]);

  async function handleResolve(notice: Notice) {
    setResolving(notice.id);
    try {
      await apiFetch(`/notices/${notice.id}`, {
        method: "PUT",
        body: JSON.stringify({ notice_type: notice.notice_type, status: "resolved", resolved_at: new Date().toISOString() }),
      });
      setActive(prev => prev.filter(n => n.id !== notice.id));
      fetchLog();
    } catch { /* silent */ }
    finally { setResolving(null); }
  }

  async function handlePost(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fType) { setFErr("Select a notice type."); return; }
    setFBusy(true); setFErr(""); setFOk(false);
    try {
      let truck_id: string | null = null;
      if (fTruck.trim()) {
        const res = await apiFetch<{ count: number; list: TruckObj[] }>(`/trucks?search=${encodeURIComponent(fTruck.trim().toUpperCase())}&limit=10`);
        const match = res.list.find(t => t.truck_number.toUpperCase() === fTruck.trim().toUpperCase());
        if (match) { truck_id = match.id; truckCache.current[match.id] = match; }
      }
      await apiFetch<Notice>("/notices", {
        method: "POST",
        body: JSON.stringify({ notice_type: fType, message: fMsg.trim() || null, truck_id, status: "open" }),
      });
      setFTruck(""); setFMsg(""); setFOk(true);
      setTimeout(() => setFOk(false), 3000);
      fetchActive(); fetchLog();
    } catch (err) { setFErr(err instanceof Error ? err.message : "Failed to post notice."); }
    finally { setFBusy(false); }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-5">

      {/* header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600 font-medium">Notices</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Notices &amp; alerts</h1>
            <p className="text-sm text-gray-400 mt-0.5">System alerts, owner communications, and operator notes.</p>
          </div>
          <button onClick={() => { fetchActive(); fetchLog(); }} disabled={loadingA}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-sm hover:bg-gray-50 transition">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingA ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ── left: active alerts + post form ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* active alerts */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900">Active alerts</p>
                {active.length > 0 && (
                  <span className="text-xs font-bold bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                    {active.length} open
                  </span>
                )}
              </div>
              {loadingA && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
            </div>

            {activeErr && (
              <div className="flex items-center gap-2 mx-4 my-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{activeErr}</p>
              </div>
            )}

            {!loadingA && active.length === 0 && !activeErr && (
              <div className="px-5 py-12 text-center">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-gray-500">All clear</p>
                <p className="text-xs text-gray-400 mt-1">No open alerts right now.</p>
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {active.map(notice => {
                const cfg = noticeConfig(notice.notice_type);
                const crit = isCritical(notice.notice_type);
                return (
                  <div key={notice.id} className={`px-5 py-4 ${cfg.cardBg} border-l-4 ${cfg.cardBorder}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.cardBg}`}>
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">
                            {cfg.label}
                            {notice.truck_number && (
                              <> <span className="text-gray-400">—</span> <span className="font-mono text-blue-600">{notice.truck_number}</span></>
                            )}
                          </p>
                          <span className="text-xs text-gray-400">{relTime(notice.created_at)}</span>
                        </div>
                        {notice.message && (
                          <p className="text-sm text-gray-600 mt-0.5 leading-snug">{notice.message}</p>
                        )}
                        {(notice.owner_name || notice.owner_mobile) && (
                          <p className="text-xs text-gray-500 mt-1">
                            {notice.owner_name}
                            {notice.owner_mobile && (
                              <> · <span className="font-mono">+91 {notice.owner_mobile.slice(-10)}</span></>
                            )}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          {crit && (
                            <button onClick={() => handleResolve(notice)} disabled={resolving === notice.id}
                              className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-sm">
                              {resolving === notice.id
                                ? <><Loader2 className="w-3 h-3 animate-spin" />Resolving…</>
                                : <><CheckCircle2 className="w-3 h-3" />Resolve now</>}
                            </button>
                          )}
                          {notice.owner_mobile && (
                            <a href={`tel:${notice.owner_mobile}`}
                              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-sm">
                              <Phone className="w-3 h-3" />Call owner
                            </a>
                          )}
                          {!crit && (
                            <button onClick={() => handleResolve(notice)} disabled={resolving === notice.id}
                              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-xs font-semibold bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">
                              {resolving === notice.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <X className="w-3 h-3" />}
                              Dismiss
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* post a notice */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
              <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-sm font-bold text-gray-900">Post a notice</p>
            </div>
            <form onSubmit={handlePost} className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Truck number</label>
                <div className="relative">
                  <Truck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input value={fTruck} onChange={e => setFTruck(e.target.value.toUpperCase())}
                    placeholder="e.g. GJ11AB1234"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition font-mono" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Notice type <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select value={fType} onChange={e => { setFType(e.target.value); setFErr(""); }} className={selectCls}>
                    <option value="">Select type…</option>
                    {alertTypes.map(at => (
                      <option key={at.id} value={at.code}>{at.name ?? at.code}</option>
                    ))}
                    {alertTypes.length === 0 && (
                      <>
                        <option value="general_reminder">General reminder</option>
                        <option value="damage_note">Damage note</option>
                        <option value="overdue">Overdue</option>
                        <option value="capacity_warning">Capacity warning</option>
                      </>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notice details</label>
                <textarea value={fMsg} onChange={e => setFMsg(e.target.value)} rows={3}
                  placeholder="Notice details..."
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition resize-none" />
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
                  <p className="text-sm text-emerald-700 font-semibold">Notice posted successfully.</p>
                </div>
              )}

              <button type="submit" disabled={fBusy}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl shadow-sm shadow-blue-200 transition text-sm">
                {fBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Posting…</> : "Post notice"}
              </button>
            </form>
          </div>
        </div>

        {/* ── right: all notices log ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900">All notices log</p>
            <div className="flex items-center gap-2">
              {logTotal > 0 && (
                <span className="text-xs text-gray-400 font-medium">{logTotal} total</span>
              )}
              {loadingL && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
            </div>
          </div>

          {!loadingL && log.length === 0 && (
            <div className="px-5 py-12 text-center">
              <BellOff className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No notices yet.</p>
            </div>
          )}

          <div className="divide-y divide-gray-50 max-h-[640px] overflow-y-auto">
            {log.map(notice => {
              const cfg = noticeConfig(notice.notice_type);
              const isOpen = notice.status === "open";
              const byLabel = notice.is_system ? "System" : (notice.created_by_name ?? "Operator");
              return (
                <div key={notice.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors ${isOpen ? cfg.cardBg + "/30" : ""}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 mt-2 ${isOpen ? cfg.dotBg : "bg-gray-200"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 leading-snug truncate">
                          {notice.truck_number
                            ? <span className="font-mono text-blue-600 mr-1">{notice.truck_number}</span>
                            : null}
                          <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.badgeCls}`}>
                            {cfg.label}
                          </span>
                        </p>
                        {notice.message && (
                          <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{notice.message}</p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-0.5">{byLabel}</p>
                      </div>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0 font-mono">
                        {fmtTime(notice.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
