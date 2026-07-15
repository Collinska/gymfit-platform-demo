import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("gym_freezes")
      .select(
        `
        *,
        member:gym_members (
          id,
          first_name,
          last_name,
          erp_customer_id
        ),
        membership:gym_memberships (
          id,
          plan_name,
          membership_end
        )
      `,
      )
      .is("freeze_end", null)
      .order("freeze_start", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { membership_id, reason, approved_by, freeze_start } = body;

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("gym_memberships")
      .select("*")
      .eq("id", membership_id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership || membership.status !== "active") {
      return NextResponse.json({ error: "Membership must exist and be active before freezing" }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("gym_memberships")
      .update({ status: "frozen", frozen_at: new Date().toISOString() })
      .eq("id", membership_id);

    if (updateError) throw updateError;

    const { data, error } = await supabaseAdmin
      .from("gym_freezes")
      .insert({
        member_id: membership.member_id,
        membership_id,
        reason,
        approved_by,
        freeze_start: freeze_start ?? new Date().toISOString().slice(0, 10),
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ data, message: "Membership frozen" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
