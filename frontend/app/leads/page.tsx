'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/Sidebar'

type Lead = {
  id: number
  first_name: string
  last_name: string | null
  mobile: string | null
  email: string | null
  source: string | null
  status: string
  notes: string | null
  follow_up_date: string | null
  converted_member_id: number | null
  created_at: string
}

const STATUSES = ['all', 'new', 'contacted', 'trial', 'converted', 'lost'] as const
type StatusTab = (typeof STATUSES)[number]

const STATUS_BADGE: Record<string, string> = {
  new:       'bg-blue-50 text-blue-700 border-blue-200',
  contacted: 'bg-amber-50 text-amber-700 border-amber-200',
  trial:     'bg-purple-50 text-purple-700 border-purple-200',
  converted: 'bg-green-50 text-green-700 border-green-200',
  lost:      'bg-slate-100 text-slate-500 border-slate-200',
}

const SOURCES = ['Walk-in', 'Referral', 'Social', 'Website', 'Other']

function fmtDate(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(v: string | null, status: string) {
  if (!v || status === 'converted' || status === 'lost') return false
  return new Date(v) < new Date(new Date().toDateString())
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? STATUS_BADGE.lost
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${cls}`}>
      {status}
    </span>
  )
}

export default function LeadsPage() {
  const router = useRouter()
  const [leads, setLeads]   = useState<Lead[]>([])
  const [tab, setTab]       = useState<StatusTab>('all')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Lead | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/leads', { cache: 'no-store' })
      const d = await res.json()
      setLeads(d.data ?? [])
    } catch {
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length }
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1
    return c
  }, [leads])

  const filtered = tab === 'all' ? leads : leads.filter((l) => l.status === tab)

  return (
    <div className="app-frame">
      <Sidebar />
      <main className="dashboard-page">
        <div className="topbar">
          <div>
            <p className="eyebrow">Prospect pipeline</p>
            <h1 className="page-title font-head">Leads</h1>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors"
          >
            + New Lead
          </button>
        </div>

        <div className="content space-y-4">
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1 bg-[#e5e5ea] rounded-xl p-1 w-fit">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`px-4 py-1.5 rounded-[9px] text-sm font-medium capitalize transition-all ${
                  tab === s ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-[#1c1c1e]'
                }`}
              >
                {s} <span className="text-xs text-slate-400">({counts[s] ?? 0})</span>
              </button>
            ))}
          </div>

          {/* Lead table */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f2f2f7] text-left">
                    {['Name', 'Mobile', 'Source', 'Status', 'Follow-up', 'Added'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f2f7]">
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No leads in this stage</td></tr>
                  ) : filtered.map((l) => (
                    <tr key={l.id} onClick={() => setSelected(l)} className="hover:bg-[#f9f9fb] cursor-pointer">
                      <td className="px-4 py-3 font-medium text-[#1c1c1e]">
                        {[l.first_name, l.last_name].filter(Boolean).join(' ')}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{l.mobile || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{l.source || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                      <td className="px-4 py-3">
                        {l.follow_up_date ? (
                          <span className={isOverdue(l.follow_up_date, l.status) ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                            {fmtDate(l.follow_up_date)}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {showNew && <NewLeadModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} />}
        {selected && (
          <LeadDrawer
            lead={selected}
            onClose={() => setSelected(null)}
            onChanged={() => { load() }}
            onConvert={(l) => {
              const qs = new URLSearchParams({
                first_name: l.first_name ?? '',
                last_name:  l.last_name ?? '',
                mobile:     l.mobile ?? '',
                email:      l.email ?? '',
                lead_id:    String(l.id),
              })
              router.push(`/members/new?${qs}`)
            }}
          />
        )}
      </main>
    </div>
  )
}

// ── New Lead modal ──────────────────────────────────────────────────────────────

function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', mobile: '', email: '', source: 'Walk-in', notes: '', follow_up_date: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.first_name.trim()) { setError('First name is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create')
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  const field = 'h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500 w-full'

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1c1c1e] mb-4">New Lead</h2>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-400">First Name *</label><input className={field} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></div>
          <div><label className="text-xs text-slate-400">Last Name</label><input className={field} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></div>
          <div><label className="text-xs text-slate-400">Mobile</label><input className={field} value={form.mobile} onChange={(e) => set('mobile', e.target.value)} /></div>
          <div><label className="text-xs text-slate-400">Email</label><input className={field} value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div><label className="text-xs text-slate-400">Source</label>
            <select className={field} value={form.source} onChange={(e) => set('source', e.target.value)}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-slate-400">Follow-up</label><input type="date" className={field} value={form.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} /></div>
          <div className="col-span-2"><label className="text-xs text-slate-400">Notes</label><textarea className={`${field} h-20 py-2`} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border border-[#e5e5ea] text-sm font-medium text-slate-600 hover:bg-[#f2f2f7]">Cancel</button>
          <button onClick={submit} disabled={saving} className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Create Lead'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Lead detail drawer ──────────────────────────────────────────────────────────

function LeadDrawer({
  lead, onClose, onChanged, onConvert,
}: {
  lead: Lead
  onClose: () => void
  onChanged: () => void
  onConvert: (l: Lead) => void
}) {
  const [form, setForm] = useState(lead)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Lead, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function patch(updates: Partial<Lead>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) onChanged()
    } finally {
      setSaving(false)
    }
  }

  const field = 'h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500 w-full'

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="bg-white h-full w-full max-w-md p-6 overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#1c1c1e]">{[form.first_name, form.last_name].filter(Boolean).join(' ')}</h2>
            <StatusBadge status={form.status} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-400">First Name</label><input className={field} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></div>
          <div><label className="text-xs text-slate-400">Last Name</label><input className={field} value={form.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} /></div>
          <div><label className="text-xs text-slate-400">Mobile</label><input className={field} value={form.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} /></div>
          <div><label className="text-xs text-slate-400">Email</label><input className={field} value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></div>
          <div><label className="text-xs text-slate-400">Source</label>
            <select className={field} value={form.source ?? ''} onChange={(e) => set('source', e.target.value)}>
              <option value="">—</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-slate-400">Follow-up</label><input type="date" className={field} value={form.follow_up_date ?? ''} onChange={(e) => set('follow_up_date', e.target.value)} /></div>
          <div className="col-span-2"><label className="text-xs text-slate-400">Status</label>
            <select className={field} value={form.status} onChange={(e) => set('status', e.target.value)}>
              {['new', 'contacted', 'trial', 'converted', 'lost'].map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className="text-xs text-slate-400">Notes</label><textarea className={`${field} h-24 py-2`} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></div>
        </div>

        {form.converted_member_id ? (
          <p className="text-xs text-green-700 mt-3">Converted → member #{form.converted_member_id}</p>
        ) : null}

        <div className="flex flex-col gap-2 mt-5">
          <button
            onClick={() => patch({
              first_name: form.first_name, last_name: form.last_name, mobile: form.mobile,
              email: form.email, source: form.source, status: form.status,
              notes: form.notes, follow_up_date: form.follow_up_date,
            })}
            disabled={saving}
            className="h-9 px-4 rounded-xl border border-teal-200 text-teal-700 hover:bg-teal-50 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={() => onConvert(form)}
            className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
          >
            Convert to Member
          </button>
          <button
            onClick={() => patch({ status: 'lost' })}
            className="h-9 px-4 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-medium"
          >
            Mark as Lost
          </button>
        </div>
      </div>
    </div>
  )
}
