// Pure, server-safe permission logic (NO React hooks, NO "use client").
// Imported by both server (api-auth / permissions-server) and client code.
// Runtime permission data lives in the DB (role_permissions); this file only
// defines the module catalog and the resolution rule.

export type Role = "admin" | "manager" | "front_desk";

export const ROLES: Role[] = ["admin", "manager", "front_desk"];

export const ROLE_LABELS: Record<Role, string> = {
  admin:      "Admin",
  manager:    "Manager",
  front_desk: "Front Desk",
};

export type Module =
  | "dashboard" | "kiosk" | "checkins" | "members" | "leads" | "freeze"
  | "gym_wrap" | "pos" | "reports" | "analytics" | "churn" | "sync_log" | "settings";

export const MODULES: { key: Module; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "kiosk",     label: "Check-in Kiosk" },
  { key: "checkins",  label: "Check-in Log" },
  { key: "members",   label: "Members" },
  { key: "gym_wrap",  label: "Gym Wrap" },
  { key: "leads",     label: "Leads" },
  { key: "freeze",    label: "Freeze / Unfreeze" },
  { key: "pos",       label: "Point of Sale" },
  { key: "reports",   label: "Reports" },
  { key: "analytics", label: "Analytics" },
  { key: "churn",     label: "Retention" },
  { key: "sync_log",  label: "ERP Sync Log" },
  { key: "settings",  label: "Settings" },
];

export const MODULE_KEYS: Module[] = MODULES.map((m) => m.key);

// Base route each module maps to (for sidebar/guards).
export const MODULE_ROUTES: Record<Module, string> = {
  dashboard: "/dashboard",
  kiosk:     "/kiosk",
  checkins:  "/checkins",
  members:   "/members",
  leads:     "/leads",
  freeze:    "/freeze",
  gym_wrap:  "/gym-wrap",
  pos:       "/pos",
  reports:   "/pos/reports",
  analytics: "/analytics",
  churn:     "/churn",
  sync_log:  "/sync-log",
  settings:  "/settings",
};

// role → module → allowed (loaded from role_permissions in the DB).
export type PermsMap = Record<string, Record<string, boolean>>;

/** Admin always has full access; everyone else is DB-driven. */
export function can(
  role: Role | string | null | undefined,
  module: Module | string,
  permsMap: PermsMap,
): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  return permsMap[role]?.[module] === true;
}

/** Resolve every module for a role into a flat { module: allowed } map. */
export function resolveModules(role: Role | string, permsMap: PermsMap): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of MODULE_KEYS) out[m] = can(role, m, permsMap);
  return out;
}
