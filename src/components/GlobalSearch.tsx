"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, Loader2, Truck, Users, BookOpen, Layers, MapPin, ShieldX, UserCog,
} from "lucide-react";
import { handleUnauthorized } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

interface GlobalSearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  truck_number?: string | null;
  location_id?: string | null;
}

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  truck:      { label: "Truck",      icon: Truck,    color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-300" },
  owner:      { label: "Owner",      icon: Users,    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300" },
  khata:      { label: "Khata",      icon: BookOpen, color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-300" },
  division:   { label: "Division",   icon: Layers,   color: "text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-300" },
  location:   { label: "Location",   icon: MapPin,   color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-500/10 dark:text-cyan-300" },
  blacklist:  { label: "Blacklist",  icon: ShieldX,  color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-300" },
  admin_user: { label: "Admin user", icon: UserCog,  color: "text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300" },
};

// Where each result type deep-links to. Trucks/owners jump straight to their
// profile page; the rest don't have a dedicated detail route today, so they
// land on the list page with the search prefilled (or, for divisions, the
// right location preselected) instead.
function resultHref(r: GlobalSearchResult): string {
  switch (r.type) {
    case "truck":
      return `/dashboard/trucks/profile?truck=${encodeURIComponent(r.truck_number ?? r.title)}`;
    case "owner":
      return `/dashboard/owners/profile?id=${encodeURIComponent(r.id)}`;
    case "khata":
      return `/dashboard/khata?q=${encodeURIComponent(r.title)}`;
    case "division":
      return r.location_id ? `/dashboard/divisions?location=${encodeURIComponent(r.location_id)}` : "/dashboard/divisions";
    case "location":
      return "/dashboard/locations";
    case "blacklist":
      return `/dashboard/blacklist?q=${encodeURIComponent(r.truck_number ?? r.title)}`;
    case "admin_user":
      return `/dashboard/admin-users?q=${encodeURIComponent(r.title)}`;
    default:
      return "/dashboard";
  }
}

export function GlobalSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      const token = getToken();
      fetch(`${BASE_URL}/global-search?q=${encodeURIComponent(q)}&limit=5`, {
        headers: { "Content-Type": "application/json", token },
      })
        .then(res => {
          if (res.status === 401) { handleUnauthorized(); return null; }
          if (!res.ok) return null;
          return res.json();
        })
        .then(data => { setResults(data?.results ?? []); setActiveIndex(-1); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function go(r: GlobalSearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    inputRef.current?.blur();
    router.push(resultHref(r));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => (i - 1 + results.length) % results.length); }
    else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); go(results[activeIndex]); }
  }

  const showDropdown = open && (loading || query.trim().length >= 2);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
        open ? "border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-500/20 bg-white dark:bg-slate-800" : "border-gray-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/60"
      }`}>
        {loading ? <Loader2 className="w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0 animate-spin" /> : <Search className="w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0" />}
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search trucks, owners, khata, locations…"
          className="flex-1 min-w-0 bg-transparent outline-none text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }} className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-2 w-full max-h-96 overflow-y-auto bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-black/40 overflow-hidden py-1.5">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400 dark:text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-slate-500">
              No matches for &ldquo;{query.trim()}&rdquo;
            </div>
          ) : (
            results.map((r, i) => {
              const meta = TYPE_META[r.type] ?? { label: r.type, icon: Search, color: "text-gray-500 bg-gray-50 dark:bg-slate-800" };
              const Icon = meta.icon;
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => go(r)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition ${activeIndex === i ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-gray-50 dark:hover:bg-slate-800"}`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{r.title}</span>
                    <span className="block text-xs text-gray-400 dark:text-slate-500 truncate">{meta.label}{r.subtitle ? ` • ${r.subtitle}` : ""}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
