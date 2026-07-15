import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { getRolePermissions } from "@/lib/permissions-server";
import { resolveModules } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const perms = await getRolePermissions();
  const modules = resolveModules(staff.role, perms); // admin → all true

  return NextResponse.json({
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    is_active: staff.is_active,
    modules,
  });
}
