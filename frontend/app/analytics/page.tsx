'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { RequireModule } from '@/components/RequireModule'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = {
  active:        '#0d9488',
  expired:       '#ef4444',
  frozen:        '#f59e0b',
  no_membership: '#94a3b8',
  unknown:       '#e2e8f0',
}

const fmt = (n: number) =>
  'KES ' + (n ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 0 })

function AnalyticsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="app-frame">
      <Sidebar />
      <main className="dashboard-page">
        <div className="content">
          <p className="text-slate-400 text-sm">Loading analytics...</p>
        </div>
      </main>
    </div>
  )

  const statusData = Object.entries(data?.status_counts ?? {}).map(([name, value]) => ({ name, value }))
  const changePct = data?.revenue_change_pct ?? 0
  const newChange = (data?.new_this_month ?? 0) - (data?.new_last_month ?? 0)

  return (
    <div className="app-frame">
      <Sidebar />
      <main className="dashboard-page">
        <div className="topbar">
          <div>
            <p className="eyebrow">Business Overview</p>
            <h1 className="page-title font-head">Analytics</h1>
          </div>
        </div>

        <div className="content space-y-5">
          {/* ROW 1 — Stat Cards */}
          <div className="grid grid-cols-3 gap-4">
            {/* Revenue This Month */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Revenue This Month
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {fmt(data?.revenue_this_month ?? 0)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  changePct >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}% vs last month
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {data?.sales_this_month ?? 0} transactions
              </p>
            </div>

            {/* Active Members */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Active Members
              </p>
              <p className="text-2xl font-bold text-teal-600">
                {(data?.status_counts?.active ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {data?.status_counts?.frozen ?? 0} frozen · {data?.status_counts?.expired ?? 0} expired
              </p>
            </div>

            {/* New Members */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                New Members This Month
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {data?.new_this_month ?? 0}
              </p>
              <div className="mt-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  newChange >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}>
                  {newChange >= 0 ? '+' : ''}{newChange} vs last month
                </span>
              </div>
            </div>
          </div>

          {/* ROW 2 — Revenue Bar Chart */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Revenue — Last 6 Months</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.monthly_revenue ?? []}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [fmt(Number(v)), 'Revenue']} />
                <Bar dataKey="revenue" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ROW 3 — Top Plans + Member Status */}
          <div className="grid grid-cols-2 gap-6">
            {/* Top Plans */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4">Top Plans</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-slate-500 font-medium">Plan</th>
                    <th className="text-right py-2 text-slate-500 font-medium">Sales</th>
                    <th className="text-right py-2 text-slate-500 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.top_plans ?? []).map((p: any, i: number) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-2 text-slate-700 truncate max-w-[140px]">{p.plan_name}</td>
                      <td className="py-2 text-right text-slate-600">{p.count}</td>
                      <td className="py-2 text-right text-slate-600">{fmt(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Member Status Pie */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4">Member Status</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={index} fill={COLORS[entry.name as keyof typeof COLORS] ?? '#e2e8f0'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-slate-600 capitalize">
                        {value.replace('_', ' ')}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ROW 4 — Staff Performance */}
          <StaffPerformance />
        </div>
      </main>
    </div>
  )
}

// ── Staff Performance section ──────────────────────────────────────────────────

type StaffSale    = { user_name: string; user_id: number; invoices: number; total_sales: number }
type StaffDeposit = { user_name: string; user_id: number; deposits: number; total_deposited: number }

function monthRange() {
  const now   = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const iso   = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(first), to: iso(now) }
}

function StaffPerformance() {
  const init = monthRange()
  const [from, setFrom]       = useState(init.from)
  const [to, setTo]           = useState(init.to)
  const [sales, setSales]     = useState<StaffSale[]>([])
  const [deposits, setDeposits] = useState<StaffDeposit[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const qs  = new URLSearchParams({ date_from: from, date_to: to })
      const res = await fetch(`/api/reports/staff-performance?${qs}`, { cache: 'no-store' })
      const d   = await res.json()
      setSales(d.sales_by_user ?? [])
      setDeposits(d.deposits_by_user ?? [])
    } catch {
      setSales([]); setDeposits([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const busiest = [...sales].sort((a, b) => b.invoices - a.invoices)[0]

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-slate-800">Staff Performance</h2>
        <div className="flex items-end gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <span className="text-slate-400 text-sm pb-2">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <button onClick={load} disabled={loading}
            className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
            {loading ? 'Loading…' : 'Apply'}
          </button>
        </div>
      </div>

      {busiest && (
        <p className="text-sm text-slate-500 mb-4">
          Busiest cashier: <span className="font-semibold text-teal-700">{busiest.user_name}</span> — {busiest.invoices} transaction{busiest.invoices !== 1 ? 's' : ''}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sales by Staff */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Sales by Staff</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 text-slate-500 font-medium">Staff</th>
                <th className="text-right py-2 text-slate-500 font-medium">Invoices</th>
                <th className="text-right py-2 text-slate-500 font-medium">Total Sales</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((r, i) => (
                <tr key={r.user_id} className={`border-b border-slate-50 ${i === 0 ? 'bg-teal-50/60' : ''}`}>
                  <td className={`py-2 ${i === 0 ? 'font-semibold text-teal-700' : 'text-slate-700'}`}>{r.user_name}</td>
                  <td className="py-2 text-right text-slate-600">{r.invoices}</td>
                  <td className={`py-2 text-right ${i === 0 ? 'font-semibold text-teal-700' : 'text-slate-600'}`}>{fmt(r.total_sales)}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-slate-400">No sales for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Deposits by Staff */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Deposits by Staff</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 text-slate-500 font-medium">Staff</th>
                <th className="text-right py-2 text-slate-500 font-medium">Deposits</th>
                <th className="text-right py-2 text-slate-500 font-medium">Total Handled</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((r) => (
                <tr key={r.user_id} className="border-b border-slate-50">
                  <td className="py-2 text-slate-700">{r.user_name}</td>
                  <td className="py-2 text-right text-slate-600">{r.deposits}</td>
                  <td className="py-2 text-right text-slate-600">{fmt(r.total_deposited)}</td>
                </tr>
              ))}
              {deposits.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-slate-400">No deposits for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function AnalyticsPageGuarded() {
  return <RequireModule module="analytics"><AnalyticsPage /></RequireModule>;
}
