"use client";

import { useEffect, useState } from "react";
import { handleUnauthorized } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

export interface TruckTypeOption {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
}

async function fetchActiveTruckTypes(): Promise<TruckTypeOption[]> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/truck-types/all`, {
    headers: { "Content-Type": "application/json", token },
  });
  if (res.status === 401) { handleUnauthorized(); return []; }
  if (!res.ok) return [];
  const text = await res.text();
  return text ? (JSON.parse(text) as TruckTypeOption[]) : [];
}

// Every page that lets a user pick or display a truck type reads the master
// list from here (GET /truck-types/all) instead of a hardcoded array, so
// adding/renaming/retiring a type from /dashboard/truck-types takes effect
// everywhere without a frontend deploy.
export function useTruckTypes() {
  const [truckTypes, setTruckTypes] = useState<TruckTypeOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchActiveTruckTypes()
      .then(list => { if (!cancelled) setTruckTypes(list); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { truckTypes, loading };
}

// Resolves a stored truck_type value (code, or — from before this master
// table existed — a raw name/short-word string) to its display name, falling
// back to the raw value so older records never disappear, just show unstyled.
export function truckTypeLabel(truckTypes: TruckTypeOption[], value: string | null | undefined): string {
  if (!value) return "—";
  const match = truckTypes.find(t => t.code === value || t.name === value);
  return match?.name ?? value;
}

const CHIP_STYLES: Record<string, { color: string; abbr: string; dot: string }> = {
  heavy_20_plus: { color: "from-red-500 to-rose-600",      abbr: "H+", dot: "bg-red-500" },
  heavy_10_20:   { color: "from-orange-500 to-red-500",    abbr: "H",  dot: "bg-orange-500" },
  medium_5_10:   { color: "from-amber-500 to-orange-500",  abbr: "M",  dot: "bg-amber-500" },
  light_below_5: { color: "from-emerald-500 to-teal-600",  abbr: "L",  dot: "bg-emerald-500" },
  trailer:       { color: "from-indigo-500 to-violet-600", abbr: "Tr", dot: "bg-indigo-500" },
  tanker:        { color: "from-cyan-500 to-blue-600",     abbr: "Tk", dot: "bg-cyan-500" },
  // legacy short values written before the truck_types master table existed
  heavy:  { color: "from-red-500 to-rose-600",     abbr: "H", dot: "bg-red-500" },
  medium: { color: "from-amber-500 to-orange-500", abbr: "M", dot: "bg-amber-500" },
  light:  { color: "from-emerald-500 to-teal-600", abbr: "L", dot: "bg-emerald-500" },
};
const FALLBACK_CHIP = { color: "from-gray-400 to-slate-500", dot: "bg-gray-400" };

function autoAbbr(name: string): string {
  const words = name.replace(/[()]/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

// Per-type chip color for truck-type pickers (check-in, owners, khata). Known
// seed codes get a hand-picked color; a brand-new type added from the admin
// page gets a neutral fallback with an auto-generated abbreviation.
export function truckTypeChipStyle(value: string, name?: string): { color: string; abbr: string; dot: string } {
  const known = CHIP_STYLES[value.toLowerCase()];
  if (known) return known;
  return { ...FALLBACK_CHIP, abbr: autoAbbr(name ?? value) };
}

// Per-type theme for division zone cards/pills (divisions, check-in). Matches
// by prefix so both legacy short values ("heavy") and master codes
// ("heavy_20_plus", "heavy_10_20") land on the same weight-class color.
export function divisionTypeStyle(code: string): {
  grad: string; avatar: string; badge: string; pill: string; ring: string; occ: string; dot: string;
} {
  const c = code.toLowerCase();
  if (c.startsWith("heavy"))
    return { grad: "from-violet-50 to-indigo-50", avatar: "bg-gradient-to-br from-violet-500 to-indigo-600", badge: "bg-violet-100 text-violet-700 border-violet-200", pill: "bg-violet-100 text-violet-700", ring: "focus:ring-violet-400 focus:border-violet-400", occ: "bg-violet-400", dot: "bg-violet-500" };
  if (c.startsWith("medium"))
    return { grad: "from-teal-50 to-cyan-50", avatar: "bg-gradient-to-br from-teal-500 to-cyan-600", badge: "bg-teal-100 text-teal-700 border-teal-200", pill: "bg-teal-100 text-teal-700", ring: "focus:ring-teal-400 focus:border-teal-400", occ: "bg-teal-400", dot: "bg-teal-500" };
  if (c.startsWith("light"))
    return { grad: "from-emerald-50 to-green-50", avatar: "bg-gradient-to-br from-emerald-500 to-green-600", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", pill: "bg-emerald-100 text-emerald-700", ring: "focus:ring-emerald-400 focus:border-emerald-400", occ: "bg-emerald-400", dot: "bg-emerald-500" };
  if (c.startsWith("trailer"))
    return { grad: "from-indigo-50 to-violet-50", avatar: "bg-gradient-to-br from-indigo-500 to-violet-600", badge: "bg-indigo-100 text-indigo-700 border-indigo-200", pill: "bg-indigo-100 text-indigo-700", ring: "focus:ring-indigo-400 focus:border-indigo-400", occ: "bg-indigo-400", dot: "bg-indigo-500" };
  if (c.startsWith("tanker"))
    return { grad: "from-cyan-50 to-blue-50", avatar: "bg-gradient-to-br from-cyan-500 to-blue-600", badge: "bg-cyan-100 text-cyan-700 border-cyan-200", pill: "bg-cyan-100 text-cyan-700", ring: "focus:ring-cyan-400 focus:border-cyan-400", occ: "bg-cyan-400", dot: "bg-cyan-500" };
  return { grad: "from-gray-50 to-slate-50", avatar: "bg-gradient-to-br from-gray-400 to-slate-500", badge: "bg-gray-100 text-gray-600 border-gray-200", pill: "bg-gray-100 text-gray-600", ring: "focus:ring-gray-400 focus:border-gray-400", occ: "bg-gray-400", dot: "bg-gray-400" };
}
