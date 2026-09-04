import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
// Throttled batch send can run for a while. Capped at 300 (not 800) because
// that's the Vercel Hobby plan's hard ceiling — a higher value fails the
// deploy outright rather than degrading gracefully. At erp_api's default 3s
// throttle that's ~100 recipients per batch, well beyond the demo's 25
// seeded members; raise it if the plan is ever upgraded.
export const maxDuration = 300;

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
