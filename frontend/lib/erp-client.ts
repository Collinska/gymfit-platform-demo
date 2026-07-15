const ERP_BASE = process.env.ERP_API_URL ?? 'http://localhost:8000'

export async function createERPMember(data: {
  first_name: string
  last_name?: string
  mobile?: string
  email?: string
  card_id?: string
}) {
  const res = await fetch(`${ERP_BASE}/erp/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `ERP member create failed: ${res.status}`)
  }
  return res.json() as Promise<{ customer_id: string; account_id: number; ml_number: number }>
}

export async function createERPDeposit(data: {
  account_id: number
  amount: number
  payment_method: string
  narration: string
  cash_account_id?: number
}) {
  const res = await fetch(`${ERP_BASE}/erp/deposits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `ERP deposit failed: ${res.status}`)
  }
  return res.json()
}

export async function createERPSale(data: {
  customer_id: string
  account_id: number
  items: Array<{
    product_id: string
    quantity: number
    sale_rate: number
    mrp: number
    tax_id: number
    tax_rate: number
    tax_amount: number
    taxable_value: number
  }>
  subtotal: number
  tax_total: number
  bill_amount: number
  session_id?: string
  enforce_stock_check?: boolean
}) {
  const res = await fetch(`${ERP_BASE}/erp/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.detail?.error ?? body.detail ?? `ERP sale failed: ${res.status}`) as Error & { status: number; detail: unknown }
    err.status = res.status
    err.detail = body.detail ?? body
    throw err
  }
  return res.json()
}
