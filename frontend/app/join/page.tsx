"use client";

// PUBLIC, standalone member-facing enquiry page (no sidebar / app chrome).
//
// Embedding: the marketing website can link straight to /join, or embed it:
//   <iframe src="https://<yourapp>/join" width="100%" height="700"></iframe>
// Submissions post to /api/public/leads (write-only, honeypot + rate limited)
// and auto-populate the Leads module with source='website'.

import { useEffect, useState } from "react";

type Brand = { biz_name: string; biz_logo_url: string };

export default function JoinPage() {
  const [brand, setBrand] = useState<Brand>({ biz_name: "Fitness Mania", biz_logo_url: "" });
  const [form, setForm] = useState({ first_name: "", last_name: "", mobile: "", email: "", message: "" });
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/branding", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setBrand({ biz_name: d.biz_name || "Fitness Mania", biz_logo_url: d.biz_logo_url || "" }))
      .catch(() => {});
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.first_name.trim() || (!form.mobile.trim() && !form.email.trim())) {
      setErr("Please enter your first name and a phone number or email.");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, _honeypot: honeypot }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Something went wrong.");
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  }

  const field =
    "w-full h-11 px-3.5 rounded-xl border border-[#e5e5ea] text-[15px] text-[#1c1c1e] bg-white " +
    "focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0fdfa] to-[#faf7f5] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-6">
          {brand.biz_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.biz_logo_url} alt={brand.biz_name} className="h-14 max-w-[180px] object-contain mb-3" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center mb-3 shadow-lg shadow-teal-500/30">
              <span className="text-white text-lg font-bold tracking-wide">FM</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-7">
          {status === "done" ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎉</span>
              </div>
              <h2 className="text-xl font-bold text-[#1c1c1e] mb-2">Thanks{form.first_name ? `, ${form.first_name}` : ""}!</h2>
              <p className="text-[15px] text-slate-500 leading-relaxed">
                Our team will be in touch shortly. We look forward to welcoming you to {brand.biz_name}.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-[#1c1c1e] mb-1.5 text-center">Join {brand.biz_name}</h1>
              <p className="text-[15px] text-slate-500 text-center mb-6 leading-relaxed">
                Enquire about membership — leave your details and we&apos;ll reach out with everything you need to get started.
              </p>

              <form onSubmit={submit} className="space-y-3.5">
                {/* Honeypot — visually hidden; real users never see or fill it. */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: 0, height: 0, overflow: "hidden" }}>
                  <label>
                    Leave this field empty
                    <input
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input className={field} placeholder="First name *" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
                  <input className={field} placeholder="Last name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
                </div>
                <input className={field} type="tel" placeholder="Mobile" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
                <input className={field} type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                <textarea
                  className={field.replace("h-11", "h-24 py-2.5") + " resize-none"}
                  placeholder="What are you interested in? (optional)"
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                />

                {err && <p className="text-sm text-red-600 text-center">{err}</p>}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-full h-11 rounded-xl bg-teal-600 text-white font-semibold text-[15px] hover:bg-teal-700 active:scale-[0.99] transition disabled:opacity-60"
                >
                  {status === "sending" ? "Sending…" : "Send enquiry"}
                </button>
                <p className="text-[11px] text-slate-400 text-center pt-1">
                  We&apos;ll only use your details to respond to your enquiry.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
