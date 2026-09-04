"""Read business/branding details from Supabase platform_settings (biz_* keys),
cached briefly so receipts/wraps don't hit the DB on every render."""

from __future__ import annotations

import time

import psycopg2

from gym_db import gym_conn_str

_CACHE: dict = {"data": None, "ts": 0.0}
_TTL = 60.0

_DEFAULTS = {
    "name":             "Fitness Mania Ltd",
    "address_line1":    "",
    "address_line2":    "",
    "phone":            "",
    "pin":              "",
    "paybill":          "",
    "paybill_account":  "",
    "till":             "",
    "business_no":      "",
    "business_account": "",
    "email":            "",
    "logo_url":         "",
}

_KEYMAP = {
    "biz_name": "name",
    "biz_address_line1": "address_line1",
    "biz_address_line2": "address_line2",
    "biz_phone": "phone",
    "biz_pin": "pin",
    "biz_paybill": "paybill",
    "biz_paybill_account": "paybill_account",
    "biz_till": "till",
    "biz_business_no": "business_no",
    "biz_business_account": "business_account",
    "biz_email": "email",
    "biz_logo_url": "logo_url",
}


def get_business_details() -> dict:
    now = time.time()
    if _CACHE["data"] and (now - _CACHE["ts"] < _TTL):
        return _CACHE["data"]

    data = dict(_DEFAULTS)
    try:
        conn = psycopg2.connect(**gym_conn_str(), sslmode="require")
        with conn.cursor() as cur:
            cur.execute("SELECT key, value FROM platform_settings WHERE key LIKE 'biz_%'")
            rows = dict(cur.fetchall())  # jsonb → parsed python (strings)
        conn.close()
        for k, field in _KEYMAP.items():
            v = rows.get(k)
            if v not in (None, ""):
                data[field] = v
        if not data["name"]:
            data["name"] = _DEFAULTS["name"]
    except Exception:
        pass  # fall back to defaults

    _CACHE.update(data=data, ts=now)
    return data
