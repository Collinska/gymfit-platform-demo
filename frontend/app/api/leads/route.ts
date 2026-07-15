import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status')
    let query = supabaseAdmin
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (status && status !== 'all') query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { first_name, last_name, mobile, email, source, notes, follow_up_date } = body

    if (!first_name || !String(first_name).trim()) {
      return NextResponse.json({ error: 'first_name is required' }, { status: 422 })
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({
        first_name: String(first_name).trim(),
        last_name:  last_name ? String(last_name).trim() : null,
        mobile:     mobile ? String(mobile).trim() : null,
        email:      email ? String(email).trim() : null,
        source:     source ?? null,
        notes:      notes ?? null,
        follow_up_date: follow_up_date || null,
        status:     'new',
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
