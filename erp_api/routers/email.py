"""Email endpoints — /email/... (test, generic send, throttled batch)."""

from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from email_service import get_smtp_settings, send_email

log = logging.getLogger("erp_api.email")
router = APIRouter(prefix="/email", tags=["email"])

TEST_HTML = """
<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:auto;">
  <div style="background:#0d9488;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;">
    <h2 style="margin:0;font-size:18px;">Fitness Mania</h2>
  </div>
  <div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 12px 12px;">
    <p style="color:#1c1c1e;">✅ Your SMTP settings are working.</p>
    <p style="color:#8e8e93;font-size:13px;">This is a test email sent from the Fitness Mania operations console.</p>
  </div>
</div>
"""


class TestBody(BaseModel):
    to: str


class SendBody(BaseModel):
    to: str
    subject: str
    html: str


class BatchItem(BaseModel):
    to: str
    subject: str
    html: str


class BatchBody(BaseModel):
    emails: list[BatchItem]


def _valid_email(addr: Optional[str]) -> bool:
    return bool(addr) and "@" in addr and "." in addr.split("@")[-1]


@router.post("/test")
def send_test(body: TestBody):
    sent, error = send_email(body.to, "Fitness Mania — SMTP Test", TEST_HTML)
    if sent:
        return {"sent": True}
    return {"sent": False, "error": error}


@router.post("/send")
def send_one(body: SendBody):
    sent, error = send_email(body.to, body.subject, body.html)
    return {"sent": sent, "error": error}


@router.post("/send-batch")
def send_batch(body: BatchBody):
    # Load SMTP settings ONCE for the whole batch.
    settings = get_smtp_settings()
    throttle = int(settings.get("throttle") or 3)

    results = []
    sent_count = 0
    failed_count = 0
    total = len(body.emails)

    for i, item in enumerate(body.emails):
        if not _valid_email(item.to):
            results.append({"to": item.to, "sent": False, "error": "Invalid recipient"})
            failed_count += 1
            continue

        sent, error = send_email(item.to, item.subject, item.html, settings=settings)
        results.append({"to": item.to, "sent": sent, "error": error})
        if sent:
            sent_count += 1
        else:
            failed_count += 1

        # Throttle between sends (not after the last one).
        if i < total - 1:
            time.sleep(throttle)

    return {
        "total": total,
        "sent": sent_count,
        "failed": failed_count,
        "results": results,
    }
