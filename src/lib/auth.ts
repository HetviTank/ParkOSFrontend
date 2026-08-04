"use client";

import { useCallback, useLayoutEffect, useState } from "react";

// Shared by every page's local apiFetch() — on a 401 (expired/invalid token or
// session), the backend has already invalidated the session server-side, so
// there's nothing to retry: clear local auth state and send the user back to
// the login screen, mirroring the existing manual-logout flow in Sidebar.tsx.
export function handleUnauthorized() {
  if (typeof window === "undefined") return;
  localStorage.clear();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!window.location.pathname.startsWith(`${basePath}/login`)) {
    // trailing "index.html" so this also resolves on hosts (e.g. the raw
    // storage.googleapis.com/<bucket>/ test URL) that don't auto-resolve a
    // bare trailing-slash path to its index.html.
    window.location.href = `${basePath}/login/index.html`;
  }
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  location_id: string | null;
  role: { name: string } | null;
}

// The "user" object saved to localStorage at login (see src/app/login/page.tsx).
// Centralized here so every page reads the same shape instead of re-parsing
// localStorage ad hoc.
export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredUser; } catch { return null; }
}

// Role names that grant unrestricted (all-location) access. Roles are
// admin-defined and dynamic (see dashboard/roles/page.tsx) — "Admin"/
// "Super Admin" are just the conventionally-seeded unrestricted roles;
// every other role is treated as scoped to the user's assigned location.
const UNRESTRICTED_ROLES = ["Super Admin", "Admin"];

export function isAdminRole(roleName: string | null | undefined): boolean {
  return UNRESTRICTED_ROLES.includes(roleName ?? "");
}

// Drives a page's "Location" filter with role-based scoping, and does so
// without ever exposing (even momentarily) an unrestricted "All locations"
// state to a non-admin — the backend does not filter by location itself, so
// a page-level fetch made before the lock resolved would genuinely return
// other locations' data, not just look wrong for one frame.
//
// Both admins and non-admins start at locationId="" on the very first render
// (identical on server and client, so no hydration mismatch). The real role
// is resolved in useLayoutEffect — which runs, and can trigger a synchronous
// re-render, before the browser paints and before any passive useEffect (i.e.
// before a page's data-fetching effect ever reads a stale locationId).
// Non-admins are locked to their assigned location immediately after that;
// admins are left at "" (all locations), matching prior behavior.
export function useLocationFilter() {
  const [state, setState] = useState<{ isAdmin: boolean; locationId: string; ready: boolean }>(
    { isAdmin: false, locationId: "", ready: false }
  );

  useLayoutEffect(() => {
    const user = getStoredUser();
    const admin = isAdminRole(user?.role?.name);
    setState({ isAdmin: admin, locationId: admin ? "" : (user?.location_id ?? ""), ready: true });
  }, []);

  // Accepts a plain value or a React-style functional updater (mirroring
  // useState's own setter signature) so call sites can do e.g.
  // setLocationId(prev => prev || defaultId) exactly like plain useState.
  // Memoized (stable reference) so it can safely appear in a consumer's own
  // effect dependency array without causing that effect to re-run every render.
  const setLocationId = useCallback((next: string | ((prev: string) => string)) => {
    // Non-admins have no client-side way to change scope — silently ignored
    // rather than throwing, since a disabled/locked control should never call this anyway.
    setState(s => {
      if (!s.isAdmin) return s;
      const id = typeof next === "function" ? next(s.locationId) : next;
      return { ...s, locationId: id };
    });
  }, []);

  return { isAdmin: state.isAdmin, locationId: state.locationId, setLocationId, ready: state.ready };
}
