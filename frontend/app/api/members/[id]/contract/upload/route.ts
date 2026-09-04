import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ERP_BASE = process.env.ERP_API_URL ?? "http://127.0.0.1:8000";

// Same resolver as ../generate/route.ts — see comment there.
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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const customerId = await resolveErpCustomerId(params.id);
    if (!customerId) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 422 });
    }

    // Re-wrap into a fresh FormData to proxy the multipart upload to erp_api.
    const proxyForm = new FormData();
    proxyForm.append("file", file, file.name);

    const res = await fetch(
      `${ERP_BASE}/contracts/${encodeURIComponent(customerId)}/upload-signed`,
      { method: "POST", body: proxyForm, cache: "no-store" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data.detail ?? "Upload failed" }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
