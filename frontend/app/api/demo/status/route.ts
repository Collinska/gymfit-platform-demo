import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// PUBLIC, like /api/branding — middleware (Edge runtime, anon-keyed client
// only) needs this reachable pre-auth to decide whether to block the whole
// app. Service-key-backed here specifically because platform_settings has
// zero anon grants (same RLS posture as production) and that must stay true.
//
// Expiry is decided by Postgres's own now(), never this route's or the
// caller's clock — the app has a separate, real host-clock-drift issue, so
// nothing here can trust a local timestamp for something that gates access.
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.rpc("demo_status_check");
    if (error) throw error;
    return NextResponse.json(data);
  } catch {
    // Fail open: a misconfigured/production deployment (no demo function or
    // no is_demo row) must never accidentally lock users out.
    return NextResponse.json({ is_demo: false, expired: false, demo_expires_at: null });
  }
}
