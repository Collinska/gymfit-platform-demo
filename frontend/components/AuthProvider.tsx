"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Module, Role } from "@/lib/permissions";

type Staff = { id: string; name: string; email: string; role: Role };

type AuthValue = {
  staff: Staff | null;
  modules: Record<string, boolean>;
  loading: boolean;
  hasModule: (m: Module | string) => boolean;
  refresh: () => void;
};

const AuthContext = createContext<AuthValue>({
  staff: null,
  modules: {},
  loading: true,
  hasModule: () => false,
  refresh: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setStaff({ id: d.id, name: d.name, email: d.email, role: d.role });
          setModules(d.modules ?? {});
        } else {
          setStaff(null);
          setModules({});
        }
      })
      .catch(() => { setStaff(null); setModules({}); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const hasModule = (m: Module | string) =>
    staff?.role === "admin" ? true : modules[m] === true;

  return (
    <AuthContext.Provider value={{ staff, modules, loading, hasModule, refresh: load }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
