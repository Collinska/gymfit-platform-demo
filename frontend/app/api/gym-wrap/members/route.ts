import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const DENIED = "Access denied";

async function fetchAll(table: string, select: string) {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  const size = 1000;
  // Paginate past Supabase's default 1000-row cap.
  for (;;) {
    const { data, error } = await supabaseAdmin.from(table).select(select).range(from, from + size - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < size) break;
    from += size;
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const _gate = await requireModule("gym_wrap");
  if (!_gate.ok) return NextResponse.json({ error: _gate.error }, { status: _gate.status });
  try {
    const month = request.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

    const [members, emailRows, checkinRows] = await Promise.all([
      fetchAll("v_member_status", "id, erp_customer_id, first_name, last_name, photo_url, display_status"),
      fetchAll("gym_members", "id, email"),
      // This month's check-ins (bounded set) — count per member, excluding denials.
      supabaseAdmin
        .from("gym_checkins")
        .select("member_id, notes")
        .gte("checkin_at", start)
        .lt("checkin_at", end),
    ]);

    const emailById = new Map<number, string>();
    for (const r of emailRows) emailById.set(Number(r.id), String(r.email ?? ""));

    const visitsById = new Map<number, number>();
    for (const c of (checkinRows.data ?? [])) {
      if (c.notes && String(c.notes).includes(DENIED)) continue;
      visitsById.set(c.member_id, (visitsById.get(c.member_id) ?? 0) + 1);
    }

    const out = members.map((mem) => {
      const id = Number(mem.id);
      const email = emailById.get(id) ?? "";
      return {
        id,
        erp_customer_id: mem.erp_customer_id,
        first_name: mem.first_name,
        last_name: mem.last_name,
        email,
        photo_url: mem.photo_url,
        display_status: mem.display_status,
        has_email: !!email,
        visits_this_month: visitsById.get(id) ?? 0,
      };
    });

    return NextResponse.json({ members: out, month });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
