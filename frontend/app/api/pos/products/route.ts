import { NextResponse } from 'next/server'

const ERP_BASE = process.env.ERP_API_URL ?? 'http://localhost:8000'

export const dynamic = 'force-dynamic'
export const revalidate = 60

export async function GET() {
  try {
    const res = await fetch(`${ERP_BASE}/erp/products`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) throw new Error(`ERP products fetch failed: ${res.status}`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
