"use client";

import { RequireModule } from '@/components/RequireModule';
import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Avatar } from "@/components/dashboard/dashboard-widgets";
import { GymWrapModal } from "@/components/GymWrapModal";

type WrapMember = {
  id: number;
  erp_customer_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  photo_url: string | null;
  display_status: string;
  has_email: boolean;
  visits_this_month: number;
};

type BatchResult = {
  total: number;
  sent: number;
  failed: number;
  results: { customer_id: string; name: string; sent: boolean; error: string | null }[];
} | { error: string };

function monthOptions() {
  const out: { val: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      val: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-teal-50 text-teal-700",
  expired: "bg-red-50 text-red-600",
  frozen: "bg-amber-50 text-amber-700",
  no_membership: "bg-stone-100 text-stone-500",
};

function GymWrapPage() {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0].val);
  const [members, setMembers] = useState<WrapMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [fHasEmail, setFHasEmail] = useState(true);
  const [fActive, setFActive] = useState(false);
  const [fChecked, setFChecked] = useState(false);
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(new Set());
    setResult(null);
    fetch(`/api/gym-wrap/members?month=${month}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMembers(d.members ?? []); })
      .catch(() => { if (!cancelled) setMembers([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (fHasEmail && !m.has_email) return false;
      if (fActive && m.display_status !== "active") return false;
      if (fChecked && m.visits_this_month <= 0) return false;
      if (q) {
        const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLowerCase();
        if (!name.includes(q) && !String(m.erp_customer_id).toLowerCase().includes(q) && !m.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [members, fHasEmail, fActive, fChecked, search]);

  const selectableIds = filtered.filter((m) => m.has_email).map((m) => m.erp_customer_id);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selectAll() { setSelected(new Set(selectableIds)); }
  function selectNone() { setSelected(new Set()); }

  async function sendBatch() {
    setShowConfirm(false);
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/gym-wrap/send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_ids: [...selected], month }),
      });
      const d = await res.json();
      setResult(d);
    } catch {
      setResult({ error: "Send failed" });
    } finally {
      setSending(false);
    }
  }

  const monthLabel = months.find((m) => m.val === month)?.label ?? month;
  const failedResults = result && "results" in result ? result.results.filter((r) => !r.sent) : [];

  return (
    <div className="app-frame">
      <Sidebar />
      <main className="dashboard-page" style={{ background: "var(--warm-bg)" }}>
        <div className="max-w-[1280px] mx-auto space-y-4">
          <div>
            <p className="eyebrow">Send members their monthly summary</p>
            <h1 className="text-2xl font-bold text-stone-800">Gym Wrap 🎉</h1>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3">
            <select value={month} onChange={(e) => setMonth(e.target.value)}
              className="h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              {months.map((m) => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / ID / email"
              className="h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-teal-500" />
            {[
              { label: "Has email", on: fHasEmail, set: setFHasEmail },
              { label: "Active only", on: fActive, set: setFActive },
              { label: "Checked in", on: fChecked, set: setFChecked },
            ].map((f) => (
              <button key={f.label} onClick={() => f.set(!f.on)}
                className={`h-9 px-3 rounded-xl text-xs font-medium border transition-colors ${
                  f.on ? "bg-teal-50 border-teal-200 text-teal-700" : "bg-white border-[#e5e5ea] text-stone-500 hover:bg-stone-50"
                }`}>
                {f.on ? "✓ " : ""}{f.label}
              </button>
            ))}
          </div>

          {/* Bulk actions */}
          <div className="bg-white rounded-2xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
            <button onClick={selectAll} className="text-xs font-medium text-teal-600 hover:text-teal-700">Select All</button>
            <button onClick={selectNone} className="text-xs font-medium text-stone-400 hover:text-stone-600">Select None</button>
            <span className="text-xs text-stone-500">{selected.size} selected</span>
            <div className="ml-auto flex items-center gap-3">
              {sending && <span className="text-xs text-amber-600 flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                Sending {selected.size} wrap{selected.size !== 1 ? "s" : ""}…
              </span>}
              <button onClick={() => setShowConfirm(true)} disabled={selected.size === 0 || sending}
                className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-40">
                Send Wraps ({selected.size})
              </button>
            </div>
          </div>

          {/* Result summary */}
          {result && (
            "error" in result ? (
              <div className="bg-red-50 rounded-2xl px-4 py-3 text-sm text-red-600">{result.error}</div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
                <p className="text-sm font-semibold text-stone-800">
                  Sent {result.sent} · Failed {result.failed} of {result.total}
                </p>
                {failedResults.length > 0 && (
                  <div className="mt-2 text-xs text-stone-500 space-y-0.5">
                    {failedResults.map((r) => (
                      <div key={r.customer_id}><span className="text-red-500">✗</span> {r.name} — {r.error}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {/* Member table */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-left">
                    <th className="px-4 py-2.5 w-10"></th>
                    {["Member", "Email", "Visits", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-400">Loading members…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-400">No members match these filters</td></tr>
                  ) : filtered.map((m) => {
                    const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "—";
                    return (
                      <tr key={m.id} className="hover:bg-stone-50">
                        <td className="px-4 py-3">
                          <input type="checkbox" disabled={!m.has_email}
                            checked={selected.has(m.erp_customer_id)}
                            onChange={() => toggle(m.erp_customer_id)}
                            className="w-4 h-4 accent-teal-600 disabled:opacity-40" />
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setPreview({ id: m.erp_customer_id, name })} className="flex items-center gap-2.5 text-left group">
                            <Avatar name={name} erpId={m.erp_customer_id} photoUrl={m.photo_url} />
                            <span className="font-medium text-stone-700 group-hover:text-teal-700">{name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-stone-500 text-xs">
                          {m.has_email ? m.email : <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-400">no email</span>}
                        </td>
                        <td className="px-4 py-3 text-stone-600">{m.visits_this_month}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_BADGE[m.display_status] ?? "bg-stone-100 text-stone-500"}`}>
                            {String(m.display_status).replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Confirm dialog */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-bold text-stone-800">Send {monthLabel} Gym Wrap?</h2>
              <p className="text-sm text-stone-500 mt-1">This will email the wrap to {selected.size} member{selected.size !== 1 ? "s" : ""}.</p>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowConfirm(false)} className="h-9 px-4 rounded-xl border border-[#e5e5ea] text-sm font-medium text-slate-600 hover:bg-[#f2f2f7]">Cancel</button>
                <button onClick={sendBatch} className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">Send {selected.size}</button>
              </div>
            </div>
          </div>
        )}

        {preview && (
          <GymWrapModal customerId={preview.id} memberName={preview.name} onClose={() => setPreview(null)} />
        )}
      </main>
    </div>
  );
}

export default function GymWrapPageGuarded() {
  return <RequireModule module="gym_wrap"><GymWrapPage /></RequireModule>;
}
