"use client";

import { useEffect, useMemo, useState } from "react";

type WrapResponse = {
  html: string;
  member: Record<string, unknown>;
  has_email: boolean;
  email: string;
};

type Props = {
  customerId: string;
  memberName: string;
  onClose: () => void;
};

function monthOptions() {
  const out: { val: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    out.push({ val, label });
  }
  return out;
}

export function GymWrapModal({ customerId, memberName, onClose }: Props) {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0].val);
  const [data, setData] = useState<WrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/wrap/${encodeURIComponent(customerId)}?month=${month}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setToast({ msg: "Failed to load wrap", ok: false }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, month]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const hasEmail = !!data?.has_email;
  const email = data?.email ?? "";

  async function send() {
    if (!hasEmail) return;
    setSending(true);
    try {
      const res = await fetch(`/api/wrap/${encodeURIComponent(customerId)}/send?month=${month}`, {
        method: "POST",
      });
      const d = await res.json();
      if (res.ok && d.sent) setToast({ msg: `Sent to ${email}`, ok: true });
      else setToast({ msg: d.error ?? "Failed to send", ok: false });
    } catch {
      setToast({ msg: "Failed to send", ok: false });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-[560px] max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-stone-100">
          <div>
            <h2 className="text-sm font-bold text-stone-800">🎉 Gym Wrap — {memberName}</h2>
            <p className="text-xs text-stone-400 mt-0.5">Monthly summary preview</p>
          </div>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            {months.map((m) => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
        </div>

        {/* Preview (sandboxed iframe keeps email styles isolated) */}
        <div className="flex-1 min-h-[320px] bg-[#faf7f5] overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-stone-400">Loading wrap…</div>
          ) : data?.html ? (
            <iframe
              title="Gym Wrap preview"
              srcDoc={data.html}
              sandbox=""
              className="w-full h-full min-h-[320px] border-0"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-stone-400">No wrap data</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-stone-100">
          {toast && (
            <p className={`text-xs mb-2 font-medium ${toast.ok ? "text-teal-600" : "text-red-600"}`}>{toast.msg}</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-stone-400 truncate">
              {hasEmail ? <>Email: <span className="text-stone-600 font-medium">{email}</span></> : "No email on file"}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={onClose}
                className="h-9 px-4 rounded-xl border border-[#e5e5ea] text-sm font-medium text-slate-600 hover:bg-[#f2f2f7]"
              >
                Close
              </button>
              <button
                onClick={send}
                disabled={!hasEmail || sending || loading}
                className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-40"
                title={hasEmail ? `Send to ${email}` : "No email on file"}
              >
                {sending ? "Sending…" : hasEmail ? `Send to ${email}` : "No email"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
