"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight, Bell, BellOff, CheckCircle2, AlertTriangle,
  AlertCircle, Clock, Truck, X, Loader2, Plus, RefreshCw,
  ChevronDown, ChevronLeft, Phone, Info, CheckCheck, Search, Check,
} from "lucide-react";

const PER_PAGE = 15;

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

// ── types ─────────────────────────────────────────────────────────────────────
interface Notice {
  id: string; notice_type: string; message: string | null;
  truck_id: string | null; owner_id: string | null; session_id: string | null;
  created_by: string | null; is_system: boolean; status: string;
  resolved_at: string | null; created_at: string | null;
  truck_number?: string; owner_name?: string; owner_mobile?: string; created_by_name?: string;
}
interface AlertType { id: string; name: string | null; code: string; description: string | null }
interface TruckObj  { id: string; truck_number: string; truck_type: string | null }
interface Owner     { id: string; name: string; primary_mobile: string }
interface AdminUser { id: string; name: string }
interface Session   { id: string; truck_id: string | null; owner_id: string | null }

// ── helpers ───────────────────────────────────────────────────────────────────
function noticeConfig(type: string) {
  const t = type.toLowerCase();
  if (t.includes("mismatch") || t.includes("driver"))
    return { label: "Driver mismatch", dot: "bg-red-400",    badge: "bg-red-100 text-red-700 border-red-200",    row: "bg-red-50/40",   Icon: AlertCircle,   iconColor: "text-red-500",     grad: "from-red-500 to-rose-600"     };
  if (t.includes("overdue") || t.includes("khata"))
    return { label: "Overdue",         dot: "bg-rose-400",   badge: "bg-rose-100 text-rose-700 border-rose-200",  row: "bg-rose-50/40",  Icon: AlertTriangle, iconColor: "text-rose-500",    grad: "from-rose-500 to-pink-600"    };
  if (t.includes("capacity") || t.includes("full"))
    return { label: "Capacity",        dot: "bg-amber-400",  badge: "bg-amber-100 text-amber-700 border-amber-200", row: "bg-amber-50/40",Icon: AlertTriangle, iconColor: "text-amber-500",   grad: "from-amber-500 to-orange-500" };
  if (t.includes("remind") || t.includes("day"))
    return { label: "Reminder",        dot: "bg-blue-400",   badge: "bg-blue-100 text-blue-700 border-blue-200",   row: "bg-blue-50/30",  Icon: Clock,         iconColor: "text-blue-500",    grad: "from-blue-500 to-indigo-600"  };
  if (t.includes("damage") || t.includes("note"))
    return { label: "Damage note",     dot: "bg-orange-400", badge: "bg-orange-100 text-orange-700 border-orange-200", row: "", Icon: Info,       iconColor: "text-orange-500",  grad: "from-orange-500 to-red-500"   };
  if (t.includes("receipt"))
    return { label: "Receipt sent",    dot: "bg-emerald-400",badge: "bg-emerald-100 text-emerald-700 border-emerald-200", row: "", Icon: CheckCheck, iconColor: "text-emerald-500", grad: "from-emerald-500 to-teal-600"  };
  return   { label: type.replace(/_/g," "), dot: "bg-gray-300", badge: "bg-gray-100 text-gray-600 border-gray-200", row: "", Icon: Bell, iconColor: "text-gray-400", grad: "from-gray-400 to-slate-500" };
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d   = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (diffDays === 0) return time;
  return `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })} ${time}`;
}
function relTime(iso: string | null) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const inputCls = "w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition";

// ── Sweet-alert toast ─────────────────────────────────────────────────────────
function SuccessToast({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div
        className="bg-white rounded-3xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 pointer-events-auto"
        style={{ animation: "swal-pop .35s cubic-bezier(.175,.885,.32,1.275) both" }}
      >
        {/* animated check circle */}
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="#e9fdf0" strokeWidth="8" />
            <circle cx="40" cy="40" r="36" fill="none" stroke="#22c55e" strokeWidth="8"
              strokeDasharray="226" strokeDashoffset="226"
              style={{ animation: "swal-circle .5s .15s ease forwards" }}
              strokeLinecap="round" transform="rotate(-90 40 40)" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-9 h-9 text-green-500"
              style={{ animation: "swal-check .3s .55s ease both", opacity: 0 }}>
              <polyline points="4,13 9,18 20,7" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900">Notice Created!</p>
          <p className="text-sm text-gray-400 mt-1">Your notice has been posted successfully.</p>
        </div>
      </div>
      <style>{`
        @keyframes swal-pop  { from { opacity:0; transform:scale(.6) } to { opacity:1; transform:scale(1) } }
        @keyframes swal-circle { to { stroke-dashoffset:0 } }
        @keyframes swal-check  { from { opacity:0; transform:scale(.5) } to { opacity:1; transform:scale(1) } }
      `}</style>
    </div>
  );
}

// ── Notice type dropdown (modern, portal-positioned, mobile-safe) ─────────────
interface NoticeTypeOption { code: string; label: string; description?: string | null }

function NoticeTypeSelect({ value, onChange, options, placeholder = "Select type…" }: {
  value: string; onChange: (v: string) => void; options: NoticeTypeOption[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect,  setRect]  = useState<DOMRect | null>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  function openDropdown() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function reposition() { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()); }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const selected = options.find(o => o.code === value) ?? null;
  const selectedCfg = selected ? noticeConfig(selected.code) : null;
  const estimatedPanelHeight = 320;
  const openUp = rect ? rect.bottom + estimatedPanelHeight > window.innerHeight && rect.top > window.innerHeight - rect.bottom : false;
  const panelStyle: React.CSSProperties = rect ? {
    position: "fixed", left: rect.left, width: rect.width, zIndex: 10000,
    ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
  } : { display: "none" };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm text-left transition-all ${
          open
            ? "border-blue-500 ring-4 ring-blue-50 bg-white"
            : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/20"
        }`}
      >
        {selected && selectedCfg ? (
          <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${selectedCfg.grad} flex items-center justify-center shrink-0 shadow-sm`}>
            <selectedCfg.Icon className="w-4 h-4 text-white" />
          </span>
        ) : (
          <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Bell className="w-3.5 h-3.5 text-gray-400" />
          </span>
        )}
        <span className={`flex-1 truncate ${selected ? "font-semibold text-gray-900" : "font-medium text-gray-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <AnimatePresence>
          <motion.ul
            ref={panelRef}
            style={panelStyle}
            initial={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="bg-white border border-gray-100 rounded-2xl shadow-xl shadow-gray-200/60 overflow-hidden py-1.5 max-h-80 overflow-y-auto"
          >
            {options.map(o => {
              const cfg = noticeConfig(o.code);
              const isSelected = o.code === value;
              return (
                <li key={o.code}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.code); setOpen(false); }}
                    className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left transition ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${cfg.grad} flex items-center justify-center shrink-0 shadow-sm mt-0.5`}>
                      <cfg.Icon className="w-4 h-4 text-white" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isSelected ? "text-blue-700" : "text-gray-800"}`}>{o.label}</p>
                      {o.description && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{o.description}</p>}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 mt-1" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

// ── Add Notice Modal ──────────────────────────────────────────────────────────
const TRUCK_PAGE_SIZE = 8;

function AddNoticeModal({
  alertTypes, onClose, onSuccess,
}: {
  alertTypes: AlertType[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedTruck, setSelectedTruck] = useState<TruckObj | null>(null);
  const [truckSearch,   setTruckSearch]   = useState("");
  const [truckOptions,  setTruckOptions]  = useState<TruckObj[]>([]);
  const [truckTotal,    setTruckTotal]    = useState(0);
  const [truckPage,     setTruckPage]     = useState(0);
  const [truckLoading,  setTruckLoading]  = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);

  const [fType, setFType] = useState(alertTypes[0]?.code ?? "");
  const [fMsg,  setFMsg]  = useState("");
  const [fErr,  setFErr]  = useState("");
  const [fBusy, setFBusy] = useState(false);

  const noticeTypeOptions: NoticeTypeOption[] = alertTypes.length > 0
    ? alertTypes.map(at => ({ code: at.code, label: at.name ?? at.code, description: at.description }))
    : [
        { code: "general_reminder", label: "General reminder" },
        { code: "damage_note",      label: "Damage note" },
        { code: "overdue",          label: "Overdue" },
        { code: "capacity_warning", label: "Capacity warning" },
      ];

  // load all trucks on mount
  useEffect(() => {
    (async () => {
      setTruckLoading(true);
      try {
        const res = await apiFetch<{ count: number; list: TruckObj[] }>(
          `/trucks?limit=${TRUCK_PAGE_SIZE}&start=0&sort_by=created_at&order=desc`
        );
        setTruckOptions(res.list ?? []);
        setTruckTotal(res.count ?? 0);
      } catch { /* silent */ }
      finally { setTruckLoading(false); }
    })();
  }, []);

  // debounced search — when empty, reload the default full list
  useEffect(() => {
    const q = truckSearch.trim();
    if (!q) {
      // reset to full list
      setTruckPage(0);
      setTruckLoading(true);
      apiFetch<{ count: number; list: TruckObj[] }>(
        `/trucks?limit=${TRUCK_PAGE_SIZE}&start=0&sort_by=created_at&order=desc`
      ).then(res => {
        setTruckOptions(res.list ?? []);
        setTruckTotal(res.count ?? 0);
      }).catch(() => {}).finally(() => setTruckLoading(false));
      return;
    }
    const t = setTimeout(async () => {
      setTruckLoading(true); setTruckPage(0);
      try {
        const res = await apiFetch<{ count: number; list: TruckObj[] }>(
          `/trucks?search=${encodeURIComponent(q.toUpperCase())}&limit=${TRUCK_PAGE_SIZE}&start=0`
        );
        setTruckOptions(res.list ?? []);
        setTruckTotal(res.count ?? 0);
      } catch { /* silent */ }
      finally { setTruckLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [truckSearch]);

  async function loadMoreTrucks() {
    const nextPage = truckPage + 1;
    setTruckLoading(true);
    try {
      const res = await apiFetch<{ count: number; list: TruckObj[] }>(
        `/trucks?search=${encodeURIComponent(truckSearch.trim().toUpperCase())}&limit=${TRUCK_PAGE_SIZE}&start=${nextPage * TRUCK_PAGE_SIZE}`
      );
      setTruckOptions(prev => [...prev, ...(res.list ?? [])]);
      setTruckPage(nextPage);
    } catch { /* silent */ }
    finally { setTruckLoading(false); }
  }

  function pickTruck(t: TruckObj) {
    setSelectedTruck(t);
    setTruckSearch(""); setShowDropdown(false);
  }

  async function handlePost(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!fType) { setFErr("Select a notice type."); return; }
    setFBusy(true); setFErr("");
    try {
      await apiFetch<Notice>("/notices", {
        method: "POST",
        body: JSON.stringify({
          notice_type: fType,
          message: fMsg.trim() || null,
          truck_id: selectedTruck?.id ?? null,
          status: "open",
        }),
      });
      onSuccess();
    } catch (err) {
      setFErr(err instanceof Error ? err.message : "Failed to post notice.");
      setFBusy(false);
    }
  }

  const hasMore = truckOptions.length < truckTotal;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        style={{ animation: "modal-in .25s ease both" }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <Plus className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-sm font-bold text-gray-900">Post a notice</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handlePost} className="px-6 py-5 space-y-4">

          {/* ── truck search / select ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Truck number</label>

            {selectedTruck ? (
              /* selected chip */
              <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2.5">
                <Truck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono font-bold text-sm text-blue-700">{selectedTruck.truck_number}</span>
                  {selectedTruck.truck_type && (
                    <span className="ml-2 text-[11px] text-blue-400">{selectedTruck.truck_type}</span>
                  )}
                </div>
                <button type="button" onClick={() => setSelectedTruck(null)}
                  className="p-1 rounded-lg text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              /* search input + dropdown */
              <div className="relative">
                <Truck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  value={truckSearch}
                  onChange={e => setTruckSearch(e.target.value.toUpperCase())}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 160)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search by truck number…"
                  autoComplete="off"
                  className={inputCls + " pl-9 pr-9 font-mono"}
                />
                {truckLoading
                  ? <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400 pointer-events-none" />
                  : truckSearch && <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
                }

                {/* dropdown */}
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
                    {truckOptions.length > 0 ? (
                      <>
                        <ul className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                          {truckOptions.map(t => (
                            <li key={t.id}>
                              <button type="button" onMouseDown={() => pickTruck(t)}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-blue-50 transition text-left">
                                <Truck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="font-mono font-bold text-sm text-gray-800 flex-1">{t.truck_number}</span>
                                {t.truck_type && (
                                  <span className="text-[11px] text-gray-400 shrink-0">{t.truck_type}</span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                        {hasMore && (
                          <button type="button" onMouseDown={loadMoreTrucks} disabled={truckLoading}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 border-t border-gray-100 transition disabled:opacity-60">
                            {truckLoading
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</>
                              : <>Load more <span className="text-blue-400">({truckTotal - truckOptions.length} remaining)</span></>
                            }
                          </button>
                        )}
                      </>
                    ) : !truckLoading ? (
                      <div className="px-4 py-5 text-center">
                        <AlertCircle className="w-5 h-5 text-gray-300 mx-auto mb-1.5" />
                        <p className="text-xs font-semibold text-gray-500">No truck found</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          &ldquo;{truckSearch}&rdquo; is not registered in the system
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── notice type ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Notice type <span className="text-red-400">*</span>
            </label>
            <NoticeTypeSelect value={fType} onChange={(v) => { setFType(v); setFErr(""); }} options={noticeTypeOptions} />
          </div>

          {/* ── message ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notice details</label>
            <textarea value={fMsg} onChange={e => setFMsg(e.target.value)} rows={3}
              placeholder="Notice details…"
              className={inputCls + " resize-none"} />
          </div>

          {fErr && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{fErr}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={fBusy}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2.5 rounded-xl shadow-sm shadow-blue-200 transition text-sm">
              {fBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Posting…</> : "Post notice"}
            </button>
          </div>
        </form>
      </div>
      <style>{`
        @keyframes modal-in { from { opacity:0; transform:translateY(16px) scale(.97) } to { opacity:1; transform:none } }
      `}</style>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function NoticesPage() {
  const [active,    setActive]    = useState<Notice[]>([]);
  const [activeErr, setActiveErr] = useState("");
  const [log,       setLog]       = useState<Notice[]>([]);
  const [logTotal,  setLogTotal]  = useState(0);
  const [loadingA,  setLoadingA]  = useState(false);
  const [loadingL,  setLoadingL]  = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [alertTypes,setAlertTypes]= useState<AlertType[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [page,      setPage]      = useState(1);
  const pageRef = useRef(1);

  const truckCache   = useRef<Record<string, TruckObj>>({});
  const ownerCache   = useRef<Record<string, Owner>>({});
  const adminCache   = useRef<Record<string, string>>({});
  const sessionCache = useRef<Record<string, Session>>({});

  async function enrichNotices(notices: Notice[]): Promise<Notice[]> {
    // Step 1: for notices that have session_id but no truck_id/owner_id, fetch the session first
    const sessionIds = [...new Set(
      notices
        .filter(n => n.session_id && (!n.truck_id || !n.owner_id))
        .map(n => n.session_id as string)
    )].filter(id => !sessionCache.current[id]);

    await Promise.allSettled(
      sessionIds.map(id =>
        apiFetch<Session>(`/parking-sessions/${id}`)
          .then(s => { sessionCache.current[id] = s; })
          .catch(() => {})
      )
    );

    // Step 2: resolve effective truck/owner IDs (notice direct or via session fallback)
    const effectiveIds = notices.map(n => {
      const sess = n.session_id ? sessionCache.current[n.session_id] : undefined;
      return {
        truckId: n.truck_id ?? sess?.truck_id ?? null,
        ownerId: n.owner_id ?? sess?.owner_id ?? null,
      };
    });

    const truckIds = [...new Set(effectiveIds.map(e => e.truckId).filter(Boolean) as string[])].filter(id => !truckCache.current[id]);
    const ownerIds = [...new Set(effectiveIds.map(e => e.ownerId).filter(Boolean) as string[])].filter(id => !ownerCache.current[id]);
    const adminIds = [...new Set(notices.map(n => n.created_by).filter(Boolean) as string[])].filter(id => !adminCache.current[id]);

    await Promise.allSettled([
      ...truckIds.map(id => apiFetch<TruckObj>(`/trucks/${id}`).then(t => { truckCache.current[id] = t; }).catch(() => {})),
      ...ownerIds.map(id => apiFetch<Owner>(`/owners/${id}`).then(o => { ownerCache.current[id] = o; }).catch(() => {})),
      ...adminIds.map(id => apiFetch<AdminUser>(`/admin-users/${id}`).then(a => { adminCache.current[id] = a.name; }).catch(() => {})),
    ]);

    return notices.map((n, i) => {
      const { truckId, ownerId } = effectiveIds[i];
      return {
        ...n,
        truck_number:    truckId ? (truckCache.current[truckId]?.truck_number ?? n.truck_number) : n.truck_number,
        owner_name:      ownerId ? (ownerCache.current[ownerId]?.name          ?? n.owner_name)   : n.owner_name,
        owner_mobile:    ownerId ? (ownerCache.current[ownerId]?.primary_mobile ?? n.owner_mobile) : n.owner_mobile,
        created_by_name: n.created_by ? (adminCache.current[n.created_by]      ?? n.created_by_name) : n.created_by_name,
      };
    });
  }

  const fetchActive = useCallback(async () => {
    setLoadingA(true); setActiveErr("");
    try {
      const data = await apiFetch<{ count: number; list: Notice[] }>(`/notices?status=open&sort_by=created_at&order=desc&limit=20`);
      setActive(await enrichNotices(data.list ?? []));
    } catch (e) { setActiveErr(e instanceof Error ? e.message : "Failed to load alerts."); }
    finally { setLoadingA(false); }
  }, []); // eslint-disable-line

  const fetchLog = useCallback(async (pageNum = 1) => {
    setLoadingL(true);
    try {
      const start = (pageNum - 1) * PER_PAGE;
      const data = await apiFetch<{ count: number; list: Notice[] }>(
        `/notices?sort_by=created_at&order=desc&start=${start}&limit=${PER_PAGE}`
      );
      setLogTotal(data.count ?? 0);
      setLog(await enrichNotices(data.list ?? []));
    } catch { /* silent */ }
    finally { setLoadingL(false); }
  }, []); // eslint-disable-line

  useEffect(() => {
    fetchActive(); fetchLog(1);
    apiFetch<{ count: number; list: AlertType[] }>("/alert-types/all")
      .then(r => setAlertTypes(r.list ?? []))
      .catch(() => {});
    const id = setInterval(() => { fetchActive(); fetchLog(pageRef.current); }, 30_000);
    return () => clearInterval(id);
  }, [fetchActive, fetchLog]);

  function goToPage(p: number) {
    setPage(p);
    pageRef.current = p;
    fetchLog(p);
  }

  async function handleResolve(notice: Notice) {
    setResolving(notice.id);
    try {
      await apiFetch(`/notices/${notice.id}`, {
        method: "PUT",
        body: JSON.stringify({ notice_type: notice.notice_type, status: "resolved", resolved_at: new Date().toISOString() }),
      });
      setActive(prev => prev.filter(n => n.id !== notice.id));
      fetchLog(pageRef.current);
    } catch { /* silent */ }
    finally { setResolving(null); }
  }

  function handleSuccess() {
    setShowModal(false);
    setShowToast(true);
    goToPage(1);
    fetchActive();
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* ── header ── */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600 font-medium">Notices</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Notices &amp; alerts</h1>
            <p className="text-sm text-gray-400 mt-0.5">System alerts, owner communications, and operator notes.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { fetchActive(); goToPage(1); }} disabled={loadingA || loadingL}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-sm hover:bg-gray-50 transition">
              <RefreshCw className={`w-3.5 h-3.5 ${(loadingA || loadingL) ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm shadow-blue-200 transition">
              <Plus className="w-4 h-4" />
              Add notice
            </button>
          </div>
        </div>
      </div>

      {/* ── active alerts banner ── */}
      {(active.length > 0 || loadingA || activeErr) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
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

          <div className="divide-y divide-gray-100">
            {active.map(notice => {
              const cfg  = noticeConfig(notice.notice_type);
              const crit = ["mismatch","driver","overdue"].some(k => notice.notice_type.toLowerCase().includes(k));
              return (
                <div key={notice.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="mt-0.5 shrink-0"><cfg.Icon className={`w-3.5 h-3.5 ${cfg.iconColor}`} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
                      {notice.truck_number && (
                        <span className="text-xs font-mono font-bold text-blue-600">{notice.truck_number}</span>
                      )}
                      <span className="text-xs text-gray-400">{relTime(notice.created_at)}</span>
                    </div>
                    {notice.message && <p className="text-sm text-gray-600 mt-0.5">{notice.message}</p>}
                    {(notice.owner_name || notice.owner_mobile) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {notice.owner_name}{notice.owner_mobile && <> · +91 {notice.owner_mobile.slice(-10)}</>}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {notice.owner_mobile && (
                      <a href={`tel:${notice.owner_mobile}`}
                        className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition">
                        <Phone className="w-3 h-3" />Call
                      </a>
                    )}
                    <button onClick={() => handleResolve(notice)} disabled={resolving === notice.id}
                      className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg transition ${
                        crit
                          ? "bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white"
                          : "bg-white border border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}>
                      {resolving === notice.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : crit ? <><CheckCircle2 className="w-3 h-3" />Resolve</> : <><X className="w-3 h-3" />Dismiss</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── all notices table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-900">All notices log</p>
            {logTotal > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">{logTotal} total</span>
            )}
          </div>
          {loadingL && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>

        {!loadingL && log.length === 0 ? (
          <div className="py-16 text-center">
            <BellOff className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No notices yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Truck No.</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Type</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Message</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Owner</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Posted by</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {log.map(notice => {
                  const cfg    = noticeConfig(notice.notice_type);
                  const isOpen = notice.status === "open";
                  const byLabel = notice.is_system ? "System" : (notice.created_by_name ?? "Operator");
                  return (
                    <tr key={notice.id} className={`hover:bg-gray-50/60 transition-colors ${isOpen ? cfg.row : ""}`}>
                      {/* truck */}
                      <td className="px-5 py-3">
                        {notice.truck_number ? (
                          <Link
                            href={`/dashboard/trucks/profile?truck=${encodeURIComponent(notice.truck_number)}`}
                            className="font-mono text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {notice.truck_number}
                          </Link>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* type */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <cfg.Icon className={`w-3.5 h-3.5 ${cfg.iconColor}`} />
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </td>
                      {/* message */}
                      <td className="px-4 py-3 max-w-[260px]">
                        {notice.message
                          ? <p className="text-xs text-gray-600 truncate" title={notice.message}>{notice.message}</p>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isOpen
                            ? "bg-rose-100 text-rose-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-rose-500" : "bg-emerald-500"}`} />
                          {isOpen ? "Open" : "Resolved"}
                        </span>
                      </td>
                      {/* owner */}
                      <td className="px-4 py-3">
                        {notice.owner_name ? (
                          <div>
                            <p className="text-xs font-medium text-gray-700">{notice.owner_name}</p>
                            {notice.owner_mobile && (
                              <p className="text-[11px] text-gray-400 font-mono">+91 {notice.owner_mobile.slice(-10)}</p>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* posted by */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{byLabel}</span>
                      </td>
                      {/* time */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono text-gray-400">{fmtTime(notice.created_at)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── pagination bar ── */}
        {logTotal > PER_PAGE && (() => {
          const totalPages = Math.ceil(logTotal / PER_PAGE);
          const from = (page - 1) * PER_PAGE + 1;
          const to   = Math.min(page * PER_PAGE, logTotal);

          // build page number list: show first, last, current±1, with "…" gaps
          const pages: (number | "…")[] = [];
          for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
              pages.push(i);
            } else if (pages[pages.length - 1] !== "…") {
              pages.push("…");
            }
          }

          return (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs text-gray-400">
                Showing <span className="font-semibold text-gray-700">{from}–{to}</span> of{" "}
                <span className="font-semibold text-gray-700">{logTotal}</span> notices
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1 || loadingL}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                {pages.map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p as number)}
                      disabled={loadingL}
                      className={`w-8 h-8 text-xs font-semibold rounded-lg transition ${
                        p === page
                          ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                          : "text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages || loadingL}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── modal ── */}
      {showModal && (
        <AddNoticeModal
          alertTypes={alertTypes}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}

      {/* ── success toast ── */}
      {showToast && <SuccessToast onDone={() => setShowToast(false)} />}
    </div>
  );
}
