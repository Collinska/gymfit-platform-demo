'use client'

import { useState, useEffect } from 'react'
import { BackLink } from '@/components/BackLink'

type MOPRow = {
  PaymentMethod: string
  TransactionCount: number
  TotalAmount: number
}

type UserRow = {
  UserName: string
  InvoiceCount: number
  TotalNet: number
  TotalTax: number
  TotalSales: number
}

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function DayAuditPage() {
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [mopData,  setMopData]  = useState<MOPRow[]>([])
  const [userData, setUserData] = useState<UserRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const n   = (v: number) => (v ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })
  const fmt = (v: number) => 'KES ' + n(v)

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/reports/day-audit?date=${date}`)
      const json = await res.json()

      setMopData(
        (json.deposits_by_mop ?? []).map((r: any) => ({
          PaymentMethod:    r.PaymentMethod    ?? r.payment_method    ?? '',
          TransactionCount: r.TransactionCount ?? r.transaction_count ?? 0,
          TotalAmount:      r.TotalAmount      ?? r.total_amount      ?? 0,
        }))
      )

      setUserData(
        (json.sales_by_user ?? []).map((r: any) => ({
          UserName:     r.UserName     ?? r.user_name     ?? '',
          InvoiceCount: r.InvoiceCount ?? r.invoice_count ?? 0,
          TotalNet:     r.TotalNet     ?? r.total_net     ?? 0,
          TotalTax:     r.TotalTax     ?? r.total_tax     ?? 0,
          TotalSales:   r.TotalSales   ?? r.total_sales   ?? 0,
        }))
      )
    } catch {
      setError('Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDeposit  = mopData.reduce((s, r)  => s + (r.TotalAmount  ?? 0), 0)
  const totalSales    = userData.reduce((s, r)  => s + (r.TotalSales   ?? 0), 0)
  const totalInvoices = userData.reduce((s, r)  => s + (r.InvoiceCount ?? 0), 0)
  const totalNet      = userData.reduce((s, r)  => s + (r.TotalNet     ?? 0), 0)
  const totalTax      = userData.reduce((s, r)  => s + (r.TotalTax     ?? 0), 0)

  function exportMOPCSV() {
    const lines = [
      '"Mode of Deposit","Amount"',
      ...mopData.map((r) => `"${r.PaymentMethod}","${n(r.TotalAmount)}"`),
      `"Total","${n(totalDeposit)}"`,
    ]
    triggerDownload(lines.join('\n'), `mode_of_deposit_${date}.csv`)
  }

  function exportUserCSV() {
    const lines = [
      '"User","Invoices","Net","Tax","Total"',
      ...userData.map((r) => `"${r.UserName}","${r.InvoiceCount}","${n(r.TotalNet)}","${n(r.TotalTax)}","${n(r.TotalSales)}"`),
      `"Total","${totalInvoices}","${n(totalNet)}","${n(totalTax)}","${n(totalSales)}"`,
    ]
    triggerDownload(lines.join('\n'), `sales_by_user_${date}.csv`)
  }

  const csvBtn = (onClick: () => void, disabled: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="border border-teal-600 text-teal-600 text-sm font-medium px-4 py-1.5 rounded-xl hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      Export CSV
    </button>
  )

  return (
    <div className="min-h-screen bg-[#f2f2f7]">
      {/* Header with back link (consistent with Sales Register) */}
      <div className="bg-white border-b border-[#e5e5ea] px-6 py-4">
        <div className="flex items-center gap-3 max-w-6xl mx-auto">
          <BackLink href="/pos/reports" label="Back to Reports" />
          <div>
            <h1 className="text-lg font-bold text-[#1c1c1e]">Day Audit</h1>
            <p className="text-xs text-slate-400">Daily deposit and sales summary</p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-700 bg-white"
        />
        <button
          onClick={fetchData}
          className="bg-teal-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <div className="flex flex-col gap-6">

        {/* CARD 1 — Mode of Deposit */}
        <div className="bg-white rounded-2xl shadow-sm p-6 w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">Mode of Deposit</h2>
            {csvBtn(exportMOPCSV, mopData.length === 0)}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 text-slate-500 font-medium">Mode of Deposit</th>
                <th className="text-right py-2 text-slate-500 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {mopData.length === 0 && !loading && (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-slate-400">No deposits for this date</td>
                </tr>
              )}
              {mopData.map((row, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-2.5 text-slate-700">{row.PaymentMethod}</td>
                  <td className="py-2.5 text-right text-slate-700">{fmt(row.TotalAmount)}</td>
                </tr>
              ))}
            </tbody>
            {mopData.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="py-2.5 font-bold text-slate-900">Total</td>
                  <td className="py-2.5 text-right font-bold text-slate-900">{fmt(totalDeposit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* CARD 2 — Sales by User */}
        <div className="bg-white rounded-2xl shadow-sm p-6 w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">Sales by User</h2>
            {csvBtn(exportUserCSV, userData.length === 0)}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 text-slate-500 font-medium">User</th>
                <th className="text-right py-2 text-slate-500 font-medium">Invoices</th>
                <th className="text-right py-2 text-slate-500 font-medium">Net</th>
                <th className="text-right py-2 text-slate-500 font-medium">Tax</th>
                <th className="text-right py-2 text-slate-500 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {userData.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">No sales for this date</td>
                </tr>
              )}
              {userData.map((row, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-2.5 text-slate-700">{row.UserName}</td>
                  <td className="py-2.5 text-right text-slate-600">{row.InvoiceCount}</td>
                  <td className="py-2.5 text-right text-slate-600">{n(row.TotalNet)}</td>
                  <td className="py-2.5 text-right text-slate-600">{n(row.TotalTax)}</td>
                  <td className="py-2.5 text-right font-medium text-slate-800">{fmt(row.TotalSales)}</td>
                </tr>
              ))}
            </tbody>
            {userData.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="py-2.5 font-bold text-slate-900">Total</td>
                  <td className="py-2.5 text-right font-bold text-slate-900">{totalInvoices}</td>
                  <td className="py-2.5 text-right font-bold text-slate-900">{n(totalNet)}</td>
                  <td className="py-2.5 text-right font-bold text-slate-900">{n(totalTax)}</td>
                  <td className="py-2.5 text-right font-bold text-teal-600">{fmt(totalSales)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

      </div>
      </div>
    </div>
  )
}
