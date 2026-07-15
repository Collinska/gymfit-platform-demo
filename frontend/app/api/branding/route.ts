import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// PUBLIC — returns only non-sensitive branding (name + logo) for the login page
// and sidebar. No auth guard; deliberately excludes PIN/paybill/etc.
export async function GET() {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["biz_name", "biz_logo_url"]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = (row.value as string) ?? "";

  return NextResponse.json({
    biz_name: map.biz_name || "Fitness Mania",
    biz_logo_url: map.biz_logo_url || "",
  });
}
