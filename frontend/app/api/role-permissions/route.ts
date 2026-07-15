import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireModule("settings");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data, error } = await supabaseAdmin
    .from("role_permissions")
    .select("role, module, allowed");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ permissions: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireModule("settings");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { role, module, allowed } = await request.json();
  if (!role || !module || typeof allowed !== "boolean") {
    return NextResponse.json({ error: "role, module and allowed are required" }, { status: 422 });
  }
  if (role === "admin") {
    return NextResponse.json({ error: "Admin always has full access and cannot be changed" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("role_permissions")
    .upsert({ role, module, allowed }, { onConflict: "role,module" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
