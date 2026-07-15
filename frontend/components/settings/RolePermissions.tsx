"use client";

import { useEffect, useState } from "react";
import { MODULES } from "@/lib/permissions";

type Perms = Record<string, Record<string, boolean>>;

const EDITABLE_ROLES = [
  { key: "manager", label: "Manager" },
  { key: "front_desk", label: "Front Desk" },
];

export function RolePermissions() {
  const [perms, setPerms] = useState<Perms>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/role-permissions", { cache: "no-store" });
      const d = await res.json();
      const map: Perms = {};
      for (const r of d.permissions ?? []) (map[r.role] ??= {})[r.module] = !!r.allowed;
      setPerms(map);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggle(role: string, module: string, next: boolean) {
    setPerms((p) => ({ ...p, [role]: { ...(p[role] ?? {}), [module]: next } })); // optimistic
    try {
      const res = await fetch("/api/role-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, module, allowed: next }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // revert on failure
      setPerms((p) => ({ ...p, [role]: { ...(p[role] ?? {}), [module]: !next } }));
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Roles &amp; Permissions</p>
        {saved && <span className="text-xs text-teal-600 font-medium">✓ Saved</span>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#f2f2f7]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Module</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Admin</th>
                {EDITABLE_ROLES.map((r) => (
                  <th key={r.key} className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f2f7]">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              ) : MODULES.map((m) => (
                <tr key={m.key} className="hover:bg-[#f9f9fb]">
                  <td className="px-4 py-2.5 text-[#1c1c1e]">{m.label}</td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked disabled className="w-4 h-4 accent-teal-600 opacity-60" title="Admin always has full access" />
                  </td>
                  {EDITABLE_ROLES.map((r) => (
                    <td key={r.key} className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={perms[r.key]?.[m.key] ?? false}
                        onChange={(e) => toggle(r.key, m.key, e.target.checked)}
                        className="w-4 h-4 accent-teal-600 cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[11px] text-slate-400 border-t border-[#f2f2f7]">
          Admin always has full access. Staff will see updated access on their next page load / login.
        </p>
      </div>
    </div>
  );
}
