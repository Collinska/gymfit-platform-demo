"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Dict, fetchJson } from "@/components/dashboard/dashboard-widgets";

type FormState = {
  first_name: string;
  last_name: string;
  mobile: string;
  email: string;
  card_id: string;
  erp_customer_id: string;
};

const empty: FormState = { first_name: "", last_name: "", mobile: "", email: "", card_id: "", erp_customer_id: "" };

const FIELDS: { key: keyof FormState; label: string; placeholder: string; type?: string; required?: boolean }[] = [
  { key: "first_name",      label: "First Name",       placeholder: "First name",                        required: true },
  { key: "last_name",       label: "Last Name",        placeholder: "Last name" },
  { key: "mobile",          label: "Mobile",           placeholder: "e.g. 0712 345 678" },
  { key: "email",           label: "Email",            placeholder: "email@example.com", type: "email" },
  { key: "card_id",         label: "Card ID",          placeholder: "Membership card ID" },
  { key: "erp_customer_id", label: "ERP Customer ID",  placeholder: "Optional — leave blank if not yet in ERP" },
];

export default function NewMemberPage() {
  const router = useRouter();
  const [form, setForm]       = useState<FormState>(empty);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [leadId, setLeadId]   = useState<string | null>(null);

  // Prefill from lead conversion (?first_name=&last_name=&mobile=&email=&lead_id=)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setForm((prev) => ({
      ...prev,
      first_name: p.get("first_name") ?? prev.first_name,
      last_name:  p.get("last_name")  ?? prev.last_name,
      mobile:     p.get("mobile")     ?? prev.mobile,
      email:      p.get("email")      ?? prev.email,
    }));
    setLeadId(p.get("lead_id"));
  }, []);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.first_name.trim()) { setError("First name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const json = await fetchJson<{ data: Dict }>("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      // If this member came from a lead, mark that lead converted.
      if (leadId) {
        await fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "converted", converted_member_id: json.data.id }),
        }).catch(() => {});
      }

      const dest = json.data.erp_customer_id ?? json.data.id;
      router.push(`/members/${String(dest)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create member");
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#f2f2f7]">
      <Sidebar />
      <main className="flex-1 p-7 min-w-0">
        {/* Topbar */}
        <div className="flex items-center justify-between mb-6 max-w-xl mx-auto">
          <div>
            <p className="text-[11px] text-slate-400 font-normal">Members</p>
            <h1 className="text-[18px] font-semibold text-[#1c1c1e] mt-0.5 tracking-tight">New Member</h1>
          </div>
          <Link href="/members" className="ios-btn-secondary text-sm">
            ← Back
          </Link>
        </div>

        {/* Error */}
        {error ? (
          <div className="max-w-xl mx-auto mb-4 px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm font-medium">
            {error}
          </div>
        ) : null}

        {/* Form card */}
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-ios p-6">
          <h2 className="text-base font-semibold text-[#1c1c1e] mb-5">Member Details</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {FIELDS.map(({ key, label, placeholder, type, required }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-500 mb-1.5">
                  {label}
                  {required && <span className="text-teal-600 ml-0.5">*</span>}
                </label>
                <input
                  type={type ?? "text"}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={placeholder}
                  autoFocus={key === "first_name"}
                  className="ios-input"
                />
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <Link href="/members" className="ios-btn-secondary flex-1 text-sm">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="ios-btn-primary flex-1 text-sm"
              >
                {saving ? "Saving…" : "Create Member"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
