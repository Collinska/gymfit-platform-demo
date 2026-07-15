import { getCurrentStaff } from "@/lib/auth";
import { getRolePermissions } from "@/lib/permissions-server";
import { can, type Module } from "@/lib/permissions";

type Allowed = { ok: true; staff: NonNullable<Awaited<ReturnType<typeof getCurrentStaff>>> };
type Denied = { ok: false; status: number; error: string };

/**
 * Server-side gate for API routes. Confirms an active signed-in staff member
 * whose role is allowed the given module (admin is always allowed). This is the
 * authoritative check — the DB (role_permissions) is the source of truth.
 */
export async function requireModule(module: Module): Promise<Allowed | Denied> {
  const staff = await getCurrentStaff();
  if (!staff || !staff.is_active) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }
  if (staff.role === "admin") {
    return { ok: true, staff };
  }
  const perms = await getRolePermissions();
  if (!can(staff.role, module, perms)) {
    return { ok: false, status: 403, error: "You don't have access to this module" };
  }
  return { ok: true, staff };
}
