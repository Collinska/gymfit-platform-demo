import { NextResponse } from 'next/server'
import { requireModule } from "@/lib/api-auth";
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const DEFAULT_KIOSK_LAUNCH = '2026-06-20'

const dayMs = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
function daysSince(dateStr: string, from: Date) {
  return Math.floor((from.getTime() - new Date(dateStr).getTime()) / dayMs)
}
function segmentFor(days: number) {
  if (days <= 30) return 'recent'
  if (days <= 90) return 'warm'
  if (days <= 180) return 'cold'
  return 'lost'
}

export async function GET() {
  const _gate = await requireModule("churn");
  if (!_gate.ok) return NextResponse.json({ error: _gate.error }, { status: _gate.status });
  try {
    const today = new Date()
    const todayStr = iso(today)
    const d90 = new Date(today.getTime() - 90 * dayMs)

    const [
      launchRes,
      expiredRes,
      exp90Res,
      activeRes,
    ] = await Promise.all([
      // Kiosk launch date (STEP 4 — read from settings, not hardcoded)
      supabaseAdmin.from('platform_settings').select('value').eq('key', 'kiosk_launch_date').maybeSingle(),

      // A + D — all expired members
      supabaseAdmin.from('v_member_status')
        .select('id, erp_customer_id, first_name, last_name, mobile, plan_name, membership_end')
        .eq('display_status', 'expired'),

      // B — memberships that expired in the last 90 days
      supabaseAdmin.from('gym_memberships')
        .select('member_id, membership_end')
        .gte('membership_end', iso(d90))
        .lt('membership_end', todayStr),

      // C — active members
      supabaseAdmin.from('v_member_status')
        .select('id, erp_customer_id, first_name, last_name, mobile, plan_name, membership_end')
        .eq('display_status', 'active'),
    ])

    const kioskLaunch = (launchRes.data?.value as string) || DEFAULT_KIOSK_LAUNCH

    // ── A) Expiry segments + D) win-back list ─────────────────────────────────
    const segments = { recent: 0, warm: 0, cold: 0, lost: 0 }
    const winBack = (expiredRes.data ?? [])
      .filter((m) => m.membership_end)
      .map((m) => {
        const days = daysSince(String(m.membership_end), today)
        const segment = segmentFor(days)
        segments[segment as keyof typeof segments] += 1
        return {
          id: m.id,
          erp_customer_id: m.erp_customer_id,
          first_name: m.first_name,
          last_name: m.last_name,
          mobile: m.mobile,
          plan_name: m.plan_name,
          membership_end: m.membership_end,
          days_since_expiry: days,
          segment,
        }
      })
      .sort((a, b) => a.days_since_expiry - b.days_since_expiry)

    // ── B) Renewal rate (last 90 days) ────────────────────────────────────────
    const latestExpiry = new Map<number, string>()
    for (const r of exp90Res.data ?? []) {
      if (!r.membership_end) continue
      const cur = latestExpiry.get(r.member_id)
      if (!cur || String(r.membership_end) > cur) latestExpiry.set(r.member_id, String(r.membership_end))
    }
    const expired90dMemberIds = [...latestExpiry.keys()]

    let renewedCount = 0
    if (expired90dMemberIds.length > 0) {
      const { data: histRows } = await supabaseAdmin
        .from('gym_memberships')
        .select('member_id, membership_start')
        .in('member_id', expired90dMemberIds)

      const startsByMember = new Map<number, string[]>()
      for (const r of histRows ?? []) {
        if (!r.membership_start) continue
        const arr = startsByMember.get(r.member_id) ?? []
        arr.push(String(r.membership_start))
        startsByMember.set(r.member_id, arr)
      }
      for (const [mid, expEnd] of latestExpiry) {
        const starts = startsByMember.get(mid) ?? []
        if (starts.some((s) => s > expEnd)) renewedCount += 1
      }
    }
    const expired90dCount = latestExpiry.size
    const renewalRate = expired90dCount > 0 ? (renewedCount / expired90dCount) * 100 : 0

    // ── C) Active member engagement (kiosk-era only) ──────────────────────────
    const activeMembers = activeRes.data ?? []
    const activeIds = activeMembers.map((m) => m.id)
    const engagement = { engaged: 0, at_risk: 0, quiet: 0, active_total: activeMembers.length }
    const atRiskMembers: Array<Record<string, unknown>> = []

    if (activeIds.length > 0) {
      const { data: checkins } = await supabaseAdmin
        .from('gym_checkins')
        .select('member_id, checkin_at, notes')
        .in('member_id', activeIds)
        .gte('checkin_at', kioskLaunch)

      const lastByMember = new Map<number, string>()
      for (const c of checkins ?? []) {
        if (c.notes && String(c.notes).includes('Access denied')) continue
        const cur = lastByMember.get(c.member_id)
        if (!cur || String(c.checkin_at) > cur) lastByMember.set(c.member_id, String(c.checkin_at))
      }

      for (const m of activeMembers) {
        const last = lastByMember.get(m.id)
        if (!last) {
          engagement.quiet += 1
          atRiskMembers.push({ ...m, last_checkin: null, days_since_checkin: null })
          continue
        }
        const days = daysSince(last, today)
        if (days <= 7) {
          engagement.engaged += 1
        } else if (days <= 30) {
          engagement.at_risk += 1
          atRiskMembers.push({ ...m, last_checkin: last, days_since_checkin: days })
        } else {
          engagement.at_risk += 1
          atRiskMembers.push({ ...m, last_checkin: last, days_since_checkin: days })
        }
      }
    }

    return NextResponse.json({
      expiry_segments: segments,
      renewal_rate: Math.round(renewalRate * 10) / 10,
      renewed_count: renewedCount,
      expired_90d_count: expired90dCount,
      engagement: { ...engagement, at_risk_members: atRiskMembers },
      kiosk_launch_date: kioskLaunch,
      win_back_list: winBack.slice(0, 200),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
