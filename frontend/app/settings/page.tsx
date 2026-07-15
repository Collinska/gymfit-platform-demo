"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { RequireModule } from "@/components/RequireModule";
import { StaffManagement } from "@/components/settings/StaffManagement";
import { RolePermissions } from "@/components/settings/RolePermissions";
import { BusinessProfile } from "@/components/settings/BusinessProfile";

// ── Toggle component ───────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        checked ? "bg-teal-600" : "bg-[#e5e5ea]"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Settings = {
  pos_enforce_stock_check: boolean;
  auto_revoke_enabled: boolean;
};

type SyncStatus = {
  worker_alive:            boolean;
  last_heartbeat:          string | null;
  last_sync_at:            string | null;
  membership_count:        number;
  member_count:            number;
  processed_serials_count: number;
};

const DEFAULTS: Settings = { pos_enforce_stock_check: true, auto_revoke_enabled: false };

type Smtp = {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from_name: string;
  smtp_from_email: string;
  smtp_use_tls: boolean;
  email_throttle_seconds: number;
};

const SMTP_DEFAULTS: Smtp = {
  smtp_host: "", smtp_port: 587, smtp_user: "", smtp_password: "",
  smtp_from_name: "Fitness Mania", smtp_from_email: "", smtp_use_tls: true,
  email_throttle_seconds: 3,
};

const FIELD = "w-full h-9 px-3 mt-1 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500";

// ── Page ───────────────────────────────────────────────────────────────────────

function SettingsPage() {
  const { staff } = useAuth();
  const role = staff?.role ?? null;
  const canManageRevoke = role === "admin";
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [toast,    setToast]    = useState<string | null>(null);

  const [syncStatus,      setSyncStatus]      = useState<SyncStatus | null>(null);
  const [syncStatusError, setSyncStatusError] = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [resyncing,       setResyncing]       = useState(false);
  const [resyncCooldown,  setResyncCooldown]  = useState(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [smtp,        setSmtp]        = useState<Smtp>(SMTP_DEFAULTS);
  const [savingSmtp,  setSavingSmtp]  = useState(false);
  const [testEmail,   setTestEmail]   = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // ── Load settings ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings({ ...DEFAULTS, ...d });
        setSmtp((prev) => ({
          smtp_host:              d.smtp_host ?? prev.smtp_host,
          smtp_port:              Number(d.smtp_port ?? prev.smtp_port),
          smtp_user:              d.smtp_user ?? prev.smtp_user,
          smtp_password:          d.smtp_password ?? prev.smtp_password,
          smtp_from_name:         d.smtp_from_name ?? prev.smtp_from_name,
          smtp_from_email:        d.smtp_from_email ?? prev.smtp_from_email,
          smtp_use_tls:           d.smtp_use_tls ?? prev.smtp_use_tls,
          email_throttle_seconds: Number(d.email_throttle_seconds ?? prev.email_throttle_seconds),
        }));
      })
      .catch(() => {});
  }, []);

  // ── Load + poll sync status every 30s ────────────────────────────────────────

  async function fetchSyncStatus() {
    try {
      const res = await fetch("/api/sync/status");
      if (!res.ok) throw new Error();
      setSyncStatus(await res.json());
      setSyncStatusError(false);
    } catch {
      setSyncStatusError(true);
    }
  }

  useEffect(() => {
    fetchSyncStatus();
    syncIntervalRef.current = setInterval(fetchSyncStatus, 30_000);
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, []);

  // ── Setting toggle ───────────────────────────────────────────────────────────

  async function toggle(key: keyof Settings, value: boolean) {
    setSaving(key);
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast("Saved");
    } catch {
      setSettings((prev) => ({ ...prev, [key]: !value }));
      showToast("Failed to save");
    } finally {
      setSaving(null);
    }
  }

  // ── Email (SMTP) ─────────────────────────────────────────────────────────────

  async function saveSmtp() {
    setSavingSmtp(true);
    try {
      const entries: Array<[string, unknown]> = [
        ["smtp_host", smtp.smtp_host],
        ["smtp_port", Number(smtp.smtp_port)],
        ["smtp_user", smtp.smtp_user],
        ["smtp_password", smtp.smtp_password],
        ["smtp_from_name", smtp.smtp_from_name],
        ["smtp_from_email", smtp.smtp_from_email],
        ["smtp_use_tls", smtp.smtp_use_tls],
        ["email_throttle_seconds", Number(smtp.email_throttle_seconds)],
      ];
      for (const [key, value] of entries) {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) throw new Error();
      }
      showToast("Email settings saved");
    } catch {
      showToast("Failed to save email settings");
    } finally {
      setSavingSmtp(false);
    }
  }

  async function sendTest() {
    if (!testEmail.trim()) { showToast("Enter a recipient email"); return; }
    setSendingTest(true);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail.trim() }),
      });
      const d = await res.json();
      if (res.ok && d.sent) {
        showToast("Test email sent — check the inbox");
      } else {
        showToast(d.error ?? "Failed to send test email");
      }
    } catch {
      showToast("Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  }

  // ── Force resync ─────────────────────────────────────────────────────────────

  async function handleResync() {
    setShowConfirm(false);
    setResyncing(true);
    setResyncCooldown(true);
    try {
      const res  = await fetch("/api/sync/resync", { method: "POST" });
      const data = await res.json();
      if (data.status === "ok") {
        showToast("Sync state cleared successfully. Re-sync will begin shortly.");
        await fetchSyncStatus();
      } else {
        showToast(`Resync failed: ${data.message ?? "Unknown error"}`);
      }
    } catch {
      showToast("Resync failed: Sync API unavailable");
    } finally {
      setResyncing(false);
      setTimeout(() => setResyncCooldown(false), 10_000);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Formatting helpers ───────────────────────────────────────────────────────

  function fmtDatetime(val: string | null): string {
    if (!val) return "Never";
    try {
      return new Date(val).toLocaleString("en-KE", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return val;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f2f2f7] p-5 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <a href="/dashboard" className="text-slate-400 hover:text-slate-600 text-sm">← Back</a>
        <h1 className="text-xl font-bold text-[#1c1c1e]">Settings</h1>
      </div>

      {/* Staff & Access — admin only */}
      {role === "admin" && <StaffManagement />}

      {/* Roles & Permissions — admin only */}
      {role === "admin" && <RolePermissions />}

      {/* Business Profile — anyone with settings access */}
      <BusinessProfile />

      {/* Point of Sale */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          Point of Sale
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-[#f2f2f7]">
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex-1 pr-4">
              <p className="text-sm font-semibold text-[#1c1c1e]">Block out-of-stock items</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Items with zero stock at Parklands cannot be sold when enabled
              </p>
            </div>
            <Toggle
              checked={settings.pos_enforce_stock_check}
              onChange={(v) => toggle("pos_enforce_stock_check", v)}
              disabled={saving === "pos_enforce_stock_check"}
            />
          </div>
        </div>
      </div>

      {/* Memberships */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          Memberships
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-[#f2f2f7]">
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex-1 pr-4">
              <p className="text-sm font-semibold text-[#1c1c1e]">Auto-revoke on sale return</p>
              <p className="text-xs text-slate-400 mt-0.5">
                When enabled, a membership refunded/returned in the ERP is automatically
                cancelled here and remaining dates re-stacked. When off, returns are left for
                manual review.
              </p>
              {!canManageRevoke && (
                <p className="text-xs text-rose-500 mt-1">
                  🔒 Only Admin or Manager roles can change this.
                </p>
              )}
            </div>
            <Toggle
              checked={settings.auto_revoke_enabled}
              onChange={(v) => toggle("auto_revoke_enabled", v)}
              disabled={saving === "auto_revoke_enabled" || !canManageRevoke}
            />
          </div>
        </div>
      </div>

      {/* Email (SMTP) */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          Email (SMTP)
        </p>
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block text-xs text-slate-500">
              SMTP Host
              <input className={FIELD} value={smtp.smtp_host} placeholder="smtp.gmail.com"
                onChange={(e) => setSmtp({ ...smtp, smtp_host: e.target.value })} />
            </label>
            <label className="block text-xs text-slate-500">
              Port
              <input type="number" className={FIELD} value={smtp.smtp_port}
                onChange={(e) => setSmtp({ ...smtp, smtp_port: Number(e.target.value) })} />
            </label>
            <div className="flex items-end justify-between pb-1">
              <span className="text-xs text-slate-500">Use TLS</span>
              <Toggle checked={smtp.smtp_use_tls} onChange={(v) => setSmtp({ ...smtp, smtp_use_tls: v })} />
            </div>
            <label className="block text-xs text-slate-500">
              Username
              <input className={FIELD} value={smtp.smtp_user}
                onChange={(e) => setSmtp({ ...smtp, smtp_user: e.target.value })} />
            </label>
            <label className="block text-xs text-slate-500">
              Password
              <input type="password" className={FIELD} value={smtp.smtp_password} placeholder="••••••••"
                onChange={(e) => setSmtp({ ...smtp, smtp_password: e.target.value })} />
            </label>
            <label className="block text-xs text-slate-500">
              From Name
              <input className={FIELD} value={smtp.smtp_from_name}
                onChange={(e) => setSmtp({ ...smtp, smtp_from_name: e.target.value })} />
            </label>
            <label className="block text-xs text-slate-500">
              From Email
              <input type="email" className={FIELD} value={smtp.smtp_from_email} placeholder="noreply@fitnessmania.co"
                onChange={(e) => setSmtp({ ...smtp, smtp_from_email: e.target.value })} />
            </label>
            <label className="col-span-2 block text-xs text-slate-500">
              Throttle (seconds between mass emails)
              <input type="number" className={FIELD} value={smtp.email_throttle_seconds}
                onChange={(e) => setSmtp({ ...smtp, email_throttle_seconds: Number(e.target.value) })} />
            </label>
          </div>

          <button onClick={saveSmtp} disabled={savingSmtp} className="ios-btn-primary w-full text-sm">
            {savingSmtp ? "Saving…" : "Save"}
          </button>

          <div className="border-t border-[#f2f2f7] pt-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">Send Test Email</p>
            <div className="flex gap-2">
              <input type="email" placeholder="recipient@example.com" value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <button onClick={sendTest} disabled={sendingTest}
                className="ios-btn-secondary text-sm whitespace-nowrap px-4">
                {sendingTest ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Data & Sync */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          Data &amp; Sync
        </p>

        {/* Sync Status */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-[#f2f2f7] mb-3">
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1c1c1e]">Sync Status</p>
            <button
              onClick={fetchSyncStatus}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              Refresh
            </button>
          </div>

          {syncStatusError ? (
            <div className="px-4 py-3">
              <p className="text-xs text-red-500">Sync API unavailable — is start_api.bat running?</p>
            </div>
          ) : syncStatus ? (
            <>
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-[#3c3c43]">Worker</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  syncStatus.worker_alive
                    ? "bg-teal-50 text-teal-700"
                    : "bg-red-50 text-red-600"
                }`}>
                  {syncStatus.worker_alive ? "● Live" : "● Offline"}
                </span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-[#3c3c43]">Last sync</p>
                <p className="text-sm text-slate-500">{fmtDatetime(syncStatus.last_sync_at)}</p>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-[#3c3c43]">Members synced</p>
                <p className="text-sm text-slate-500">{syncStatus.member_count.toLocaleString()}</p>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-[#3c3c43]">Memberships</p>
                <p className="text-sm text-slate-500">{syncStatus.membership_count.toLocaleString()}</p>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-[#3c3c43]">Serials tracked</p>
                <p className="text-sm text-slate-500">{syncStatus.processed_serials_count.toLocaleString()}</p>
              </div>
            </>
          ) : (
            <div className="px-4 py-3">
              <p className="text-xs text-slate-400">Loading…</p>
            </div>
          )}
        </div>

        {/* Force Resync — danger zone */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-4">
            <p className="text-sm font-semibold text-[#1c1c1e] mb-1">Force Full Resync</p>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              Use only after restoring an ERP database backup. Deletes all check-ins, freezes, and
              membership records from this platform and re-syncs from ERP on the next worker cycle.
              Member profiles are kept. This cannot be undone.
            </p>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={resyncCooldown || resyncing}
              className="border border-rose-300 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {resyncing ? "Clearing…" : "Force Resync"}
            </button>
          </div>
        </div>
      </div>

      {/* Permissions placeholder */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          Permissions
        </p>
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
          <p className="text-sm text-slate-400">More settings coming soon</p>
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl mx-4 max-w-sm w-full p-6">
            <h2 className="text-base font-bold text-[#1c1c1e] mb-2">Force Full Resync?</h2>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              This will permanently delete all synced check-ins, freezes, and memberships. The sync
              worker will re-pull everything from FusionERP on its next cycle. Are you sure?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-xl border border-[#e5e5ea] text-sm font-medium text-[#1c1c1e] hover:bg-[#f2f2f7] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResync}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition-colors"
              >
                Yes, Force Resync
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#1c1c1e] text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-lg max-w-xs">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function SettingsPageGuarded() {
  return <RequireModule module="settings"><SettingsPage /></RequireModule>;
}
