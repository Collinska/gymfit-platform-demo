"use client";

import { RequireModule } from '@/components/RequireModule';
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Avatar, daysRemaining, Dict, ErrorBox, fetchJson, formatDate, LoadingBlock, memberName, statusValue } from "@/components/dashboard/dashboard-widgets";

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function FreezePage() {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Dict[]>([]);
  const [selected, setSelected] = useState<Dict | null>(null);
  const [frozen, setFrozen] = useState<Dict[]>([]);
  const [freezeStart, setFreezeStart] = useState(todayValue());
  const [reason, setReason] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadFrozen() {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<{ data: Dict[] }>("/api/freezes");
      setFrozen(json.data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Frozen members failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFrozen();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (search.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const json = await fetchJson<{ data: Dict[] }>(`/api/members?search=${encodeURIComponent(search)}&status=active`);
        setSuggestions(json.data ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function applyFreeze() {
    if (!selected) return;
    const membershipId = selected.membership_id ?? selected.current_membership_id ?? selected.id;
    try {
      await fetchJson("/api/freezes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_id: membershipId, reason, approved_by: approvedBy, freeze_start: freezeStart }),
      });
      setToast({ type: "success", message: "Freeze applied successfully" });
      setSelected(null);
      setSearch("");
      setReason("");
      setApprovedBy("");
      await loadFrozen();
    } catch (caught) {
      setToast({ type: "error", message: caught instanceof Error ? caught.message : "Freeze failed" });
    }
  }

  async function unfreeze(id: unknown) {
    try {
      await fetchJson(`/api/freezes/${id}/unfreeze`, { method: "POST" });
      setToast({ type: "success", message: "Membership resumed" });
      await loadFrozen();
    } catch (caught) {
      setToast({ type: "error", message: caught instanceof Error ? caught.message : "Unfreeze failed" });
    }
  }

  return (
    <div className="app-frame">
      <Sidebar />
      <main className="dashboard-page">
        <div className="topbar">
          <h1 className="page-title font-head">FREEZE / UNFREEZE</h1>
          <div className="topbar-right" />
        </div>
        <div className="content">
          {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}
          <ErrorBox message={error} />
          <section className="dashboard-grid">
            <div className="card">
              <div className="card-head">
                <h2>APPLY FREEZE</h2>
              </div>
              <div className="form-grid">
                <label>
                  Member search
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search active member..." />
                </label>
                {suggestions.length > 0 ? (
                  <div className="autocomplete">
                    {suggestions.slice(0, 8).map((row, index) => (
                      <button key={String(row.id ?? index)} onClick={() => setSelected(row)}>
                        {memberName(row)} · {String(row.erp_customer_id ?? "")}
                      </button>
                    ))}
                  </div>
                ) : null}
                {selected ? (
                  <div className="member-card">
                    <Avatar name={memberName(selected)} erpId={selected.erp_customer_id} photoUrl={selected.photo_url} />
                    <div>
                      <strong>{memberName(selected)}</strong>
                      <p>{String(selected.plan_name ?? "N/A")} · ends {formatDate(selected.membership_end)}</p>
                      <span className={`badge ${statusValue(selected)}`}>{statusValue(selected)}</span>
                    </div>
                  </div>
                ) : null}
                <label>
                  Freeze from
                  <input type="date" value={freezeStart} onChange={(event) => setFreezeStart(event.target.value)} />
                </label>
                <label>
                  Reason
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
                <label>
                  Approved by
                  <input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} />
                </label>
                <div className="info-box blue">Freeze writes to FusionERP InboxData. End date extends by frozen days on resume.</div>
                <div className="button-row">
                  <button className="btn" onClick={() => setSelected(null)}>
                    Clear
                  </button>
                  <button className="btn btn-accent" onClick={applyFreeze}>
                    Apply Freeze
                  </button>
                </div>
              </div>
            </div>
            <div>
              <section className="card">
                <div className="card-head">
                  <h2>CURRENTLY FROZEN</h2>
                </div>
                {loading ? <LoadingBlock text="Loading frozen members..." /> : null}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Since</th>
                        <th>Days frozen</th>
                        <th>Reason</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frozen.map((row, index) => {
                        const member = (row.member as Dict | undefined) ?? {};
                        const membership = (row.membership as Dict | undefined) ?? {};
                        const name = memberName(member);
                        const frozenDays = daysRemaining(row.freeze_start) * -1;
                        return (
                          <tr key={String(row.id ?? index)}>
                            <td>
                              <div className="member-cell">
                                <Avatar name={name} erpId={member.erp_customer_id} />
                                <div>
                                  <div className="member-name">{name}</div>
                                  <div className="member-id">{String(member.erp_customer_id ?? "")}</div>
                                  <div className="member-id">{String(membership.plan_name ?? "")}</div>
                                </div>
                              </div>
                            </td>
                            <td>{formatDate(row.freeze_start)}</td>
                            <td>
                              <span className={`badge ${frozenDays > 30 ? "frozen" : "active"}`}>{frozenDays}</span>
                            </td>
                            <td>{String(row.reason ?? "")}</td>
                            <td>
                              <button className="btn btn-sm" onClick={() => unfreeze(row.id)}>
                                Unfreeze
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!loading && frozen.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No frozen memberships</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card">
                <div className="card-head">
                  <h2>FREEZE HISTORY (LAST 30 DAYS)</h2>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Period</th>
                        <th>Days</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frozen.map((row, index) => {
                        const member = (row.member as Dict | undefined) ?? {};
                        return (
                          <tr key={String(row.id ?? index)}>
                            <td>{memberName(member)}</td>
                            <td>
                              {formatDate(row.freeze_start)} → {formatDate(row.freeze_end)}
                            </td>
                            <td>{Math.max(0, daysRemaining(row.freeze_start) * -1)}</td>
                            <td>{row.freeze_end ? "Resumed" : "Ongoing"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function FreezePageGuarded() {
  return <RequireModule module="freeze"><FreezePage /></RequireModule>;
}
