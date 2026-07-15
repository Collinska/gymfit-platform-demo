import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

/** The authenticated Supabase auth user, or null if not signed in. */
export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** The staff row linked to the current session (by auth_id), or null. */
export async function getCurrentStaff() {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await supabaseAdmin
    .from("staff")
    .select("id, auth_id, name, email, role, is_active")
    .eq("auth_id", user.id)
    .maybeSingle();
  return data;
}

/** Current staff only if present AND active; otherwise null. */
export async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff || !staff.is_active) return null;
  return staff;
}
