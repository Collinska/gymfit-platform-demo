# frontend/app/api/stats/route.ts

```typescript
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CountMap = Record<string, number>;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function getCount(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function GET() {
  try {
    const today = startOfToday();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);

    const expiredSince = new Date();
    expiredSince.setDate(expiredSince.getDate() - 7);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const expiringUntil = new Date();
    expiringUntil.setDate(expiringUntil.getDate() + 14);

    const [
      activeMembers,
      frozenMembers,
      expiredThisWeek,
      checkinsToday,
      newThisMonth,
      syncErrorsToday,
      weeklyCheckinRows,
      planMixRows,
      expiringSoon,
    ] = await Promise.all([
      getCount(supabaseAdmin.from("gym_memberships").select("*", { count: "exact", head: true }).eq("status", "active")),
      getCount(supabaseAdmin.from("gym_memberships").select("*", { count: "exact", head: true }).eq("status", "frozen")),
      getCount(
        supabaseAdmin
          .from("gym_memberships")
          .select("*", { count: "exact", head: true })
          .eq("status", "expired")
          .gte("membership_end", expiredSince.toISOString()),
      ),
      getCount(
        supabaseAdmin
          .from("gym_checkins")
          .select("*", { count: "exact", head: true })
          .gte("checkin_at", today.toISOString()),
      ),
      getCount(
        supabaseAdmin
          .from("gym_members")
          .select("*", { count: "exact", head: true })
          .gte("created_at", firstDayOfMonth.toISOString()),
      ),
      getCount(
        supabaseAdmin
          .from("sync_log")
          .select("*", { count: "exact", head: true })
          .eq("status", "error")
          .gte("sync_at", today.toISOString()),
      ),
      supabaseAdmin.from("gym_checkins").select("checkin_at").gte("checkin_at", sevenDaysAgo.toISOString()),
      supabaseAdmin.from("gym_memberships").select("plan_name").eq("status", "active"),
      supabaseAdmin
        .from("v_member_status")
        .select("*")
        .eq("display_status", "active")
        .lte("membership_end", expiringUntil.toISOString())
        .order("membership_end", { ascending: true }),
    ]);

    if (weeklyCheckinRows.error) throw weeklyCheckinRows.error;
    if (planMixRows.error) throw planMixRows.error;
    if (expiringSoon.error) throw expiringSoon.error;

    const weeklyCheckins: CountMap = {};
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(sevenDaysAgo);
      date.setDate(sevenDaysAgo.getDate() + index);
      weeklyCheckins[toDateKey(date)] = 0;
    }

    for (const row of weeklyCheckinRows.data ?? []) {
      if (!row.checkin_at) continue;
      const key = toDateKey(new Date(row.checkin_at));
      weeklyCheckins[key] = (weeklyCheckins[key] ?? 0) + 1;
    }

    const planMix: CountMap = {};
    for (const row of planMixRows.data ?? []) {
      const key = row.plan_name || "Unassigned";
      planMix[key] = (planMix[key] ?? 0) + 1;
    }

    return NextResponse.json({
      active_members: activeMembers,
      frozen_members: frozenMembers,
      expired_this_week: expiredThisWeek,
      checkins_today: checkinsToday,
      new_this_month: newThisMonth,
      sync_errors_today: syncErrorsToday,
      weekly_checkins: weeklyCheckins,
      plan_mix: planMix,
      expiring_soon: expiringSoon.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```
