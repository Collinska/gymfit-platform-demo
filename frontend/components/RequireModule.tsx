"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Module } from "@/lib/permissions";

/** Client-side page guard: renders children only if the current staff's role
 *  is allowed the module (admin always). Otherwise shows an Access Denied page.
 *  NOTE: the authoritative check is server-side (requireModule on the APIs). */
export function RequireModule({ module, children }: { module: Module; children: ReactNode }) {
  const { hasModule, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!hasModule(module)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--warm-bg, #faf7f5)" }}>
        <div className="text-center bg-white rounded-2xl shadow-sm px-8 py-10 max-w-sm">
          <p className="text-3xl mb-2">🔒</p>
          <h1 className="text-lg font-bold text-stone-800">Access denied</h1>
          <p className="text-sm text-stone-400 mt-1">You don&apos;t have access to this section.</p>
          <a href="/dashboard" className="inline-block mt-4 text-sm text-teal-600 hover:text-teal-700 font-medium">← Back to Dashboard</a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
