"""One-off bootstrap: create the FIRST real admin.

Creates a Supabase Auth user (email confirmed) and links a staff row
(role='admin'). Safe to re-run — it reuses an existing auth user if the
email already exists and upserts the staff row.

    python seed_admin.py

Edit ADMIN_EMAIL / ADMIN_PASSWORD below before running.

Fallback (manual): create the user in Supabase Dashboard → Authentication,
then INSERT a staff row with matching auth_id, role='admin', is_active=true.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error

import psycopg2

# ── CONFIGURE ────────────────────────────────────────────────────────────────
ADMIN_EMAIL    = "admin@fitnessmania.co"
ADMIN_PASSWORD = "ChangeMe!2026"
ADMIN_NAME     = "System Admin"
# ─────────────────────────────────────────────────────────────────────────────

HERE = os.path.dirname(os.path.abspath(__file__))
FRONTEND_ENV = os.path.join(os.path.dirname(HERE), "frontend", ".env.local")
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "sync_worker"))
from config import build_config  # noqa: E402


def _load_frontend_env() -> dict:
    env = {}
    with open(FRONTEND_ENV, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def _api(method: str, url: str, key: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def main() -> None:
    env = _load_frontend_env()
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in frontend/.env.local")
        sys.exit(1)

    admin_users_url = f"{supabase_url}/auth/v1/admin/users"

    # 1) Create the auth user (email confirmed)
    status, resp = _api("POST", admin_users_url, service_key, {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "email_confirm": True,
    })
    if status in (200, 201):
        auth_id = resp["id"]
        print(f"Created auth user {ADMIN_EMAIL} -> {auth_id}")
    else:
        # Already exists? Look it up.
        print(f"Create returned {status}: {resp.get('msg') or resp.get('error_description') or resp}")
        st2, listing = _api("GET", f"{admin_users_url}?page=1&per_page=200", service_key)
        users = listing.get("users", listing if isinstance(listing, list) else [])
        match = next((u for u in users if u.get("email") == ADMIN_EMAIL), None)
        if not match:
            print("Could not create or find the auth user. Aborting.")
            sys.exit(1)
        auth_id = match["id"]
        print(f"Reusing existing auth user {ADMIN_EMAIL} -> {auth_id}")

    # 2) Upsert the staff row linked to that auth_id
    conn = psycopg2.connect(**build_config().gym_conn_str, sslmode="require")
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("UPDATE staff SET auth_id=%s, name=%s, role='admin', is_active=true WHERE email=%s",
                    (auth_id, ADMIN_NAME, ADMIN_EMAIL))
        if cur.rowcount == 0:
            cur.execute(
                "INSERT INTO staff (id, auth_id, name, email, role, is_active) "
                "VALUES (gen_random_uuid(), %s, %s, %s, 'admin', true)",
                (auth_id, ADMIN_NAME, ADMIN_EMAIL),
            )
        cur.execute("SELECT id, auth_id, name, email, role, is_active FROM staff WHERE email=%s", (ADMIN_EMAIL,))
        print("Staff row:", cur.fetchone())
    conn.close()
    print(f"\nDone. Sign in with {ADMIN_EMAIL} / (the password you set).")


if __name__ == "__main__":
    main()
