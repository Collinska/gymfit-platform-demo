import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SYNC_API = process.env.SYNC_API_URL ?? 'http://localhost:8001'

export async function GET() {
  try {
    const res = await fetch(`${SYNC_API}/sync/status`)
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch {
    return NextResponse.json({ error: 'Sync API unavailable' }, { status: 503 })
  }
}
