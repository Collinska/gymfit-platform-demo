import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const ERP_BASE = process.env.ERP_API_URL ?? "http://127.0.0.1:8000";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireModule("settings");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const body = await request.json();
    const res = await fetch(`${ERP_BASE}/staff/${encodeURIComponent(params.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: "Staff service unavailable" }, { status: 503 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireModule("settings");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const res = await fetch(`${ERP_BASE}/staff/${encodeURIComponent(params.id)}`, {
      method: "DELETE",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: "Staff service unavailable" }, { status: 503 });
  }
}
