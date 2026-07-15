# sync_worker/sync_worker.py

```python
from __future__ import annotations

import logging
from datetime import timedelta
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
    "monthly": 30,
    "month": 30,
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
    AND pm.ProductGroupID = ?
JOIN ProductGroupMaster pgm
    ON pgm.ProductGroupID = pm.ProductGroupID
JOIN CustomerMaster cm
    ON cm.CustomerID = sh.CustomerID
WHERE sh.TableName = 'MEMBER'
  AND sh.Status = 2
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


def get_processed_serials(gym_conn) -> set[str]:
    with gym_conn.cursor() as cur:
        cur.execute("SELECT erp_sale_serial FROM gym_memberships")
        return {str(row[0]) for row in cur.fetchall()}


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
            photo_url = EXCLUDED.photo_url,
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

    cur.execute(
        """
        INSERT INTO gym_memberships
            (member_id, erp_sale_serial, erp_product_id, plan_name,
             duration_days, sale_amount, sale_date,
             membership_start, membership_end, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
        """,
        (
            member_id,
            str(row["SerialNumber"]),
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


def fetch_sales(erp_conn, config: Config) -> list[dict[str, Any]]:
    erp_cur = erp_conn.cursor()
    erp_cur.execute(FETCH_SALES_SQL, (config.membership_group_id,))
    columns = [col[0] for col in erp_cur.description]
    rows = [dict(zip(columns, row)) for row in erp_cur.fetchall()]
    log.info("Number of records fetched: %s", len(rows))
    return rows


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
        all_rows = fetch_sales(erp_conn, config)
        new_rows = [row for row in all_rows if str(row["SerialNumber"]) not in processed_serials]
        log.info("Sync cycle found %s total sales and %s new sales", len(all_rows), len(new_rows))

        for row in new_rows:
            serial = str(row["SerialNumber"])
            try:
                duration_days = parse_duration(row.get("DurationLabel"))
                if duration_days is None:
                    log.warning("Skipping serial=%s because DurationLabel is unknown: %r", serial, row.get("DurationLabel"))
                    with gym_conn.cursor() as cur:
                        write_sync_log(cur, row, "skip", "skipped", f"Unknown PMField2: {row.get('DurationLabel')!r}")
                    gym_conn.commit()
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


def main() -> None:
    log.info("Gym sync worker starting")

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
```
