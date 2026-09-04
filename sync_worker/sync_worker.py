from __future__ import annotations

import logging
import socket
import statistics
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg2
import psycopg2.extras
import pyodbc
from apscheduler.schedulers.blocking import BlockingScheduler

from config import Config, ConfigError, build_config


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("gymfit.sync_worker")


DURATION_MAP: dict[str, int] = {
    "daily": 1,
    "day": 1,
    "weekly": 7,
    "week": 7,
    "two weeks": 14,
    "monthly": 30,
    "month": 30,
    "two months": 60,
    "three months": 90,
    "3 months": 90,
    "quarter": 90,
    "quarterly": 90,
    "6 months": 180,
    "six months": 180,
    "biannual": 180,
    "yearly": 365,
    "annual": 365,
    "year": 365,
    "48": 1461,
}


FETCH_SALES_SQL = """
SELECT
    sh.SerialNumber,
    sh.VoucherDate,
    sh.BillAmount,
    sh.CustomerID,
    sd.ProductID,
    sd.FinalSaleAmount,
    pm.ProductName,
    NULLIF(LTRIM(RTRIM(pm.PMField2)), '') AS DurationLabel,
    cm.FirstName,
    cm.LastName,
    cm.Mobile,
    cm.EMail,
    cm.CardID,
    cm.CardExpiryDate,
    cm.IsActive,
    cm.AccountID,
    cm.Picture1
FROM SaleHeader sh
JOIN SaleDetail sd
    ON sd.SerialNumber = sh.SerialNumber
JOIN ProductMaster pm
    ON pm.ProductID = sd.ProductID
    AND (
        pm.ProductGroupID = ?
        -- Group 108 ("Other Fees") mixes real access products with admin
        -- fees (Transaction Fee, Barcode Fee) — include ONLY the access
        -- products here by ProductID, not the whole group.
        OR pm.ProductID IN ('000G', '00P8', '00PE', '00PF')
    )
JOIN ProductGroupMaster pgm
    ON pgm.ProductGroupID = pm.ProductGroupID
JOIN CustomerMaster cm
    ON cm.CustomerID = sh.CustomerID
WHERE sh.TableName = 'MEMBER'
  AND (
    -- Posted/day-closed sales: trusted as before.
    sh.Status = 2
    -- Unposted (not yet day-closed) sales: sync immediately, but ONLY
    -- if fully paid (recorded payments cover the bill). This lets a POS
    -- membership go active seconds after payment, while ignoring parked/
    -- unpaid tickets. Voided sales are removed from SaleHeader entirely,
    -- so they can never be fetched here.
    OR (
      sh.Status = 0
      AND sh.BillAmount <= (
        SELECT ISNULL(SUM(sp.Amount), 0)
        FROM SalePayment sp
        WHERE sp.SerialNumber = sh.SerialNumber
          AND ISNULL(sp.IsDeleted, 0) = 0
      )
    )
  )
ORDER BY sh.VoucherDate ASC
"""


def connect_erp(config: Config):
    try:
        conn = pyodbc.connect(config.erp_connection_string, timeout=10)
        log.info("ERP connected")
        return conn
    except Exception as exc:
        log.error("ERP connection failed: %s", exc)
        return None


def connect_supabase(config: Config):
    try:
        conn = psycopg2.connect(**config.gym_conn_str)
        conn.autocommit = False
        log.info("Supabase connection status: success")
        return conn
    except Exception as exc:
        log.error("Supabase connection status: fail")
        log.error("Supabase connection failed: %s", exc)
        return None


def parse_duration(pmfield2_value: Any) -> int | None:
    if not pmfield2_value:
        return None

    key = str(pmfield2_value).strip().lower()
    if key in DURATION_MAP:
        return DURATION_MAP[key]

    for map_key, days in DURATION_MAP.items():
        if map_key in key or key in map_key:
            return days

    return None


# ── CHANGE 1: Load processed serials from memberships + sync_state JSON array ─

def get_processed_serials(gym_conn) -> set[str]:
    with gym_conn.cursor() as cur:
        # Source of truth: membership records
        cur.execute(
            "SELECT erp_sale_serial FROM gym_memberships "
            "WHERE erp_sale_serial IS NOT NULL"
        )
        from_memberships = {str(row[0]) for row in cur.fetchall()}

        # Previously skipped/member-only serials from sync_log
        try:
            cur.execute(
                "SELECT erp_sale_serial FROM sync_log "
                "WHERE erp_sale_serial IS NOT NULL"
            )
            from_sync_log = {str(row[0]) for row in cur.fetchall()}
        except Exception:
            from_sync_log = set()

        # In-flight serials persisted between restarts
        try:
            cur.execute(
                "SELECT value FROM sync_state "
                "WHERE key = 'processed_serials'"
            )
            row = cur.fetchone()
            from_state = set(row[0]) if row and row[0] else set()
        except Exception:
            from_state = set()

        combined = from_memberships | from_sync_log | from_state
        log.info(
            "Loaded %s from memberships + %s from sync_log + %s from state = %s total",
            len(from_memberships), len(from_sync_log), len(from_state), len(combined),
        )
        return combined


# ── CHANGE 2: Persist processed serials as single JSON array ──────────────────

def save_processed_serials(gym_conn, processed_serials: set[str]) -> None:
    try:
        with gym_conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sync_state (key, value, updated_at)
                VALUES ('processed_serials', %s, NOW())
                ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value,
                    updated_at = NOW()
                """,
                (psycopg2.extras.Json(list(processed_serials)),),
            )
        gym_conn.commit()
    except Exception as exc:
        log.error("Failed to persist processed serials: %s", exc)
        gym_conn.rollback()


def upsert_member(cur, row: dict[str, Any]) -> int:
    cur.execute(
        """
        INSERT INTO gym_members
            (erp_customer_id, erp_account_id, first_name, last_name,
             mobile, email, card_id, card_expiry, photo_url, is_active)
        VALUES (%(cid)s, %(aid)s, %(fn)s, %(ln)s,
                %(mob)s, %(email)s, %(card)s, %(expiry)s, %(photo)s, %(active)s)
        ON CONFLICT (erp_customer_id) DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            mobile = EXCLUDED.mobile,
            email = EXCLUDED.email,
            card_id = EXCLUDED.card_id,
            card_expiry = EXCLUDED.card_expiry,
            -- ERP CustomerMaster.Picture1 is empty for every customer in this
            -- deployment (confirmed: 0/3003 rows), so a plain overwrite here
            -- silently wiped any photo uploaded through the app's own Photo
            -- Upload feature on the very next sync. Only let the ERP value win
            -- when it's actually non-empty; otherwise keep whatever Supabase
            -- already has (an app-uploaded photo, or NULL if there is none).
            photo_url = CASE
                WHEN EXCLUDED.photo_url IS NOT NULL AND EXCLUDED.photo_url <> ''
                THEN EXCLUDED.photo_url
                ELSE gym_members.photo_url
            END,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
        RETURNING id
        """,
        {
            "cid": row["CustomerID"],
            "aid": row["AccountID"],
            "fn": row["FirstName"] or "",
            "ln": row["LastName"] or "",
            "mob": row["Mobile"],
            "email": row["EMail"],
            "card": row["CardID"],
            "expiry": row["CardExpiryDate"],
            "photo": row["Picture1"],
            "active": bool(row["IsActive"]),
        },
    )
    return cur.fetchone()[0]


def get_active_membership(cur, member_id: int):
    cur.execute(
        """
        SELECT id, membership_end
        FROM gym_memberships
        WHERE member_id = %s
          AND status IN ('active', 'frozen')
        ORDER BY membership_end DESC
        LIMIT 1
        """,
        (member_id,),
    )
    return cur.fetchone()


# gym_memberships.erp_sale_serial is varchar(20) — real ERP serials look like
# "14520.0001" (~10 chars), so a naive long suffix (e.g. an ISO date) can blow
# the column limit and fail the INSERT outright.
SERIAL_COLUMN_MAX_LEN = 20


def disambiguate_serial(cur, original_serial: str) -> str:
    """Produce a short, guaranteed-unique stand-in for `original_serial` that
    fits the column limit, for the case where the original is already taken
    by a different member (see the collision-guard note in activate_membership)."""
    for n in range(1, 100):
        suffix = f"-R{n}"
        candidate = original_serial[: SERIAL_COLUMN_MAX_LEN - len(suffix)] + suffix
        cur.execute("SELECT 1 FROM gym_memberships WHERE erp_sale_serial = %s", (candidate,))
        if cur.fetchone() is None:
            return candidate
    # Practically unreachable (100 collisions on the same serial), but keep
    # this total so the caller never gets an unhandled exception.
    return original_serial[: SERIAL_COLUMN_MAX_LEN - 3] + "-RX"


def activate_membership(cur, member_id: int, row: dict[str, Any], duration_days: int) -> None:
    existing = get_active_membership(cur, member_id)
    sale_date = row["VoucherDate"].date() if hasattr(row["VoucherDate"], "date") else row["VoucherDate"]

    if existing:
        start = existing[1]
        log.info("Extending member_id=%s from %s by %s days", member_id, start, duration_days)
    else:
        start = sale_date
        log.info("Activating member_id=%s from %s for %s days", member_id, start, duration_days)

    end = start + timedelta(days=duration_days)
    erp_sale_serial = str(row["SerialNumber"])

    # An ERP restore can reset SerialNumber sequences, so a serial that once
    # belonged to one member's sale can later be reused by a completely
    # different member's brand-new sale. gym_memberships.erp_sale_serial is
    # UNIQUE, so ON CONFLICT would otherwise silently overwrite the ORIGINAL
    # member's membership row with the new member's data. Detect that and
    # give the new sale its own disambiguated serial instead of colliding.
    cur.execute("SELECT member_id FROM gym_memberships WHERE erp_sale_serial = %s", (erp_sale_serial,))
    existing_owner = cur.fetchone()
    if existing_owner and existing_owner[0] != member_id:
        original_serial = erp_sale_serial
        erp_sale_serial = disambiguate_serial(cur, original_serial)
        log.warning(
            "erp_sale_serial=%s already belongs to member_id=%s (pre-restore sale) — "
            "activating member_id=%s under disambiguated serial=%s instead",
            original_serial, existing_owner[0], member_id, erp_sale_serial,
        )

    cur.execute(
        """
        INSERT INTO gym_memberships
            (member_id, erp_sale_serial, erp_product_id, plan_name,
             duration_days, sale_amount, sale_date,
             membership_start, membership_end, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
        ON CONFLICT (erp_sale_serial) DO UPDATE SET
            member_id = EXCLUDED.member_id,
            erp_product_id = EXCLUDED.erp_product_id,
            plan_name = EXCLUDED.plan_name,
            duration_days = EXCLUDED.duration_days,
            sale_amount = EXCLUDED.sale_amount,
            sale_date = EXCLUDED.sale_date,
            membership_start = EXCLUDED.membership_start,
            membership_end = EXCLUDED.membership_end,
            status = EXCLUDED.status,
            updated_at = NOW()
        """,
        (
            member_id,
            erp_sale_serial,
            row["ProductID"],
            row["ProductName"],
            duration_days,
            float(row["FinalSaleAmount"]),
            sale_date,
            start,
            end,
        ),
    )


def write_sync_log(
    cur,
    row: dict[str, Any],
    action: str,
    status: str,
    message: str | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO sync_log
            (erp_sale_serial, erp_customer_id, erp_product_id, action, status, message, raw_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            str(row.get("SerialNumber")),
            row.get("CustomerID"),
            row.get("ProductID"),
            action,
            status,
            message,
            psycopg2.extras.Json({key: str(value) for key, value in row.items()}),
        ),
    )


def expire_memberships(gym_conn) -> int:
    """Mark all past-due active memberships as expired. Returns count updated."""
    try:
        with gym_conn.cursor() as cur:
            cur.execute("""
                UPDATE gym_memberships
                SET status = 'expired', updated_at = NOW()
                WHERE status = 'active'
                  AND membership_end < CURRENT_DATE
            """)
            count = cur.rowcount
        gym_conn.commit()
        if count > 0:
            log.info("Auto-expired %s memberships", count)
        return count
    except Exception as exc:
        gym_conn.rollback()
        log.error("Failed to auto-expire memberships: %s", exc)
        return 0


def is_auto_revoke_enabled(gym_conn) -> bool:
    """Read the admin gate from platform_settings. Off unless explicitly enabled."""
    try:
        with gym_conn.cursor() as cur:
            cur.execute("SELECT value FROM platform_settings WHERE key = 'auto_revoke_enabled'")
            row = cur.fetchone()
        if not row:
            return False
        val = row[0]  # jsonb -> parsed python value
        return val is True or str(val).strip().lower() == "true"
    except Exception as exc:
        log.warning("Could not read auto_revoke_enabled setting: %s", exc)
        gym_conn.rollback()
        return False


def _restack_member(cur, member_id: int) -> None:
    """Recompute the member's membership chain from their non-returned memberships,
    in sale_date order, re-deriving start/end (memberships stack sequentially)."""
    cur.execute(
        """
        SELECT id, sale_date, duration_days, status
        FROM gym_memberships
        WHERE member_id = %s AND status <> 'returned'
        ORDER BY sale_date ASC, id ASC
        """,
        (member_id,),
    )
    rows = cur.fetchall()
    today = datetime.now().date()
    prev_end = None
    for m_id, sale_date, duration_days, status in rows:
        if duration_days is None or sale_date is None:
            continue
        start = sale_date if prev_end is None else prev_end
        end = start + timedelta(days=int(duration_days))
        # Preserve a manual freeze; otherwise derive active/expired from the new end.
        new_status = status if status == "frozen" else ("active" if end >= today else "expired")
        cur.execute(
            """
            UPDATE gym_memberships
            SET membership_start = %s, membership_end = %s, status = %s, updated_at = NOW()
            WHERE id = %s
            """,
            (start, end, new_status, m_id),
        )
        prev_end = end


def reconcile_returns(erp_conn, gym_conn) -> int:
    """Detect membership Sale Returns in the ERP (SaleReturnHeader, VoucherID=17)
    and revoke the matching membership here, then re-stack the member's dates.
    Gated by the auto_revoke_enabled admin setting."""
    try:
        # 1. Returned original-sale serials from the ERP (SOSerialNumber -> original sale)
        erp_cur = erp_conn.cursor()
        erp_cur.execute(
            """
            SELECT DISTINCT SOSerialNumber
            FROM SaleReturnHeader
            WHERE VoucherID = 17 AND Status = 2 AND SOSerialNumber IS NOT NULL
            """
        )
        returned_serials = {str(r[0]) for r in erp_cur.fetchall()}
        if not returned_serials:
            return 0

        # 2. Membership rows that were returned but not yet revoked here (idempotent)
        with gym_conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, member_id, erp_sale_serial
                FROM gym_memberships
                WHERE erp_sale_serial = ANY(%s) AND status <> 'returned'
                """,
                (list(returned_serials),),
            )
            to_revoke = cur.fetchall()
        if not to_revoke:
            return 0

        # 3. Admin gate — when disabled, surface for manual review but do nothing.
        if not is_auto_revoke_enabled(gym_conn):
            log.info(
                "%s membership return(s) detected but auto-revoke is disabled — left for manual review",
                len(to_revoke),
            )
            return 0

        # 4. Revoke + re-stack
        affected_members: set[int] = set()
        with gym_conn.cursor() as cur:
            for membership_id, member_id, serial in to_revoke:
                cur.execute(
                    "UPDATE gym_memberships SET status = 'returned', updated_at = NOW() WHERE id = %s",
                    (membership_id,),
                )
                cur.execute(
                    """
                    INSERT INTO sync_log (erp_sale_serial, action, status, message)
                    VALUES (%s, 'membership_returned', 'ok', %s)
                    """,
                    (serial, f"Sale return detected — membership {membership_id} revoked"),
                )
                affected_members.add(member_id)
            for member_id in affected_members:
                _restack_member(cur, member_id)
        gym_conn.commit()
        log.info(
            "Revoked %s membership(s) from ERP returns; re-stacked %s member(s)",
            len(to_revoke), len(affected_members),
        )
        return len(to_revoke)
    except Exception as exc:
        gym_conn.rollback()
        log.error("Failed to reconcile sale returns: %s", exc)
        return 0


def compute_monthly_stats(gym_conn, month: str | None = None) -> bool:
    """Compute avg/median visits + a visit distribution for a month (default:
    current YYYY-MM), from successful check-ins, and upsert into monthly_stats."""
    if month is None:
        month = datetime.now().strftime("%Y-%m")
    try:
        with gym_conn.cursor() as cur:
            cur.execute(
                """
                SELECT member_id, COUNT(*) AS visits
                FROM gym_checkins
                WHERE TO_CHAR(checkin_at, 'YYYY-MM') = %s
                  AND (notes IS NULL OR notes NOT LIKE '%%Access denied%%')
                GROUP BY member_id
                """,
                (month,),
            )
            rows = cur.fetchall()

        visit_counts = [int(r[1]) for r in rows]
        total_active   = len(visit_counts)
        total_checkins = sum(visit_counts)
        avg_visits     = statistics.mean(visit_counts) if visit_counts else 0.0
        median_visits  = statistics.median(visit_counts) if visit_counts else 0.0

        # Compact distribution {visit_count: number_of_members} for percentile lookups.
        dist: dict[str, int] = {}
        for v in visit_counts:
            dist[str(v)] = dist.get(str(v), 0) + 1

        with gym_conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO monthly_stats
                    (month, avg_visits, median_visits, total_active_members,
                     total_checkins, percentile_data, computed_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (month) DO UPDATE SET
                    avg_visits           = EXCLUDED.avg_visits,
                    median_visits        = EXCLUDED.median_visits,
                    total_active_members = EXCLUDED.total_active_members,
                    total_checkins       = EXCLUDED.total_checkins,
                    percentile_data      = EXCLUDED.percentile_data,
                    computed_at          = NOW()
                """,
                (month, round(float(avg_visits), 2), round(float(median_visits), 2),
                 total_active, total_checkins, psycopg2.extras.Json(dist)),
            )
        gym_conn.commit()
        log.info("Computed monthly stats for %s: avg=%.2f members=%s", month, float(avg_visits), total_active)
        return True
    except Exception as exc:
        gym_conn.rollback()
        log.error("Failed to compute monthly stats for %s: %s", month, exc)
        return False


def maybe_compute_monthly_stats(gym_conn) -> None:
    """Daily-ish trigger: recompute the current month when its row is missing or
    older than 12 hours, and backfill the previous month if it's missing."""
    try:
        now        = datetime.now()
        cur_month  = now.strftime("%Y-%m")
        prev_month = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")

        with gym_conn.cursor() as cur:
            cur.execute("SELECT computed_at FROM monthly_stats WHERE month = %s", (cur_month,))
            row = cur.fetchone()
        stale = (
            row is None
            or row[0] is None
            or (datetime.now(timezone.utc) - row[0]).total_seconds() > 12 * 3600
        )
        if stale:
            compute_monthly_stats(gym_conn, cur_month)

        with gym_conn.cursor() as cur:
            cur.execute("SELECT 1 FROM monthly_stats WHERE month = %s", (prev_month,))
            has_prev = cur.fetchone() is not None
        if not has_prev:
            compute_monthly_stats(gym_conn, prev_month)
    except Exception as exc:
        gym_conn.rollback()
        log.error("Monthly-stats scheduler error: %s", exc)


def fetch_sales(erp_conn, config: Config) -> list[dict[str, Any]]:
    erp_cur = erp_conn.cursor()
    erp_cur.execute(FETCH_SALES_SQL, (config.membership_group_id,))
    columns = [col[0] for col in erp_cur.description]
    rows = [dict(zip(columns, row)) for row in erp_cur.fetchall()]
    log.info("Number of records fetched: %s", len(rows))
    return rows


def detect_stale_serials(gym_conn, rows: list[dict[str, Any]], processed_serials: set[str]) -> set[str]:
    """A serial marked 'processed' can get reused by a brand-new, unrelated
    sale after an ERP restore (SerialNumber sequences aren't guaranteed
    unique across a restore) — the plain 'already in processed_serials' check
    would then silently skip that new sale forever. Detect it by comparing
    each already-processed serial's CURRENT ERP VoucherDate against the most
    recent sync_log record on file for it: a mismatch means the serial now
    belongs to a different transaction and should be reprocessed. One batched
    query per cycle, not one per row."""
    candidates = {
        str(row["SerialNumber"]): row["VoucherDate"]
        for row in rows
        if str(row["SerialNumber"]) in processed_serials
    }
    if not candidates:
        return set()

    with gym_conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (erp_sale_serial) erp_sale_serial, raw_data->>'VoucherDate'
            FROM sync_log
            WHERE erp_sale_serial = ANY(%s)
            ORDER BY erp_sale_serial, sync_at DESC
            """,
            (list(candidates.keys()),),
        )
        on_file = dict(cur.fetchall())

    stale: set[str] = set()
    for serial, current_voucher_date in candidates.items():
        on_file_date = on_file.get(serial)
        if on_file_date is not None and str(on_file_date).strip() != str(current_voucher_date).strip():
            stale.add(serial)
    return stale


def run_sync(config: Config, processed_serials: set[str]) -> None:
    log.info("Sync cycle start")

    erp_conn = connect_erp(config)
    if erp_conn is None:
        log.error("Sync cycle stopped because ERP connection failed")
        return

    gym_conn = connect_supabase(config)
    if gym_conn is None:
        erp_conn.close()
        log.error("Sync cycle stopped because Supabase connection failed")
        return

    try:
        # Auto-expire past-due memberships on every cycle
        expired_count = expire_memberships(gym_conn)
        if expired_count > 0:
            log.info("Expired %s memberships this cycle", expired_count)

        # Reconcile ERP sale returns -> revoke matching memberships (gated by setting)
        returned_count = reconcile_returns(erp_conn, gym_conn)
        if returned_count > 0:
            log.info("Reconciled %s membership return(s) this cycle", returned_count)

        # ── CHANGE 4: Worker heartbeat ────────────────────────────────────────
        try:
            with gym_conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO sync_state (key, value, updated_at)
                    VALUES ('worker_heartbeat', %s, NOW())
                    ON CONFLICT (key) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = NOW()
                    """,
                    (psycopg2.extras.Json(datetime.now().isoformat()),),
                )
            gym_conn.commit()
        except Exception as exc:
            log.warning("Failed to write worker heartbeat: %s", exc)
            gym_conn.rollback()

        all_rows = fetch_sales(erp_conn, config)

        stale_serials = detect_stale_serials(gym_conn, all_rows, processed_serials)
        if stale_serials:
            log.warning(
                "Detected %s serial(s) reused after an ERP restore (VoucherDate changed "
                "vs on-file record) — reprocessing despite being marked processed: %s",
                len(stale_serials), sorted(stale_serials),
            )

        new_rows = [
            row for row in all_rows
            if str(row["SerialNumber"]) not in processed_serials
            or str(row["SerialNumber"]) in stale_serials
        ]
        log.info("Sync cycle found %s total sales and %s new sales", len(all_rows), len(new_rows))

        for row in new_rows:
            serial = str(row["SerialNumber"])
            try:
                duration_days = parse_duration(row.get("DurationLabel"))
                if duration_days is None:
                    log.warning(
                        "No duration for serial=%s — upserting member only, skipping membership",
                        serial
                    )
                    try:
                        with gym_conn.cursor() as cur:
                            upsert_member(cur, row)
                            write_sync_log(
                                cur, row, "member_only", "skipped",
                                f"No duration for {row.get('DurationLabel')!r} — member created, membership skipped"
                            )
                        gym_conn.commit()
                        processed_serials.add(serial)
                    except Exception as exc:
                        gym_conn.rollback()
                        log.exception("Failed to upsert member for serial=%s: %s", serial, exc)
                    continue

                with gym_conn.cursor() as cur:
                    member_id = upsert_member(cur, row)
                    activate_membership(cur, member_id, row, duration_days)
                    write_sync_log(
                        cur,
                        row,
                        "membership_activated",
                        "ok",
                        f"{row['ProductName']} | {duration_days}d | {row['FirstName']} {row['LastName']}",
                    )
                gym_conn.commit()

                processed_serials.add(serial)
                log.info(
                    "Processed serial=%s member=%s %s plan=%s duration_days=%s",
                    serial,
                    row["FirstName"],
                    row["LastName"],
                    row["ProductName"],
                    duration_days,
                )

            except Exception as exc:
                gym_conn.rollback()
                log.exception("Failed to process serial=%s: %s", serial, exc)
                try:
                    with gym_conn.cursor() as cur:
                        write_sync_log(cur, row, "membership_activated", "error", str(exc))
                    gym_conn.commit()
                except Exception as log_exc:
                    gym_conn.rollback()
                    log.error("Could not write sync error log for serial=%s: %s", serial, log_exc)

        log.info("Sync cycle completed")

        # ── CHANGE 3: Save processed serials ─────────────────────────────────
        save_processed_serials(gym_conn, processed_serials)

        # ── CHANGE 5: Update last_sync_at ─────────────────────────────────────
        try:
            with gym_conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO sync_state (key, value, updated_at)
                    VALUES ('last_sync_at', %s, NOW())
                    ON CONFLICT (key) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = NOW()
                    """,
                    (psycopg2.extras.Json(datetime.now().isoformat()),),
                )
            gym_conn.commit()
        except Exception as exc:
            log.warning("Failed to update last_sync_at: %s", exc)
            gym_conn.rollback()

        # Recompute monthly member-visit stats at most ~twice a day
        maybe_compute_monthly_stats(gym_conn)

    except Exception as exc:
        log.exception("Sync cycle failed: %s", exc)
    finally:
        erp_conn.close()
        gym_conn.close()


def load_processed_serials(gym_conn) -> set[str] | None:
    try:
        processed_serials = get_processed_serials(gym_conn)
        log.info("Loaded %s already-processed serials", len(processed_serials))
        return processed_serials
    except Exception as exc:
        log.error("Supabase connection failed: could not load processed serials: %s", exc)
        return None


def configure_logging(config: Config) -> None:
    logging.getLogger().setLevel(config.log_level)


def print_startup_debug(config: Config) -> None:
    log.info("Location filter: DISABLED (all branches)")
    log.info("Membership group id: %s", config.membership_group_id)
    log.info("Sync interval: %s seconds", config.sync_interval)


# Fixed local port used purely as a single-instance mutex. If a second copy
# of the worker starts, its bind() fails and it exits — preventing the
# multiple-workers race that lets stale copies overwrite processed_serials.
SINGLE_INSTANCE_PORT = 47921


def acquire_single_instance_lock() -> socket.socket | None:
    """Bind a localhost port as a mutex. Returns the socket (keep it alive for
    the process lifetime) or None if another instance already holds the lock."""
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        # No SO_REUSEADDR: we WANT the bind to fail if another worker holds it.
        lock.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
        lock.listen(1)
        return lock
    except OSError:
        lock.close()
        return None


def main() -> None:
    log.info("Gym sync worker starting")

    instance_lock = acquire_single_instance_lock()
    if instance_lock is None:
        log.error(
            "Another sync worker is already running (port %s in use). Exiting.",
            SINGLE_INSTANCE_PORT,
        )
        raise SystemExit(1)

    try:
        config = build_config()
    except ConfigError as exc:
        log.error("Configuration error. Missing or invalid values:")
        for error in exc.errors:
            log.error("- %s", error)
        raise SystemExit(1) from exc

    configure_logging(config)
    print_startup_debug(config)

    erp_conn = connect_erp(config)
    if erp_conn is None:
        log.error("Startup stopped because ERP connection failed")
        raise SystemExit(1)
    erp_conn.close()

    gym_conn = connect_supabase(config)
    if gym_conn is None:
        log.error("Startup stopped because Supabase connection failed")
        raise SystemExit(1)

    processed_serials = load_processed_serials(gym_conn)
    gym_conn.close()
    if processed_serials is None:
        log.error("Startup stopped because processed serials could not be loaded")
        raise SystemExit(1)

    scheduler = BlockingScheduler(timezone=config.timezone)
    scheduler.add_job(
        lambda: run_sync(config, processed_serials),
        "interval",
        seconds=config.sync_interval,
        id="erp_sync",
        max_instances=1,
        misfire_grace_time=15,
    )

    log.info("Scheduler running every %s seconds. Press Ctrl+C to stop.", config.sync_interval)
    try:
        scheduler.start()
    except KeyboardInterrupt:
        log.info("Worker stopped by user")


if __name__ == "__main__":
    main()
