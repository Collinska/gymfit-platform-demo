import { NextResponse } from 'next/server'
import { requireModule } from "@/lib/api-auth";

export const revalidate = 300

const ERP_BASE = process.env.ERP_API_URL ?? 'http://localhost:8000'

export async function GET() {
  const _gate = await requireModule("reports");
  if (!_gate.ok) return NextResponse.json({ error: _gate.error }, { status: _gate.status });
  try {
    const res = await fetch(`${ERP_BASE}/erp/reports/filters`)
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch {
    return NextResponse.json({ groups: [], departments: [] }, { status: 503 })
  }
}
