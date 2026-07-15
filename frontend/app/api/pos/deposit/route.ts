import { NextRequest, NextResponse } from 'next/server'
import { createERPDeposit } from '@/lib/erp-client'

export const dynamic = 'force-dynamic'

const ERP_BASE = process.env.ERP_API_URL ?? 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      account_id, amount, payment_method, narration,
      printer = 'thermal', customer_name,
    } = body

    if (!account_id || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'account_id and a positive amount are required' },
        { status: 400 },
      )
    }

    const result = await createERPDeposit({
      account_id,
      amount,
      payment_method: payment_method ?? 'cash',
      narration: narration ?? `${payment_method ?? 'cash'} deposit`,
    })

    // Fire-and-forget receipt print
    fetch(`${ERP_BASE}/erp/print/deposit-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serial_number:  result.serial_number,
        vch_number:     result.vch_number,
        amount,
        customer_name:  customer_name ?? `Account ${account_id}`,
        payment_method: payment_method ?? 'cash',
        narration:      narration ?? '',
        printer,
      }),
    }).catch(() => {/* print failure is non-fatal */})

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
