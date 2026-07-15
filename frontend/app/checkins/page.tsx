"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Avatar, calculateDuration, Dict, ErrorBox, fetchJson, formatTime, LoadingBlock, memberName, methodIcon } from "@/components/dashboard/dashboard-widgets";

export default function CheckinsPage() {
  const [period, setPeriod] = useState("today");
  const [checkins, setCheckins] = useState<Dict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCheckins() {
      setLoading(true);
      setError(null);
      try {
        const json = await fetchJson<{ data: Dict[] }>(`/api/checkins?period=${period}`);
        if (!cancelled) setCheckins(json.data ?? []);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Check-ins failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCheckins();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const summary = useMemo(() => {
    const unique = new Set<string>();
    const methods: Record<string, number> = { face: 0, barcode: 0, manual: 0 };
    for (const row of checkins) {
      const member = (row.gym_members as Dict | undefined) ?? {};
      unique.add(String(row.member_id ?? member.erp_customer_id ?? row.id));
      const method = methodIcon(row.method).label;
      methods[method] = (methods[method] ?? 0) + 1;
    }
    return { total: checkins.length, unique: unique.size, methods };
  }, [checkins]);

  return (
    <div className="app-frame">
      <Sidebar />
      <main className="dashboard-page">
        <div className="topbar">
          <h1 className="page-title font-head">CHECK-IN LOG</h1>
          <div className="topbar-right">
            <select className="filter-select" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
            </select>
          </div>
        </div>
        <div className="content">
          {loading ? <LoadingBlock text="Loading check-ins..." /> : null}
          <ErrorBox message={error} />
          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">TOTAL CHECK-INS</div>
              <div className="stat-value font-head">{summary.total}</div>
              <div className="stat-sub">selected period</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-label">UNIQUE MEMBERS</div>
              <div className="stat-value font-head">{summary.unique}</div>
              <div className="stat-sub">distinct visitors</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">METHOD BREAKDOWN</div>
              <div className="stat-sub">
                face {summary.methods.face ?? 0} · barcode {summary.methods.barcode ?? 0} · manual {summary.methods.manual ?? 0}
              </div>
            </div>
          </section>
          <section className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Member</th>
                    <th>ERP ID</th>
                    <th>Method</th>
                    <th>Confidence %</th>
                    <th>Check-out</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {checkins.map((row, index) => {
                    const member = (row.gym_members as Dict | undefined) ?? {};
                    const name = memberName(member);
                    const method = methodIcon(row.method);
                    return (
                      <tr key={String(row.id ?? index)}>
                        <td className="mono accent">{formatTime(row.checkin_at)}</td>
                        <td>
                          <div className="member-cell">
                            <Avatar name={name} erpId={member.erp_customer_id} photoUrl={member.photo_url} />
                            <div className="member-name">{name}</div>
                          </div>
                        </td>
                        <td className="mono muted">{String(member.erp_customer_id ?? "N/A")}</td>
                        <td>
                          <span className={method.className}>{method.icon}</span> {method.label}
                        </td>
                        <td className={method.label === "face" ? "" : "muted"}>{method.label === "face" ? String(row.match_score ?? "N/A") : "N/A"}</td>
                        <td className="mono muted">{formatTime(row.checkout_at)}</td>
                        <td className="muted">{calculateDuration(row.checkin_at, row.checkout_at)}</td>
                      </tr>
                    );
                  })}
                  {!loading && checkins.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No check-ins for this period</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
