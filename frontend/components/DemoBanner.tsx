"use client";

import { useEffect, useState } from "react";

// Persistent-but-dismissible: dismissing hides it for this page view only —
// since every authenticated page mounts its own <Sidebar> (no shared layout
// wrapper in this app), the component remounts fresh on the next navigation,
// so the banner naturally reappears without needing localStorage tricks.
export function DemoBanner() {
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/demo/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.is_demo && !d.expired && d.demo_expires_at) setExpiresAt(d.demo_expires_at);
      })
      .catch(() => {});
  }, []);

  if (!expiresAt || dismissed) return null;

  const msLeft = new Date(expiresAt).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 60,
        height: 34, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        background: "linear-gradient(90deg,#f59e0b,#fbbf24)",
        color: "#1c1c1e", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.02em",
      }}
    >
      <span>⚠ DEMO ENVIRONMENT — expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}</span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: "rgba(0,0,0,0.12)", border: "none", borderRadius: 6,
          width: 18, height: 18, lineHeight: "18px", fontSize: 12, fontWeight: 700,
          color: "#1c1c1e", cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
