import { NextRequest, NextResponse } from 'next/server'
import { requireModule } from "@/lib/api-auth";

export const dynamic = 'force-dynamic'

const ERP_BASE = process.env.ERP_API_URL ?? 'http://localhost:8000'

export async function GET(request: NextRequest) {
  const _gate = await requireModule("reports");
  if (!_gate.ok) return NextResponse.json({ error: _gate.error }, { status: _gate.status });
  const { searchParams } = request.nextUrl
  const qs = new URLSearchParams()
  for (const key of ['date_from', 'date_to', 'location_id']) {
    const v = searchParams.get(key)
    if (v) qs.set(key, v)
  }
  try {
    const res = await fetch(`${ERP_BASE}/erp/reports/sales-by-invoice?${qs}`)
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch {
    return NextResponse.json({ error: 'Report service unavailable' }, { status: 503 })
  }
}
