import { NextResponse } from 'next/server'

const ERP_BASE = process.env.ERP_API_URL ?? 'http://127.0.0.1:8000'

// Live stock levels for POS badges. MUST be no-store — stock changes with every
// sale/purchase; a cached response would show stale availability (same reasoning
// as the member balance endpoint).
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch(`${ERP_BASE}/erp/products/stock-levels`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`ERP stock fetch failed: ${res.status}`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ stock: {}, error: message }, { status: 200 })
  }
}
