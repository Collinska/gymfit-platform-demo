"""Self-contained Supabase/Postgres connection helper for erp_api.

Deliberately does NOT reach into sync_worker/config.py the way the rest of
this file's callers used to (a `sys.path.insert(0, ".../sync_worker")` then
`from config import build_config`). That only works when sync_worker/ sits
next to erp_api/ on disk — true on a local monorepo checkout, NOT true on
Railway: with the service's Root Directory set to erp_api, the deployed
container only ever contains the erp_api/ subtree, so sync_worker/ simply
isn't there and that import fails with `ModuleNotFoundError: No module
named 'config'` (the actual cause of the 2026-09-04 Railway crash — traced
via the live deploy log, not the psycopg2-binary issue diagnosed earlier).

This duplicates just the Postgres-connection piece of build_config() — and
deliberately drops the SQL-Server ERP fields (ENV_MODE/ERP_USER/ERP_PASSWORD/
ERP_HOST/...) build_config() required even for callers that only ever wanted
Postgres. Those were previously forced into Railway's env vars as unused
placeholders just to satisfy that validation (see the big comment block in
.env.demo.railway.example) — no longer necessary after this change.

db.py (the actual SQL-Server ERP connection) is untouched and unrelated.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent

# erp_api's own .env, if present (local dev). Non-fatal if missing — Railway
# injects real env vars directly into the process, same as sync_worker/
# config.py's load_env_file() already does for the cloud case.
load_dotenv(dotenv_path=_HERE / ".env", override=True)

# Best-effort, local-dev-only convenience: this monorepo has historically
# kept SUPABASE_DB_* in sync_worker/.env rather than erp_api/.env. Pick it up
# if that directory happens to exist (a local checkout) without requiring it
# — override=False so it only fills gaps, never clobbers erp_api/.env or a
# real process env var. Skipped silently on Railway, where sync_worker/ isn't
# present in the build at all.
_sync_worker_env = _HERE.parent / "sync_worker" / ".env"
if _sync_worker_env.exists():
    load_dotenv(dotenv_path=_sync_worker_env, override=False)


def gym_conn_str() -> dict[str, Any]:
    """Supabase/Postgres connection kwargs — psycopg2.connect(**gym_conn_str())."""
    host = os.getenv("SUPABASE_DB_HOST", "").strip()
    password = os.getenv("SUPABASE_DB_PASSWORD", "").strip()
    if not host or not password:
        raise RuntimeError(
            "SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD must be set "
            "(as env vars, or in erp_api/.env for local dev)"
        )
    port = os.getenv("SUPABASE_DB_PORT", "5432").strip()
    return {
        "host": host,
        "port": int(port) if port else 5432,
        "dbname": os.getenv("SUPABASE_DB_NAME", "postgres").strip() or "postgres",
        "user": os.getenv("SUPABASE_DB_USER", "postgres").strip() or "postgres",
        "password": password,
    }
