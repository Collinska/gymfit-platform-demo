"""GymFit DEMO environment seed script — idempotent, safe to re-run.

Targets ONLY the Supabase project described in .env.demo (never production).
Refuses to run if .env.demo is missing or references the production project
ref (ynunbegchlyyfhdffsim).

Usage:
    cd demo
    python seed.py
"""

from __future__ import annotations

import json
import os
import random
import secrets
import string
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

import psycopg2
import psycopg2.extras
from dotenv import dotenv_values

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, "..", ".env.demo")
PRODUCTION_REF = "ynunbegchlyyfhdffsim"


# ── Safety gate ──────────────────────────────────────────────────────────────

def load_demo_env() -> dict:
    if not os.path.exists(ENV_PATH):
        print(f"ABORT: {ENV_PATH} not found. This script only runs against a demo project.")
        sys.exit(1)
    env = dotenv_values(ENV_PATH)
    required = [
        "SUPABASE_DB_HOST", "SUPABASE_DB_PORT", "SUPABASE_DB_NAME",
        "SUPABASE_DB_USER", "SUPABASE_DB_PASSWORD", "SUPABASE_URL", "SUPABASE_SERVICE_KEY",
    ]
    missing = [k for k in required if not env.get(k)]
    if missing:
        print(f"ABORT: .env.demo missing required keys: {missing}")
        sys.exit(1)
    for key in ("SUPABASE_DB_HOST", "SUPABASE_URL", "SUPABASE_DB_USER"):
        if PRODUCTION_REF in str(env.get(key, "")):
            print(f"ABORT: .env.demo's {key} references the PRODUCTION project ({PRODUCTION_REF}). Refusing to run.")
            sys.exit(1)
    return env


def connect(env: dict):
    return psycopg2.connect(
        host=env["SUPABASE_DB_HOST"],
        port=int(env["SUPABASE_DB_PORT"]),
        dbname=env["SUPABASE_DB_NAME"],
        user=env["SUPABASE_DB_USER"],
        password=env["SUPABASE_DB_PASSWORD"],
        sslmode="require",
    )


# ── Fake Kenyan-context data pools (fabricated — no real member data) ───────

FIRST_NAMES = [
    "Wanjiru", "Otieno", "Njeri", "Mwangi", "Wafula", "Chebet", "Kiprotich", "Naliaka",
    "Muthoni", "Odhiambo", "Wambui", "Kimani", "Auma", "Njoroge", "Wekesa", "Nyambura",
    "Barasa", "Adhiambo", "Karanja", "Cherop", "Omondi", "Wairimu", "Ochieng", "Akinyi",
    "Kiptoo",
]
LAST_NAMES = [
    "Mutiso", "Kariuki", "Onyango", "Cheruiyot", "Njuguna", "Wanyama", "Maina", "Koech",
    "Gathoni", "Mburu", "Achieng", "Rotich", "Waithera", "Owino", "Kilonzo", "Mumbi",
    "Simiyu", "Nekesa", "Kamande", "Wekesa",
]
PLANS = [
    ("Monthly", 30, 5800), ("Quarterly", 90, 15500), ("Annual", 365, 55000),
    ("Student Offer", 30, 4200), ("Two Weeks Subscription", 14, 3200),
]
PAYMENT_METHODS = ["Cash", "M-Pesa", "Card"]
RETAIL_ITEMS = [
    ("Protein Shake", 450), ("Gym Towel", 600), ("Pre-Workout Sachet", 350),
    ("Locker Rental (Day)", 200), ("Resistance Band", 800),
]

# ── POS product catalog (powers /erp/products in DEMO_MODE — see
# erp_api/demo_mode.py). Price points reuse PLANS/RETAIL_ITEMS above where
# they overlap, for consistency with the seeded sales history.
# Columns: product_id, menu_id, menu_name, display_name, rate, mrp,
#          tax_value, ask_price, stock_qty (None = service, not stock-tracked)
# Rental product_ids (000I-000M) are a fixed set the frontend matches on
# (frontend/app/pos/page.tsx RENTAL_PRODUCT_IDS) — must not change.
PRODUCTS = [
    # Memberships — services, no VAT, no stock tracking.
    ("MEM01", 1, "Memberships", "Day Pass",                  500,   500,   0, False, None),
    ("MEM02", 1, "Memberships", "Weekly Pass",               2500,  2500,  0, False, None),
    ("MEM03", 1, "Memberships", "Two Weeks Membership",      3200,  3200,  0, False, None),
    ("MEM04", 1, "Memberships", "Monthly Membership",        5800,  5800,  0, False, None),
    ("MEM05", 1, "Memberships", "Two Months Membership",     10500, 10500, 0, False, None),
    ("MEM06", 1, "Memberships", "Quarterly Membership",      15500, 15500, 0, False, None),
    ("MEM07", 1, "Memberships", "Six Months Membership",     28000, 28000, 0, False, None),
    ("MEM08", 1, "Memberships", "Annual Membership",         55000, 55000, 0, False, None),
    ("MEM09", 1, "Memberships", "Student Membership",        4200,  4200,  0, False, None),
    ("MEM10", 1, "Memberships", "Personal Training Session", 1500,  1500,  0, True,  None),
    # POS Items — physical stocked goods, 16% VAT (inclusive), tracked stock.
    # RETL03 and RETL05 are deliberately low/zero to exercise the low-stock
    # amber badge and the out-of-stock block in the demo.
    ("RETL01", 2, "POS Items", "Protein Shake",      450,  500,  16, False, 40),
    ("RETL02", 2, "POS Items", "Sports Drink 500ml",  150,  180,  16, False, 60),
    ("RETL03", 2, "POS Items", "Bottled Water 500ml", 80,   100,  16, False, 5),
    ("RETL04", 2, "POS Items", "Energy Bar",          250,  280,  16, False, 25),
    ("RETL05", 2, "POS Items", "Pre-Workout Sachet",  350,  400,  16, False, 0),
    ("RETL06", 2, "POS Items", "Yoga Mat",            2200, 2500, 16, False, 12),
    ("RETL07", 2, "POS Items", "Gym Gloves",          1200, 1400, 16, False, 18),
    ("RETL08", 2, "POS Items", "Shaker Bottle",       600,  700,  16, False, 30),
    ("RETL09", 2, "POS Items", "Branded T-Shirt",     1800, 2000, 16, False, 15),
    ("RETL10", 2, "POS Items", "Resistance Band",     800,  900,  16, False, 22),
    # Rentals — fixed IDs, services, no VAT, no stock tracking.
    ("000I", 3, "Rentals", "Bath Towel",             100,  100,  0, False, None),
    ("000J", 3, "Rentals", "Bath Towel Replacement", 1500, 1500, 0, False, None),
    ("000K", 3, "Rentals", "Locker Service",         200,  200,  0, False, None),
    ("000L", 3, "Rentals", "Small Towel",            50,   50,   0, False, None),
    ("000M", 3, "Rentals", "Locker Money 10",        10,   10,   0, False, None),
]


def rand_name() -> tuple[str, str]:
    return random.choice(FIRST_NAMES), random.choice(LAST_NAMES)


def rand_mobile() -> str:
    return f"07{random.randint(10000000, 99999999)}"


# ── Auth admin (create the demo manager user) ────────────────────────────────

def auth_admin(env: dict, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    url = env["SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_KEY"]
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


def gen_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(14))


def seed_demo_manager(env: dict, cur) -> tuple[str, str]:
    email = "demo@fitnessmania.co"
    password = gen_password()

    status, resp = auth_admin(env, "POST", "users", {
        "email": email, "password": password, "email_confirm": True,
    })
    if status not in (200, 201):
        msg = str(resp.get("msg") or resp.get("error_description") or resp)
        if "already" in msg.lower() and "registered" in msg.lower():
            # Idempotent re-run: user exists already. Find it, reset the
            # password so the printed credentials at the end are always valid.
            status2, listing = auth_admin(env, "GET", f"users?email={email}")
            users = listing.get("users") or []
            if not users:
                print(f"WARNING: could not resolve existing auth user for {email}: {listing}")
                return email, "(unchanged — see Supabase dashboard)"
            auth_id = users[0]["id"]
            auth_admin(env, "PUT", f"users/{auth_id}", {"password": password})
        else:
            print(f"WARNING: could not create/reset demo manager auth user: {msg}")
            return email, "(auth user creation failed — see warning above)"
    else:
        auth_id = resp["id"]

    # staff.email has no unique constraint in the reconstructed schema — key
    # off email manually instead, to stay idempotent without altering schema.sql.
    cur.execute("SELECT id FROM staff WHERE email = %s", (email,))
    existing = cur.fetchone()
    if existing:
        cur.execute(
            "UPDATE staff SET auth_id=%s, name=%s, role='manager', is_active=true, updated_at=now() WHERE email=%s",
            (auth_id, "Demo Manager", email),
        )
    else:
        cur.execute(
            "INSERT INTO staff (auth_id, name, email, role, is_active) VALUES (%s,%s,%s,'manager',true)",
            (auth_id, "Demo Manager", email),
        )

    return email, password


def seed_role_permissions(cur) -> None:
    # Manager gets everything EXCEPT settings — which is where Business
    # Profile, Staff Management, and Role Permissions all live. Staff
    # Management / RBAC are ALSO hardcoded admin-only inside the settings
    # page itself (app/settings/page.tsx: `role === "admin" && <...>`), so
    # this is belt-and-suspenders: manager can't reach the page at all, and
    # even if they could, those two sections wouldn't render for them.
    manager_modules = [
        "dashboard", "kiosk", "checkins", "members", "leads", "freeze",
        "gym_wrap", "pos", "reports", "analytics", "churn", "sync_log",
    ]
    for module in manager_modules:
        cur.execute(
            "INSERT INTO role_permissions (role, module, allowed) VALUES ('manager', %s, true) "
            "ON CONFLICT (role, module) DO UPDATE SET allowed = true",
            (module,),
        )
    cur.execute(
        "INSERT INTO role_permissions (role, module, allowed) VALUES ('manager', 'settings', false) "
        "ON CONFLICT (role, module) DO UPDATE SET allowed = false"
    )


# ── Members (25: 15 active, 5 expiring soon, 3 expired, 2 member_only) ──────

def seed_members(cur) -> list[int]:
    today = date.today()
    member_ids: list[int] = []

    def upsert_member(n: int, first: str, last: str) -> int:
        erp_id = f"DEMO{n:03d}"
        cur.execute(
            """
            INSERT INTO gym_members (erp_customer_id, first_name, last_name, mobile, email, is_active)
            VALUES (%s, %s, %s, %s, %s, true)
            ON CONFLICT (erp_customer_id) DO UPDATE SET
                first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
                mobile = EXCLUDED.mobile, updated_at = now()
            RETURNING id
            """,
            (erp_id, first, last, rand_mobile(), f"{first.lower()}.{last.lower()}@example.com"),
        )
        return cur.fetchone()[0]

    def upsert_membership(member_id: int, serial: str, plan_name: str, duration_days: int,
                           amount: int, start: date, status: str) -> None:
        end = start + timedelta(days=duration_days)
        cur.execute(
            """
            INSERT INTO gym_memberships
                (member_id, erp_sale_serial, erp_product_id, plan_name, duration_days,
                 sale_amount, sale_date, membership_start, membership_end, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (erp_sale_serial) DO UPDATE SET
                member_id = EXCLUDED.member_id, plan_name = EXCLUDED.plan_name,
                membership_start = EXCLUDED.membership_start, membership_end = EXCLUDED.membership_end,
                status = EXCLUDED.status, updated_at = now()
            """,
            (member_id, serial, "DEMOPLAN", plan_name, duration_days, amount, start, start, end, status),
        )

    n = 1

    # 15 active — varied plan types, started at varied points so they read naturally.
    for _ in range(15):
        first, last = rand_name()
        mid = upsert_member(n, first, last)
        plan_name, duration_days, amount = random.choice(PLANS)
        days_in = random.randint(1, max(1, duration_days - 10))
        start = today - timedelta(days=days_in)
        upsert_membership(mid, f"DEMO-SALE-{n:03d}", plan_name, duration_days, amount, start, "active")
        member_ids.append(mid)
        n += 1

    # 5 expiring within 7 days.
    for _ in range(5):
        first, last = rand_name()
        mid = upsert_member(n, first, last)
        plan_name, duration_days, amount = random.choice(PLANS)
        days_left = random.randint(1, 7)
        start = today - timedelta(days=duration_days - days_left)
        upsert_membership(mid, f"DEMO-SALE-{n:03d}", plan_name, duration_days, amount, start, "active")
        member_ids.append(mid)
        n += 1

    # 3 expired.
    for _ in range(3):
        first, last = rand_name()
        mid = upsert_member(n, first, last)
        plan_name, duration_days, amount = random.choice(PLANS)
        start = today - timedelta(days=duration_days + random.randint(5, 45))
        upsert_membership(mid, f"DEMO-SALE-{n:03d}", plan_name, duration_days, amount, start, "expired")
        member_ids.append(mid)
        n += 1

    # 2 member_only — no gym_memberships row at all (matches the real sync
    # convention this app already has for a member with no membership yet).
    for _ in range(2):
        first, last = rand_name()
        mid = upsert_member(n, first, last)
        member_ids.append(mid)
        n += 1

    return member_ids


# ── Leads (8: new / contacted / converted / lost) ────────────────────────────

def seed_leads(cur) -> None:
    # No stable natural key for fabricated leads — re-seed cleanly each run
    # by clearing prior demo-seeded rows first (tagged created_by='demo-seed',
    # never touches any lead created through the app itself).
    cur.execute("DELETE FROM leads WHERE created_by = 'demo-seed'")
    statuses = ["new", "new", "contacted", "contacted", "contacted", "converted", "converted", "lost"]
    for i, status in enumerate(statuses, start=1):
        first, last = rand_name()
        cur.execute(
            """
            INSERT INTO leads (first_name, last_name, mobile, email, source, status, notes, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'demo-seed')
            """,
            (first, last, rand_mobile(), f"{first.lower()}{i}@example.com",
             random.choice(["website", "walk-in", "referral"]), status,
             "Interested in monthly membership" if status != "lost" else "No longer interested"),
        )


# ── Check-ins (10 days, morning/evening bimodal, a few denied) ──────────────

def seed_checkins(cur, member_ids: list[int]) -> None:
    # No natural business key on gym_checkins — re-seed cleanly each run by
    # clearing prior check-ins for exactly these demo-seeded members first.
    cur.execute("DELETE FROM gym_checkins WHERE member_id = ANY(%s)", (member_ids,))
    now = datetime.now(timezone.utc)
    # Only members WITH an active/expired membership check in realistically;
    # the two member_only ones occasionally try and get denied.
    for day_offset in range(10):
        day = now - timedelta(days=day_offset)
        visitors = random.sample(member_ids, k=min(len(member_ids), random.randint(8, 14)))
        for mid in visitors:
            # Bimodal: morning crowd (6-9am) or evening crowd (5-8pm).
            if random.random() < 0.55:
                hour = random.randint(6, 9)
            else:
                hour = random.randint(17, 20)
            checkin_at = day.replace(hour=hour, minute=random.randint(0, 59), second=random.randint(0, 59), microsecond=0)
            cur.execute(
                "SELECT display_status FROM v_member_status WHERE id = %s",
                (mid,),
            )
            row = cur.fetchone()
            status = row[0] if row else "no_membership"
            denied = status not in ("active", "frozen")
            cur.execute(
                """
                INSERT INTO gym_checkins (member_id, checkin_at, method, location_id, notes)
                VALUES (%s, %s, %s, 15, %s)
                """,
                (mid, checkin_at, random.choice(["barcode", "qr", "face"]),
                 "Access denied — no active membership" if denied else None),
            )


# ── POS sales (15, membership + retail, last 2 weeks) ───────────────────────

def seed_sales(cur, member_ids: list[int]) -> None:
    # No natural business key on sales either — same re-seed-cleanly approach,
    # tagged staff_name='Demo Front Desk' so it never touches real POS rows.
    cur.execute("DELETE FROM sales WHERE staff_name = 'Demo Front Desk'")
    now = datetime.now(timezone.utc)
    for i in range(15):
        sold_at = now - timedelta(days=random.randint(0, 13), hours=random.randint(8, 20))
        member_id = random.choice(member_ids) if random.random() < 0.85 else None
        if random.random() < 0.5:
            plan_name, _, amount = random.choice(PLANS)
            item, category = plan_name, "membership"
        else:
            item, amount = random.choice(RETAIL_ITEMS)
            category = "retail"
        cur.execute(
            """
            INSERT INTO sales (member_id, item_name, category, amount, payment_method, staff_name, sold_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (member_id, item, category, amount, random.choice(PAYMENT_METHODS), "Demo Front Desk", sold_at),
        )


# ── POS product catalog ──────────────────────────────────────────────────────

def seed_products(cur) -> None:
    # product_id is a stable natural key, so upsert rather than delete/reinsert.
    # Matches the rest of this script's reset semantics: re-running restores
    # the pristine catalog, including stock_qty (undoing any drift from demo
    # POS sales) — same "reset the demo" intent as seed_checkins/seed_sales.
    for pid, menu_id, menu_name, name, rate, mrp, tax_value, ask_price, stock_qty in PRODUCTS:
        tax_id = 1 if tax_value else 0
        tax_name = "VAT" if tax_value else ""
        is_stock_item = stock_qty is not None
        cur.execute(
            """
            INSERT INTO demo_products (
                product_id, menu_id, menu_name, display_name, product_name,
                rate, mrp, tax_id, tax_value, tax_name, include_in_rate,
                ask_price, is_stock_item, stock_qty, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true, %s, %s, %s, now())
            ON CONFLICT (product_id) DO UPDATE SET
                menu_id = EXCLUDED.menu_id, menu_name = EXCLUDED.menu_name,
                display_name = EXCLUDED.display_name, product_name = EXCLUDED.product_name,
                rate = EXCLUDED.rate, mrp = EXCLUDED.mrp,
                tax_id = EXCLUDED.tax_id, tax_value = EXCLUDED.tax_value, tax_name = EXCLUDED.tax_name,
                ask_price = EXCLUDED.ask_price, is_stock_item = EXCLUDED.is_stock_item,
                stock_qty = EXCLUDED.stock_qty, updated_at = now()
            """,
            (pid, menu_id, menu_name, name, name, rate, mrp, tax_id, tax_value, tax_name,
             ask_price, is_stock_item, stock_qty),
        )


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    env = load_demo_env()
    print(f"Seeding demo project (host suffix ...{env['SUPABASE_DB_HOST'][-25:]}) - confirmed NOT production.")

    conn = connect(env)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        email, password = seed_demo_manager(env, cur)
        seed_role_permissions(cur)
        member_ids = seed_members(cur)
        seed_leads(cur)
        seed_checkins(cur, member_ids)
        seed_sales(cur, member_ids)
        seed_products(cur)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print()
    print("=" * 60)
    print("DEMO SEED COMPLETE")
    print("=" * 60)
    print(f"Manager login email : {email}")
    print(f"Manager password    : {password}")
    print("(Not stored anywhere else - save it now. Re-running this script")
    print(" resets the password and reprints a new one.)")
    print(f"Members seeded      : {len(member_ids)}")
    print(f"Products seeded     : {len(PRODUCTS)}")
    print("Demo expires        : see platform_settings.demo_expires_at")
    print("=" * 60)


if __name__ == "__main__":
    main()
