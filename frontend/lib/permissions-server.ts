import { supabaseAdmin } from "@/lib/supabase";
import type { PermsMap } from "@/lib/permissions";

/** Load all role_permissions into { role: { module: allowed } }. */
export async function getRolePermissions(): Promise<PermsMap> {
  const { data, error } = await supabaseAdmin
    .from("role_permissions")
    .select("role, module, allowed");
  if (error || !data) return {};
  const map: PermsMap = {};
  for (const row of data) {
    (map[row.role] ??= {})[row.module] = !!row.allowed;
  }
  return map;
}
