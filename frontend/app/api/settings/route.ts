import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireModule } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('platform_settings')
    .select('key, value')

  if (error) {
    // Table may not exist yet — return empty defaults
    console.warn('platform_settings fetch error:', error.message)
    return NextResponse.json({ pos_enforce_stock_check: true })
  }

  const result: Record<string, unknown> = {}
  for (const row of data ?? []) {
    result[row.key] = row.value
  }
  return NextResponse.json(result)
}

export async function PATCH(request: NextRequest) {
  const _gate = await requireModule('settings')
  if (!_gate.ok) return NextResponse.json({ error: _gate.error }, { status: _gate.status })
  const body = await request.json()
  const { key, value } = body

  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
