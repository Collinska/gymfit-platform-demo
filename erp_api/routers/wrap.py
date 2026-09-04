"""Gym Wrap — per-member monthly summary from Supabase check-ins + ERP purchases
+ precomputed monthly_stats. Endpoints: data JSON, rendered HTML, and send."""

from __future__ import annotations

import logging
import os
import sys
import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import psycopg2
from fastapi import APIRouter, Query
from pydantic import BaseModel

from db import erp_conn
import demo_mode

from gym_db import gym_conn_str  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from wrap_template import render_wrap_html  # noqa: E402
from business_settings import get_business_details  # noqa: E402
from email_service import send_email, get_smtp_settings  # noqa: E402

log = logging.getLogger("erp_api.wrap")
router = APIRouter(prefix="/wrap", tags=["wrap"])

EAT = timezone(timedelta(hours=3))   # Africa/Nairobi

# Same paid-or-posted rule the rest of the reports use (SQL-2008 safe).
_PAID = """(
    sh.Status = 2
    OR (sh.Status = 0 AND sh.BillAmount <= (
        SELECT ISNULL(SUM(sp.Amount), 0) FROM SalePayment sp
        WHERE sp.SerialNumber = sh.SerialNumber AND ISNULL(sp.IsDeleted, 0) = 0))
)"""


def _gym_conn():
    return psycopg2.connect(**gym_conn_str(), sslmode="require")


def _month_bounds(month: str) -> tuple[date, date]:
    y, mo = int(month[:4]), int(month[5:7])
    start = date(y, mo, 1)
    end = date(y + 1, 1, 1) if mo == 12 else date(y, mo, 28) + timedelta(days=4)
    end = end.replace(day=1)
    return start, end


def _prev_month(month: str) -> str:
    y, mo = int(month[:4]), int(month[5:7])
    return f"{y-1:04d}-12" if mo == 1 else f"{y:04d}-{mo-1:02d}"


def _time_block(hour: int) -> str:
    # Every hour maps to a friendly label (no "Off-hours").
    if 5 <= hour <= 11:
        return "Morning"
    if 12 <= hour <= 16:
        return "Afternoon"
    if 17 <= hour <= 20:
        return "Evening"
    return "Night"  # 21:00–04:59


def _fetch_month_checkins(gym_cur, member_id: int, month: str) -> list[datetime]:
    """Successful check-in timestamps (UTC, tz-aware) for member+month."""
    if member_id is None:
        return []
    gym_cur.execute(
        """
        SELECT checkin_at FROM gym_checkins
        WHERE member_id = %s
          AND TO_CHAR(checkin_at, 'YYYY-MM') = %s
          AND (notes IS NULL OR notes NOT LIKE '%%Access denied%%')
        """,
        (member_id, month),
    )
    return [r[0] for r in gym_cur.fetchall()]


def _summarize_checkins(checkins: list[datetime]) -> dict:
    local = [c.astimezone(EAT) for c in checkins]
    dates = sorted({d.date() for d in local})

    day_counter = Counter(d.strftime("%A") for d in local)
    block_counter = Counter(_time_block(d.hour) for d in local)
    week_counter = Counter((d.isocalendar()[0], d.isocalendar()[1]) for d in local)

    # longest consecutive-day streak
    longest = run = 0
    prev = None
    for d in dates:
        run = run + 1 if (prev is not None and (d - prev).days == 1) else 1
        longest = max(longest, run)
        prev = d

    return {
        "total_visits": len(local),
        "favorite_day": day_counter.most_common(1)[0][0] if day_counter else None,
        "favorite_time_block": block_counter.most_common(1)[0][0] if block_counter else None,
        "visit_dates": [d.isoformat() for d in dates],
        "longest_streak": longest,
        "weeks_with_3plus": sum(1 for v in week_counter.values() if v >= 3),
    }


def gather_wrap_data(customer_id: str, month: str) -> dict:
    start, end = _month_bounds(month)
    month_label = datetime.strptime(month + "-01", "%Y-%m-%d").strftime("%B %Y")

    # ── 1) Member info + 3) items — ERP normally, Supabase in DEMO_MODE ──
    if demo_mode.DEMO_MODE:
        identity = demo_mode.member_identity(customer_id)
        member = {
            "first_name":  identity["first_name"] or "" if identity else "",
            "last_name":   identity["last_name"] or "" if identity else "",
            "mobile":      identity["mobile"] or "" if identity else "",
            "email":       identity["email"] or "" if identity else "",
            "customer_id": identity["erp_customer_id"] if identity else customer_id,
            "account_id":  None,
        }
        # Section 2 below re-resolves this same id via its own connection —
        # cheap, idempotent, and keeps this branch self-contained.
        demo_conn = demo_mode.gym_conn()
        try:
            with demo_conn.cursor() as dc:
                dc.execute("SELECT id FROM gym_members WHERE erp_customer_id = %s", (customer_id,))
                drow = dc.fetchone()
        finally:
            demo_conn.close()
        item_list = demo_mode.wrap_purchases(drow[0] if drow else None, start, end)
    else:
        with erp_conn() as erp:
            cur = erp.cursor()
            cur.execute(
                "SELECT FirstName, LastName, Mobile, Email, CustomerID, AccountID "
                "FROM CustomerMaster WHERE CustomerID = ?",
                customer_id,
            )
            row = cur.fetchone()
            member = {
                "first_name":  (row[0] or "").strip() if row else "",
                "last_name":   (row[1] or "").strip() if row else "",
                "mobile":      (row[2] or "").strip() if row else "",
                "email":       (row[3] or "").strip() if row else "",
                "customer_id": (row[4] or "").strip() if row else customer_id,
                "account_id":  int(row[5]) if row and row[5] is not None else None,
            } if row else {"customer_id": customer_id}

            cur.execute(
                f"""
                SELECT pm.ProductName, sd.Quantity, sd.FinalSaleRate,
                       (sd.FinalSaleRate * sd.Quantity) AS LineTotal, sh.VoucherDate
                FROM SaleHeader sh
                JOIN SaleDetail sd    ON sd.SerialNumber = sh.SerialNumber
                JOIN ProductMaster pm ON pm.ProductID    = sd.ProductID
                WHERE sh.CustomerID = ?
                  AND sh.TableName = N'MEMBER'
                  AND {_PAID}
                  AND sh.VoucherDate >= ? AND sh.VoucherDate < ?
                ORDER BY sh.VoucherDate
                """,
                customer_id, start.isoformat(), end.isoformat(),
            )
            item_rows = cur.fetchall()

        item_list = [
            {
                "product_name": str(r[0] or "").strip(),
                "quantity":     float(r[1] or 0),
                "rate":         float(r[2] or 0),
                "line_total":   float(r[3] or 0),
                "date":         str(r[4])[:10],
            }
            for r in item_rows
        ]
    total_spent = round(sum(i["line_total"] for i in item_list), 2)
    items = (
        {"list": item_list, "total_spent": total_spent, "item_count": len(item_list)}
        if item_list else None
    )

    # ── 2) check-ins + 4) productivity (Supabase) ──
    gym = _gym_conn()
    try:
        gcur = gym.cursor()
        gcur.execute("SELECT id FROM gym_members WHERE erp_customer_id = %s", (customer_id,))
        mrow = gcur.fetchone()
        member_id = mrow[0] if mrow else None

        this_checkins = _fetch_month_checkins(gcur, member_id, month)
        chk = _summarize_checkins(this_checkins)

        prev_month = _prev_month(month)
        prev_checkins = _fetch_month_checkins(gcur, member_id, prev_month)
        prev_visits = len(prev_checkins)
        this_visits = chk["total_visits"]

        if prev_visits > 0:
            change_pct = round((this_visits - prev_visits) / prev_visits * 100, 1)
            direction = "up" if this_visits > prev_visits else ("down" if this_visits < prev_visits else "flat")
        else:
            change_pct = None
            direction = "flat"

        # vs gym average (from monthly_stats)
        vs_average = None
        gcur.execute(
            "SELECT avg_visits, percentile_data FROM monthly_stats WHERE month = %s", (month,)
        )
        srow = gcur.fetchone()
        if srow:
            avg_visits = float(srow[0] or 0)
            dist = srow[1] or {}
            total_members = sum(int(v) for v in dist.values())
            members_below = sum(int(v) for k, v in dist.items() if int(k) < this_visits)
            pct = round(members_below / total_members * 100) if total_members else None
            vs_average = {"more_active_than_pct": pct, "avg_visits": round(avg_visits, 2)}
    finally:
        gym.close()

    productivity = {
        "visits": this_visits,
        "prev_visits": prev_visits,
        "change_pct": change_pct,
        "direction": direction,
        "weeks_with_3plus": chk["weeks_with_3plus"],
        "longest_streak": chk["longest_streak"],
        "vs_average": vs_average,
    }

    return {
        "month": month,
        "month_label": month_label,
        "member": member,
        "checkins": chk,
        "items": items,
        "productivity": productivity,
    }


def _default_month(month: Optional[str]) -> str:
    return month or datetime.now().strftime("%Y-%m")


@router.get("/{customer_id}")
def wrap_data(customer_id: str, month: Optional[str] = Query(None)):
    return gather_wrap_data(customer_id, _default_month(month))


@router.get("/{customer_id}/html")
def wrap_html(customer_id: str, month: Optional[str] = Query(None)):
    data = gather_wrap_data(customer_id, _default_month(month))
    member = data.get("member", {})
    email = member.get("email") or ""
    return {
        "html": render_wrap_html(data),
        "member": member,
        "has_email": bool(email),
        "email": email,
    }


@router.post("/{customer_id}/send")
def wrap_send(customer_id: str, month: Optional[str] = Query(None)):
    data = gather_wrap_data(customer_id, _default_month(month))
    member = data.get("member", {})
    email = (member.get("email") or "").strip()
    if not email:
        return {"sent": False, "error": "No email on file"}

    biz_name = get_business_details()["name"] or "Fitness Mania"
    subject = f"Your {data.get('month_label', '')} Gym Wrap — {biz_name} 🎉"
    html = render_wrap_html(data)
    sent, error = send_email(email, subject, html)
    return {"sent": sent, "error": error}


class BatchWrapBody(BaseModel):
    customer_ids: list[str]
    month: Optional[str] = None


@router.post("/send-batch")
def wrap_send_batch(body: BatchWrapBody):
    """Render + send a wrap to each selected member, throttled. Skips no-email."""
    month = _default_month(body.month)
    settings = get_smtp_settings()          # load SMTP config once
    throttle = int(settings.get("throttle") or 3)
    biz_name = get_business_details()["name"] or "Fitness Mania"

    results = []
    sent_count = 0
    failed_count = 0
    total = len(body.customer_ids)

    for i, cid in enumerate(body.customer_ids):
        name = cid
        try:
            data = gather_wrap_data(cid, month)
            member = data.get("member", {})
            name = f"{member.get('first_name', '')} {member.get('last_name', '')}".strip() or cid
            email = (member.get("email") or "").strip()
            if not email:
                results.append({"customer_id": cid, "name": name, "sent": False, "error": "No email on file"})
                failed_count += 1
                continue
            subject = f"Your {data.get('month_label', '')} Gym Wrap — {biz_name} 🎉"
            html = render_wrap_html(data)
            sent, error = send_email(email, subject, html, settings=settings)
            results.append({"customer_id": cid, "name": name, "sent": sent, "error": error})
            if sent:
                sent_count += 1
            else:
                failed_count += 1
        except Exception as exc:
            results.append({"customer_id": cid, "name": name, "sent": False, "error": str(exc)})
            failed_count += 1

        if i < total - 1:
            time.sleep(throttle)

    return {"total": total, "sent": sent_count, "failed": failed_count, "results": results}
