import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function getPeriodRange(period: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);

  if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (period === "week") {
    start.setDate(start.getDate() - 6);
    return { start, end: null };
  }

  if (period === "month") {
    start.setDate(1);
    return { start, end: null };
  }

  return { start, end: null };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const memberId = searchParams.get("member_id");
  const period = searchParams.get("period") ?? "today";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100), 1), 500);
  const range = getPeriodRange(period);

  try {
    let query = supabaseAdmin
      .from("gym_checkins")
      .select(
        `
        *,
        gym_members (
          id,
          first_name,
          last_name,
          erp_customer_id,
          card_id,
          photo_url
        )
      `,
        { count: "exact" },
      )
      .gte("checkin_at", range.start.toISOString())
      .order("checkin_at", { ascending: false })
      .limit(limit);

    if (range.end) query = query.lt("checkin_at", range.end.toISOString());
    if (memberId) query = query.eq("member_id", memberId);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], count: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { member_id, membership_id, method, match_score, notes } = body;

    const { data, error } = await supabaseAdmin
      .from("gym_checkins")
      .insert({
        member_id,
        membership_id,
        method,
        match_score,
        notes,
        location_id: 15,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
