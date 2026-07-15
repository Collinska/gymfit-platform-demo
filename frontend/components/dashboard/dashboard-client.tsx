"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, CalendarClock, Clock, Snowflake, UserPlus, Users } from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import {
  RevenueAreaChart,
  CheckinsAreaChart,
  MemberStatusDonut,
  WarmPlanMix,
} from "@/components/dashboard/charts";
import {
  Avatar,
  Dict,
  emptyStats,
  ErrorBox,
  fetchJson,
  formatTime,
  LoadingBlock,
  memberName,
  methodIcon,
  StatsResponse,
} from "@/components/dashboard/dashboard-widgets";

type CheckinsResponse  = { data: Dict[] };
type ExpiringResponse  = { expiring_soon: Dict[]; recently_expired: Dict[] };
type AnalyticsResponse = {
  monthly_revenue: Array<{ month: string; revenue: number }>;
  status_counts: Record<string, number>;
  new_this_month: number;
};

const CARD = "bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.05)] p-6";

const TINT: Record<string, { chip: string; bar: string }> = {
  teal:  { chip: "bg-teal-50 text-teal-600",       bar: "bg-teal-500" },
  coral: { chip: "bg-[#fff1ef] text-[#f97362]",    bar: "bg-[#f97362]" },
  amber: { chip: "bg-amber-50 text-amber-500",     bar: "bg-amber-400" },
  blue:  { chip: "bg-blue-50 text-blue-500",       bar: "bg-blue-400" },
};

function fmtDate(val: unknown) {
  if (!val) return "—";
  return new Date(String(val)).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function triggerCsv(rows: Dict[], filename: string, headers: string[], cols: (keyof Dict)[]) {
  const lines = [
    headers.join(","),
    ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function DashboardClient() {
  const [stats,    setStats]    = useState<StatsResponse>(emptyStats);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [checkins, setCheckins] = useState<Dict[]>([]);
  const [expiringSoon,    setExpiringSoon]    = useState<Dict[]>([]);
  const [recentlyExpired, setRecentlyExpired] = useState<Dict[]>([]);
  const [expiringTab, setExpiringTab] = useState<"expiring" | "expired">("expiring");
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [now,     setNow]     = useState(new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      setLoading(true);
      setError(null);
      try {
        const [statsJson, checkinsJson, expiringJson, analyticsJson] = await Promise.all([
          fetchJson<StatsResponse>("/api/stats"),
          fetchJson<CheckinsResponse>("/api/checkins?period=today&limit=8"),
          fetchJson<ExpiringResponse>("/api/members/expiring"),
          fetchJson<AnalyticsResponse>("/api/analytics").catch(() => null),
        ]);
        if (!cancelled) {
          setStats(statsJson);
          setCheckins(checkinsJson.data ?? []);
          setExpiringSoon(expiringJson.expiring_soon ?? []);
          setRecentlyExpired(expiringJson.recently_expired ?? []);
          if (analyticsJson) setAnalytics(analyticsJson);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Dashboard data failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDashboard();
    return () => { cancelled = true; };
  }, []);

  const syncOk = (stats.sync_errors_today ?? 0) === 0;
  const currentTime      = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const shortCurrentTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date().toISOString().slice(0, 10);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning 👋" : hour < 18 ? "Good afternoon 👋" : "Good evening 👋";
  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const checkinChart = Object.entries(stats.weekly_checkins).map(([date, count]) => ({
    day: new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" }),
    count,
  }));
  const expiring7 = expiringSoon.filter((r) => Number(r.days_remaining ?? 99) <= 7).length;

  const hero = [
    { label: "Active Members", value: stats.active_members,      sub: "live memberships", Icon: Users,        tint: "teal"  },
    { label: "Check-ins Today", value: stats.checkins_today,     sub: "sessions today",   Icon: Activity,     tint: "coral" },
    { label: "Expiring Soon",   value: stats.expiring_soon.length, sub: "next 14 days",   Icon: CalendarClock, tint: "amber" },
    { label: "Frozen",          value: stats.frozen_members,     sub: "paused plans",     Icon: Snowflake,    tint: "blue"  },
  ];

  const glance = [
    { Icon: Activity, value: stats.checkins_today,          label: "Check-ins today" },
    { Icon: UserPlus, value: analytics?.new_this_month ?? 0, label: "New this month" },
    { Icon: Users,    value: stats.active_members,          label: "Active members" },
    { Icon: Clock,    value: expiring7,                     label: "Expiring in 7 days" },
  ];

  function exportExpiring() {
    if (expiringTab === "expiring") {
      triggerCsv(
        expiringSoon,
        `expiring_soon_${today}.csv`,
        ["Name", "Plan", "Expires", "Days Left", "Mobile"],
        ["first_name", "plan_name", "membership_end", "days_remaining", "mobile"],
      );
    } else {
      triggerCsv(
        recentlyExpired,
        `recently_expired_${today}.csv`,
        ["Name", "Plan", "Expired", "Mobile"],
        ["first_name", "plan_name", "membership_end", "mobile"],
      );
    }
  }

  const activeRows = expiringTab === "expiring" ? expiringSoon : recentlyExpired;
  const bothEmpty  = expiringSoon.length === 0 && recentlyExpired.length === 0;

  return (
    <div className="app-frame">
      <Sidebar syncStatus={syncOk ? "active" : "error"} lastSyncTime={mounted ? shortCurrentTime : "--:--"} />
      <main className="dashboard-page" style={{ background: "var(--warm-bg)" }}>
        <div className="max-w-[1280px] mx-auto space-y-5">

          {/* ── Warm greeting header ── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg text-stone-500">{mounted ? greeting : "Welcome 👋"}</p>
              <h1 className="text-2xl font-bold text-stone-800 mt-0.5 tracking-tight">
                Here&apos;s how Fitness Mania is doing today
              </h1>
              <p className="text-xs text-stone-400 mt-1.5" suppressHydrationWarning>
                {mounted ? `${dateStr} · ${currentTime}` : ""}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
                syncOk ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${syncOk ? "bg-green-500" : "bg-red-500"}`} />
              {syncOk ? "Live" : "Sync error"}
            </span>
          </div>

          {loading ? <LoadingBlock text="Loading dashboard..." /> : null}
          <ErrorBox message={error} />

          {/* ── Hero stat cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {hero.map((h) => (
              <div key={h.label} className={`${CARD} relative overflow-hidden`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${TINT[h.tint].chip}`}>
                  <h.Icon size={18} />
                </div>
                <p className="text-[11px] uppercase tracking-wide text-stone-400 font-semibold mt-3">{h.label}</p>
                <p className="text-3xl font-bold text-stone-800 mt-1">{h.value.toLocaleString()}</p>
                <p className="text-xs text-stone-400 mt-0.5">{h.sub}</p>
                <div className={`absolute bottom-0 left-0 h-1 w-full ${TINT[h.tint].bar} opacity-70`} />
              </div>
            ))}
          </div>

          {/* ── Today at a glance ── */}
          <div className={`${CARD} !py-4 flex flex-wrap items-center`}>
            {glance.map((g, i) => (
              <div key={i} className="flex items-center gap-3 px-5 first:pl-0 border-l first:border-l-0 border-stone-100 flex-1 min-w-[160px] py-1">
                <div className="w-8 h-8 rounded-full bg-stone-50 flex items-center justify-center text-stone-400">
                  <g.Icon size={16} />
                </div>
                <div>
                  <p className="text-xl font-bold text-stone-800 leading-none">{g.value.toLocaleString()}</p>
                  <p className="text-xs text-stone-400 mt-1">{g.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Charts row 1 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className={`${CARD} lg:col-span-2`}>
              <h2 className="text-sm font-bold text-stone-700 mb-4">Revenue — Last 6 Months</h2>
              <RevenueAreaChart data={analytics?.monthly_revenue ?? []} />
            </div>
            <div className={CARD}>
              <h2 className="text-sm font-bold text-stone-700 mb-4">Member Status</h2>
              <MemberStatusDonut data={analytics?.status_counts ?? {}} />
            </div>
          </div>

          {/* ── Charts row 2 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className={CARD}>
              <h2 className="text-sm font-bold text-stone-700 mb-4">Check-ins This Week</h2>
              <CheckinsAreaChart data={checkinChart} />
            </div>
            <div className={CARD}>
              <h2 className="text-sm font-bold text-stone-700 mb-4">Top Plans</h2>
              <WarmPlanMix planMix={stats.plan_mix} />
            </div>
          </div>

          {/* ── Alerts ── */}
          {stats.expiring_soon.length > 0 || stats.frozen_members > 0 ? (
            <div className={CARD}>
              <h2 className="text-sm font-bold text-stone-700 mb-3">⚠ Alerts</h2>
              <div className="space-y-2">
                {stats.expiring_soon.map((row, index) => (
                  <div
                    key={String(row.id ?? row.erp_customer_id ?? index)}
                    className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#fff7ed] text-amber-800 text-sm"
                  >
                    <span>{memberName(row)} expires soon</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {String(row.days_remaining ?? "") || "renew"}
                    </span>
                  </div>
                ))}
                {stats.frozen_members > 0 ? (
                  <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 text-blue-800 text-sm">
                    <span>{stats.frozen_members} frozen memberships require monitoring</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">info</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ── Recent Check-ins ── */}
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="text-sm font-bold text-stone-700">Recent Check-ins</h2>
              <Link href="/checkins" className="text-xs text-teal-600 font-medium hover:text-teal-700">View all →</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-left">
                    {["Time", "Member", "Method", "Status"].map((h) => (
                      <th key={h} className="px-6 py-2.5 text-xs font-semibold text-stone-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {checkins.map((row, index) => {
                    const member = (row.gym_members as Dict | undefined) ?? {};
                    const name   = memberName(member);
                    const method = methodIcon(row.method);
                    return (
                      <tr key={String(row.id ?? index)} className="hover:bg-stone-50">
                        <td className="px-6 py-3 font-mono text-teal-600 text-xs">{formatTime(row.checkin_at)}</td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={name} erpId={member.erp_customer_id} photoUrl={member.photo_url} />
                            <span className="font-medium text-stone-700">{name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-stone-500">
                          <span className={method.className}>{method.icon}</span> {method.label}
                        </td>
                        <td className="px-6 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700">Checked in</span>
                        </td>
                      </tr>
                    );
                  })}
                  {checkins.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-stone-400">No check-ins yet today</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Membership Renewal Reminders ── */}
          <section className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-stone-100">
              <div>
                <h2 className="text-sm font-bold text-stone-700">⚠ Membership Reminders</h2>
                <p className="text-xs text-stone-400 mt-0.5">Expiring soon and recently expired members</p>
              </div>
              {!bothEmpty && (
                <button
                  onClick={exportExpiring}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors"
                >
                  Export CSV
                </button>
              )}
            </div>

            {!bothEmpty && (
              <div className="flex border-b border-stone-100">
                <button
                  onClick={() => setExpiringTab("expiring")}
                  className={`px-6 py-2.5 text-xs font-semibold transition-colors ${
                    expiringTab === "expiring"
                      ? "border-b-2 border-teal-600 text-teal-700"
                      : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  Expiring Soon ({expiringSoon.length})
                </button>
                <button
                  onClick={() => setExpiringTab("expired")}
                  className={`px-6 py-2.5 text-xs font-semibold transition-colors ${
                    expiringTab === "expired"
                      ? "border-b-2 border-[#f97362] text-[#f97362]"
                      : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  Recently Expired ({recentlyExpired.length})
                </button>
              </div>
            )}

            {bothEmpty ? (
              <div className="px-6 py-5">
                <p className="text-sm text-teal-600 font-medium">✓ No memberships expiring or recently expired</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100">
                      {(expiringTab === "expiring"
                        ? ["Member", "Plan", "Expires", "Days Left", "Mobile"]
                        : ["Member", "Plan", "Expired", "Days Ago", "Mobile"]
                      ).map((h) => (
                        <th key={h} className="px-6 py-2.5 text-left text-xs font-semibold text-stone-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {activeRows.map((row, i) => {
                      const name = [String(row.first_name ?? ""), String(row.last_name ?? "")].filter(Boolean).join(" ") || "—";
                      const endDate = fmtDate(row.membership_end);

                      if (expiringTab === "expiring") {
                        const days = Number(row.days_remaining ?? 0);
                        const daysCls = days <= 3
                          ? "bg-red-100 text-red-700"
                          : days <= 7
                          ? "bg-amber-100 text-amber-700"
                          : "bg-green-100 text-green-700";
                        return (
                          <tr key={String(row.id ?? i)} className="hover:bg-stone-50 cursor-pointer"
                            onClick={() => window.location.href = `/members/${row.erp_customer_id}`}>
                            <td className="px-6 py-3 font-medium text-stone-700">{name}</td>
                            <td className="px-6 py-3 text-stone-500">{String(row.plan_name ?? "—")}</td>
                            <td className="px-6 py-3 text-stone-600">{endDate}</td>
                            <td className="px-6 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${daysCls}`}>{days}</span>
                            </td>
                            <td className="px-6 py-3 text-stone-500 font-mono text-xs">{String(row.mobile ?? "—")}</td>
                          </tr>
                        );
                      }
                      const daysAgo = row.membership_end
                        ? Math.floor((Date.now() - new Date(String(row.membership_end)).getTime()) / 86_400_000)
                        : null;
                      return (
                        <tr key={String(row.id ?? i)} className="hover:bg-stone-50 cursor-pointer"
                          onClick={() => window.location.href = `/members/${row.erp_customer_id}`}>
                          <td className="px-6 py-3 font-medium text-stone-700">{name}</td>
                          <td className="px-6 py-3 text-stone-500">{String(row.plan_name ?? "—")}</td>
                          <td className="px-6 py-3 text-stone-600">{endDate}</td>
                          <td className="px-6 py-3">
                            {daysAgo !== null && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">{daysAgo}</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-stone-500 font-mono text-xs">{String(row.mobile ?? "—")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
