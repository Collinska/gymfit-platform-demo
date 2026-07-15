import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = decodeURIComponent(params.id);
    // Prefer erp_customer_id (how the app routes members, e.g. "00246"), then
    // fall back to the internal numeric id. Zero-padded ERP ids look numeric,
    // so a plain /^\d+$/ check would wrongly treat them as internal ids.
    let { data: members, error: memberError } = await supabaseAdmin
      .from("gym_members").select("*").eq("erp_customer_id", id).limit(1);
    if (memberError) throw memberError;
    if ((!members || members.length === 0) && /^\d+$/.test(id)) {
      ({ data: members, error: memberError } = await supabaseAdmin
        .from("gym_members").select("*").eq("id", id).limit(1));
      if (memberError) throw memberError;
    }

    const member = members?.[0] ?? null;
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const [memberships, checkins, freezes] = await Promise.all([
      supabaseAdmin
        .from("gym_memberships")
        .select("*")
        .eq("member_id", member.id)
        .order("membership_start", { ascending: false }),
      supabaseAdmin
        .from("gym_checkins")
        .select("id, checkin_at, checkout_at, method, match_score, notes")
        .eq("member_id", member.id)
        .order("checkin_at", { ascending: false }),
      supabaseAdmin.from("gym_freezes").select("*").eq("member_id", member.id).order("freeze_start", { ascending: false }),
    ]);

    if (memberships.error) throw memberships.error;
    if (checkins.error) throw checkins.error;
    if (freezes.error) throw freezes.error;

    const DENIED_NOTE = 'Access denied — no active membership'
    const allCheckins = checkins.data ?? []
    const successfulCheckins = allCheckins.filter((c) => c.notes !== DENIED_NOTE)
    const totalVisits = successfulCheckins.length
    const lastVisit = successfulCheckins[0]?.checkin_at ?? null

    return NextResponse.json({
      member,
      memberships: memberships.data ?? [],
      checkins: allCheckins.slice(0, 20),
      freezes: freezes.data ?? [],
      totalVisits,
      lastVisit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const id = decodeURIComponent(params.id);
    // Prefer erp_customer_id, fall back to internal numeric id (see GET note).
    let { data: members, error: memberError } = await supabaseAdmin
      .from("gym_members").select("id").eq("erp_customer_id", id).limit(1);
    if (memberError) throw memberError;
    if ((!members || members.length === 0) && /^\d+$/.test(id)) {
      ({ data: members, error: memberError } = await supabaseAdmin
        .from("gym_members").select("id").eq("id", id).limit(1));
      if (memberError) throw memberError;
    }
    const member = members?.[0] ?? null;
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const body = await request.json();
    const { first_name, last_name, mobile, email, card_id } = body;

    const updates: Record<string, string | null> = {};
    if (first_name !== undefined) updates.first_name = first_name ? String(first_name).trim() : null;
    if (last_name !== undefined) updates.last_name = last_name ? String(last_name).trim() : null;
    if (mobile !== undefined) updates.mobile = mobile ? String(mobile).trim() : null;
    if (email !== undefined) updates.email = email ? String(email).trim() : null;
    if (card_id !== undefined) updates.card_id = card_id ? String(card_id).trim() : null;

    const { data, error } = await supabaseAdmin
      .from("gym_members")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", String(member.id))
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
