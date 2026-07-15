import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
// Throttled batch send can run for a while.
export const maxDuration = 800;

const ERP_BASE = process.env.ERP_API_URL ?? "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  const _gate = await requireModule("gym_wrap");
  if (!_gate.ok) return NextResponse.json({ error: _gate.error }, { status: _gate.status });
  try {
    const body = await request.json();
    const res = await fetch(`${ERP_BASE}/wrap/send-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: "Wrap service unavailable" }, { status: 503 });
  }
}
