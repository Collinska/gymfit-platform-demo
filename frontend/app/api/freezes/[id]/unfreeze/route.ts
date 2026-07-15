import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const id = decodeURIComponent(params.id);
    const { data: freeze, error: freezeError } = await supabaseAdmin
      .from("gym_freezes")
      .select(
        `
        *,
        membership:gym_memberships (
          id,
          membership_end,
          frozen_days_used
        )
      `,
      )
      .eq("id", id)
      .single();

    if (freezeError) throw freezeError;
    if (!freeze) return NextResponse.json({ error: "Freeze record not found" }, { status: 404 });

    const today = startOfDay(new Date());
    const freezeStart = startOfDay(new Date(freeze.freeze_start));
    const freezeDays = Math.max(Math.ceil((today.getTime() - freezeStart.getTime()) / 86_400_000), 0);
    const currentEnd = new Date(freeze.membership.membership_end);
    const newEnd = addDays(currentEnd, freezeDays);
    const previousFrozenDays = freeze.membership.frozen_days_used ?? 0;
    const totalFrozenDays = previousFrozenDays + freezeDays;

    const { error: freezeUpdateError } = await supabaseAdmin
      .from("gym_freezes")
      .update({
        freeze_end: today.toISOString().slice(0, 10),
        resumed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (freezeUpdateError) throw freezeUpdateError;

    const { error: membershipUpdateError } = await supabaseAdmin
      .from("gym_memberships")
      .update({
        status: "active",
        membership_end: newEnd.toISOString(),
        frozen_at: null,
        frozen_days_used: totalFrozenDays,
      })
      .eq("id", freeze.membership.id);

    if (membershipUpdateError) throw membershipUpdateError;

    return NextResponse.json({
      message: "Membership unfrozen",
      freeze_days: freezeDays,
      new_membership_end: newEnd.toISOString(),
      total_frozen_days: totalFrozenDays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
