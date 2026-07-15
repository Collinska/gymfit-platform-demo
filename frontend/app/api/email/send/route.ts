import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ERP_BASE = process.env.ERP_API_URL ?? "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${ERP_BASE}/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ sent: false, error: "Email service unavailable" }, { status: 503 });
  }
}
