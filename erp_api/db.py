"""ERP database connection — reuses the same connection-string logic as sync_worker/config.py."""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import pyodbc
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

_ENV_MODE    = (os.getenv("ENV_MODE", "local")).strip().lower()
_ERP_USER    = os.getenv("ERP_USER", "")
_ERP_PASS    = os.getenv("ERP_PASSWORD", "")
_ERP_DB      = os.getenv("ERP_DATABASE", "FR8RootDB")

if _ENV_MODE == "local":
    _host     = os.getenv("LOCAL_ERP_HOST", "")
    _instance = os.getenv("ERP_INSTANCE", "")
    _ERP_SERVER = f"{_host}\\{_instance}" if _host and _instance else _host
else:
    _host = os.getenv("ERP_HOST", "")
    _port = os.getenv("ERP_PORT", "6161")
    _ERP_SERVER = f"{_host},{_port}" if _host else ""

CONNECTION_STRING = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    f"SERVER={_ERP_SERVER};"
    f"DATABASE={_ERP_DB};"
    f"UID={_ERP_USER};"
    f"PWD={_ERP_PASS};"
    "TrustServerCertificate=yes;"
)


@contextmanager
def erp_conn() -> Iterator[pyodbc.Connection]:
    """Yield a pyodbc connection with autocommit OFF (caller controls commit/rollback)."""
    conn = pyodbc.connect(CONNECTION_STRING, autocommit=False)
    try:
        yield conn
    finally:
        conn.close()
