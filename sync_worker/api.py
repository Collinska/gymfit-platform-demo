from __future__ import annotations

from datetime import datetime, timedelta

import psycopg2
import psycopg2.extras
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import build_config

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5300"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    config = build_config()
    conn = psycopg2.connect(**config.gym_conn_str, sslmode="require")
    conn.autocommit = False
    return conn


@app.get("/sync/status")
def sync_status():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT key, value, updated_at FROM sync_state "
                "WHERE key IN ('last_sync_at', 'worker_heartbeat', 'processed_serials')"
            )
            rows = {row[0]: (row[1], row[2]) for row in cur.fetchall()}

            last_sync       = rows.get("last_sync_at",      (None, None))[0]
            heartbeat_val   = rows.get("worker_heartbeat",  (None, None))[0]
            heartbeat_at    = rows.get("worker_heartbeat",  (None, None))[1]
            processed       = rows.get("processed_serials", ([], None))[0]

            worker_alive = False
            if heartbeat_at:
                worker_alive = (
                    datetime.utcnow() - heartbeat_at.replace(tzinfo=None)
                ) < timedelta(minutes=2)

            cur.execute("SELECT COUNT(*) FROM gym_memberships")
            membership_count = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM gym_members")
            member_count = cur.fetchone()[0]

        return {
            "worker_alive":            worker_alive,
            "last_heartbeat":          heartbeat_val,
            "last_sync_at":            last_sync,
            "membership_count":        membership_count,
            "member_count":            member_count,
            "processed_serials_count": len(processed) if processed else 0,
        }
    finally:
        conn.close()


@app.post("/resync/full")
def full_resync():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM face_vectors")
            cur.execute("DELETE FROM gym_checkins")
            cur.execute("DELETE FROM gym_freezes")
            cur.execute("DELETE FROM gym_memberships")
            cur.execute("DELETE FROM sync_log")
            cur.execute("""
                INSERT INTO sync_state (key, value, updated_at)
                VALUES ('processed_serials', '[]'::jsonb, NOW())
                ON CONFLICT (key) DO UPDATE
                SET value = '[]'::jsonb, updated_at = NOW()
            """)
            cur.execute("""
                INSERT INTO sync_state (key, value, updated_at)
                VALUES ('last_sync_at', 'null'::jsonb, NOW())
                ON CONFLICT (key) DO UPDATE
                SET value = 'null'::jsonb, updated_at = NOW()
            """)
        conn.commit()
        return {
            "status":  "ok",
            "message": "Sync state cleared. Re-sync will begin on next worker cycle.",
        }
    except Exception as e:
        conn.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()
