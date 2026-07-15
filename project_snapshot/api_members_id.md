# frontend/app/api/members/[id]/route.ts

```typescript
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = decodeURIComponent(params.id);
    const memberQuery = supabaseAdmin.from("gym_members").select("*").limit(1);
    const { data: members, error: memberError } = /^\d+$/.test(id)
      ? await memberQuery.eq("id", id)
      : await memberQuery.eq("erp_customer_id", id);

    if (memberError) throw memberError;

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
        .select("*")
        .eq("member_id", member.id)
        .order("checkin_at", { ascending: false })
        .limit(20),
      supabaseAdmin.from("gym_freezes").select("*").eq("member_id", member.id).order("freeze_start", { ascending: false }),
    ]);

    if (memberships.error) throw memberships.error;
    if (checkins.error) throw checkins.error;
    if (freezes.error) throw freezes.error;

    return NextResponse.json({
      member,
      memberships: memberships.data ?? [],
      checkins: checkins.data ?? [],
      freezes: freezes.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```
