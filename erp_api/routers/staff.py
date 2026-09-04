"""Staff / user management — admin-only. Creates Supabase Auth users via the
Auth Admin API and links a staff row. Deactivation bans the auth user so login
is blocked immediately (we never delete auth users, to preserve attribution)."""

from __future__ import annotations

import json
import logging
import os
import urllib.request
import urllib.error
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Ensure SUPABASE_URL / SUPABASE_SERVICE_KEY from erp_api/.env are available.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

# Supabase connection (staff table) via gym_db.gym_conn_str().
from gym_db import gym_conn_str  # noqa: E402

log = logging.getLogger("erp_api.staff")
router = APIRouter(prefix="/staff", tags=["staff"])

VALID_ROLES = {"admin", "manager", "front_desk"}
BAN_FOREVER = "876000h"   # ~100 years — effectively disables login
UNBAN = "none"


def _supabase() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase URL/service key not configured")
    return url.rstrip("/"), key


def _auth_admin(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    url, key = _supabase()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{url}/auth/v1/admin/{path}", data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {"msg": str(e)}


def _gym_conn():
    return psycopg2.connect(**gym_conn_str(), sslmode="require")


def _staff_row(cur, staff_id: str) -> Optional[dict]:
    cur.execute(
        "SELECT id, auth_id, name, email, role, is_active, created_at FROM staff WHERE id = %s",
        (staff_id,),
    )
    return cur.fetchone()


# ── Models ────────────────────────────────────────────────────────────────────

class CreateStaff(BaseModel):
    name: str
    email: str
    password: str
    role: str


class PatchStaff(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class ResetPassword(BaseModel):
    new_password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/list")
def list_staff():
    conn = _gym_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, auth_id, name, email, role, is_active, created_at "
                "FROM staff ORDER BY created_at ASC"
            )
            rows = cur.fetchall()
        return {"staff": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/create")
def create_staff(body: CreateStaff):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Invalid role. Use one of {sorted(VALID_ROLES)}")

    # 1) Create the Supabase auth user (confirmed)
    status, resp = _auth_admin("POST", "users", {
        "email": body.email.strip(),
        "password": body.password,
        "email_confirm": True,
    })
    if status not in (200, 201):
        msg = resp.get("msg") or resp.get("error_description") or resp.get("error") or "Auth user creation failed"
        # Friendlier common cases
        low = str(msg).lower()
        if "already" in low and "registered" in low:
            msg = "A user with this email already exists"
        elif "password" in low:
            msg = f"Password rejected: {msg}"
        raise HTTPException(status_code=400, detail=msg)

    auth_id = resp["id"]

    # 2) Insert the staff row
    conn = _gym_conn()
    conn.autocommit = True
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO staff (id, auth_id, name, email, role, is_active) "
                "VALUES (gen_random_uuid(), %s, %s, %s, %s, true) "
                "RETURNING id, auth_id, name, email, role, is_active, created_at",
                (auth_id, body.name.strip(), body.email.strip(), body.role),
            )
            row = cur.fetchone()
        return {"staff": dict(row)}
    except Exception as exc:
        # Roll back the auth user so we don't orphan it
        _auth_admin("DELETE", f"users/{auth_id}")
        raise HTTPException(status_code=400, detail=f"Failed to create staff row: {exc}")
    finally:
        conn.close()


@router.patch("/{staff_id}")
def patch_staff(staff_id: str, body: PatchStaff):
    conn = _gym_conn()
    conn.autocommit = True
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            row = _staff_row(cur, staff_id)
            if not row:
                raise HTTPException(status_code=404, detail="Staff not found")

            sets, params = [], []
            if body.name is not None:
                sets.append("name = %s"); params.append(body.name.strip())
            if body.role is not None:
                if body.role not in VALID_ROLES:
                    raise HTTPException(status_code=422, detail="Invalid role")
                sets.append("role = %s"); params.append(body.role)
            if body.is_active is not None:
                sets.append("is_active = %s"); params.append(body.is_active)

            if sets:
                sets.append("updated_at = NOW()")
                params.append(staff_id)
                cur.execute(f"UPDATE staff SET {', '.join(sets)} WHERE id = %s", params)

            # Ban/unban the auth user to enforce is_active at login time.
            if body.is_active is not None and row.get("auth_id"):
                _auth_admin("PUT", f"users/{row['auth_id']}",
                            {"ban_duration": UNBAN if body.is_active else BAN_FOREVER})

            updated = _staff_row(cur, staff_id)
        return {"staff": dict(updated)}
    finally:
        conn.close()


@router.post("/{staff_id}/reset-password")
def reset_password(staff_id: str, body: ResetPassword):
    conn = _gym_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            row = _staff_row(cur, staff_id)
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Staff not found")
    if not row.get("auth_id"):
        raise HTTPException(status_code=400, detail="Staff has no linked auth account")

    status, resp = _auth_admin("PUT", f"users/{row['auth_id']}", {"password": body.new_password})
    if status not in (200, 201):
        msg = resp.get("msg") or resp.get("error_description") or "Password reset failed"
        raise HTTPException(status_code=400, detail=msg)
    return {"ok": True}


@router.delete("/{staff_id}")
def deactivate_staff(staff_id: str):
    """Soft-deactivate (never hard-delete): set is_active=false and ban the auth user."""
    conn = _gym_conn()
    conn.autocommit = True
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            row = _staff_row(cur, staff_id)
            if not row:
                raise HTTPException(status_code=404, detail="Staff not found")
            cur.execute("UPDATE staff SET is_active = false, updated_at = NOW() WHERE id = %s", (staff_id,))
        if row.get("auth_id"):
            _auth_admin("PUT", f"users/{row['auth_id']}", {"ban_duration": BAN_FOREVER})
        return {"ok": True}
    finally:
        conn.close()
