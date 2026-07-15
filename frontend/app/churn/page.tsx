'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { RequireModule } from '@/components/RequireModule'

type WinBack = {
  id: number
  erp_customer_id: string
  first_name: string
  last_name: string | null
  mobile: string | null
  plan_name: string | null
  membership_end: string
  days_since_expiry: number
  segment: 'recent' | 'warm' | 'cold' | 'lost'
}

type ChurnData = {
  expiry_segments: { recent: number; warm: number; cold: number; lost: number }
  renewal_rate: number
  renewed_count: number
  expired_90d_count: number
  engagement: {
    engaged: number
    at_risk: number
    quiet: number
    active_total: number
    at_risk_members: Array<Record<string, unknown>>
  }
  kiosk_launch_date: string
  win_back_list: WinBack[]
}

const SEG = {
  recent: { label: 'Recent', range: '0–30 days',   card: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
  warm:   { label: 'Warm',   range: '31–90 days',  card: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700' },
  cold:   { label: 'Cold',   range: '91–180 days', card: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  lost:   { label: 'Lost',   range: '180+ days',   card: 'text-slate-500',  badge: 'bg-slate-100 text-slate-500' },
} as const

type SegKey = keyof typeof SEG
const FILTERS: Array<'all' | SegKey> = ['all', 'recent', 'warm', 'cold', 'lost']

function fmtDate(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function ChurnPage() {
  const router = useRouter()
  const [data, setData] = useState<ChurnData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | SegKey>('all')

  useEffect(() => {
    fetch('/api/churn', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    return filter === 'all' ? data.win_back_list : data.win_back_list.filter((r) => r.segment === filter)
  }, [data, filter])

  if (loading || !data) {
    return (
      <div className="app-frame">
        <Sidebar />
        <main className="dashboard-page"><div className="content"><p className="text-slate-400 text-sm">Loading retention…</p></div></main>
      </div>
    )
  }

  const seg = data.expiry_segments

  function exportCSV() {
    const header = ['Name', 'Plan', 'Expired On', 'Days Ago', 'Mobile', 'Segment']
    const body = rows.map((r) => [
      [r.first_name, r.last_name].filter(Boolean).join(' '),
      r.plan_name ?? '', fmtDate(r.membership_end), String(r.days_since_expiry), r.mobile ?? '', r.segment,
    ])
    downloadCSV([header, ...body], `win_back_${filter}_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="app-frame">
      <Sidebar />
      <main className="dashboard-page">
        <div className="topbar">
          <div>
            <p className="eyebrow">Membership churn analysis</p>
            <h1 className="page-title font-head">Retention &amp; Win-Back</h1>
          </div>
        </div>

        <div className="content space-y-5">
          {/* ROW 1 — Expiry segment cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['recent', 'warm', 'cold', 'lost'] as SegKey[]).map((k) => (
              <div key={k} className="bg-white rounded-2xl shadow-sm p-5">
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${SEG[k].card}`}>{SEG[k].label}</p>
                <p className={`text-3xl font-bold ${SEG[k].card}`}>{seg[k]}</p>
                <p className="text-xs text-slate-400 mt-1">{SEG[k].range}</p>
                <p className="text-[11px] text-slate-400">since expiry</p>
              </div>
            ))}
          </div>

          {/* ROW 2 — Metrics strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Renewal Rate (90d)</p>
              <p className="text-2xl font-bold text-teal-600">{data.renewal_rate}%</p>
              <p className="text-xs text-slate-400 mt-1">{data.renewed_count}/{data.expired_90d_count} renewed</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Active Members</p>
              <p className="text-2xl font-bold text-slate-900">{data.engagement.active_total}</p>
              <p className="text-xs text-slate-400 mt-1">Check-in engagement tracked since {data.kiosk_launch_date}</p>
            </div>
          </div>

          {/* ROW 3 — Win-Back Call List */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#f2f2f7]">
              <div>
                <h2 className="text-sm font-bold text-[#1c1c1e]">Win-Back Call List</h2>
                <p className="text-xs text-slate-400 mt-0.5">Expired members, warmest leads first</p>
              </div>
              <button onClick={exportCSV} className="text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors">
                Export CSV
              </button>
            </div>

            <div className="flex flex-wrap gap-1 bg-[#f2f2f7] m-4 rounded-xl p-1 w-fit">
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-[9px] text-xs font-semibold capitalize transition-all ${
                    filter === f ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-[#1c1c1e]'
                  }`}>
                  {f} {f !== 'all' && <span className="text-slate-400">({seg[f as SegKey]})</span>}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f2f2f7] text-left">
                    {['Member', 'Plan', 'Expired On', 'Days Ago', 'Mobile', 'Segment'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f2f7]">
                  {rows.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No members in this segment</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.id} onClick={() => router.push(`/members/${r.erp_customer_id}`)} className="hover:bg-[#f9f9fb] cursor-pointer">
                      <td className="px-4 py-3 font-medium text-[#1c1c1e]">{[r.first_name, r.last_name].filter(Boolean).join(' ')}</td>
                      <td className="px-4 py-3 text-slate-500">{r.plan_name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(r.membership_end)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${SEG[r.segment].badge}`}>{r.days_since_expiry}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.mobile ?? '—'}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${SEG[r.segment].badge}`}>{SEG[r.segment].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ROW 4 — Active Member Engagement (kiosk-era) */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-bold text-[#1c1c1e]">Active Member Engagement</h2>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">Based on check-ins since {data.kiosk_launch_date} (kiosk-era only)</p>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="rounded-xl bg-green-50 p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{data.engagement.engaged}</p>
                <p className="text-xs text-green-700 mt-0.5">Engaged</p>
                <p className="text-[11px] text-slate-400">≤7 days</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-4 text-center">
                <p className="text-2xl font-bold text-amber-700">{data.engagement.at_risk}</p>
                <p className="text-xs text-amber-700 mt-0.5">At Risk</p>
                <p className="text-[11px] text-slate-400">8–30 days</p>
              </div>
              <div className="rounded-xl bg-slate-100 p-4 text-center">
                <p className="text-2xl font-bold text-slate-500">{data.engagement.quiet}</p>
                <p className="text-xs text-slate-500 mt-0.5">Quiet</p>
                <p className="text-[11px] text-slate-400">no check-in</p>
              </div>
            </div>

            {data.engagement.at_risk_members.length > 0 && (
              <div className="border-t border-[#f2f2f7] pt-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Active members not checking in</p>
                <div className="divide-y divide-[#f2f2f7]">
                  {data.engagement.at_risk_members.map((m, i) => (
                    <div key={String(m.id ?? i)}
                      onClick={() => m.erp_customer_id && router.push(`/members/${m.erp_customer_id}`)}
                      className="flex items-center justify-between py-2 cursor-pointer hover:bg-[#f9f9fb] rounded-lg px-2">
                      <span className="text-sm font-medium text-[#1c1c1e]">
                        {[m.first_name, m.last_name].filter(Boolean).join(' ') || '—'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {m.last_checkin ? `${m.days_since_checkin}d since check-in` : 'No check-in since launch'}
                        {m.mobile ? ` · ${m.mobile}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function ChurnPageGuarded() {
  return <RequireModule module="churn"><ChurnPage /></RequireModule>;
}
