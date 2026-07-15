import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ERP_BASE = process.env.ERP_API_URL ?? 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Print request body:', JSON.stringify(body))
    const res = await fetch(`${ERP_BASE}/erp/print/sale-receipt`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    console.log('ERP response status:', res.status)
    console.log('ERP response body:', JSON.stringify(data))
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch (err) {
    console.log('Print proxy exception:', err)
    return NextResponse.json({ printed: false, error: 'Print service unavailable' }, { status: 503 })
  }
}
