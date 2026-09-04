"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { GymWrapModal } from "@/components/GymWrapModal";
import { Sidebar } from "@/components/dashboard/Sidebar";
import {
  Avatar,
  calculateDuration,
  daysRemaining,
  Dict,
  fetchJson,
  formatDate,
  formatTime,
  initials,
  LoadingBlock,
  memberName,
  statusValue,
} from "@/components/dashboard/dashboard-widgets";

type MemberDetail = { member: Dict; memberships: Dict[]; checkins: Dict[]; freezes: Dict[]; totalVisits: number; lastVisit: string | null };

function amount(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  return Number(v).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:        "bg-teal-50  text-teal-700  border-teal-200",
    frozen:        "bg-amber-50 text-amber-700 border-amber-200",
    expired:       "bg-red-50   text-red-600   border-red-200",
    returned:      "bg-rose-50  text-rose-600  border-rose-200",
    no_membership: "bg-slate-100 text-slate-500 border-slate-200",
  };
  const cls = styles[status] ?? styles.no_membership;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[#f2f2f7] last:border-0">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap">{label}</span>
      <span className="text-sm text-slate-700 font-medium text-right break-words max-w-[60%]">{value}</span>
    </div>
  );
}

function PhotoControl({
  memberKey, name, photoUrl, onChange,
}: {
  memberKey: string;
  name: string;
  photoUrl: string | null | undefined;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    if (!["image/jpeg", "image/png"].includes(file.type)) { setErr("JPEG or PNG only"); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("Image must be under 5 MB"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/members/${encodeURIComponent(memberKey)}/photo`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      onChange(d.photo_url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    setUploading(true); setErr(null);
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(memberKey)}/photo`, { method: "DELETE" });
      if (!res.ok) throw new Error("Remove failed");
      onChange(null);
    } catch {
      setErr("Remove failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative group w-[72px] h-[72px]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={name} className="w-[72px] h-[72px] rounded-full object-cover" />
        ) : (
          <div className="w-[72px] h-[72px] rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-2xl font-bold">
            {initials(name)}
          </div>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 rounded-full bg-black/45 text-white text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          {uploading ? "…" : "📷 Change"}
        </button>
        {uploading && (
          <div className="absolute inset-0 rounded-full bg-white/60 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      {photoUrl && !uploading ? (
        <button onClick={remove} className="text-xs text-red-500 hover:text-red-600">Remove photo</button>
      ) : (
        !uploading && <button onClick={() => inputRef.current?.click()} className="text-xs text-teal-600 hover:text-teal-700">Upload photo</button>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  );
}

type ContractStatus = "not_generated" | "generated" | "signed";

const CONTRACT_STATUS_CFG: Record<ContractStatus, { label: string; cls: string }> = {
  not_generated: { label: "Not Generated",              cls: "bg-slate-100 text-slate-500 border-slate-200" },
  generated:     { label: "Generated — Awaiting Signature", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  signed:        { label: "Signed",                      cls: "bg-teal-50  text-teal-700  border-teal-200" },
};

function ContractCard({
  memberKey, initialStatus, initialSignedUrl,
}: {
  memberKey: string;
  initialStatus: string | null | undefined;
  initialSignedUrl: string | null | undefined;
}) {
  const [status, setStatus] = useState<ContractStatus>(
    (initialStatus as ContractStatus) in CONTRACT_STATUS_CFG ? (initialStatus as ContractStatus) : "not_generated",
  );
  const [signedUrl, setSignedUrl] = useState<string | null>(initialSignedUrl ?? null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = CONTRACT_STATUS_CFG[status];

  async function generate() {
    setGenerating(true); setErr(null);
    try {
      const res = await fetch(`/api/members/${memberKey}/contract/generate`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Contract generation failed");
      setStatus("generated");
      window.open(d.pdf_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Contract generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function uploadSigned(file: File) {
    setErr(null);
    const okType = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!okType) { setErr("PDF or image files only"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/members/${memberKey}/contract/upload`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      setStatus("signed");
      setSignedUrl(d.signed_url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-ios p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Contract</h3>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cfg.cls}`}>
          {cfg.label}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <button onClick={generate} disabled={generating} className="ios-btn-primary w-full text-sm">
          {generating ? "Generating…" : status === "not_generated" ? "Generate Contract" : "Regenerate Contract"}
        </button>

        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="ios-btn-secondary w-full text-sm">
          {uploading ? "Uploading…" : "Upload Signed Contract"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSigned(f); e.target.value = ""; }}
        />

        {status === "signed" && signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-teal-600 hover:text-teal-700 text-center mt-1"
          >
            View Signed Contract →
          </a>
        ) : null}

        {err ? <p className="text-xs text-red-500 text-center">{err}</p> : null}
      </div>
    </div>
  );
}

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail]   = useState<MemberDetail | null>(null);
  const [tab, setTab]         = useState<"sessions" | "memberships" | "freezes">("sessions");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [showWrap, setShowWrap] = useState(false);
  const [toast, setToast]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const json = await fetchJson<MemberDetail>(`/api/members/${params.id}`);
        if (!cancelled) setDetail(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load member");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [params.id]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const member             = detail?.member ?? {};
  const name               = memberName(member);
  const currentMembership  = detail?.memberships?.[0] ?? {};
  const st                 = statusValue(currentMembership);
  const days               = daysRemaining(currentMembership.membership_end);

  // Value the kiosk lookup resolves (erp_customer_id), so scanning the QR checks the member in.
  const qrValue            = String(member.erp_customer_id ?? member.card_id ?? params.id ?? "");

  function printQR() {
    const svg = document.getElementById("member-qr")?.outerHTML;
    if (!svg) return;
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><title>Check-in QR — ${name}</title></head>` +
      `<body style="margin:0;text-align:center;font-family:-apple-system,Segoe UI,sans-serif;padding:48px 24px;">` +
      `<div style="display:inline-block;padding:24px;border:1px solid #e5e5ea;border-radius:16px;">${svg}` +
      `<h2 style="margin:16px 0 4px;font-size:20px;color:#1c1c1e;">${name}</h2>` +
      `<p style="margin:0;font-family:monospace;color:#8e8e93;">${qrValue}</p></div>` +
      `<script>window.onload=function(){window.focus();window.print();}<\/script></body></html>`,
    );
    w.document.close();
  }

  const weeklySessions = useMemo(() => {
    const b = [0, 0, 0, 0];
    for (const row of detail?.checkins ?? []) {
      const d = new Date(String(row.checkin_at ?? ""));
      if (Number.isNaN(d.getTime())) continue;
      const diff = Math.floor((Date.now() - d.getTime()) / 604_800_000);
      if (diff >= 0 && diff < 4) b[3 - diff] += 1;
    }
    return b;
  }, [detail?.checkins]);
  const maxWeek = Math.max(1, ...weeklySessions);

  return (
    <div className="flex min-h-screen bg-[#f2f2f7]">
      <Sidebar />
      <main className="flex-1 p-7 min-w-0">
        {/* Toast */}
        {toast ? (
          <div className="fixed top-5 right-5 z-50 px-4 py-3 bg-slate-800 text-white text-sm font-medium rounded-xl shadow-lg">
            {toast}
          </div>
        ) : null}

        {/* Breadcrumb topbar */}
        <div className="flex items-center justify-between mb-6 max-w-[1280px] mx-auto">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/members" className="text-slate-400 hover:text-teal-600 transition-colors">Members</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-700">{name || params.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowWrap(true)} className="ios-btn-secondary text-sm">
              🎉 Gym Wrap
            </button>
            <Link
              href={`/freeze?member=${params.id}`}
              className="ios-btn-primary text-sm"
            >
              Freeze Membership
            </Link>
          </div>
        </div>

        {loading ? <div className="max-w-[1280px] mx-auto"><LoadingBlock text="Loading member…" /></div> : null}
        {error ? (
          <div className="max-w-[1280px] mx-auto px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        ) : null}

        {detail ? (
          <div className="max-w-[1280px] mx-auto grid grid-cols-[300px_1fr] gap-5 items-start">

            {/* ── Profile sidebar ── */}
            <aside className="space-y-4">
              {/* Profile card */}
              <div className="bg-white rounded-2xl shadow-ios p-6 flex flex-col items-center text-center gap-3">
                <PhotoControl
                  memberKey={String(member.erp_customer_id ?? params.id)}
                  name={name}
                  photoUrl={member.photo_url as string | null | undefined}
                  onChange={(url) =>
                    setDetail((prev) => (prev ? { ...prev, member: { ...prev.member, photo_url: url } } : prev))
                  }
                />
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{name}</h2>
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-mono">
                    {String(member.erp_customer_id ?? params.id)}
                  </span>
                </div>
                <StatusBadge status={st} />

                {currentMembership.membership_end ? (
                  <div className="w-full">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{days > 0 ? `${days}d left` : "Expired"}</span>
                      <span>{formatDate(currentMembership.membership_end)}</span>
                    </div>
                    <div className="h-1.5 bg-[#f2f2f7] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${Math.max(0, Math.min(100, (days / (Number(currentMembership.duration_days) || 30)) * 100))}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="w-full border-t border-slate-100 pt-3 mt-1 text-left space-y-0">
                  <InfoRow label="Phone"   value={String(member.mobile  ?? "—")} />
                  <InfoRow label="Email"   value={String(member.email   ?? "—")} />
                  <InfoRow label="Card ID" value={String(member.card_id ?? "—")} />
                  <InfoRow label="Face"    value={member.face_enrolled ? "Enrolled" : "Not enrolled"} />
                </div>
              </div>

              {/* Membership card */}
              <div className="bg-white rounded-2xl shadow-ios p-5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Current Membership</h3>
                <p className="text-base font-bold text-teal-600 mb-3">
                  {String(currentMembership.plan_name ?? "No plan")}
                </p>
                <div className="space-y-0">
                  <InfoRow label="Start"      value={formatDate(currentMembership.membership_start)} />
                  <InfoRow label="End"        value={formatDate(currentMembership.membership_end)} />
                  <InfoRow label="Duration"   value={`${String(currentMembership.duration_days ?? "—")} days`} />
                  <InfoRow label="Amount"     value={amount(currentMembership.sale_amount)} />
                  <InfoRow label="ERP Serial" value={String(currentMembership.erp_sale_serial ?? "—")} />
                </div>

                {st === "frozen" ? (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs text-amber-600 mb-2">Frozen since {formatDate(currentMembership.frozen_at)}</p>
                    <button className="w-full h-8 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                      Unfreeze
                    </button>
                  </div>
                ) : null}

                <div className="mt-3 pt-3 border-t border-[#f2f2f7]">
                  <button
                    className="ios-btn-secondary w-full text-sm"
                    onClick={() => setToast("Add Membership — coming soon")}
                  >
                    + Add Membership
                  </button>
                </div>
              </div>

              {/* Check-in QR card */}
              {qrValue ? (
                <div className="bg-white rounded-2xl shadow-ios p-5 flex flex-col items-center text-center">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 self-start">Check-in QR</h3>
                  <div className="p-3 bg-white rounded-xl border border-[#f2f2f7]">
                    <QRCodeSVG id="member-qr" value={qrValue} size={160} level="M" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs font-mono text-slate-400">{qrValue}</p>
                  <button onClick={printQR} className="ios-btn-secondary w-full text-sm mt-3">
                    Print QR
                  </button>
                  <Link
                    href={`/members/${params.id}/card`}
                    className="ios-btn-primary w-full text-sm mt-2 flex items-center justify-center"
                  >
                    🪪 View Membership Card
                  </Link>
                  <p className="mt-2 text-[11px] text-slate-400 leading-snug">
                    Scan at the kiosk to check in. Physical possession = access, same as a card.
                  </p>
                </div>
              ) : null}

              {/* Contract */}
              <ContractCard
                memberKey={String(member.erp_customer_id ?? params.id)}
                initialStatus={member.contract_status as string | null | undefined}
                initialSignedUrl={member.signed_contract_url as string | null | undefined}
              />
            </aside>

            {/* ── Right panel ── */}
            <section className="min-w-0">
              {/* Tabs */}
              <div className="flex gap-2 mb-4">
                {(["sessions", "memberships", "freezes"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      tab === t
                        ? "bg-teal-600 text-white shadow-ios"
                        : "bg-white text-slate-500 shadow-ios hover:text-teal-700"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* ── Sessions ── */}
              {tab === "sessions" ? (
                <div className="space-y-4">
                {/* Stats cards */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    {
                      label: "Total Visits",
                      value: String(detail.totalVisits ?? 0),
                      sub: "successful check-ins",
                    },
                    {
                      label: "Last Visit",
                      value: detail.lastVisit ? formatDate(detail.lastVisit) : "Never",
                      sub: "most recent check-in",
                    },
                    {
                      label: "Member Since",
                      value: detail.member.created_at
                        ? new Date(String(detail.member.created_at)).toLocaleString("en-KE", { month: "short", year: "numeric" })
                        : "—",
                      sub: "joined platform",
                    },
                  ].map((c) => (
                    <div key={c.label} className="bg-white rounded-2xl shadow-ios p-4">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{c.label}</p>
                      <p className="text-2xl font-bold text-slate-900">{c.value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-2xl shadow-ios p-5">
                  {/* Weekly bar chart */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Weekly Sessions</p>
                  <div className="grid grid-cols-4 gap-3 mb-5 h-24">
                    {weeklySessions.map((count, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div className="flex-1 w-full flex items-end bg-slate-100 rounded overflow-hidden">
                          <div
                            className="w-full rounded-t bg-teal-500"
                            style={{ height: `${Math.max(8, (count / maxWeek) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">W{i + 1}</span>
                        <span className="text-xs font-bold text-slate-600">{count}</span>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#f2f2f7]">
                          {["Date", "Time", "Method", "Notes"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {detail.checkins.map((row, i) => {
                          const denied = String(row.notes ?? "").includes("Access denied")
                          const methodColors: Record<string, string> = {
                            barcode: "bg-slate-100 text-slate-600",
                            face:    "bg-teal-50 text-teal-700",
                            qr:      "bg-violet-50 text-violet-700",
                            manual:  "bg-slate-200 text-slate-700",
                          }
                          const methodCls = methodColors[String(row.method ?? "")] ?? "bg-slate-100 text-slate-500"
                          return (
                            <tr key={String(row.id ?? i)} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5 text-slate-700">{formatDate(row.checkin_at)}</td>
                              <td className="px-3 py-2.5 font-mono text-teal-600 text-xs">{formatTime(row.checkin_at)}</td>
                              <td className="px-3 py-2.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${methodCls}`}>
                                  {String(row.method ?? "—")}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-xs">
                                {denied
                                  ? <span className="text-red-500 font-medium">Denied</span>
                                  : <span className="text-slate-400">{String(row.notes ?? "—")}</span>
                                }
                              </td>
                            </tr>
                          )
                        })}
                        {detail.checkins.length === 0 ? (
                          <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400 text-sm">No check-in history</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
                </div>
              ) : null}

              {/* ── Memberships ── */}
              {tab === "memberships" ? (
                <div className="bg-white rounded-2xl shadow-ios overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {["Plan", "Status", "Start", "End", "Amount", "Days", "ERP Serial"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.memberships.map((row, i) => (
                          <tr key={String(row.id ?? i)} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-semibold text-slate-900">{String(row.plan_name ?? "—")}</td>
                            <td className="px-4 py-3"><StatusBadge status={statusValue(row)} /></td>
                            <td className="px-4 py-3 text-slate-600">{formatDate(row.membership_start)}</td>
                            <td className="px-4 py-3 text-slate-600">{formatDate(row.membership_end)}</td>
                            <td className="px-4 py-3 text-slate-700 font-medium">{amount(row.sale_amount)}</td>
                            <td className="px-4 py-3 text-slate-500">{String(row.duration_days ?? "—")}</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-400">{String(row.erp_sale_serial ?? "—")}</td>
                          </tr>
                        ))}
                        {detail.memberships.length === 0 ? (
                          <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">No membership history</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* ── Freezes ── */}
              {tab === "freezes" ? (
                <div className="bg-white rounded-2xl shadow-ios overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {["From", "To", "Days Frozen", "Reason", "Approved By", "Status"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.freezes.map((row, i) => (
                          <tr key={String(row.id ?? i)} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-700">{formatDate(row.freeze_start)}</td>
                            <td className="px-4 py-3 text-slate-700">{formatDate(row.freeze_end)}</td>
                            <td className="px-4 py-3 text-slate-600">{String(row.days_frozen ?? row.freeze_days ?? "—")}</td>
                            <td className="px-4 py-3 text-slate-600">{String(row.reason ?? "—")}</td>
                            <td className="px-4 py-3 text-slate-600">{String(row.approved_by ?? "—")}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${row.freeze_end ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
                                {row.freeze_end ? "Resumed" : "Ongoing"}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {detail.freezes.length === 0 ? (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">No freeze history</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </main>

      {showWrap && (
        <GymWrapModal
          customerId={String(member.erp_customer_id ?? params.id)}
          memberName={name || String(params.id)}
          onClose={() => setShowWrap(false)}
        />
      )}
    </div>
  );
}
