"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import {
  Avatar,
  daysRemaining,
  Dict,
  fetchJson,
  formatDate,
  LoadingBlock,
  memberName,
  statusValue,
} from "@/components/dashboard/dashboard-widgets";

const PLANS = ["Monthly", "Yearly", "Three Months", "6 months", "Daily", "Day Pass"];

/* ── Status config (like hotel: Confirmed / Checked-in / Checked-out) ── */
type StatusKey = "active" | "frozen" | "expired" | "no_membership";

const STATUS_CFG: Record<StatusKey, { label: string; bar: string; badge: string; text: string; border: string }> = {
  active:        { label: "Active",        bar: "bg-teal-500",   badge: "bg-teal-50 text-teal-700 border-teal-200",   text: "text-teal-700",  border: "border-l-teal-500" },
  frozen:        { label: "Frozen",        bar: "bg-blue-400",   badge: "bg-blue-50 text-blue-700 border-blue-200",   text: "text-blue-700",  border: "border-l-blue-400" },
  expired:       { label: "Expired",       bar: "bg-red-400",    badge: "bg-red-50 text-red-600 border-red-200",      text: "text-red-600",   border: "border-l-red-400" },
  no_membership: { label: "No membership", bar: "bg-slate-300",  badge: "bg-slate-100 text-slate-500 border-slate-200", text: "text-slate-500", border: "border-l-slate-300" },
};

function cfg(st: string) {
  return STATUS_CFG[(st as StatusKey)] ?? STATUS_CFG.no_membership;
}

/* ── Contextual action button (Renew / Unfreeze) — omitted when there's no
   status-specific action, since "View Profile" below always covers that. ── */
function ActionButton({ st, erpId }: { st: string; erpId: unknown }) {
  const id = String(erpId ?? "");
  if (st === "expired" || st === "no_membership") {
    return (
      <Link
        href={`/members/${id}`}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-colors shadow-sm whitespace-nowrap"
      >
        Renew →
      </Link>
    );
  }
  if (st === "frozen") {
    return (
      <Link
        href={`/freeze?member=${id}`}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100 transition-colors whitespace-nowrap"
      >
        Unfreeze
      </Link>
    );
  }
  return null;
}

/* ── Always-present, unambiguously-labeled link into the member profile.
   The contextual ActionButton's label changes with status (Renew/Unfreeze),
   which reads as an action rather than navigation — this guarantees every
   card has one obvious, consistently-labeled way in. ── */
function ViewProfileButton({ erpId }: { erpId: unknown }) {
  const id = String(erpId ?? "");
  return (
    <Link
      href={`/members/${id}`}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition-colors whitespace-nowrap"
    >
      View Profile →
    </Link>
  );
}

/* ── Membership bar (like the hotel's timeline bar) ── */
function MembershipBar({ member, st }: { member: Dict; st: string }) {
  const end   = member.membership_end;
  const start = member.membership_start;
  const days  = daysRemaining(end);
  const total = end && start
    ? Math.max(1, Math.ceil((new Date(String(end)).getTime() - new Date(String(start)).getTime()) / 86_400_000))
    : Number(member.duration_days) || 30;
  const pct = Math.max(0, Math.min(100, (days / total) * 100));
  const { bar } = cfg(st);

  return (
    <div className="mt-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] font-medium text-slate-400">
          {end ? `Expires ${formatDate(end)}` : "No active membership"}
        </span>
        {Boolean(end) && (
          <span className={`text-[11px] font-bold ${days <= 7 ? "text-red-500" : days <= 30 ? "text-amber-500" : "text-slate-400"}`}>
            {days > 0 ? `${days}d left` : "Expired"}
          </span>
        )}
      </div>
      <div className="h-2 rounded-full bg-[#f2f2f7] overflow-hidden">
        <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Member Card ── */
function MemberCard({ member }: { member: Dict }) {
  const name  = memberName(member);
  const erpId = member.erp_customer_id;
  const st    = statusValue(member);
  const c     = cfg(st);
  const days  = daysRemaining(member.membership_end);

  return (
    <div className={`bg-white rounded-2xl shadow-ios hover:shadow-ios-md transition-shadow overflow-hidden border-l-4 ${c.border}`}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <Avatar name={name} erpId={erpId} photoUrl={member.photo_url} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-sm leading-tight">{name}</span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {String(erpId ?? "—")}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {String(member.mobile ?? "")}
              {member.card_id ? <span className="ml-2 text-slate-400">· Card {String(member.card_id)}</span> : null}
            </p>
          </div>

          {/* Status badge */}
          <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${c.badge}`}>
            {c.label}
          </span>
        </div>

        {/* Plan + bar */}
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-700">
              {String(member.plan_name ?? "—")}
            </p>
            <MembershipBar member={member} st={st} />
          </div>

          {/* Actions: contextual (Renew/Unfreeze) when relevant, plus an
              always-present, unambiguous "View Profile →" link. */}
          <div className="shrink-0 pb-0.5 flex items-center gap-1.5">
            <ActionButton st={st} erpId={erpId} />
            <ViewProfileButton erpId={erpId} />
          </div>
        </div>

        {/* Footer: days-remaining warning */}
        {st === "active" && days <= 14 && days > 0 ? (
          <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <span className="text-amber-500 text-xs">⚠</span>
            <span className="text-xs font-medium text-amber-700">Renewal due in {days} day{days !== 1 ? "s" : ""}</span>
          </div>
        ) : null}
        {st === "expired" ? (
          <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200">
            <span className="text-red-500 text-xs">●</span>
            <span className="text-xs font-medium text-red-600">Membership expired — action required</span>
          </div>
        ) : null}
        {st === "frozen" ? (
          <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
            <span className="text-blue-400 text-xs">❄</span>
            <span className="text-xs font-medium text-blue-700">
              Frozen since {formatDate(member.frozen_at)} — {Math.abs(days)}d remaining when resumed
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Status Legend (like hotel's Confirmed / Checked-in / Checked-out legend) ── */
function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      {(Object.entries(STATUS_CFG) as [StatusKey, typeof STATUS_CFG[StatusKey]][]).map(([key, c]) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-sm ${c.bar}`} />
          <span className="text-xs text-slate-500 font-medium">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main page ── */
export default function MembersPage() {
  const [members, setMembers]                 = useState<Dict[]>([]);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus]                   = useState("");
  const [plan, setPlan]                       = useState("");
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (status) p.set("status", status);
    if (plan)   p.set("plan",   plan);
    return p.toString();
  }, [debouncedSearch, status, plan]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const json = await fetchJson<{ data: Dict[] }>(`/api/members${query ? `?${query}` : ""}`);
        if (!cancelled) setMembers(json.data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load members");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [query]);

  /* Counts per status */
  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0, frozen: 0, expired: 0, no_membership: 0 };
    for (const m of members) { const s = statusValue(m); c[s] = (c[s] ?? 0) + 1; }
    return c;
  }, [members]);

  return (
    <div className="flex min-h-screen bg-[#f2f2f7]">
      <Sidebar />
      <main className="flex-1 min-w-0">
        {/* Top header bar */}
        <div className="bg-white border-b border-[#f2f2f7] px-7 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-slate-400 font-normal">Members</p>
            <h1 className="text-[18px] font-semibold text-[#1c1c1e] mt-0.5 leading-none tracking-tight">Member List</h1>
          </div>

          {/* Summary pills — like hotel showing "Confirmed / Checked-in" counts */}
          <div className="hidden md:flex items-center gap-2">
            {(["active", "frozen", "expired", "no_membership"] as StatusKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setStatus(status === key ? "" : key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  status === key
                    ? `${STATUS_CFG[key].badge} ring-2 ring-offset-1 ring-teal-400`
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${STATUS_CFG[key].bar}`} />
                {STATUS_CFG[key].label}
                <span className="ml-0.5 font-mono">{counts[key] ?? 0}</span>
              </button>
            ))}
          </div>

          <Link href="/members/new" className="ios-btn-primary text-sm">
            + Enrol Member
          </Link>
        </div>

        <div className="p-7">
          {/* Error */}
          {error ? (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          ) : null}

          {/* Filter bar */}
          <div className="flex flex-wrap gap-3 items-center mb-6">
            <div className="relative flex-1 min-w-[220px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                className="ios-input pl-9"
                style={{ paddingLeft: "2.25rem" }}
                placeholder="Search name, ERP ID, mobile, card…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="ios-input h-auto py-2 w-auto"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="">All plans</option>
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="text-xs text-slate-400 font-medium ml-auto">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </span>
            <StatusLegend />
          </div>

          {loading ? <LoadingBlock text="Loading members…" /> : null}

          {/* Card grid */}
          {!loading ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {members.map((member, idx) => (
                <MemberCard
                  key={String(member.id ?? member.erp_customer_id ?? idx)}
                  member={member}
                />
              ))}
              {members.length === 0 ? (
                <div className="col-span-2 py-16 text-center text-slate-400 text-sm bg-white rounded-2xl shadow-ios">
                  No members found. Try a different search or filter.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
