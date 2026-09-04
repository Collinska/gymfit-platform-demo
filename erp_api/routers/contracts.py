"""Placeholder membership contract: generate a pre-filled PDF for printing,
and accept the signed copy back (photo or scanned PDF).

PDF/image bytes go to Supabase Storage via the REST API directly (psycopg2
only reaches Postgres, not object storage); gym_members.contract_* columns
are updated over the same direct Postgres connection the rest of erp_api
already uses (see business_settings.py / staff.py)."""

from __future__ import annotations

import logging
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime

import psycopg2
import psycopg2.extras
import pyodbc
from dotenv import load_dotenv
from fastapi import APIRouter, File, HTTPException, UploadFile

from db import erp_conn
from contract_template import generate_contract_pdf
import demo_mode

# Ensure SUPABASE_URL / SUPABASE_SERVICE_KEY from erp_api/.env are available.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

_SYNC_WORKER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sync_worker")
if _SYNC_WORKER not in sys.path:
    sys.path.insert(0, _SYNC_WORKER)
from config import build_config  # noqa: E402

log = logging.getLogger("erp_api.contracts")
router = APIRouter(prefix="/contracts", tags=["contracts"])

BUCKET = "contracts"
ALLOWED_SIGNED_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
}
MAX_SIGNED_BYTES = 15 * 1024 * 1024


# ── Supabase Storage (REST) ─────────────────────────────────────────────────

def _supabase() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase URL/service key not configured")
    return url.rstrip("/"), key


def _storage_upload(path: str, data: bytes, content_type: str) -> str:
    """Upload bytes to the public 'contracts' bucket (upsert) and return a
    cache-busted public URL."""
    url, key = _supabase()
    req = urllib.request.Request(
        f"{url}/storage/v1/object/{BUCKET}/{path}",
        data=data,
        method="POST",
    )
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", content_type)
    req.add_header("x-upsert", "true")  # overwrite on regenerate/re-upload
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        log.error("Storage upload failed for %s: %s", path, detail)
        raise HTTPException(status_code=502, detail="Could not upload contract file") from exc
    return f"{url}/storage/v1/object/public/{BUCKET}/{path}?v={int(datetime.utcnow().timestamp())}"


# ── Supabase Postgres (gym_members) ─────────────────────────────────────────

def _gym_conn():
    return psycopg2.connect(**build_config().gym_conn_str, sslmode="require")


def _update_contract_status(customer_id: str, **fields) -> None:
    if not fields:
        return
    sets = ", ".join(f"{key} = %s" for key in fields)
    conn = _gym_conn()
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE gym_members SET {sets} WHERE erp_customer_id = %s",
                (*fields.values(), customer_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail=f"Member {customer_id!r} not found")
    finally:
        conn.close()


# ── Member + plan lookup ─────────────────────────────────────────────────────

def _member_and_plan(customer_id: str) -> dict:
    """Live ERP identity (CustomerMaster) + current plan (Supabase
    v_member_status, already correctly computed by the sync). In DEMO_MODE,
    identity comes from gym_members instead — same fields, no ERP touch."""
    if demo_mode.DEMO_MODE:
        identity = demo_mode.member_identity(customer_id)
        if identity is None:
            raise HTTPException(status_code=404, detail=f"Member {customer_id!r} not found")
        member = {
            "customer_id": identity["erp_customer_id"] or customer_id,
            "first_name":  identity["first_name"] or "",
            "last_name":   identity["last_name"] or "",
            "mobile":      identity["mobile"] or "",
            "email":       identity["email"] or "",
            "card_id":     identity["card_id"] or "",
            "plan_name":   None,
            "membership_start": None,
        }
    else:
        try:
            with erp_conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT CustomerID, FirstName, LastName, Mobile, Email, CardID "
                    "FROM CustomerMaster WHERE CustomerID = ?",
                    customer_id,
                )
                row = cur.fetchone()
        except pyodbc.Error as exc:
            log.error("ERP DB error fetching customer %s: %s", customer_id, exc)
            raise HTTPException(status_code=500, detail=f"ERP database error: {exc}") from exc

        if row is None:
            raise HTTPException(status_code=404, detail=f"Member {customer_id!r} not found in ERP")

        member = {
            "customer_id": str(row[0]).strip(),
            "first_name":  str(row[1] or "").strip(),
            "last_name":   str(row[2] or "").strip(),
            "mobile":      str(row[3] or "").strip(),
            "email":       str(row[4] or "").strip(),
            "card_id":     str(row[5] or "").strip(),
            "plan_name":   None,
            "membership_start": None,
        }

    conn = _gym_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT plan_name, membership_start FROM v_member_status WHERE erp_customer_id = %s",
                (customer_id,),
            )
            plan_row = cur.fetchone()
    finally:
        conn.close()

    if plan_row:
        member["plan_name"] = plan_row.get("plan_name")
        start = plan_row.get("membership_start")
        member["membership_start"] = start.strftime("%d %b %Y") if isinstance(start, date) else start

    return member


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{customer_id}/generate")
def generate_contract(customer_id: str):
    member = _member_and_plan(customer_id)
    pdf_bytes = generate_contract_pdf(member)

    pdf_url = _storage_upload(f"{customer_id}/contract.pdf", pdf_bytes, "application/pdf")

    _update_contract_status(
        customer_id,
        contract_status="generated",
        contract_generated_at=datetime.utcnow(),
    )

    return {"pdf_url": pdf_url}


@router.post("/{customer_id}/upload-signed")
async def upload_signed_contract(customer_id: str, file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_SIGNED_TYPES:
        raise HTTPException(status_code=415, detail="Only PDF, JPEG, or PNG files are accepted")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Empty file")
    if len(data) > MAX_SIGNED_BYTES:
        raise HTTPException(status_code=413, detail="File must be under 15 MB")

    ext = ALLOWED_SIGNED_TYPES[file.content_type]
    signed_url = _storage_upload(f"{customer_id}/signed.{ext}", data, file.content_type)

    _update_contract_status(
        customer_id,
        contract_status="signed",
        signed_contract_url=signed_url,
    )

    return {"signed_url": signed_url}
