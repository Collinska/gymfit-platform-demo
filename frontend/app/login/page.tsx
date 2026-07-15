"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState<{ biz_name: string; biz_logo_url: string }>({ biz_name: "Fitness Mania", biz_logo_url: "" });

  useEffect(() => {
    fetch("/api/branding", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setBrand({ biz_name: d.biz_name || "Fitness Mania", biz_logo_url: d.biz_logo_url || "" }))
      .catch(() => {});
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      // Full reload so AuthProvider (in the persistent root layout) re-fetches
      // the session/role/modules for the newly signed-in user.
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--warm-bg, #faf7f5)" }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-8">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-6">
          {brand.biz_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.biz_logo_url} alt={brand.biz_name} className="h-14 max-w-[200px] object-contain" />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-teal-600 flex items-center justify-center shadow-[0_4px_12px_rgba(13,148,136,0.4)]">
              <span className="text-white text-sm font-bold tracking-wide">FM</span>
            </div>
          )}
          <h1 className="mt-3 text-xl font-bold text-stone-800">{brand.biz_name}</h1>
          <p className="text-sm text-stone-400">Operations Console — sign in</p>
        </div>

        <form onSubmit={signIn} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-stone-500">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              className="w-full h-10 px-3 mt-1 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="you@fitnessmania.co"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full h-10 px-3 mt-1 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-[11px] text-stone-400 text-center mt-5">
          Accounts are created by an administrator.
        </p>
      </div>
    </div>
  );
}
