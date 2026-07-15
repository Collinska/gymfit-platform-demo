import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type RouteContext = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', params.id)
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 404 })
  }
}

const EDITABLE = [
  'first_name', 'last_name', 'mobile', 'email', 'source',
  'status', 'notes', 'follow_up_date', 'converted_member_id',
] as const

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of EDITABLE) {
      if (key in body) updates[key] = body[key] === '' ? null : body[key]
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { error } = await supabaseAdmin.from('leads').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
