"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

function OverlayHeader({ title, onClose }: { title?: string; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800">
      <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function Overlay({
  open,
  onClose,
  variant = "modal",
  title,
  widthClass,
  children,
}: {
  open: boolean;
  onClose: () => void;
  variant?: "modal" | "drawer";
  title?: string;
  widthClass?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {variant === "modal" ? (
            // Bottom sheet on mobile (full-width, anchored to bottom edge), centered modal from sm: up —
            // same shared component, no behavior change for existing callers beyond this responsive shape.
            <div className="absolute inset-0 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className={`pointer-events-auto relative bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full ${widthClass ?? "max-w-lg"} max-h-[85vh] sm:max-h-[90vh] overflow-y-auto`}
              >
                <div className="sm:hidden flex justify-center pt-2 pb-1">
                  <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-slate-700" />
                </div>
                <OverlayHeader title={title} onClose={onClose} />
                <div className="px-6 pb-6 pt-4">{children}</div>
              </motion.div>
            </div>
          ) : (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`absolute inset-y-0 right-0 bg-white dark:bg-slate-900 shadow-2xl w-full ${widthClass ?? "max-w-md"} overflow-y-auto`}
            >
              <OverlayHeader title={title} onClose={onClose} />
              <div className="px-6 pb-6 pt-4">{children}</div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
