"use client";

import { useEffect, useState } from "react";

type Staff = {
  id: string;
  auth_id: string | null;
  name: string;
  email: string;
  role: "admin" | "manager" | "front_desk";
  is_active: boolean;
  created_at: string;
};

const ROLE_BADGE: Record<string, string> = {
  admin:      "bg-teal-50 text-teal-700",
  manager:    "bg-blue-50 text-blue-700",
  front_desk: "bg-stone-100 text-stone-600",
};
const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", front_desk: "Front Desk" };
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "front_desk", label: "Front Desk" },
];

const FIELD = "w-full h-9 px-3 mt-1 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500";

type Modal =
  | { type: "add" }
  | { type: "edit"; staff: Staff }
  | { type: "reset"; staff: Staff }
  | { type: "deactivate"; staff: Staff }
  | null;

export function StaffManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/staff", { cache: "no-store" });
      const d = await res.json();
      setStaff(d.staff ?? []);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff &amp; Access</p>
        <button
          onClick={() => setModal({ type: "add" })}
          className="text-xs font-semibold text-teal-600 hover:text-teal-700"
        >
          + Add Staff
        </button>
      </div>

      {toast && (
        <p className={`text-xs mb-2 px-1 font-medium ${toast.ok ? "text-teal-600" : "text-red-600"}`}>{toast.msg}</p>
      )}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#f2f2f7] text-left">
                {["Name", "Email", "Role", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f2f7]">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : staff.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No staff yet</td></tr>
              ) : staff.map((s) => (
                <tr key={s.id} className="hover:bg-[#f9f9fb]">
                  <td className="px-4 py-3 font-medium text-[#1c1c1e]">{s.name}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{s.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[s.role]}`}>
                      {ROLE_LABEL[s.role] ?? s.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${s.is_active ? "bg-green-50 text-green-700" : "bg-stone-100 text-stone-400"}`}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-xs">
                      <button onClick={() => setModal({ type: "edit", staff: s })} className="text-teal-600 hover:text-teal-700">Edit</button>
                      <button onClick={() => setModal({ type: "reset", staff: s })} className="text-slate-500 hover:text-slate-700">Reset PW</button>
                      {s.is_active ? (
                        <button onClick={() => setModal({ type: "deactivate", staff: s })} className="text-red-500 hover:text-red-600">Deactivate</button>
                      ) : (
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/staff/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: true }) });
                            if (res.ok) { showToast(`${s.name} reactivated`, true); load(); }
                            else showToast((await res.json()).error ?? "Failed", false);
                          }}
                          className="text-green-600 hover:text-green-700"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal?.type === "add" && (
        <AddStaffModal
          onClose={() => setModal(null)}
          onDone={(msg, ok) => { showToast(msg, ok); if (ok) { setModal(null); load(); } }}
        />
      )}
      {modal?.type === "edit" && (
        <EditStaffModal
          staff={modal.staff}
          onClose={() => setModal(null)}
          onDone={(msg, ok) => { showToast(msg, ok); if (ok) { setModal(null); load(); } }}
        />
      )}
      {modal?.type === "reset" && (
        <ResetPasswordModal
          staff={modal.staff}
          onClose={() => setModal(null)}
          onDone={(msg, ok) => { showToast(msg, ok); if (ok) setModal(null); }}
        />
      )}
      {modal?.type === "deactivate" && (
        <ConfirmDeactivate
          staff={modal.staff}
          onClose={() => setModal(null)}
          onDone={(msg, ok) => { showToast(msg, ok); if (ok) { setModal(null); load(); } }}
        />
      )}
    </div>
  );
}

// ── Modals ──────────────────────────────────────────────────────────────────

function Shell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-[#1c1c1e] mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function AddStaffModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string, ok: boolean) => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "front_desk" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name.trim() || !form.email.trim() || !form.password) { setErr("All fields are required"); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch("/api/staff/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? d.error ?? "Failed to create");
      onDone("Staff created", true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <Shell title="Add Staff" onClose={onClose}>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      <div className="space-y-2">
        <label className="block text-xs text-slate-500">Name<input className={FIELD} value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="block text-xs text-slate-500">Email<input type="email" className={FIELD} value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className="block text-xs text-slate-500">Password<input type="password" className={FIELD} value={form.password} onChange={(e) => set("password", e.target.value)} /></label>
        <label className="block text-xs text-slate-500">Role
          <select className={FIELD} value={form.role} onChange={(e) => set("role", e.target.value)}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-[#e5e5ea] text-sm font-medium text-slate-600 hover:bg-[#f2f2f7]">Cancel</button>
        <button onClick={submit} disabled={saving} className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">{saving ? "Creating…" : "Create"}</button>
      </div>
    </Shell>
  );
}

function EditStaffModal({ staff, onClose, onDone }: { staff: Staff; onClose: () => void; onDone: (msg: string, ok: boolean) => void }) {
  const [name, setName] = useState(staff.name);
  const [role, setRole] = useState(staff.role);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/staff/${staff.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onDone("Staff updated", true);
    } catch (e) { onDone(e instanceof Error ? e.message : "Failed", false); }
    finally { setSaving(false); }
  }

  return (
    <Shell title={`Edit ${staff.name}`} onClose={onClose}>
      <div className="space-y-2">
        <label className="block text-xs text-slate-500">Name<input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block text-xs text-slate-500">Role
          <select className={FIELD} value={role} onChange={(e) => setRole(e.target.value as Staff["role"])}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <p className="text-[11px] text-slate-400">{staff.email}</p>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-[#e5e5ea] text-sm font-medium text-slate-600 hover:bg-[#f2f2f7]">Cancel</button>
        <button onClick={submit} disabled={saving} className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
      </div>
    </Shell>
  );
}

function ResetPasswordModal({ staff, onClose, onDone }: { staff: Staff; onClose: () => void; onDone: (msg: string, ok: boolean) => void }) {
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!pw) { setErr("Enter a new password"); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/staff/${staff.id}/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_password: pw }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? d.error ?? "Failed");
      onDone(`Password reset for ${staff.name}`, true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <Shell title={`Reset Password — ${staff.name}`} onClose={onClose}>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      <label className="block text-xs text-slate-500">New Password<input type="password" className={FIELD} value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-[#e5e5ea] text-sm font-medium text-slate-600 hover:bg-[#f2f2f7]">Cancel</button>
        <button onClick={submit} disabled={saving} className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">{saving ? "Resetting…" : "Reset"}</button>
      </div>
    </Shell>
  );
}

function ConfirmDeactivate({ staff, onClose, onDone }: { staff: Staff; onClose: () => void; onDone: (msg: string, ok: boolean) => void }) {
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/staff/${staff.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onDone(`${staff.name} deactivated`, true);
    } catch (e) { onDone(e instanceof Error ? e.message : "Failed", false); }
    finally { setSaving(false); }
  }
  return (
    <Shell title={`Deactivate ${staff.name}?`} onClose={onClose}>
      <p className="text-sm text-slate-500">Deactivated staff can no longer log in. Their history is preserved.</p>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-[#e5e5ea] text-sm font-medium text-slate-600 hover:bg-[#f2f2f7]">Cancel</button>
        <button onClick={submit} disabled={saving} className="h-9 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? "…" : "Deactivate"}</button>
      </div>
    </Shell>
  );
}
