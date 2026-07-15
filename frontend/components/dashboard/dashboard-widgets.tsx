"use client";

import Image from "next/image";

export type Dict = Record<string, unknown>;

export type StatsResponse = {
  active_members: number;
  frozen_members: number;
  expired_this_week: number;
  checkins_today: number;
  sync_errors_today?: number;
  weekly_checkins: Record<string, number>;
  plan_mix: Record<string, number>;
  expiring_soon: Dict[];
};

export const emptyStats: StatsResponse = {
  active_members: 0,
  frozen_members: 0,
  expired_this_week: 0,
  checkins_today: 0,
  sync_errors_today: 0,
  weekly_checkins: {},
  plan_mix: {},
  expiring_soon: [],
};

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return (await response.json()) as T;
}

export function formatDate(value: unknown) {
  if (!value) return "N/A";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(value: unknown) {
  if (!value) return "N/A";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function avatarColorClass(erpCustomerId: unknown) {
  const value = String(erpCustomerId ?? "0");
  const last = value[value.length - 1] ?? "0";
  const index = Number.parseInt(last, 16);
  return `avatar-${Number.isNaN(index) ? 0 : index % 5}`;
}

export function daysRemaining(value: unknown) {
  if (!value) return 0;
  const end = new Date(String(value));
  if (Number.isNaN(end.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}

export function memberName(row: Dict) {
  const first = row.first_name ? String(row.first_name) : "";
  const last = row.last_name ? String(row.last_name) : "";
  const name = `${first} ${last}`.trim();
  return name || String(row.member_name ?? row.full_name ?? "Unknown member");
}

export function statusValue(row: Dict) {
  return String(row.display_status ?? row.status ?? "no_membership");
}

export function LoadingBlock({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="loading">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="info-box red">{message}</div>;
}

export function Avatar({ name, erpId, photoUrl, size = "sm" }: { name: string; erpId?: unknown; photoUrl?: unknown; size?: "sm" | "lg" }) {
  const colorClass = avatarColorClass(erpId);
  if (size === "lg") {
    const cls = `avatar avatar-lg ${colorClass}`;
    if (photoUrl) return <Image alt="" className={cls} height={72} src={String(photoUrl)} unoptimized width={72} />;
    return <div className={cls}>{initials(name)}</div>;
  }
  const cls = `avatar ${colorClass}`;
  if (photoUrl) return <Image alt="" className={cls} height={34} src={String(photoUrl)} unoptimized width={34} />;
  return <div className={cls}>{initials(name)}</div>;
}

export function StatCard({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: number;
  subtitle: string;
  tone?: "red" | "amber" | "blue";
}) {
  return (
    <div className={`stat-card${tone ? ` ${tone}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value font-head">{value.toLocaleString()}</div>
      <div className="stat-sub">{subtitle}</div>
    </div>
  );
}

export function StatsCards({ stats, variant = "dashboard" }: { stats: StatsResponse; variant?: "dashboard" | "reports" }) {
  const reportMode = variant === "reports";
  return (
    <section className="stats-grid">
      <StatCard label="ACTIVE MEMBERS" value={stats.active_members} subtitle={reportMode ? "active trend baseline" : "live memberships"} />
      <StatCard label="FROZEN" value={stats.frozen_members} subtitle={reportMode ? "freeze volume" : "paused plans"} tone="blue" />
      <StatCard label={reportMode ? "EXPIRING SOON" : "EXPIRING SOON"} value={stats.expiring_soon.length} subtitle={reportMode ? "renewal pipeline" : "next 14 days"} tone="amber" />
      <StatCard label="CHECK-INS TODAY" value={stats.checkins_today} subtitle={reportMode ? "daily traffic" : "sessions today"} />
    </section>
  );
}

export function DayLabel({ dateKey }: { dateKey: string }) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return <>{dateKey.slice(5)}</>;
  return <>{date.toLocaleDateString("en-GB", { weekday: "short" })}</>;
}

export function WeeklyCheckinsChart({ weeklyCheckins }: { weeklyCheckins: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(weeklyCheckins));
  return (
    <div className="bar-chart">
      {Object.entries(weeklyCheckins).map(([date, count]) => (
        <div className="bar-col" key={date} title={`${date}: ${count} check-ins`}>
          <div className="bar-track">
            <div className="bar" style={{ height: `${Math.max(8, (count / max) * 100)}%` }} />
          </div>
          <span>
            <DayLabel dateKey={date} />
          </span>
          <strong>{count}</strong>
        </div>
      ))}
    </div>
  );
}

export function PlanMixList({ planMix }: { planMix: Record<string, number> }) {
  const total = Object.values(planMix).reduce((sum, value) => sum + value, 0);
  return (
    <div className="progress-list">
      {Object.entries(planMix).map(([plan, count]) => {
        const percentage = total ? Math.round((count / total) * 100) : 0;
        return (
          <div className="progress-row" key={plan}>
            <div className="progress-label">
              <span>{plan}</span>
              <strong>
                {count} · {percentage}%
              </strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${percentage}%` }} />
            </div>
          </div>
        );
      })}
      {Object.keys(planMix).length === 0 ? <p className="empty-state">No active plan data available.</p> : null}
    </div>
  );
}

export function ExpiringSoonTable({ rows, showView = false }: { rows: Dict[]; showView?: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>ERP ID</th>
            <th>Plan</th>
            <th>Expires</th>
            <th>Days Left</th>
            {showView ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const name = memberName(row);
            const erpId = row.erp_customer_id;
            const days = daysRemaining(row.membership_end);
            return (
              <tr key={String(row.id ?? erpId ?? index)}>
                <td>
                  <div className="member-cell">
                    <Avatar name={name} erpId={erpId} photoUrl={row.photo_url} />
                    <div>
                      <div className="member-name">{name}</div>
                      <div className="member-id">{String(row.mobile ?? "")}</div>
                    </div>
                  </div>
                </td>
                <td className="mono muted">{String(erpId ?? "N/A")}</td>
                <td>{String(row.plan_name ?? "N/A")}</td>
                <td>{formatDate(row.membership_end)}</td>
                <td>
                  <span className={`badge ${days <= 7 ? "expired" : "frozen"}`}>{days}</span>
                </td>
                {showView ? (
                  <td>
                    <a className="btn btn-sm" href={`/members/${erpId ?? row.id}`}>
                      View
                    </a>
                  </td>
                ) : null}
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={showView ? 6 : 5}>No active memberships expiring in the next 14 days.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function methodIcon(method: unknown) {
  const value = String(method ?? "manual").toLowerCase();
  if (value.includes("face")) return { icon: "◉", className: "method-icon face", label: "face" };
  if (value.includes("bar")) return { icon: "▦", className: "method-icon barcode", label: "barcode" };
  return { icon: "✎", className: "method-icon manual", label: "manual" };
}

export function calculateDuration(start: unknown, end: unknown) {
  if (!start || !end) return "N/A";
  const startDate = new Date(String(start));
  const endDate = new Date(String(end));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "N/A";
  const minutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
