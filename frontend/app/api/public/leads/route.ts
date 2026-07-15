import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// PUBLIC, WRITE-ONLY lead capture for the marketing website / /join page.
// No auth guard by design, but locked down: honeypot, validation, per-IP rate
// limit, input trimming/length caps. It can ONLY insert a lead — nothing else.

const ERP_BASE = process.env.ERP_API_URL ?? "http://127.0.0.1:8000";

// ── Simple in-memory per-IP rate limiter (max 5 / 10 min) ──────────────────────
// Note: resets on server restart and is per-instance; adequate as a bot speed bump.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic cleanup so the Map doesn't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_HITS;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // 1. Honeypot — bots fill hidden fields. Pretend success, insert nothing.
  if (clean(body._honeypot, 200)) {
    return NextResponse.json({ ok: true });
  }

  // 3. Rate limit (before doing any work).
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  // 4. Sanitize + cap lengths.
  const first_name = clean(body.first_name, 100);
  const last_name = clean(body.last_name, 100);
  const mobile = clean(body.mobile, 40);
  const email = clean(body.email, 200);
  const message = clean(body.message, 1000);

  // 2. Validation: first name required + at least one contact channel.
  if (!first_name || (!mobile && !email)) {
    return NextResponse.json(
      { error: "Please provide your first name and a phone number or email." },
      { status: 400 },
    );
  }

  // Insert the lead (retry without created_by if that column doesn't exist).
  const base = {
    first_name,
    last_name: last_name || null,
    mobile: mobile || null,
    email: email || null,
    source: "website",
    status: "new",
    notes: message || null,
  };

  let insertErr = null;
  {
    const { error } = await supabaseAdmin.from("leads").insert({ ...base, created_by: "website" });
    if (error) {
      const retry = await supabaseAdmin.from("leads").insert(base);
      insertErr = retry.error;
    }
  }
  if (insertErr) {
    return NextResponse.json({ error: "Could not submit right now. Please try again." }, { status: 500 });
  }

  // Fire-and-forget front-desk email alert. Never block/ fail the response on it.
  void sendAlert({ first_name, last_name, mobile, email, message });

  return NextResponse.json({ ok: true });
}

async function sendAlert(lead: {
  first_name: string;
  last_name: string;
  mobile: string;
  email: string;
  message: string;
}) {
  try {
    const { data } = await supabaseAdmin
      .from("platform_settings")
      .select("key, value")
      .in("key", ["frontdesk_alert_email", "biz_name"]);

    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.key] = (row.value as string) ?? "";
    const to = (map.frontdesk_alert_email || "").trim();
    if (!to) return; // no alert address configured

    const bizName = map.biz_name || "Fitness Mania";
    const fullName = `${lead.first_name} ${lead.last_name}`.trim();
    const row = (label: string, val: string) =>
      val
        ? `<tr><td style="padding:6px 12px;color:#8e8e93;font-size:13px;">${label}</td>
             <td style="padding:6px 12px;color:#1c1c1e;font-size:14px;">${esc(val)}</td></tr>`
        : "";

    const html = `<!doctype html><html><body style="margin:0;background:#f7f7f7;padding:20px 0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
      <table role="presentation" width="520" align="center" cellpadding="0" cellspacing="0"
             style="max-width:520px;width:100%;background:#fff;border-radius:14px;overflow:hidden;">
        <tr><td style="background:#0d9488;padding:20px 24px;color:#fff;font-size:18px;font-weight:700;">
          🔔 New Website Lead
        </td></tr>
        <tr><td style="padding:18px 24px 4px;color:#1c1c1e;font-size:15px;">
          A new enquiry just came in via the ${esc(bizName)} website.
        </td></tr>
        <tr><td style="padding:8px 12px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${row("Name", fullName)}
            ${row("Mobile", lead.mobile)}
            ${row("Email", lead.email)}
            ${row("Message", lead.message)}
          </table>
        </td></tr>
        <tr><td style="padding:14px 24px 22px;color:#8e8e93;font-size:13px;">
          Log in to the Leads module to follow up.
        </td></tr>
      </table>
    </body></html>`;

    await fetch(`${ERP_BASE}/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject: `New Website Lead — ${fullName}`,
        html,
      }),
      cache: "no-store",
    });
  } catch {
    // Swallow — the lead is already saved; email is best-effort.
  }
}
