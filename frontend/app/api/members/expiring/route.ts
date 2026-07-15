import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const [expiring, expired] = await Promise.all([
      supabaseAdmin
        .from('v_member_status')
        .select('id, erp_customer_id, first_name, last_name, mobile, card_id, plan_name, membership_end, days_remaining, display_status')
        .eq('display_status', 'active')
        .gte('days_remaining', 0)
        .lte('days_remaining', 14)
        .order('days_remaining', { ascending: true }),

      supabaseAdmin
        .from('v_member_status')
        .select('id, erp_customer_id, first_name, last_name, mobile, card_id, plan_name, membership_end, days_remaining, display_status')
        .eq('display_status', 'expired')
        .gte('membership_end', sevenDaysAgo.toISOString().slice(0, 10))
        .order('membership_end', { ascending: false }),
    ])

    if (expiring.error) throw expiring.error
    if (expired.error) throw expired.error

    return NextResponse.json({
      expiring_soon:     expiring.data ?? [],
      recently_expired:  expired.data  ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
