"use client";

import { useEffect, useRef, useState } from "react";

const FIELD = "w-full h-9 px-3 mt-1 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500";

const DETAILS: { key: string; label: string }[] = [
  { key: "biz_name", label: "Business Name" },
  { key: "biz_address_line1", label: "Address Line 1" },
  { key: "biz_address_line2", label: "Address Line 2" },
  { key: "biz_phone", label: "Phone(s)" },
  { key: "biz_pin", label: "KRA PIN" },
  { key: "biz_paybill", label: "PayBill No" },
  { key: "biz_paybill_account", label: "PayBill Account" },
  { key: "biz_till", label: "Till No" },
  { key: "biz_business_no", label: "Business No" },
  { key: "biz_business_account", label: "Business Account" },
  { key: "biz_email", label: "Contact Email" },
  { key: "frontdesk_alert_email", label: "Front Desk Alert Email" },
];

export function BusinessProfile() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/settings", { cache: "no-store" });
    const d = await res.json();
    const v: Record<string, string> = {};
    for (const f of DETAILS) v[f.key] = d[f.key] ?? "";
    setVals(v);
    setLogo(d.biz_logo_url ?? "");
  }
  useEffect(() => { load(); }, []);

  const set = (k: string, val: string) => setVals((p) => ({ ...p, [k]: val }));

  async function save() {
    setSaving(true); setErr(null);
    try {
      for (const f of DETAILS) {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: f.key, value: vals[f.key] ?? "" }),
        });
        if (!res.ok) throw new Error();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setErr("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setErr(null);
    if (!["image/png", "image/jpeg"].includes(file.type)) { setErr("PNG or JPEG only"); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("Logo must be under 5 MB"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/branding/logo", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      setLogo(d.logo_url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    setUploading(true); setErr(null);
    try {
      const res = await fetch("/api/branding/logo", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setLogo("");
    } catch {
      setErr("Remove failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Business Profile</p>
        {saved && <span className="text-xs text-teal-600 font-medium">✓ Saved</span>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-[#f2f2f7] flex items-center justify-center overflow-hidden shrink-0">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-slate-400">No logo</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="ios-btn-secondary text-sm">{uploading ? "Uploading…" : "Upload Logo"}</button>
              {logo && !uploading && (
                <button onClick={removeLogo} className="text-xs text-red-500 hover:text-red-600 px-2">Remove</button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Shown on the sidebar, login, PDF receipts, and wrap emails.</p>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
          </div>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        {/* Details */}
        <div className="grid grid-cols-2 gap-3 border-t border-[#f2f2f7] pt-3">
          {DETAILS.map((f) => (
            <label key={f.key} className="block text-xs text-slate-500">
              {f.label}
              <input className={FIELD} value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            </label>
          ))}
        </div>

        <button onClick={save} disabled={saving} className="ios-btn-primary w-full text-sm">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
