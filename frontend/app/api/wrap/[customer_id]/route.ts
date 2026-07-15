import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ERP_BASE = process.env.ERP_API_URL ?? "http://127.0.0.1:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: { customer_id: string } },
) {
  try {
    const month = request.nextUrl.searchParams.get("month");
    const qs = month ? `?month=${encodeURIComponent(month)}` : "";
    const res = await fetch(
      `${ERP_BASE}/wrap/${encodeURIComponent(params.customer_id)}/html${qs}`,
      { cache: "no-store" },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: "Wrap service unavailable" }, { status: 503 });
  }
}
