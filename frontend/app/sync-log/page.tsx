"use client";

import { RequireModule } from '@/components/RequireModule';
import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Dict, ErrorBox, fetchJson, LoadingBlock } from "@/components/dashboard/dashboard-widgets";

function emptyMessage(status: string) {
  if (status === "error") return "No errors";
  if (status === "skipped") return "No skipped events";
  return "No sync events";
}

function SyncLogPage() {
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<Dict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<{ data: Dict[] }>(`/api/sync-log${status ? `?status=${status}` : ""}`);
      setLogs(json.data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sync log failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const counts = useMemo(
    () => ({
      total: logs.length,
      ok: logs.filter((row) => row.status === "ok").length,
      error: logs.filter((row) => row.status === "error").length,
    }),
    [logs],
  );

  return (
    <div className="app-frame">
      <Sidebar syncStatus={counts.error > 0 ? "error" : "active"} />
      <main className="dashboard-page">
        <div className="topbar">
          <h1 className="page-title font-head">ERP SYNC LOG</h1>
          <div className="topbar-right">
            <select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All</option>
              <option value="ok">Success</option>
              <option value="error">Errors</option>
              <option value="skipped">Skipped</option>
            </select>
            <button className="btn btn-sm" onClick={loadLogs}>
              Refresh
            </button>
          </div>
        </div>
        <div className="content">
          {loading ? <LoadingBlock text="Loading sync log..." /> : null}
          <ErrorBox message={error} />
          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">TOTAL EVENTS</div>
              <div className="stat-value font-head">{counts.total}</div>
              <div className="stat-sub">current filter</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">SUCCESSFUL ACTIVATIONS</div>
              <div className="stat-value font-head">{counts.ok}</div>
              <div className="stat-sub">status ok</div>
            </div>
            <div className="stat-card red">
              <div className="stat-label">ERRORS</div>
              <div className="stat-value font-head">{counts.error}</div>
              <div className="stat-sub">{counts.error > 0 ? "Show errors" : "clean"}</div>
            </div>
          </section>
          <section className="card">
            <div className="table-wrap mono-table">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Sale Serial</th>
                    <th>Customer ID</th>
                    <th>Product ID</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row, index) => (
                    <tr key={String(row.id ?? index)}>
                      <td className="muted">{String(row.sync_at ?? row.created_at ?? "")}</td>
                      <td>{String(row.erp_sale_serial ?? "")}</td>
                      <td className="accent">{String(row.erp_customer_id ?? "")}</td>
                      <td>{String(row.erp_product_id ?? "")}</td>
                      <td>{String(row.action ?? "")}</td>
                      <td className={String(row.status ?? "")}>{String(row.status ?? "")}</td>
                      <td title={String(row.message ?? "")}>{String(row.message ?? "").slice(0, 90)}</td>
                    </tr>
                  ))}
                  {!loading && logs.length === 0 ? (
                    <tr>
                      <td colSpan={7}>{emptyMessage(status)}</td>
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

export default function SyncLogPageGuarded() {
  return <RequireModule module="sync_log"><SyncLogPage /></RequireModule>;
}
