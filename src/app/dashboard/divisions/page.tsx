"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight, ChevronDown, Plus, X, Loader2, AlertCircle, Check,
  CheckCircle2, Layers, Save, Truck, Zap, Percent, IndianRupee, Timer,
} from "lucide-react";

import { handleUnauthorized, useLocationFilter } from "@/lib/auth";
import { LocationSelect } from "@/components/ui/LocationSelect";
import { EnumFilterSelect } from "@/components/ui/EnumFilterSelect";

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
interface LocationRef  { id: string; name: string; city?: string | null }
interface Division {
  id: string;
  name: string;
  location: LocationRef | string;
  truck_type: string;
  total_slots: number;
  rate_per_day: number;
  gst_percent: number | null;
  relaxation_hours?: number | null;
  status: string;
}
interface DivOcc {
  division_id: string;
  occupied_slots: number;
  total_slots: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function divLocId(d: Division): string {
  return typeof d.location === "string" ? d.location : (d.location as LocationRef).id;
}

const TRUCK_TYPES = ["heavy", "medium", "light"];

function divStyle(type: string): { grad: string; avatar: string; badge: string; ring: string; occ: string } {
  switch (type.toLowerCase()) {
    case "heavy":  return { grad: "from-violet-50 to-indigo-50", avatar: "bg-gradient-to-br from-violet-500 to-indigo-600", badge: "bg-violet-100 text-violet-700 border-violet-200", ring: "focus:ring-violet-400 focus:border-violet-400", occ: "bg-violet-400" };
    case "medium": return { grad: "from-teal-50 to-cyan-50",     avatar: "bg-gradient-to-br from-teal-500 to-cyan-600",    badge: "bg-teal-100 text-teal-700 border-teal-200",    ring: "focus:ring-teal-400 focus:border-teal-400",    occ: "bg-teal-400" };
    case "light":  return { grad: "from-emerald-50 to-green-50", avatar: "bg-gradient-to-br from-emerald-500 to-green-600", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", ring: "focus:ring-emerald-400 focus:border-emerald-400", occ: "bg-emerald-400" };
    default:       return { grad: "from-gray-50 to-slate-50",    avatar: "bg-gradient-to-br from-gray-400 to-slate-500",    badge: "bg-gray-100 text-gray-600 border-gray-200",    ring: "focus:ring-gray-400 focus:border-gray-400",    occ: "bg-gray-400" };
  }
}

function statusStyle(s: string): { bg: string; text: string; dot: string } {
  switch (s.toLowerCase()) {
    case "active": return { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" };
    case "draft":  return { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500" };
    default:       return { bg: "bg-gray-100",    text: "text-gray-600",    dot: "bg-gray-400" };
  }
}

function truckLabel(t: string): string {
  if (t === "heavy")  return "Heavy trucks (20T+)";
  if (t === "medium") return "Medium trucks (10–20T)";
  if (t === "light")  return "Light trucks (<10T)";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Truck-type filter options for the "new division" form — reuses each type's
// avatar gradient's base color as a dot, matching the card it will create.
const TRUCK_TYPE_FILTER_OPTIONS = TRUCK_TYPES.map(t => ({
  value: t,
  label: truckLabel(t),
  dot: t === "heavy" ? "bg-violet-500" : t === "medium" ? "bg-teal-500" : "bg-emerald-500",
}));

const DIVISION_STATUS_OPTIONS = ["active", "draft", "inactive"];

// A per-row inline status editor styled as a colored pill matching the
// division's own status/truck-type theme — a bespoke variant of the shared
// EnumFilterSelect pattern, since its trigger needs dynamic per-row colors
// that the shared component's fixed indigo styling can't express.
function DivisionStatusSelect({ value, onChange, ringClass }: { value: string; onChange: (v: string) => void; ringClass: string }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const st = statusStyle(value);

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
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const estimatedPanelHeight = DIVISION_STATUS_OPTIONS.length * 42 + 16;
  const openUp = rect ? rect.bottom + estimatedPanelHeight > window.innerHeight && rect.top > window.innerHeight - rect.bottom : false;
  const panelStyle: React.CSSProperties = rect ? {
    position: "fixed", left: rect.left, width: Math.max(rect.width, 150), zIndex: 10000,
    ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
  } : { display: "none" };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 text-xs font-bold rounded-full border border-transparent focus:outline-none focus:ring-2 ${ringClass} ${st.bg} ${st.text} transition`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
        {value.charAt(0).toUpperCase() + value.slice(1)}
        <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <AnimatePresence>
          <motion.div
            ref={panelRef}
            style={panelStyle}
            initial={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-gray-300/40 overflow-hidden"
          >
            <ul className="py-1.5">
              {DIVISION_STATUS_OPTIONS.map(s => {
                const isSel = s === value;
                const os = statusStyle(s);
                return (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => { onChange(s); setOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold transition ${isSel ? "bg-gray-50" : "hover:bg-gray-50"}`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${os.dot}`} />
                      <span className="flex-1 text-gray-700">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                      {isSel && <Check className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const inputCls = (ring: string) =>
  `w-full px-3.5 py-3 text-sm font-semibold text-gray-900 bg-white border border-gray-200 rounded-xl placeholder-gray-300 focus:outline-none focus:ring-2 ${ring} focus:bg-white transition shadow-sm`;

// ── page ──────────────────────────────────────────────────────────────────────
export default function DivisionsPage() {
  // Non-admin roles are locked to their assigned location — no "All locations" escape hatch.
  const { isAdmin, locationId: selLoc, setLocationId: setSelLoc } = useLocationFilter();

  const [locations, setLocations] = useState<LocationRef[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [occMap,    setOccMap]    = useState<Record<string, DivOcc>>({});
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  // system relaxation hours (global setting)
  const [sysRelaxHours, setSysRelaxHours] = useState(0);

  // per-division editable state
  const [edits,   setEdits]   = useState<Record<string, { slots: string; rate: string; gst: string; status: string }>>({});
  const [saving,  setSaving]  = useState<Record<string, boolean>>({});
  const [saved,   setSaved]   = useState<Record<string, boolean>>({});
  const [saveErr, setSaveErr] = useState<Record<string, string>>({});

  // per-division slot generation state
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [genErr,     setGenErr]     = useState<Record<string, string>>({});
  const [genOk,      setGenOk]      = useState<Record<string, boolean>>({});
  const [slotPanels, setSlotPanels] = useState<Record<string, boolean>>({});
  const [slotInputs, setSlotInputs] = useState<Record<string, string[]>>({});

  // add-division form
  const [addOpen,   setAddOpen]   = useState(false);
  const [newName,        setNewName]        = useState("");
  const [newType,        setNewType]        = useState("heavy");
  const [newSlots,       setNewSlots]       = useState("");
  const [newRate,        setNewRate]        = useState("");
  const [newGst,         setNewGst]         = useState("18");
  const [newStatus,      setNewStatus]      = useState("active");
  const [newErr,    setNewErr]    = useState("");
  const [newBusy,   setNewBusy]   = useState(false);
  const [newOk,     setNewOk]     = useState(false);

  const formRef = useRef<HTMLDivElement>(null);

  // load system relaxation hours
  useEffect(() => {
    apiFetch<{ relaxation_hours: number }>("/system-preferences")
      .then(p => setSysRelaxHours(p.relaxation_hours ?? 0))
      .catch(() => {});
  }, []);

  // load locations
  useEffect(() => {
    apiFetch<{ count: number; list: LocationRef[] }>("/locations?limit=100&sort_by=name&order=asc")
      .then(r => {
        const list = r.list ?? [];
        setLocations(list);
        // Admins default to the first location; non-admins are already locked
        // to their own assigned location (set from localStorage on mount).
        if (isAdmin && list.length > 0) setSelLoc(prev => prev || list[0].id);
      }).catch(() => {});
  }, [isAdmin, setSelLoc]);

  const loadDivisions = useCallback(async (locId_: string) => {
    if (!locId_) return;
    setLoading(true); setError("");
    try {
      const [divRes, dashRes] = await Promise.all([
        apiFetch<{ count: number; list: Division[] }>(`/divisions?location_id=${locId_}&limit=50`),
        apiFetch<{ division_occupancy: DivOcc[] }>(`/dashboard?location_id=${locId_}`).catch(() => ({ division_occupancy: [] })),
      ]);
      const divs = divRes.list ?? [];
      setDivisions(divs);
      // build occ map
      const map: Record<string, DivOcc> = {};
      (dashRes.division_occupancy ?? []).forEach(o => { map[o.division_id] = o; });
      setOccMap(map);
      // seed editable state
      const e: typeof edits = {};
      divs.forEach(d => {
        e[d.id] = { slots: String(d.total_slots), rate: String(d.rate_per_day), gst: String(d.gst_percent ?? 18), status: d.status };
      });
      setEdits(e);
      setSaving({}); setSaved({}); setSaveErr({});
      // load actual slot record counts for each division
      const counts: Record<string, number> = {};
      await Promise.all(divs.map(async (d) => {
        try {
          const sr = await apiFetch<{ count: number }>(`/slots?division_id=${d.id}&limit=1`);
          counts[d.id] = sr.count ?? 0;
        } catch { counts[d.id] = 0; }
      }));
      setSlotCounts(counts);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (selLoc) loadDivisions(selLoc); }, [selLoc, loadDivisions]);

  function setField(id: string, field: string, val: string) {
    setEdits(p => ({ ...p, [id]: { ...p[id], [field]: val } }));
    setSaveErr(p => ({ ...p, [id]: "" }));
    setSaved(p => ({ ...p, [id]: false }));
  }

  async function handleSave(div: Division) {
    const e = edits[div.id];
    if (!e) return;
    if (!e.slots || isNaN(Number(e.slots))) { setSaveErr(p => ({ ...p, [div.id]: "Valid slot count required." })); return; }
    if (!e.rate  || isNaN(Number(e.rate)))  { setSaveErr(p => ({ ...p, [div.id]: "Valid rate required." })); return; }
    setSaving(p => ({ ...p, [div.id]: true })); setSaveErr(p => ({ ...p, [div.id]: "" }));
    try {
      await apiFetch<Division>(`/divisions/${div.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: div.name,
          location_id: typeof div.location === "string" ? div.location : (div.location as LocationRef).id,
          truck_type: div.truck_type,
          total_slots: Number(e.slots),
          rate_per_day: Number(e.rate),
          gst_percent: Number(e.gst) || 18,
          status: e.status,
        }),
      });
      setSaved(p => ({ ...p, [div.id]: true }));
      setTimeout(() => setSaved(p => ({ ...p, [div.id]: false })), 2000);
    } catch (err) { setSaveErr(p => ({ ...p, [div.id]: err instanceof Error ? err.message : "Failed." })); }
    finally { setSaving(p => ({ ...p, [div.id]: false })); }
  }

  function openSlotPanel(div: Division, letter: string) {
    const total    = Number(edits[div.id]?.slots ?? div.total_slots);
    const existing = slotCounts[div.id] ?? 0;
    const need     = total - existing;
    if (need <= 0) return;
    const codes = Array.from({ length: need }, (_, i) =>
      `${letter}-${String(existing + i + 1).padStart(2, "0")}`
    );
    setSlotInputs(p => ({ ...p, [div.id]: codes }));
    setSlotPanels(p => ({ ...p, [div.id]: true }));
    setGenErr(p => ({ ...p, [div.id]: "" }));
  }

  function updateSlotInput(divId: string, idx: number, val: string) {
    setSlotInputs(p => {
      const arr = [...(p[divId] ?? [])];
      arr[idx] = val;
      return { ...p, [divId]: arr };
    });
  }

  async function generateSlots(div: Division) {
    const codes    = slotInputs[div.id] ?? [];
    const existing = slotCounts[div.id] ?? 0;
    if (!codes.length) return;
    setGenerating(p => ({ ...p, [div.id]: true }));
    setGenErr(p => ({ ...p, [div.id]: "" }));
    setGenOk(p => ({ ...p, [div.id]: false }));
    try {
      await Promise.all(
        codes.map((code) =>
          apiFetch<unknown>("/slots", {
            method: "POST",
            body: JSON.stringify({
              division_id: div.id,
              location_id: divLocId(div),
              code: code.trim() || `SLOT-${existing + codes.indexOf(code) + 1}`,
              status: "free",
            }),
          })
        )
      );
      setSlotCounts(p => ({ ...p, [div.id]: existing + codes.length }));
      setSlotPanels(p => ({ ...p, [div.id]: false }));
      setGenOk(p => ({ ...p, [div.id]: true }));
      setTimeout(() => setGenOk(p => ({ ...p, [div.id]: false })), 2500);
    } catch (err) {
      setGenErr(p => ({ ...p, [div.id]: err instanceof Error ? err.message : "Failed to create slots." }));
    } finally {
      setGenerating(p => ({ ...p, [div.id]: false }));
    }
  }

  async function handleAdd(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!newName.trim()) { setNewErr("Division name required."); return; }
    if (!newSlots || isNaN(Number(newSlots))) { setNewErr("Valid slot count required."); return; }
    if (!newRate  || isNaN(Number(newRate)))  { setNewErr("Valid rate required."); return; }
    setNewBusy(true); setNewErr(""); setNewOk(false);
    try {
      const created = await apiFetch<Division>("/divisions", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(), location_id: selLoc, truck_type: newType,
          total_slots: Number(newSlots), rate_per_day: Number(newRate),
          gst_percent: Number(newGst) || 18,
          status: newStatus,
        }),
      });
      // auto-create slot records so check-in can assign them
      const letter = ALPHA[divisions.length] ?? "A";
      await Promise.all(
        Array.from({ length: Number(newSlots) }, (_, i) =>
          apiFetch<unknown>("/slots", {
            method: "POST",
            body: JSON.stringify({
              division_id: created.id,
              location_id: selLoc,
              code: `${letter}-${String(i + 1).padStart(2, "0")}`,
              status: "free",
            }),
          })
        )
      ).catch(() => {});
      setNewOk(true); setNewName(""); setNewType("heavy"); setNewSlots(""); setNewRate(""); setNewGst("18"); setNewStatus("active");
      setTimeout(() => { setAddOpen(false); setNewOk(false); loadDivisions(selLoc); }, 1200);
    } catch (err) { setNewErr(err instanceof Error ? err.message : "Failed."); }
    finally { setNewBusy(false); }
  }

  // click-outside close add form
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (addOpen && formRef.current && !formRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [addOpen]);

  const selectedLoc = locations.find(l => l.id === selLoc);

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-6">

      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
            <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 font-medium">Divisions &amp; Rates</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Divisions &amp; rates</h1>
          <p className="text-sm text-gray-400 mt-0.5">Set slot counts, truck types, and per-day charges per division.</p>
        </div>

        <div className="flex items-end gap-3 shrink-0">
          {/* Add division button */}
          {!addOpen && (
            <button
              onClick={() => { setAddOpen(true); setNewName(""); setNewType("heavy"); setNewSlots(""); setNewRate(""); setNewGst("18"); setNewStatus("active"); setNewErr(""); setNewOk(false); }}
              className="flex items-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-2xl px-4 py-2.5 shadow-sm shadow-blue-200 transition"
            >
              <Plus className="w-4 h-4" /> Add division
            </button>
          )}

          {/* location selector */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5 sm:text-right">Viewing location</p>
            <LocationSelect
              value={selLoc}
              onChange={setSelLoc}
              locations={locations}
              allowAll={false}
              locked={!isAdmin}
              className="min-w-[220px]"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Add division form — shown at top when button clicked */}
      {addOpen && (
        <div ref={formRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                <Plus className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-sm font-black text-gray-900">New division</p>
            </div>
            <button onClick={() => setAddOpen(false)} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form id="add-div-form" onSubmit={handleAdd} className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Division name <span className="text-red-400">*</span></label>
                <input value={newName} onChange={e => { setNewName(e.target.value); setNewErr(""); }}
                  placeholder="e.g. Division D" className={inputCls("focus:ring-blue-400 focus:border-blue-400")} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Truck type <span className="text-red-400">*</span></label>
                <EnumFilterSelect
                  className="w-full"
                  value={newType}
                  onChange={setNewType}
                  options={TRUCK_TYPE_FILTER_OPTIONS}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Total slots <span className="text-red-400">*</span></label>
                <input type="number" min={0} value={newSlots} onChange={e => { setNewSlots(e.target.value.replace(/\D/g,"")); setNewErr(""); }}
                  placeholder="30" className={inputCls("focus:ring-blue-400 focus:border-blue-400")} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Rate / day (₹) <span className="text-red-400">*</span></label>
                <input type="number" min={1} value={newRate} onChange={e => { setNewRate(e.target.value.replace(/\D/g,"")); setNewErr(""); }}
                  placeholder="350" className={inputCls("focus:ring-blue-400 focus:border-blue-400")} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">GST (%)</label>
                <input type="number" min={0} max={100} value={newGst} onChange={e => setNewGst(e.target.value)}
                  placeholder="18" className={inputCls("focus:ring-blue-400 focus:border-blue-400")} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Grace period (hrs)</label>
                <div className="flex items-center gap-2 px-3.5 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <Timer className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-sm font-bold text-amber-800">{sysRelaxHours}h</span>
                  <span className="text-xs text-amber-600 ml-1">from system settings</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
              <div className="flex gap-2">
                {["active","draft"].map(s => (
                  <button key={s} type="button" onClick={() => setNewStatus(s)}
                    className={`px-4 py-2 text-xs font-bold rounded-xl border transition ${newStatus === s ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {newErr && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700">{newErr}</p>
              </div>
            )}
            {newOk && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700 font-semibold">Division added!</p>
              </div>
            )}
          </form>

          <div className="px-6 pb-5 flex gap-3">
            <button type="button" onClick={() => setAddOpen(false)}
              className="flex-1 sm:flex-none py-2.5 px-6 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" form="add-div-form" disabled={newBusy}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-6 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl shadow-sm shadow-blue-200 transition">
              {newBusy ? <><Loader2 className="w-4 h-4 animate-spin" />Adding…</> : <><Plus className="w-4 h-4" />Add division</>}
            </button>
          </div>
        </div>
      )}

      {/* loading skeletons */}
      {loading && (
        <div className="space-y-4">
          {[0,1,2].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
              <div className="flex gap-4 mb-5">
                <div className="w-12 h-12 bg-gray-100 rounded-2xl" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-100 rounded w-48" />
                  <div className="h-3 bg-gray-100 rounded w-32" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="h-14 bg-gray-100 rounded-xl" />
                <div className="h-14 bg-gray-100 rounded-xl" />
                <div className="h-14 bg-gray-100 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* division cards */}
      {!loading && (
        <div className="space-y-4">
          {divisions.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-16 text-center">
              <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Layers className="w-7 h-7 text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-gray-500">No divisions yet</p>
              <p className="text-xs text-gray-400 mt-1">Add the first division for {selectedLoc?.name ?? "this location"}.</p>
            </div>
          )}

          {divisions.map((div, idx) => {
            const style = divStyle(div.truck_type);
            const occ   = occMap[div.id];
            const occupied   = occ?.occupied_slots ?? 0;
            const total      = Number(edits[div.id]?.slots ?? div.total_slots);
            const occPct     = total > 0 ? Math.min(100, (occupied / total) * 100) : 0;
            const letter     = ALPHA[idx] ?? "?";
            const isSaving   = saving[div.id];
            const isSaved    = saved[div.id];
            const errMsg     = saveErr[div.id];
            const e          = edits[div.id] ?? { slots: String(div.total_slots), rate: String(div.rate_per_day), gst: String(div.gst_percent ?? 18), status: div.status };

            return (
              <div key={div.id}
                className={`bg-gradient-to-br ${style.grad} rounded-2xl border border-white shadow-sm overflow-hidden`}>

                {/* card header */}
                <div className="flex items-center gap-4 px-6 py-5">
                  <div className={`w-12 h-12 ${style.avatar} rounded-2xl flex items-center justify-center shadow-md shrink-0`}>
                    <span className="text-base font-black text-white">{letter}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-base font-black text-gray-900">{div.name}</p>
                      <span className="text-sm font-semibold text-gray-400">—</span>
                      <span className="text-sm font-semibold text-gray-500">{truckLabel(div.truck_type)}</span>
                    </div>
                    {/* occupancy bar */}
                    <div className="flex items-center gap-2.5 mt-1.5">
                      <div className="flex-1 max-w-[160px] h-1.5 bg-white/70 rounded-full overflow-hidden shadow-inner">
                        <div className={`h-full ${style.occ} rounded-full transition-all duration-500`} style={{ width: `${occPct}%` }} />
                      </div>
                      <p className="text-xs font-semibold text-gray-500">{occupied}/{total > 0 ? total : div.total_slots} slots occupied</p>
                      {sysRelaxHours > 0 && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                          <Timer className="w-3 h-3" />{sysRelaxHours}h grace
                        </span>
                      )}
                    </div>
                  </div>

                  {/* status badge + selector */}
                  <div className="shrink-0">
                    <DivisionStatusSelect
                      value={e.status}
                      onChange={v => setField(div.id, "status", v)}
                      ringClass={style.ring}
                    />
                  </div>
                </div>

                {/* editable fields */}
                <div className="px-6 pb-5 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* total slots */}
                    <div className="bg-white/70 rounded-2xl p-3.5 border border-white shadow-sm">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Truck className="w-3.5 h-3.5 text-gray-400" />
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Total slots</label>
                      </div>
                      <input
                        type="number" min={0} value={e.slots}
                        onChange={ev => setField(div.id, "slots", ev.target.value)}
                        className={inputCls(style.ring)}
                      />
                    </div>

                    {/* rate per day */}
                    <div className="bg-white/70 rounded-2xl p-3.5 border border-white shadow-sm">
                      <div className="flex items-center gap-1.5 mb-2">
                        <IndianRupee className="w-3.5 h-3.5 text-gray-400" />
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Rate / day (₹)</label>
                      </div>
                      <input
                        type="number" min={1} value={e.rate}
                        onChange={ev => setField(div.id, "rate", ev.target.value)}
                        className={inputCls(style.ring)}
                      />
                    </div>

                    {/* gst % */}
                    <div className="bg-white/70 rounded-2xl p-3.5 border border-white shadow-sm">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Percent className="w-3.5 h-3.5 text-gray-400" />
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">GST (%)</label>
                      </div>
                      <input
                        type="number" min={0} max={100} value={e.gst}
                        onChange={ev => setField(div.id, "gst", ev.target.value)}
                        className={inputCls(style.ring)}
                      />
                    </div>

                    {/* grace period */}
                    <div className="bg-white/70 rounded-2xl p-3.5 border border-white shadow-sm">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Timer className="w-3.5 h-3.5 text-gray-400" />
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Grace (hrs)</label>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                        <span className="text-sm font-bold text-amber-800">{sysRelaxHours}h</span>
                        <span className="text-[10px] text-amber-600">system setting</span>
                      </div>
                    </div>
                  </div>

                  {/* slot generation panel */}
                  {slotPanels[div.id] && (
                    <div className="bg-white/80 rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-gray-700 uppercase tracking-wide">
                            Slot codes — {slotInputs[div.id]?.length ?? 0} new slots
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">Edit any code before creating</p>
                        </div>
                        <button
                          onClick={() => setSlotPanels(p => ({ ...p, [div.id]: false }))}
                          className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {(slotInputs[div.id] ?? []).map((code, i) => {
                          const slotNum = (slotCounts[div.id] ?? 0) + i + 1;
                          return (
                            <div key={i} className="bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5">
                              <p className="text-[10px] font-bold text-gray-400 mb-1.5">#{slotNum}</p>
                              <input
                                value={code}
                                onChange={ev => updateSlotInput(div.id, i, ev.target.value)}
                                className="w-full text-xs font-bold text-gray-900 bg-transparent border-0 p-0 focus:outline-none placeholder-gray-300"
                                placeholder={`${letter}-${String(slotNum).padStart(2, "0")}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {genErr[div.id] && (
                        <div className="flex items-center gap-1.5 text-xs text-red-600">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{genErr[div.id]}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={() => generateSlots(div)}
                          disabled={!!generating[div.id]}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-sm shadow-blue-200 transition">
                          {generating[div.id]
                            ? <><Loader2 className="w-4 h-4 animate-spin" />Creating slots…</>
                            : <><Zap className="w-4 h-4" />Create {slotInputs[div.id]?.length ?? 0} slots</>}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* feedback row */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      {errMsg && (
                        <div className="flex items-center gap-1.5 text-xs text-red-600">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{errMsg}
                        </div>
                      )}
                      {isSaved && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />Changes saved!
                        </div>
                      )}
                      {genOk[div.id] && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />Slots created successfully!
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* slot sync button */}
                      {(() => {
                        const sc   = slotCounts[div.id] ?? 0;
                        const need = total - sc;
                        if (need <= 0) return (
                          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                            <CheckCircle2 className="w-3.5 h-3.5" />{sc} slots ready
                          </span>
                        );
                        return (
                          <button
                            onClick={() => openSlotPanel(div, letter)}
                            disabled={!!slotPanels[div.id]}
                            className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-60 px-3 py-2 rounded-xl transition">
                            <Zap className="w-3.5 h-3.5" />
                            Add {need} slot{need !== 1 ? "s" : ""} ({sc}/{total})
                          </button>
                        );
                      })()}
                      <button
                        onClick={() => handleSave(div)}
                        disabled={!!isSaving}
                        className="flex items-center gap-2 bg-white hover:bg-gray-50 disabled:bg-gray-50 text-gray-800 font-bold text-sm px-4 py-2.5 rounded-xl border border-gray-200 shadow-sm transition">
                        {isSaving
                          ? <><Loader2 className="w-4 h-4 animate-spin text-gray-400" />Saving…</>
                          : <><Save className="w-4 h-4 text-gray-500" />Save changes</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

        </div>
      )}
    </div>
  );
}
