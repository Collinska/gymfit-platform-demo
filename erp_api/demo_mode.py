"""DEMO_MODE — when set, every erp_api endpoint that would otherwise dial the
real ERP (FusionERP / FR8RootDB) instead reads/writes ONLY Supabase, using
the demo project's pre-seeded data (see demo/seed.py). Defaults to false, so
a normal/production deployment is completely unaffected — nothing here runs
unless the env var is explicitly set.

Account-ID scheme: the ERP's AccountID has no Supabase analogue, so writes
here synthesize one as `ACCOUNT_ID_OFFSET + gym_members.id` — deterministic,
reversible (member_id = account_id - ACCOUNT_ID_OFFSET), and obviously outside
any real ERP account-id range if ever cross-referenced. For a brand-new member
(not yet inserted), the id is reserved via the table's own sequence with
nextval() — not predicted — so it's guaranteed to match the id the frontend's
following INSERT will actually receive, no race condition.

sales.category convention used here: 'membership' | 'retail' (real purchases,
credit against a member) | 'deposit' (wallet top-up, debit against a member,
matches the real GL sense of a deposit crediting the member's account)."""

from __future__ import annotations

import os
import sys
from datetime import date, datetime
from typing import Any, Optional

import psycopg2
import psycopg2.extras

_SYNC_WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sync_worker")
if _SYNC_WORKER not in sys.path:
    sys.path.insert(0, os.path.abspath(_SYNC_WORKER))
from config import build_config  # noqa: E402

DEMO_MODE = os.getenv("DEMO_MODE", "false").strip().lower() == "true"
ACCOUNT_ID_OFFSET = 900_000
MEMBERSHIP_MENU_ID = 1   # demo_products.menu_id for the Memberships menu — see demo/seed.py


class DemoOutOfStockError(Exception):
    """Mirrors the real ERP's out-of-stock 400 (see routers/sales.py's
    STEP 3b) so routers/sales.py can shape an identical error response."""

    def __init__(self, items: list[dict]):
        self.items = items
        super().__init__("Out of stock")


def gym_conn():
    return psycopg2.connect(**build_config().gym_conn_str, sslmode="require")


def dict_cur(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def account_id_for(member_id: int) -> int:
    return ACCOUNT_ID_OFFSET + member_id


def member_id_for(account_id: int) -> Optional[int]:
    mid = account_id - ACCOUNT_ID_OFFSET
    return mid if mid > 0 else None


def _member_balance(conn, member_id: int) -> float:
    """deposits (credit) minus membership/retail purchases (debit) — mirrors
    the real GL's AccountMaster.CreditAmount - DebitAmount sense. Opens its
    own plain (tuple) cursor so it works regardless of the caller's cursor
    factory (callers use RealDictCursor, which isn't index-addressable)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE category = 'deposit'), 0)
              - COALESCE(SUM(amount) FILTER (WHERE category IN ('membership', 'retail')), 0)
            FROM sales WHERE member_id = %s
            """,
            (member_id,),
        )
        return float(cur.fetchone()[0] or 0)


# ── (a) Writes ───────────────────────────────────────────────────────────────

def create_member(first_name: str, last_name: str, mobile: str, email: str) -> dict:
    conn = gym_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(erp_customer_id::int), 0) + 1 "
                "FROM gym_members WHERE erp_customer_id ~ '^[0-9]+$'"
            )
            next_customer_int = int(cur.fetchone()[0])
            customer_id = str(next_customer_int).zfill(5)

            # Reserve the id the frontend's upcoming gym_members INSERT will
            # receive — nextval() atomically advances the sequence, so this
            # is exact, not a guess (a skipped id if that insert ever fails
            # is harmless; sequences are allowed gaps).
            cur.execute("SELECT nextval(pg_get_serial_sequence('gym_members', 'id'))")
            reserved_id = int(cur.fetchone()[0])
        conn.commit()
    finally:
        conn.close()

    return {
        "customer_id": customer_id,
        "account_id": account_id_for(reserved_id),
        "ml_number": 1,
    }


def create_deposit(account_id: int, amount: float, payment_method: str, narration: str) -> dict:
    member_id = member_id_for(account_id)
    if member_id is None:
        raise ValueError(f"account_id {account_id} is not a demo-mode account")

    conn = gym_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sales (member_id, item_name, category, amount, payment_method, staff_name)
                VALUES (%s, %s, 'deposit', %s, %s, 'Demo Front Desk')
                RETURNING id
                """,
                (member_id, narration or f"{payment_method.title()} deposit", amount, payment_method),
            )
            new_id = cur.fetchone()[0]
        conn.commit()
    finally:
        conn.close()

    return {
        "serial_number": f"DEMO-DEP-{new_id}",
        "vch_number": new_id,
        "amount": amount,
    }


def create_sale(
    customer_id: str, items: list[dict], bill_amount: float, enforce_stock_check: bool = True
) -> dict:
    conn = gym_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM gym_members WHERE erp_customer_id = %s", (customer_id,))
            row = cur.fetchone()
            member_id = row[0] if row else None

            # Look up each item's catalog row once — used for both the stock
            # check below and the nicer item_name/category on insert.
            catalog: dict[str, tuple] = {}
            for item in items:
                pid = item.get("product_id", "")
                cur.execute(
                    "SELECT display_name, menu_id, is_stock_item, stock_qty FROM demo_products WHERE product_id = %s",
                    (pid,),
                )
                catalog[pid] = cur.fetchone()

            # Stock check — mirrors the real ERP's STEP 3b (routers/sales.py):
            # only physical stocked goods are checked; unknown/service items pass.
            if enforce_stock_check:
                out_of_stock = []
                for item in items:
                    prow = catalog.get(item.get("product_id", ""))
                    if not prow or not prow[2]:
                        continue
                    qty_avail = float(prow[3] or 0)
                    if qty_avail <= 0:
                        out_of_stock.append({"product_id": item.get("product_id", ""), "product_name": prow[0]})
                if out_of_stock:
                    raise DemoOutOfStockError(out_of_stock)

            new_ids = []
            for item in items:
                pid = item.get("product_id", "")
                prow = catalog.get(pid)
                name = prow[0] if prow else (pid or "item")
                category = "membership" if prow and prow[1] == MEMBERSHIP_MENU_ID else "retail"
                qty = item.get("quantity", 1)

                cur.execute(
                    """
                    INSERT INTO sales (member_id, item_name, category, amount, payment_method, staff_name)
                    VALUES (%s, %s, %s, %s, 'Credit Sale', 'Demo Front Desk')
                    RETURNING id
                    """,
                    (member_id, name, category, item.get("sale_rate", 0) * qty),
                )
                new_ids.append(cur.fetchone()[0])

                if prow and prow[2]:  # is_stock_item — deduct, mirrors the real ERP's Sale_Trigger
                    cur.execute(
                        "UPDATE demo_products SET stock_qty = GREATEST(stock_qty - %s, 0), updated_at = now() "
                        "WHERE product_id = %s",
                        (qty, pid),
                    )
        conn.commit()
    finally:
        conn.close()

    lead_id = new_ids[0] if new_ids else 0
    return {
        "serial_number": f"DEMO-SALE-{lead_id}",
        "vch_number": lead_id,
        "bill_amount": bill_amount,
        "gl_serial": "",
    }


# ── (b) Reads — Supabase-backed ─────────────────────────────────────────────

def list_products() -> dict:
    """Supabase-backed swap-in for products.py's list_products — shapes
    identically to the real ERP's {"menus": [{menu_id, menu_name, items}]}."""
    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            cur.execute(
                """
                SELECT menu_id, menu_name, product_id, display_name, product_name,
                       rate, mrp, tax_id, tax_value, tax_name, include_in_rate,
                       ask_price, is_stock_item
                FROM demo_products
                ORDER BY menu_id, display_name
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    menus: dict[int, dict] = {}
    for r in rows:
        menu = menus.setdefault(r["menu_id"], {"menu_id": r["menu_id"], "menu_name": r["menu_name"], "items": []})
        menu["items"].append({
            "product_id": r["product_id"],
            "display_name": r["display_name"] or r["product_name"] or "",
            "product_name": r["product_name"] or "",
            "rate": float(r["rate"] or 0),
            "mrp": float(r["mrp"] or 0),
            "tax_id": int(r["tax_id"] or 0),
            "tax_value": float(r["tax_value"] or 0),
            "tax_name": r["tax_name"] or "",
            "include_in_rate": bool(r["include_in_rate"]),
            "ask_price": bool(r["ask_price"]),
            "is_stock_item": bool(r["is_stock_item"]),
        })
    return {"menus": list(menus.values())}


def stock_levels() -> dict:
    """Supabase-backed swap-in for products.py's get_stock_levels."""
    conn = gym_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT product_id, stock_qty FROM demo_products WHERE is_stock_item AND stock_qty IS NOT NULL")
            rows = cur.fetchall()
    finally:
        conn.close()
    return {"stock": {pid: float(qty or 0) for pid, qty in rows}}


def product_stock(product_id: str) -> float:
    """Supabase-backed swap-in for products.py's get_product_stock."""
    conn = gym_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT stock_qty FROM demo_products WHERE product_id = %s", (product_id,))
            row = cur.fetchone()
    finally:
        conn.close()
    return float(row[0]) if row and row[0] is not None else 0.0


def search_members(q: str) -> dict:
    pattern = f"%{q}%"
    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            cur.execute(
                """
                SELECT id, erp_customer_id, first_name, last_name, mobile, card_id, is_active
                FROM gym_members
                WHERE first_name ILIKE %s OR last_name ILIKE %s OR mobile ILIKE %s OR card_id ILIKE %s
                ORDER BY first_name LIMIT 10
                """,
                (pattern, pattern, pattern, pattern),
            )
            rows = cur.fetchall()
            members = []
            for r in rows:
                members.append({
                    "customer_id": r["erp_customer_id"] or "",
                    "first_name": r["first_name"] or "",
                    "last_name": r["last_name"] or "",
                    "mobile": r["mobile"] or "",
                    "card_id": r["card_id"] or "",
                    "account_id": account_id_for(r["id"]),
                    "balance": _member_balance(conn, r["id"]),
                    "is_active": bool(r["is_active"]),
                })
        return {"members": members}
    finally:
        conn.close()


def member_balance(customer_id: str) -> Optional[dict]:
    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            cur.execute(
                "SELECT id, erp_customer_id, first_name, last_name, mobile FROM gym_members WHERE erp_customer_id = %s",
                (customer_id,),
            )
            r = cur.fetchone()
            if not r:
                return None
            return {
                "customer_id": r["erp_customer_id"] or "",
                "first_name": r["first_name"] or "",
                "last_name": r["last_name"] or "",
                "account_id": account_id_for(r["id"]),
                "mobile": r["mobile"] or "",
                "balance": _member_balance(conn, r["id"]),
            }
    finally:
        conn.close()


def member_identity(customer_id: str) -> Optional[dict]:
    """First/last/mobile/email/card_id — the Supabase-backed swap-in for
    contracts.py's CustomerMaster read and wrap.py's member-info read."""
    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            cur.execute(
                "SELECT erp_customer_id, first_name, last_name, mobile, email, card_id "
                "FROM gym_members WHERE erp_customer_id = %s",
                (customer_id,),
            )
            r = cur.fetchone()
            return dict(r) if r else None
    finally:
        conn.close()


def wrap_purchases(member_id: Optional[int], start: date, end: date) -> list[dict]:
    if member_id is None:
        return []
    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            cur.execute(
                """
                SELECT item_name, amount, sold_at
                FROM sales
                WHERE member_id = %s AND category IN ('membership', 'retail')
                  AND sold_at >= %s AND sold_at < %s
                ORDER BY sold_at
                """,
                (member_id, start, end),
            )
            return [
                {
                    "product_name": r["item_name"] or "",
                    "quantity": 1.0,
                    "rate": float(r["amount"] or 0),
                    "line_total": float(r["amount"] or 0),
                    "date": r["sold_at"].date().isoformat() if r["sold_at"] else "",
                }
                for r in cur.fetchall()
            ]
    finally:
        conn.close()


# ── (b) Reports — Supabase-backed ───────────────────────────────────────────

def sales_by_invoice(date_from: str, date_to: str) -> dict:
    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            cur.execute(
                """
                SELECT s.id, s.sold_at, s.amount, s.staff_name,
                       m.erp_customer_id, m.first_name, m.last_name, m.mobile
                FROM sales s LEFT JOIN gym_members m ON m.id = s.member_id
                WHERE s.category IN ('membership', 'retail')
                  AND s.sold_at >= %s AND s.sold_at < (%s::date + interval '1 day')
                ORDER BY s.sold_at DESC
                """,
                (date_from, date_to),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    invoices = []
    total_amount = 0.0
    for r in rows:
        amt = float(r["amount"] or 0)
        name = f"{r['first_name'] or ''} {r['last_name'] or ''}".strip()
        invoices.append({
            "serial_number": f"DEMO-{r['id']}",
            "voucher_date": r["sold_at"].isoformat() if r["sold_at"] else "",
            "invoice_no": f"DEMO/{r['id']}",
            "customer_id": r["erp_customer_id"] or "",
            "customer_name": name,
            "mobile": r["mobile"] or "",
            "bill_amount": amt,
            "sub_total": amt,
            "tax_total": 0.0,     # tax isn't modeled in the demo's seeded sales
            "net_amount": amt,
            "location_id": 15,
            "user_id": 1,
            "user_name": r["staff_name"] or "",
        })
        total_amount += amt

    return {
        "invoices": invoices,
        "summary": {
            "total_sales": len(invoices),
            "total_amount": round(total_amount, 2),
            "total_tax": 0.0,
            "total_net": round(total_amount, 2),
        },
    }


def sales_by_product(date_from: str, date_to: str) -> dict:
    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            cur.execute(
                """
                SELECT item_name,
                       COUNT(*) AS invoice_count,
                       SUM(amount) AS total_amount
                FROM sales
                WHERE category IN ('membership', 'retail')
                  AND sold_at >= %s AND sold_at < (%s::date + interval '1 day')
                GROUP BY item_name
                ORDER BY total_amount DESC
                """,
                (date_from, date_to),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    products = []
    total_amount = 0.0
    for r in rows:
        amt = float(r["total_amount"] or 0)
        products.append({
            "product_id": r["item_name"] or "",
            "product_name": r["item_name"] or "",
            "product_group_id": 0,        # no group/department concept in the demo schema
            "product_group_name": "",
            "department_id": 0,
            "department_name": "",
            "total_qty": float(r["invoice_count"] or 0),
            "total_amount": amt,
            "total_tax": 0.0,
            "total_net": amt,
            "invoice_count": int(r["invoice_count"] or 0),
        })
        total_amount += amt

    return {
        "products": products,
        "summary": {
            "total_qty": float(sum(p["total_qty"] for p in products)),
            "total_amount": round(total_amount, 2),
            "total_tax": 0.0,
            "total_net": round(total_amount, 2),
        },
    }


def day_audit(audit_date: str) -> dict:
    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            cur.execute(
                """
                SELECT s.id, s.item_name, s.category, s.amount, s.payment_method,
                       s.staff_name, s.sold_at, m.first_name, m.last_name
                FROM sales s LEFT JOIN gym_members m ON m.id = s.member_id
                WHERE s.sold_at::date = %s::date
                ORDER BY s.sold_at DESC
                """,
                (audit_date,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    deposits = [r for r in rows if r["category"] == "deposit"]
    sales_rows = [r for r in rows if r["category"] in ("membership", "retail")]

    def _group_by_mop(records):
        by_mop: dict[str, dict] = {}
        for r in records:
            mop = r["payment_method"] or "Unknown"
            g = by_mop.setdefault(mop, {"tx_count": 0, "total_amount": 0.0})
            g["tx_count"] += 1
            g["total_amount"] += float(r["amount"] or 0)
        return by_mop

    def _group_by_staff(records, amount_key):
        by_staff: dict[str, dict] = {}
        for r in records:
            staff = r["staff_name"] or "Unknown"
            g = by_staff.setdefault(staff, {"count": 0, "total": 0.0})
            g["count"] += 1
            g["total"] += float(r["amount"] or 0)
        return by_staff

    deposits_by_mop = [
        {"mop_account_id": 0, "payment_method": mop, "tx_count": g["tx_count"], "total_amount": round(g["total_amount"], 2)}
        for mop, g in _group_by_mop(deposits).items()
    ]
    sales_by_staff = _group_by_staff(sales_rows, "amount")
    sales_by_user = [
        {"user_id": 1, "user_name": staff, "invoice_count": g["count"], "total_sales": round(g["total"], 2), "total_tax": 0.0, "total_net": round(g["total"], 2)}
        for staff, g in sales_by_staff.items()
    ]
    deposits_by_staff = _group_by_staff(deposits, "amount")
    deposits_by_user = [
        {"user_id": 1, "user_name": staff, "tx_count": g["count"], "total_amount": round(g["total"], 2)}
        for staff, g in deposits_by_staff.items()
    ]
    tx_log = [
        {
            "serial_number": f"DEMO-{r['id']}",
            "voucher_date": r["sold_at"].isoformat() if r["sold_at"] else "",
            "vch_number": r["id"],
            "mop_account_id": 0,
            "mop_name": r["payment_method"] or "",
            "amount": float(r["amount"] or 0),
            "member_name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
            "narration": r["item_name"] or "",
            "user_name": r["staff_name"] or "",
        }
        for r in rows
    ][:200]

    total_deposits = sum(g["total_amount"] for g in deposits_by_mop)
    total_sales = sum(u["total_sales"] for u in sales_by_user)

    return {
        "date": audit_date,
        "location_id": None,
        "deposits_by_mop": deposits_by_mop,
        "sales_by_user": sales_by_user,
        "deposits_by_user": deposits_by_user,
        "tx_log": tx_log,
        "summary": {
            "total_deposits": round(total_deposits, 2),
            "total_sales": round(total_sales, 2),
            "total_tax": 0.0,
            "total_net": round(total_sales, 2),
            "total_invoices": len(sales_rows),
            "variance": round(total_deposits - total_sales, 2),
        },
    }


_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def revenue_summary() -> dict:
    today = date.today()
    start_this = today.replace(day=1)
    start_last_month = (start_this.replace(day=1) - __import__("datetime").timedelta(days=1)).replace(day=1)
    six_start_year = today.year if today.month > 5 else today.year - 1
    six_start_month = today.month - 5 if today.month > 5 else today.month + 7
    six_start = date(six_start_year, six_start_month, 1)

    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            def _period_totals(start, end):
                cur.execute(
                    """
                    SELECT COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS sales
                    FROM sales WHERE category IN ('membership', 'retail')
                      AND sold_at >= %s AND (%s::timestamptz IS NULL OR sold_at < %s)
                    """,
                    (start, end, end),
                )
                r = cur.fetchone()
                return float(r["revenue"] or 0), int(r["sales"] or 0)

            rev_this, sales_this = _period_totals(start_this, None)
            rev_last, sales_last = _period_totals(start_last_month, start_this)

            cur.execute(
                """
                SELECT date_trunc('month', sold_at) AS mo, COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS sales
                FROM sales WHERE category IN ('membership', 'retail') AND sold_at >= %s
                GROUP BY 1 ORDER BY 1
                """,
                (six_start,),
            )
            trend_rows = cur.fetchall()

            cur.execute(
                """
                SELECT item_name, COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS revenue
                FROM sales WHERE category IN ('membership','retail') AND sold_at >= %s
                GROUP BY item_name ORDER BY revenue DESC LIMIT 5
                """,
                (start_this,),
            )
            top_rows = cur.fetchall()

            def _new_members(start, end):
                cur.execute(
                    """
                    SELECT COUNT(*) FROM (
                        SELECT member_id, MIN(sale_date) AS first_date
                        FROM gym_memberships GROUP BY member_id
                    ) t WHERE t.first_date >= %s AND (%s::date IS NULL OR t.first_date < %s)
                    """,
                    (start, end, end),
                )
                return int(cur.fetchone()["count"] or 0)

            new_this = _new_members(start_this, None)
            new_last = _new_members(start_last_month, start_this)
    finally:
        conn.close()

    monthly_revenue = [
        {"month": f"{_MONTHS[r['mo'].month - 1]} {str(r['mo'].year)[2:]}", "revenue": round(float(r["revenue"] or 0), 2), "sales": int(r["sales"] or 0)}
        for r in trend_rows
    ]
    top_plans = [
        {"plan_name": r["item_name"] or "", "count": int(r["cnt"] or 0), "revenue": round(float(r["revenue"] or 0), 2)}
        for r in top_rows
    ]
    change_pct = ((rev_this - rev_last) / rev_last * 100) if rev_last > 0 else 0.0

    return {
        "revenue_this_month": round(rev_this, 2),
        "revenue_last_month": round(rev_last, 2),
        "revenue_change_pct": round(change_pct, 2),
        "sales_this_month": sales_this,
        "sales_last_month": sales_last,
        "monthly_revenue": monthly_revenue,
        "top_plans": top_plans,
        "new_this_month": new_this,
        "new_last_month": new_last,
    }


def staff_performance(date_from: str, date_to: str) -> dict:
    conn = gym_conn()
    try:
        with dict_cur(conn) as cur:
            cur.execute(
                """
                SELECT staff_name, COUNT(*) AS invoices, COALESCE(SUM(amount),0) AS total_sales
                FROM sales WHERE category IN ('membership','retail')
                  AND sold_at >= %s AND sold_at < (%s::date + interval '1 day')
                GROUP BY staff_name ORDER BY total_sales DESC
                """,
                (date_from, date_to),
            )
            sales_rows = cur.fetchall()
            cur.execute(
                """
                SELECT staff_name, COUNT(*) AS deposits, COALESCE(SUM(amount),0) AS total_deposited
                FROM sales WHERE category = 'deposit'
                  AND sold_at >= %s AND sold_at < (%s::date + interval '1 day')
                GROUP BY staff_name ORDER BY total_deposited DESC
                """,
                (date_from, date_to),
            )
            dep_rows = cur.fetchall()
    finally:
        conn.close()

    return {
        "sales_by_user": [
            {"user_name": r["staff_name"] or "", "user_id": 1, "invoices": int(r["invoices"] or 0), "total_sales": round(float(r["total_sales"] or 0), 2)}
            for r in sales_rows
        ],
        "deposits_by_user": [
            {"user_name": r["staff_name"] or "", "user_id": 1, "deposits": int(r["deposits"] or 0), "total_deposited": round(float(r["total_deposited"] or 0), 2)}
            for r in dep_rows
        ],
    }
