import { NextRequest, NextResponse } from 'next/server'
import { createERPSale } from '@/lib/erp-client'

export const dynamic = 'force-dynamic'

const ERP_BASE = process.env.ERP_API_URL ?? 'http://127.0.0.1:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customer_id, account_id, items, subtotal, tax_total, bill_amount, session_id, enforce_stock_check } = body

    if (!customer_id || !account_id || !items?.length || !bill_amount) {
      return NextResponse.json(
        { error: 'customer_id, account_id, items, and bill_amount are required' },
        { status: 400 },
      )
    }

    // Authoritative balance guard — the client check reads a value that can be
    // stale/raced, so re-verify against the live ERP balance before posting.
    // Fail closed: if balance can't be verified, block rather than risk overdraw.
    let currentBalance: number | null = null
    try {
      const balRes = await fetch(
        `${ERP_BASE}/erp/members/${encodeURIComponent(customer_id)}/balance`,
        { cache: 'no-store' },
      )
      if (balRes.ok) {
        const b = await balRes.json()
        if (typeof b.balance === 'number') currentBalance = b.balance
      }
    } catch {
      currentBalance = null
    }

    if (currentBalance === null) {
      return NextResponse.json(
        { error: 'Could not verify member balance — sale blocked. Please retry.' },
        { status: 503 },
      )
    }
    if (currentBalance < Number(bill_amount)) {
      return NextResponse.json(
        {
          error: `Insufficient balance — member has KES ${currentBalance.toLocaleString('en-KE')}, needs KES ${Number(bill_amount).toLocaleString('en-KE')}`,
        },
        { status: 402 },
      )
    }

    const result = await createERPSale({
      customer_id,
      account_id,
      items,
      subtotal:            subtotal ?? bill_amount,
      tax_total:           tax_total ?? 0,
      bill_amount,
      session_id,
      enforce_stock_check: enforce_stock_check ?? true,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const e = err as Error & { status?: number; detail?: unknown }
    if (e.status === 400) {
      return NextResponse.json({ detail: e.detail }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
