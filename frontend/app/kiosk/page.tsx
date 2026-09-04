"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Avatar, daysRemaining, Dict, fetchJson, formatDate, formatTime, memberName, statusValue } from "@/components/dashboard/dashboard-widgets";

type KioskState = "idle" | "found" | "not-found";

// Re-scanning the exact same code while it's still in frame (or during the
// result-modal dismiss window) would re-trigger check-in; skip repeats within
// this window. New scans of a DIFFERENT code are never blocked by this.
const RESCAN_COOLDOWN_MS = 4000;

export default function KioskPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [state, setState] = useState<KioskState>("idle");
  const [member, setMember] = useState<Dict | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

  // ── Camera QR scanning ──────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  // rAF loop reads this instead of `state` directly — the loop is a long-lived
  // closure and would otherwise see a stale "idle" forever.
  const stateRef = useRef<KioskState>("idle");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setMounted(true);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const focus = window.setInterval(() => inputRef.current?.focus(), 2000);
    inputRef.current?.focus();
    return () => {
      window.clearInterval(clock);
      window.clearInterval(focus);
    };
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") reset();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (state === "idle") return;
    const seconds = state === "found" ? 6 : 3;
    setCountdown(seconds);
    const tick = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    const dismiss = window.setTimeout(reset, seconds * 1000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(dismiss);
    };
  }, [state]);

  function reset() {
    setState("idle");
    setMember(null);
    setBalance(null);
    setScanValue("");
    inputRef.current?.focus();
  }

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  // Stop the camera on unmount so the device light doesn't stay on if staff
  // navigate away from the kiosk screen.
  useEffect(() => stopCamera, [stopCamera]);

  async function lookup(value: string, method: "barcode" | "qr" = "barcode") {
    const cardId = value.trim();
    if (!cardId) return;
    try {
      const json = await fetchJson<{ member: Dict; memberships: Dict[] }>(`/api/members/${encodeURIComponent(cardId)}`);
      const currentMembership = json.memberships?.[0] ?? {};
      const payload = { ...json.member, ...currentMembership };
      setMember(payload);
      setBalance(null);
      setState("found");

      // Informational balance lookup — never blocks check-in, fails silently.
      const custId = json.member.erp_customer_id;
      if (custId) {
        fetchJson<{ balance?: number }>(`/api/pos/members/${encodeURIComponent(String(custId))}/balance`)
          .then((b) => setBalance(typeof b.balance === "number" ? b.balance : null))
          .catch(() => setBalance(null));
      }

      const isActive = statusValue(payload) === "active" && daysRemaining(payload.membership_end) > 0;
      await fetchJson("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: json.member.id,
          membership_id: currentMembership.id ?? null,
          method,
          notes: isActive ? null : "Access denied — no active membership",
          // Per request: check-in time follows THIS kiosk device's own clock,
          // not the DB server's now() — so it tracks whatever the device says,
          // correct or not.
          checkin_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {
      setMember(null);
      setState("not-found");
    }
  }

  function onChange(value: string) {
    setScanValue(value);
    if (value.length >= 13) lookup(value);
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setCameraError(
        name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access in the browser and try again."
          : name === "NotFoundError"
            ? "No camera found on this device."
            : "Could not start the camera.",
      );
      setCameraOn(false);
    }
  }

  // Recursive requestAnimationFrame loop: grab a video frame onto the hidden
  // canvas, run jsQR on it, and — on a successful decode of a QR the member
  // profile generates (same value the kiosk already looks up by) — feed it
  // through the exact same `lookup()` path as the barcode-scanner / typed
  // input, so check-in behaves identically regardless of scan method.
  function scanFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frame.data, frame.width, frame.height);
        if (code && code.data) {
          const now = Date.now();
          const last = lastScanRef.current;
          const isRepeat = last && last.value === code.data && now - last.at < RESCAN_COOLDOWN_MS;
          if (!isRepeat && stateRef.current === "idle") {
            lastScanRef.current = { value: code.data, at: now };
            lookup(code.data, "qr");
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }

  const name = member ? memberName(member) : "";
  const rawStatus = member ? statusValue(member) : "expired";
  // Re-derive expired status at check-in time — DB `status` field can lag behind membership_end
  const status = rawStatus === "active" && member && daysRemaining(member.membership_end) <= 0 ? "expired" : rawStatus;
  const modalClass = state === "found" ? `kiosk-result ${status}` : "kiosk-result expired";
  const currentTime = formatTime(now.toISOString());
  const currentDate = formatDate(now.toISOString());

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--bg0, #0a0b0d)" }}>
      <main className="kiosk-page">
        <header className="topbar kiosk-top">
          <div>
            <strong className="font-head">ZENTRY FIT</strong>
            <span>CAMERA INITIALISING</span>
          </div>
          <div>
            {mounted && (
              <>
                <time className="font-head" suppressHydrationWarning>
                  {currentTime}
                </time>
                {" · "}
                <span suppressHydrationWarning>{currentDate}</span>
              </>
            )}
          </div>
        </header>
        <div className="content kiosk-content">
          <section className="kiosk-center">
            <div className="pulse-ring">
              <svg className="kiosk-icon" viewBox="0 0 96 96" aria-hidden="true">
                <path d="M30 28h9l5-7h8l5 7h9c7 0 12 5 12 12v25c0 7-5 12-12 12H30c-7 0-12-5-12-12V40c0-7 5-12 12-12Z" />
                <circle cx="48" cy="53" r="15" />
                <circle cx="67" cy="39" r="4" />
              </svg>
            </div>
            <h1 className="font-head">SCAN YOUR FACE OR CARD TO CHECK IN</h1>
            <p>Face recognition active • Hold still and look at camera</p>
            <small>ESC returns to idle · Press F11 for fullscreen</small>
          </section>
          <footer className="kiosk-scan">
            <label>
              BARCODE / CARD ID
              <input
                ref={inputRef}
                value={scanValue}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") lookup(scanValue);
                }}
                placeholder="Scan card or type member ID..."
              />
            </label>

            <div className="kiosk-camera">
              <button
                type="button"
                className={`kiosk-camera-toggle${cameraOn ? " on" : ""}`}
                onClick={() => (cameraOn ? stopCamera() : startCamera())}
              >
                {cameraOn ? "📷 Camera scan ON — tap to stop" : "📷 Scan QR with camera"}
              </button>

              {/* Hidden until active — the video feed itself is the preview;
                  a separate off-screen canvas is used purely for frame decoding. */}
              <div className="kiosk-camera-preview" hidden={!cameraOn}>
                <video ref={videoRef} muted playsInline />
              </div>
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {cameraError ? <p className="kiosk-camera-error">{cameraError}</p> : null}
              {cameraOn && !cameraError ? (
                <p className="kiosk-camera-hint">Hold the membership card&apos;s QR code up to the camera.</p>
              ) : null}
            </div>
          </footer>
        </div>
        {state !== "idle" ? (
          <section className={modalClass}>
            {state === "found" && member ? (
              <>
                <Avatar name={name} erpId={member.erp_customer_id} photoUrl={member.photo_url} size="lg" />
                <h2 className="font-head">{name}</h2>
                <p className="mono muted">{String(member.erp_customer_id ?? "")}</p>
                <span className={`badge ${status}`}>{status.toUpperCase()}</span>
                <p>
                  {String(member.plan_name ?? "No plan")} · Expires {formatDate(member.membership_end)}
                </p>
                <strong className="font-head">{daysRemaining(member.membership_end)} days remaining</strong>
                {balance !== null ? (
                  balance > 0 ? (
                    <p style={{ color: "#0d9488", fontWeight: 600, margin: "4px 0" }}>
                      Balance: KES {balance.toLocaleString("en-KE")}
                    </p>
                  ) : (
                    <div
                      style={{
                        background: "#fef3c7",
                        color: "#92400e",
                        borderRadius: 12,
                        padding: "8px 14px",
                        margin: "6px 0",
                        fontWeight: 600,
                        textAlign: "center",
                      }}
                    >
                      ⚠ Outstanding balance: KES {Math.abs(balance).toLocaleString("en-KE")}
                      <div style={{ fontWeight: 400, fontSize: "0.85em" }}>Please settle at front desk</div>
                    </div>
                  )
                ) : null}
                <h3>
                  {status === "active"
                    ? "ACCESS GRANTED"
                    : status === "frozen"
                      ? "MEMBERSHIP FROZEN — SEE RECEPTION"
                      : status === "no_membership"
                        ? "NO MEMBERSHIP ON FILE — SEE RECEPTION"
                        : "MEMBERSHIP EXPIRED — PLEASE RENEW"}
                </h3>
                <button className="btn btn-sm">CHECK OUT</button>
              </>
            ) : (
              <h2 className="font-head">MEMBER NOT FOUND — SEE RECEPTION</h2>
            )}
            <div className="countdown-bar" style={{ width: `${(countdown / (state === "found" ? 6 : 3)) * 100}%` }} />
          </section>
        ) : null}
      </main>
    </div>
  );
}
