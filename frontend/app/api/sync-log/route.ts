import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100), 1), 500);

  try {
    let query = supabaseAdmin
      .from("sync_log")
      .select("*", { count: "exact" })
      .order("sync_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], count: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
