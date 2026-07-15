import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign out failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
