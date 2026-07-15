import { NextRequest, NextResponse } from 'next/server'

const ERP_BASE = process.env.ERP_API_URL ?? 'http://127.0.0.1:8000'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { customer_id: string } },
) {
  try {
    // MUST be no-store: balance changes with every deposit/sale. Without this,
    // Next.js caches the first response and serves a stale balance forever —
    // which let a sale overdraw the wallet against a frozen 10k figure.
    const res = await fetch(
      `${ERP_BASE}/erp/members/${encodeURIComponent(params.customer_id)}/balance`,
      { cache: 'no-store' },
    )
    if (res.status === 404) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }
    if (!res.ok) throw new Error(`ERP balance fetch failed: ${res.status}`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
