"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronRight, Settings, Save, AlertCircle, CheckCircle2,
  IndianRupee, CreditCard, Smartphone, Globe, Loader2,
  Plus, Trash2, Timer, AlertTriangle,
} from "lucide-react";

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
interface OverdueRule { id: string; days: number; color: string; label: string | null }

interface AppSettings {
  systemName: string; gstRate: string; currency: string;
  dateFormat: string; timeFormat: string; receiptFooter: string;
  paymentCash: boolean; paymentCard: boolean; paymentUpi: boolean; paymentOnline: boolean;
}

const DEFAULTS: AppSettings = {
  systemName: "ParkOS", gstRate: "18", currency: "INR",
  dateFormat: "DD MMM YYYY", timeFormat: "12h",
  receiptFooter: "Thank you for using ParkOS. Drive safe!",
  paymentCash: true, paymentCard: true, paymentUpi: true, paymentOnline: false,
};

const PRESET_COLORS = [
  { hex: "#22c55e", name: "Green"  },
  { hex: "#3b82f6", name: "Blue"   },
  { hex: "#f59e0b", name: "Amber"  },
  { hex: "#f97316", name: "Orange" },
  { hex: "#ef4444", name: "Red"    },
  { hex: "#8b5cf6", name: "Purple" },
];

function load(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const s = localStorage.getItem("parkos_settings");
    return s ? { ...DEFAULTS, ...JSON.parse(s) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

const inputCls = "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition";
const selectCls = inputCls + " cursor-pointer";

export default function SettingsPage() {
  const [s, setS] = useState<AppSettings>(DEFAULTS);
  const [prefSaved, setPrefSaved] = useState(false);
  const [prefErr,   setPrefErr]   = useState("");
  const [prefBusy,  setPrefBusy]  = useState(false);

  // relaxation hours — stored in backend system-preferences
  const [relaxHours,    setRelaxHours]    = useState("0");
  const [relaxBusy,     setRelaxBusy]     = useState(false);
  const [relaxSaved,    setRelaxSaved]    = useState(false);
  const [relaxErr,      setRelaxErr]      = useState("");
  const [sysPrefCache,  setSysPrefCache]  = useState<Record<string, unknown>>({});

  // overdue threshold — stored in backend system-preferences
  const [overdueAlertDays,    setOverdueAlertDays]    = useState("5");
  const [overdueAlertBusy,    setOverdueAlertBusy]    = useState(false);
  const [overdueAlertSaved,   setOverdueAlertSaved]   = useState(false);
  const [overdueAlertErr,     setOverdueAlertErr]      = useState("");

  // overdue colour rules
  const [rules,       setRules]       = useState<OverdueRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [newDays,     setNewDays]     = useState("");
  const [newColor,    setNewColor]    = useState("#ef4444");
  const [newLabel,    setNewLabel]    = useState("");
  const [addBusy,     setAddBusy]     = useState(false);
  const [addErr,      setAddErr]      = useState("");
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  useEffect(() => { setS(load()); }, []);

  useEffect(() => {
    apiFetch<{ list: OverdueRule[] }>("/overdue-alert-rules")
      .then(r => setRules(r.list))
      .catch(() => {})
      .finally(() => setRulesLoading(false));
  }, []);

  useEffect(() => {
    apiFetch<Record<string, unknown>>("/system-preferences")
      .then(p => {
        setSysPrefCache(p);
        setRelaxHours(String(p.relaxation_hours ?? 0));
        setOverdueAlertDays(String(p.overdue_alert_days ?? 5));
      })
      .catch(() => {});
  }, []);

  async function handleSaveOverdue(e: { preventDefault(): void }) {
    e.preventDefault();
    const d = parseInt(overdueAlertDays, 10);
    if (isNaN(d) || d < 1) { setOverdueAlertErr("Must be 1 or more days."); return; }
    setOverdueAlertBusy(true); setOverdueAlertErr(""); setOverdueAlertSaved(false);
    try {
      await apiFetch("/system-preferences", {
        method: "PUT",
        body: JSON.stringify({ ...sysPrefCache, overdue_alert_days: d }),
      });
      setSysPrefCache(p => ({ ...p, overdue_alert_days: d }));
      setOverdueAlertSaved(true);
      setTimeout(() => setOverdueAlertSaved(false), 2500);
    } catch (err) {
      setOverdueAlertErr(err instanceof Error ? err.message : "Failed.");
    } finally {
      setOverdueAlertBusy(false);
    }
  }

  async function handleSaveRelax(e: { preventDefault(): void }) {
    e.preventDefault();
    const h = parseInt(relaxHours, 10);
    if (isNaN(h) || h < 0) { setRelaxErr("Must be 0 or more."); return; }
    setRelaxBusy(true); setRelaxErr(""); setRelaxSaved(false);
    try {
      await apiFetch("/system-preferences", {
        method: "PUT",
        body: JSON.stringify({ ...sysPrefCache, relaxation_hours: h }),
      });
      setSysPrefCache(p => ({ ...p, relaxation_hours: h }));
      setRelaxSaved(true);
      setTimeout(() => setRelaxSaved(false), 2500);
    } catch (err) {
      setRelaxErr(err instanceof Error ? err.message : "Failed.");
    } finally {
      setRelaxBusy(false);
    }
  }

  function upd(key: keyof AppSettings, val: string | boolean) {
    setS(prev => ({ ...prev, [key]: val }));
  }
  function saveLocal(updated: AppSettings) {
    localStorage.setItem("parkos_settings", JSON.stringify(updated));
  }

  async function handleSavePrefs(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!s.systemName.trim()) { setPrefErr("System name is required."); return; }
    setPrefBusy(true); setPrefErr(""); setPrefSaved(false);
    await new Promise(r => setTimeout(r, 400));
    saveLocal(s);
    setPrefSaved(true); setPrefBusy(false);
    setTimeout(() => setPrefSaved(false), 2500);
  }

  async function handleAddRule() {
    const d = parseInt(newDays, 10);
    if (!newDays || isNaN(d) || d < 1) { setAddErr("Days must be ≥ 1."); return; }
    if (!newColor)                       { setAddErr("Please pick a colour."); return; }
    setAddBusy(true); setAddErr("");
    try {
      const rule = await apiFetch<OverdueRule>("/overdue-alert-rules", {
        method: "POST",
        body: JSON.stringify({ days: d, color: newColor, label: newLabel.trim() || null }),
      });
      setRules(prev => [...prev, rule].sort((a, b) => a.days - b.days));
      setNewDays(""); setNewLabel(""); setNewColor("#ef4444");
    } catch (err) {
      setAddErr(err instanceof Error ? err.message : "Failed to add rule.");
    } finally {
      setAddBusy(false);
    }
  }

  async function handleDeleteRule(id: string) {
    setDeletingId(id);
    try {
      await apiFetch(`/overdue-alert-rules/${id}`, { method: "DELETE" });
      setRules(prev => prev.filter(r => r.id !== id));
    } catch {
      // silently ignore
    } finally {
      setDeletingId(null);
    }
  }

  function togglePayment(key: keyof AppSettings) {
    const updated = { ...s, [key]: !s[key] };
    setS(updated); saveLocal(updated);
  }

  const paymentMethods = [
    { key: "paymentCash"   as const, label: "Cash payments",      sub: "Physical cash at the gate",        icon: <IndianRupee className="w-4 h-4" /> },
    { key: "paymentCard"   as const, label: "Card / POS terminal", sub: "Debit & credit card payments",    icon: <CreditCard className="w-4 h-4" /> },
    { key: "paymentUpi"    as const, label: "UPI / QR code",      sub: "Google Pay, PhonePe, Paytm, etc.", icon: <Smartphone className="w-4 h-4" /> },
    { key: "paymentOnline" as const, label: "Online / pre-pay",   sub: "Link-based advance payment",       icon: <Globe className="w-4 h-4" /> },
  ];

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-5">

      {/* breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600 font-medium">Settings</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center">
            <Settings className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
            <p className="text-sm text-gray-400 mt-0.5">System configuration, thresholds, and preferences</p>
          </div>
        </div>
      </div>

      {/* two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* ── left column ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* system preferences */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-800">System preferences</p>
              <p className="text-xs text-gray-400 mt-0.5">Core display and billing defaults</p>
            </div>
            <form onSubmit={handleSavePrefs} id="pref-form" className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">System name</label>
                <input value={s.systemName} onChange={e => upd("systemName", e.target.value)}
                  placeholder="e.g. ParkOS — Bhuj Gate" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Default GST rate (%)</label>
                  <input value={s.gstRate} onChange={e => upd("gstRate", e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="18" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Currency</label>
                  <select value={s.currency} onChange={e => upd("currency", e.target.value)} className={selectCls}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date format</label>
                  <select value={s.dateFormat} onChange={e => upd("dateFormat", e.target.value)} className={selectCls}>
                    <option value="DD MMM YYYY">DD MMM YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Time format</label>
                  <select value={s.timeFormat} onChange={e => upd("timeFormat", e.target.value)} className={selectCls}>
                    <option value="12h">12-hour AM/PM</option>
                    <option value="24h">24-hour</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Receipt footer message</label>
                <textarea value={s.receiptFooter} onChange={e => upd("receiptFooter", e.target.value)}
                  rows={3} placeholder="Message printed at the bottom of every receipt…"
                  className={inputCls + " resize-none"} />
              </div>
              {prefErr && <ErrBanner msg={prefErr} />}
              {prefSaved && <OkBanner msg="Preferences saved." />}
            </form>
            <div className="px-6 pb-5">
              <button type="submit" form="pref-form" disabled={prefBusy}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-sm shadow-blue-200 transition">
                {prefBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save preferences
              </button>
            </div>
          </div>

          {/* ── overdue colour rules ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-800">Overdue colour rules</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Trucks parked beyond a threshold get a colour stripe in the All Trucks list. Higher thresholds take priority.
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* existing rules */}
              {rulesLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading rules…
                </div>
              ) : rules.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No colour rules defined yet. Add one below.</p>
              ) : (
                <div className="space-y-2">
                  {rules.map(rule => (
                    <div key={rule.id}
                      className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                      {/* colour dot */}
                      <div className="w-4 h-4 rounded-full shrink-0 border border-black/10"
                        style={{ backgroundColor: rule.color }} />
                      {/* info */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-800">
                          ≥ {rule.days} day{rule.days !== 1 ? "s" : ""}
                        </span>
                        {rule.label && (
                          <span className="ml-2 text-xs text-gray-400">— {rule.label}</span>
                        )}
                      </div>
                      {/* colour preview pill */}
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: rule.color + "22", color: rule.color }}>
                        {rule.color}
                      </span>
                      {/* delete */}
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        disabled={deletingId === rule.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
                      >
                        {deletingId === rule.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* add new rule form */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Add new rule</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">After (days) *</label>
                    <input
                      value={newDays}
                      onChange={e => { setNewDays(e.target.value.replace(/\D/g, "")); setAddErr(""); }}
                      placeholder="e.g. 10"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Label (optional)</label>
                    <input
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      placeholder="e.g. Warning"
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* colour picker */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Colour *</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.name}
                        onClick={() => setNewColor(c.hex)}
                        className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
                        style={{
                          backgroundColor: c.hex,
                          borderColor: newColor === c.hex ? "#1d4ed8" : "transparent",
                          boxShadow: newColor === c.hex ? "0 0 0 2px white, 0 0 0 4px " + c.hex : "none",
                        }}
                      />
                    ))}
                    {/* custom hex input */}
                    <div className="flex items-center gap-1.5 ml-1">
                      <div className="w-7 h-7 rounded-full border border-gray-200 shrink-0"
                        style={{ backgroundColor: newColor }} />
                      <input
                        type="text"
                        value={newColor}
                        onChange={e => setNewColor(e.target.value)}
                        placeholder="#rrggbb"
                        maxLength={7}
                        className="w-24 px-2.5 py-1.5 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {addErr && <ErrBanner msg={addErr} />}

                <button
                  type="button"
                  onClick={handleAddRule}
                  disabled={addBusy}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition"
                >
                  {addBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add rule
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* ── right: payment methods ── */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-800">Payment methods</p>
              <p className="text-xs text-gray-400 mt-0.5">Toggle which methods appear at checkout</p>
            </div>
            <div className="divide-y divide-gray-50">
              {paymentMethods.map(({ key, label, sub, icon }) => {
                const enabled = s[key] as boolean;
                return (
                  <div key={key} className="flex items-center gap-4 px-6 py-4">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${enabled ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                    </div>
                    <button type="button" onClick={() => togglePayment(key)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${enabled ? "bg-emerald-500" : "bg-gray-200"}`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${enabled ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100">
              <p className="text-xs text-gray-400">Changes to payment methods apply immediately to the checkout flow.</p>
            </div>
          </div>

          {/* billing relaxation */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-bold text-gray-800">Billing relaxation</p>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Grace hours added on top of 24 h — e.g. 2 makes 1 billing day = 26 h
              </p>
            </div>
            <form id="relax-form" onSubmit={handleSaveRelax} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Relaxation hours (0 = standard 24 h day)
                </label>
                <input
                  type="number" min={0} max={23} step={1}
                  value={relaxHours}
                  onChange={e => { setRelaxHours(e.target.value.replace(/\D/g, "")); setRelaxErr(""); }}
                  placeholder="0"
                  className={inputCls}
                />
                {relaxHours && Number(relaxHours) > 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    1 billing day = {24 + Number(relaxHours)} hours
                  </p>
                )}
              </div>
              {relaxErr   && <ErrBanner msg={relaxErr} />}
              {relaxSaved && <OkBanner msg="Relaxation hours saved." />}
            </form>
            <div className="px-6 pb-5">
              <button type="submit" form="relax-form" disabled={relaxBusy}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-sm transition">
                {relaxBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>

          {/* overdue threshold */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className="text-sm font-bold text-gray-800">Overdue threshold</p>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Trucks parked longer than this many days without checkout will be marked as overdue
              </p>
            </div>
            <form id="overdue-form" onSubmit={handleSaveOverdue} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Mark as overdue after (days)
                </label>
                <input
                  type="number" min={1} step={1}
                  value={overdueAlertDays}
                  onChange={e => { setOverdueAlertDays(e.target.value.replace(/\D/g, "")); setOverdueAlertErr(""); }}
                  placeholder="5"
                  className={inputCls}
                />
                {overdueAlertDays && Number(overdueAlertDays) > 0 && (
                  <p className="text-xs text-red-500 mt-1.5">
                    Trucks parked &gt; {overdueAlertDays} day{Number(overdueAlertDays) !== 1 ? "s" : ""} will be flagged as overdue
                  </p>
                )}
              </div>
              {overdueAlertErr   && <ErrBanner msg={overdueAlertErr} />}
              {overdueAlertSaved && <OkBanner msg="Overdue threshold saved." />}
            </form>
            <div className="px-6 pb-5">
              <button type="submit" form="overdue-form" disabled={overdueAlertBusy}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-sm transition">
                {overdueAlertBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>

          {/* legend preview */}
          {rules.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-800">Colour legend preview</p>
                <p className="text-xs text-gray-400 mt-0.5">How trucks will appear in the All Trucks list</p>
              </div>
              <div className="px-6 py-4 space-y-2">
                {rules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-3 rounded-xl overflow-hidden border border-gray-100">
                    <div className="w-1.5 self-stretch shrink-0 rounded-l-xl" style={{ backgroundColor: rule.color }} />
                    <div className="flex items-center gap-3 py-2.5 pr-3 flex-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: rule.color }} />
                      <span className="text-sm font-medium text-gray-700">
                        ≥ {rule.days} day{rule.days !== 1 ? "s" : ""}
                        {rule.label ? ` — ${rule.label}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 rounded-xl overflow-hidden border border-gray-100">
                  <div className="w-1.5 self-stretch shrink-0 rounded-l-xl bg-gray-200" />
                  <div className="flex items-center gap-3 py-2.5 pr-3 flex-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                    <span className="text-sm text-gray-400">No rule matched — default</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
      <p className="text-sm text-red-700">{msg}</p>
    </div>
  );
}

function OkBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
      <p className="text-sm text-emerald-700 font-semibold">{msg}</p>
    </div>
  );
}
