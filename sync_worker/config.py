from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent
ENV_PATH = PROJECT_ROOT / ".env"

VALID_ENV_MODES = {"local", "live"}

DEFAULT_ERP_DATABASE = "FR8RootDB"
DEFAULT_SYNC_INTERVAL = 30
DEFAULT_GYM_LOCATION_ID = 15
DEFAULT_MEMBERSHIP_GROUP_ID = 107
DEFAULT_TIMEZONE = "Africa/Nairobi"
DEFAULT_LOG_LEVEL = "INFO"

log = logging.getLogger("gymfit.config")


class ConfigError(Exception):
    def __init__(self, errors: list[str]):
        super().__init__("\n".join(errors))
        self.errors = errors


@dataclass(frozen=True)
class Config:
    env_mode: str
    erp_server: str
    erp_database: str
    erp_user: str
    erp_password: str
    gym_conn_str: dict[str, Any]
    sync_interval: int
    gym_location_id: int
    membership_group_id: int
    timezone: str
    log_level: str

    @property
    def erp_mode_label(self) -> str:
        return self.env_mode.upper()

    @property
    def erp_connection_string(self) -> str:
        return (
            "DRIVER={ODBC Driver 17 for SQL Server};"
            f"SERVER={self.erp_server};"
            f"DATABASE={self.erp_database};"
            f"UID={self.erp_user};"
            f"PWD={self.erp_password};"
            "TrustServerCertificate=yes;"
        )

    @property
    def masked_erp_connection_string(self) -> str:
        return (
            "DRIVER={ODBC Driver 17 for SQL Server};"
            f"SERVER={self.erp_server};"
            f"DATABASE={self.erp_database};"
            f"UID={mask_secret(self.erp_user)};"
            f"PWD={mask_secret(self.erp_password)};"
            "TrustServerCertificate=yes;"
        )


def mask_secret(value: str, visible: int = 4) -> str:
    if not value:
        return "<missing>"
    if len(value) <= visible:
        return "*" * len(value)
    return f"{value[:visible]}{'*' * 8}"


def load_env_file() -> None:
    if not ENV_PATH.exists():
        raise ConfigError([f"Missing .env file: {ENV_PATH}"])

    loaded = load_dotenv(dotenv_path=ENV_PATH, override=True)
    if not loaded:
        raise ConfigError([f"Could not load .env file: {ENV_PATH}"])

    log.info("ENV loaded successfully from %s", ENV_PATH)


def required(name: str, errors: list[str]) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        errors.append(name)
        return ""
    return value.strip()


def optional_int(name: str, default: int, errors: list[str]) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default

    try:
        parsed = int(value)
    except ValueError:
        errors.append(f"{name} must be an integer")
        return default

    if parsed <= 0:
        errors.append(f"{name} must be greater than 0")
    return parsed


def build_config() -> Config:
    load_env_file()

    errors: list[str] = []
    env_mode = required("ENV_MODE", errors).lower()
    erp_user = required("ERP_USER", errors)
    erp_password = required("ERP_PASSWORD", errors)
    supabase_db_host = required("SUPABASE_DB_HOST", errors)
    supabase_db_password = required("SUPABASE_DB_PASSWORD", errors)

    if env_mode and env_mode not in VALID_ENV_MODES:
        errors.append("ENV_MODE must be 'local' or 'live'")

    if env_mode == "local":
        local_host = required("LOCAL_ERP_HOST", errors)
        erp_instance = required("ERP_INSTANCE", errors)
        erp_server = f"{local_host}\\{erp_instance}" if local_host and erp_instance else ""
    elif env_mode == "live":
        live_host = required("ERP_HOST", errors)
        erp_port = required("ERP_PORT", errors)
        erp_server = f"{live_host},{erp_port}" if live_host and erp_port else ""
    else:
        erp_server = ""

    erp_database = os.getenv("ERP_DATABASE", DEFAULT_ERP_DATABASE).strip() or DEFAULT_ERP_DATABASE
    sync_interval = optional_int("SYNC_INTERVAL", DEFAULT_SYNC_INTERVAL, errors)
    gym_location_id = optional_int("GYM_LOCATION_ID", DEFAULT_GYM_LOCATION_ID, errors)
    membership_group_id = optional_int("MEMBERSHIP_GROUP_ID", DEFAULT_MEMBERSHIP_GROUP_ID, errors)
    supabase_db_port = optional_int("SUPABASE_DB_PORT", 5432, errors)
    supabase_db_name = os.getenv("SUPABASE_DB_NAME", "postgres").strip() or "postgres"
    supabase_db_user = os.getenv("SUPABASE_DB_USER", "postgres").strip() or "postgres"
    timezone = os.getenv("TIMEZONE", DEFAULT_TIMEZONE).strip() or DEFAULT_TIMEZONE
    log_level = os.getenv("LOG_LEVEL", DEFAULT_LOG_LEVEL).strip().upper() or DEFAULT_LOG_LEVEL

    if env_mode in VALID_ENV_MODES:
        log.info("ENV_MODE detected: %s", env_mode)
        log.info("ERP mode: %s", env_mode.upper())
        log.info(
            "Final ERP connection string: DRIVER={ODBC Driver 17 for SQL Server};"
            "SERVER=%s;DATABASE=%s;UID=%s;PWD=%s;TrustServerCertificate=yes;",
            erp_server or "<missing-server>",
            erp_database,
            mask_secret(erp_user),
            mask_secret(erp_password),
        )
        log.info(
            "Supabase DB params: host=%s port=%s dbname=%s user=%s password=%s",
            supabase_db_host or "<missing>",
            supabase_db_port,
            supabase_db_name,
            supabase_db_user,
            mask_secret(supabase_db_password),
        )

    if errors:
        raise ConfigError(errors)

    return Config(
        env_mode=env_mode,
        erp_server=erp_server,
        erp_database=erp_database,
        erp_user=erp_user,
        erp_password=erp_password,
        gym_conn_str={
            "host": supabase_db_host,
            "port": supabase_db_port,
            "dbname": supabase_db_name,
            "user": supabase_db_user,
            "password": supabase_db_password,
        },
        sync_interval=sync_interval,
        gym_location_id=gym_location_id,
        membership_group_id=membership_group_id,
        timezone=timezone,
        log_level=log_level,
    )
