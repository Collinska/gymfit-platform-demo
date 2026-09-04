import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ERP_BASE = process.env.ERP_API_URL ?? "http://127.0.0.1:8000";

// Resolve a member from the URL segment (erp_customer_id or internal numeric
// id) down to the ERP customer id the erp_api contracts router expects.
// Same precedence as app/api/members/[id]/route.ts: erp_customer_id first —
// ERP ids can be all-numeric (e.g. "00246"), which /^\d+$/ would wrongly
// treat as an internal id.
async function resolveErpCustomerId(rawId: string): Promise<string | undefined> {
  const id = decodeURIComponent(rawId);

  const byErp = await supabaseAdmin
    .from("gym_members").select("erp_customer_id").eq("erp_customer_id", id).limit(1);
  if (byErp.data?.[0]?.erp_customer_id) return byErp.data[0].erp_customer_id as string;

  if (/^\d+$/.test(id)) {
    const byId = await supabaseAdmin
      .from("gym_members").select("erp_customer_id").eq("id", id).limit(1);
    if (byId.data?.[0]?.erp_customer_id) return byId.data[0].erp_customer_id as string;
  }
  return undefined;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const customerId = await resolveErpCustomerId(params.id);
    if (!customerId) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const res = await fetch(
      `${ERP_BASE}/contracts/${encodeURIComponent(customerId)}/generate`,
      { cache: "no-store" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data.detail ?? "Contract generation failed" }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Contract generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
