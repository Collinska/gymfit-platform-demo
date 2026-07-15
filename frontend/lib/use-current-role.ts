"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/lib/permissions";

/** Client hook: current role from the authenticated session (GET /api/auth/me). */
export function useCurrentRole(): Role | null {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setRole((d?.role as Role) ?? null); })
      .catch(() => { if (!cancelled) setRole(null); });
    return () => { cancelled = true; };
  }, []);
  return role;
}
