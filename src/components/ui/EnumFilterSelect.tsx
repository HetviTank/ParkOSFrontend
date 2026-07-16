"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Check } from "lucide-react";

export interface EnumFilterOption { value: string; label: string; dot?: string }

// A compact, portal-positioned dropdown for simple enum filters (status/type)
// or a required single-select (e.g. sort order), mirroring LocationSelect's
// mechanics but rendering a colored dot per option instead of an icon box.
// Pass `allLabel` for a filter with a resettable "" state; omit it for a
// required select (no reset row — `value` must always match an option).
// Pass `showDot={false}` when options have no meaningful per-option color.
export function EnumFilterSelect({
  value, onChange, options, allLabel, showDot = true, className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly EnumFilterOption[];
  allLabel?: string;
  showDot?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value) ?? null;

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

  const estimatedPanelHeight = (options.length + (allLabel ? 1 : 0)) * 40 + 16;
  const openUp = rect ? rect.bottom + estimatedPanelHeight > window.innerHeight && rect.top > window.innerHeight - rect.bottom : false;
  const panelStyle: React.CSSProperties = rect ? {
    position: "fixed", left: rect.left, width: Math.max(rect.width, 190), zIndex: 10000,
    ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
  } : { display: "none" };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm text-left transition-all ${
          open
            ? "border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-500/20 bg-white dark:bg-slate-800"
            : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-500/40"
        } ${className}`}
      >
        {showDot && <span className={`w-2 h-2 rounded-full shrink-0 ${selected?.dot ?? "bg-gray-300 dark:bg-slate-600"}`} />}
        <span className={`flex-1 truncate ${selected ? "font-semibold text-gray-900 dark:text-white" : "font-medium text-gray-500 dark:text-slate-400"}`}>
          {selected ? selected.label : allLabel}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-slate-500 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
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
            <ul className="py-1.5">
              {allLabel && (
                <li>
                  <button
                    type="button"
                    onClick={() => { onChange(""); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition ${value === "" ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold" : "text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"}`}
                  >
                    {showDot && <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-slate-600 shrink-0" />}
                    <span className="flex-1 truncate">{allLabel}</span>
                    {value === "" && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                  </button>
                </li>
              )}
              {options.map(o => {
                const isSel = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      onClick={() => { onChange(o.value); setOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition ${isSel ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold" : "text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"}`}
                    >
                      {showDot && <span className={`w-2 h-2 rounded-full shrink-0 ${o.dot}`} />}
                      <span className="flex-1 truncate">{o.label}</span>
                      {isSel && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
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
