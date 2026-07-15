import { NextResponse } from 'next/server'
import { requireModule } from "@/lib/api-auth";
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ERP_BASE = process.env.ERP_API_URL ?? 'http://127.0.0.1:8000'

export async function GET() {
  const _gate = await requireModule("analytics");
  if (!_gate.ok) return NextResponse.json({ error: _gate.error }, { status: _gate.status });
  try {
    // Revenue AND new-member counts come from the ERP:
    //  - Revenue spans ALL product groups (memberships + retail + F&B), paid-or-posted.
    //  - "New members" = first membership purchase in-period (NOT Supabase created_at,
    //    which reflects sync time and gets inflated by backfills).
    // Only live member-status counts stay in Supabase.
    // Status counts use exact server-side COUNT queries (one per status).
    // NOTE: do NOT fetch rows and tally in JS — PostgREST caps selects at 1000
    // rows, which silently drops the small "active" bucket on large datasets.
    const STATUSES = ['active', 'frozen', 'expired', 'no_membership'] as const
    const statusCount = (status: string) =>
      supabaseAdmin
        .from('v_member_status')
        .select('*', { count: 'exact', head: true })
        .eq('display_status', status)
        .then(({ count }) => count ?? 0)

    const [erp, ...counts] = await Promise.all([
      fetch(`${ERP_BASE}/erp/reports/revenue-summary`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),

      ...STATUSES.map(statusCount),
    ])

    const statusCounts: Record<string, number> = {}
    STATUSES.forEach((s, i) => { statusCounts[s] = counts[i] })

    return NextResponse.json({
      revenue_this_month: erp?.revenue_this_month ?? 0,
      revenue_last_month: erp?.revenue_last_month ?? 0,
      revenue_change_pct: erp?.revenue_change_pct ?? 0,
      sales_this_month:   erp?.sales_this_month   ?? 0,
      status_counts:      statusCounts,
      monthly_revenue:    erp?.monthly_revenue    ?? [],
      top_plans:          erp?.top_plans          ?? [],
      new_this_month:     erp?.new_this_month     ?? 0,
      new_last_month:     erp?.new_last_month     ?? 0,
      revenue_source:     erp ? 'erp' : 'unavailable',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
