"""Reusable email helper — reads SMTP config from Supabase platform_settings
and sends via smtplib. Supabase connection is reused from the sync_worker config."""

from __future__ import annotations

import os
import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import psycopg2

# The Supabase connection details live in sync_worker/config.py (gym_conn_str).
_SYNC_WORKER = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sync_worker"
)
if _SYNC_WORKER not in sys.path:
    sys.path.insert(0, _SYNC_WORKER)

from config import build_config  # noqa: E402


def get_smtp_settings() -> dict:
    """Read SMTP config from Supabase platform_settings.

    psycopg2 returns jsonb already parsed into native Python types
    (str/int/bool), so no manual json.loads is needed — use rows[key] directly.
    """
    config = build_config()
    conn = psycopg2.connect(**config.gym_conn_str, sslmode="require")
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT key, value FROM platform_settings
                WHERE key LIKE 'smtp%' OR key = 'email_throttle_seconds'
                """
            )
            rows = dict(cur.fetchall())
        return {
            "host":       rows.get("smtp_host"),
            "port":       int(rows.get("smtp_port") or 587),
            "user":       rows.get("smtp_user"),
            "password":   rows.get("smtp_password"),
            "from_name":  rows.get("smtp_from_name") or "Fitness Mania",
            "from_email": rows.get("smtp_from_email"),
            "use_tls":    rows.get("smtp_use_tls", True),
            "throttle":   int(rows.get("email_throttle_seconds") or 3),
        }
    finally:
        conn.close()


def send_email(to_email: str, subject: str, html_body: str, settings: dict | None = None):
    """Send one HTML email. Returns (success: bool, error: str | None)."""
    if settings is None:
        settings = get_smtp_settings()

    if not settings.get("host") or not settings.get("from_email"):
        return False, "SMTP not configured"

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings['from_name']} <{settings['from_email']}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        server = smtplib.SMTP(settings["host"], settings["port"], timeout=20)
        if settings.get("use_tls"):
            server.starttls()

        if settings.get("user") and settings.get("password"):
            server.login(settings["user"], settings["password"])

        server.sendmail(settings["from_email"], [to_email], msg.as_string())
        server.quit()
        return True, None
    except Exception as exc:
        return False, str(exc)
