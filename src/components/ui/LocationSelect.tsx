"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { MapPin, ChevronDown, Check, Search, X, Lock } from "lucide-react";

export interface LocationOption { id: string; name: string; city?: string | null }

export function LocationSelect({
  value,
  onChange,
  locations,
  allowAll = false,
  allLabel = "All locations",
  locked = false,
  placeholder = "Select location…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  locations: LocationOption[];
  allowAll?: boolean;
  allLabel?: string;
  locked?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [rect,   setRect]   = useState<DOMRect | null>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = locations.find(l => l.id === value) ?? null;

  function openDropdown() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true); setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
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

  const filtered = locations.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.city ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const estimatedPanelHeight = 320;
  const openUp = rect ? rect.bottom + estimatedPanelHeight > window.innerHeight && rect.top > window.innerHeight - rect.bottom : false;
  const panelStyle: React.CSSProperties = rect ? {
    position: "fixed", left: rect.left, width: Math.max(rect.width, 240), zIndex: 10000,
    ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
  } : { display: "none" };

  // Locked (non-admin): a static, read-only chip showing their assigned location —
  // not a clickable dropdown, so there's no way to switch scope client-side.
  if (locked) {
    return (
      <div className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 ${className}`}>
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
          <MapPin className="w-3.5 h-3.5 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">{selected?.name ?? placeholder}</p>
          {selected?.city && <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{selected.city}</p>}
        </div>
        <Lock className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 shrink-0" aria-label="Locked to your assigned location" />
      </div>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-sm text-left transition-all ${
          open
            ? "border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-500/20 bg-white dark:bg-slate-800"
            : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-500/40"
        } ${className}`}
      >
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${selected ? "bg-gradient-to-br from-indigo-500 to-violet-600" : "bg-gray-100 dark:bg-slate-700"}`}>
          <MapPin className={`w-3.5 h-3.5 ${selected ? "text-white" : "text-gray-400 dark:text-slate-500"}`} />
        </span>
        <div className="flex-1 min-w-0 text-left">
          <p className={`text-sm truncate ${selected ? "font-semibold text-gray-900 dark:text-white" : "font-medium text-gray-400 dark:text-slate-500"}`}>
            {selected ? selected.name : (value === "" && allowAll ? allLabel : placeholder)}
          </p>
          {selected?.city && <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{selected.city}</p>}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
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
            className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-2xl shadow-gray-300/40 dark:shadow-black/40 overflow-hidden"
          >
            {locations.length > 6 && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-800/60">
                <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 shrink-0" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search locations…"
                  className="flex-1 text-xs bg-transparent outline-none text-gray-700 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="text-gray-300 dark:text-slate-600 hover:text-gray-600 dark:hover:text-slate-300 transition">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            <ul className="max-h-64 overflow-y-auto py-1.5">
              {allowAll && (
                <li>
                  <button
                    type="button"
                    onClick={() => { onChange(""); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition ${value === "" ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-gray-50 dark:hover:bg-slate-800"}`}
                  >
                    <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-400" />
                    </span>
                    <span className={`flex-1 text-sm font-semibold truncate ${value === "" ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-slate-200"}`}>{allLabel}</span>
                    {value === "" && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                  </button>
                </li>
              )}
              {filtered.length === 0 && (
                <li className="px-4 py-8 text-center text-xs text-gray-400 dark:text-slate-500">
                  {locations.length === 0 ? "No locations available" : "No results"}
                </li>
              )}
              {filtered.map(l => {
                const isSel = l.id === value;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => { onChange(l.id); setOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition ${isSel ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-gray-50 dark:hover:bg-slate-800"}`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${isSel ? "bg-gradient-to-br from-indigo-500 to-violet-600" : "bg-gray-100 dark:bg-slate-700"}`}>
                        <MapPin className={`w-4 h-4 ${isSel ? "text-white" : "text-gray-400 dark:text-slate-400"}`} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSel ? "text-indigo-700 dark:text-indigo-300" : "text-gray-800 dark:text-slate-200"}`}>{l.name}</p>
                        {l.city && <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{l.city}</p>}
                      </div>
                      {isSel && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
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
