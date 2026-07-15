import { NextResponse } from 'next/server'
import { requireModule } from "@/lib/api-auth";

export const dynamic = 'force-dynamic'

const SYNC_API = process.env.SYNC_API_URL ?? 'http://localhost:8001'

export async function POST() {
  const _gate = await requireModule("settings");
  if (!_gate.ok) return NextResponse.json({ error: _gate.error }, { status: _gate.status });
  try {
    const res = await fetch(`${SYNC_API}/resync/full`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch {
    return NextResponse.json({ error: 'Sync API unavailable' }, { status: 503 })
  }
}
