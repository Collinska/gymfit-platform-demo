"""Self-expiring demo gate. Reads platform_settings.is_demo /
demo_expires_at from whichever Supabase project THIS deployment's .env
points at — a no-op against production (no is_demo row there), and an
enforced 7-day window against a demo deployment (configured with
.env.demo's credentials as its own .env, on a SEPARATE deployment — this
module never talks to two projects at once).

Expiry is decided by Postgres's own now(), never a client/server wall clock
— the app's timezone-drift bug (fixed separately) makes any local clock
untrustworthy for this."""

from __future__ import annotations

import os
import sys
import time

import psycopg2
from fastapi import HTTPException

_SYNC_WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sync_worker")
if _SYNC_WORKER not in sys.path:
    sys.path.insert(0, os.path.abspath(_SYNC_WORKER))
from config import build_config  # noqa: E402

_CACHE: dict = {"checked_at": 0.0, "expired": False, "is_demo": False}
_TTL = 60.0  # seconds — matches business_settings.py's caching convention


def _check_demo_status() -> tuple[bool, bool]:
    """Returns (is_demo, expired). On any error, fails OPEN (not a demo /
    not expired) so a misconfigured or production deployment is never
    accidentally locked out by this feature."""
    try:
        conn = psycopg2.connect(**build_config().gym_conn_str, sslmode="require")
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT key, value FROM platform_settings WHERE key IN ('is_demo', 'demo_expires_at')"
                )
                rows = dict(cur.fetchall())
                cur.execute(
                    "SELECT now() > COALESCE((%s)::timestamptz, 'infinity'::timestamptz)",
                    (rows.get("demo_expires_at"),),
                )
                expired = bool(cur.fetchone()[0])
        finally:
            conn.close()
        is_demo = bool(rows.get("is_demo"))
        return is_demo, (is_demo and expired)
    except Exception:
        return False, False


def demo_status() -> tuple[bool, bool]:
    """Cached (is_demo, expired) — one DB round trip per ~60s, not per request."""
    now = time.time()
    if now - _CACHE["checked_at"] < _TTL:
        return _CACHE["is_demo"], _CACHE["expired"]
    is_demo, expired = _check_demo_status()
    _CACHE.update(checked_at=now, is_demo=is_demo, expired=expired)
    return is_demo, expired


def require_active_demo() -> None:
    """FastAPI dependency — raises 403 once the demo window has passed.
    A no-op (never raises) for any deployment where is_demo isn't set,
    i.e. production."""
    _, expired = demo_status()
    if expired:
        raise HTTPException(
            status_code=403,
            detail="Demo period has ended — contact Fitness Mania to continue.",
        )
