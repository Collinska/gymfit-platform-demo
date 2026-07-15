import { NextRequest, NextResponse } from 'next/server'

const ERP_BASE = process.env.ERP_API_URL ?? 'http://localhost:8000'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? ''
  if (!q.trim()) {
    return NextResponse.json({ members: [] })
  }
  try {
    const res = await fetch(
      `${ERP_BASE}/erp/members/search?q=${encodeURIComponent(q)}`,
    )
    if (!res.ok) throw new Error(`ERP member search failed: ${res.status}`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
