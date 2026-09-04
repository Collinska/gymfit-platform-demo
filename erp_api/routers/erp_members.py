"""GET /erp/members — balance lookup and search (read-only)."""

from __future__ import annotations

import logging

import pyodbc
from fastapi import APIRouter, HTTPException, Query

from db import erp_conn
import demo_mode

log = logging.getLogger("erp_api.erp_members")
router = APIRouter(prefix="/erp/members", tags=["members"])


@router.get("/search")
def search_members(q: str = Query(..., min_length=1)):
    if demo_mode.DEMO_MODE:
        return demo_mode.search_members(q)

    pattern = f"%{q}%"
    sql = """
        SELECT TOP 10
            cm.CustomerID, cm.FirstName, cm.LastName,
            cm.Mobile, cm.CardID, cm.AccountID,
            am.CreditAmount - am.DebitAmount AS balance,
            cm.IsActive
        FROM CustomerMaster cm
        JOIN AccountMaster am ON am.AccountID = cm.AccountID
        WHERE cm.FirstName LIKE ? OR cm.LastName LIKE ?
           OR cm.Mobile   LIKE ? OR cm.CardID   LIKE ?
        ORDER BY cm.FirstName
    """
    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql, pattern, pattern, pattern, pattern)
            rows = cur.fetchall()
    except pyodbc.Error as exc:
        log.error("ERP DB error searching members: %s", exc)
        raise HTTPException(status_code=500, detail=f"ERP database error: {exc}") from exc

    members = [
        {
            "customer_id": str(r[0]).strip(),
            "first_name":  str(r[1] or "").strip(),
            "last_name":   str(r[2] or "").strip(),
            "mobile":      str(r[3] or "").strip(),
            "card_id":     str(r[4] or "").strip(),
            "account_id":  int(r[5]),
            "balance":     float(r[6] or 0),
            "is_active":   bool(r[7]),
        }
        for r in rows
    ]
    return {"members": members}


@router.get("/{customer_id}/balance")
def get_member_balance(customer_id: str):
    if demo_mode.DEMO_MODE:
        result = demo_mode.member_balance(customer_id)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Member {customer_id!r} not found")
        return result

    sql = """
        SELECT
            cm.CustomerID, cm.FirstName, cm.LastName,
            cm.AccountID, cm.Mobile,
            am.CreditAmount - am.DebitAmount AS balance
        FROM CustomerMaster cm
        JOIN AccountMaster am ON am.AccountID = cm.AccountID
        WHERE cm.CustomerID = ?
    """
    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql, customer_id)
            row = cur.fetchone()
    except pyodbc.Error as exc:
        log.error("ERP DB error fetching balance: %s", exc)
        raise HTTPException(status_code=500, detail=f"ERP database error: {exc}") from exc

    if row is None:
        raise HTTPException(status_code=404, detail=f"Member {customer_id!r} not found")

    return {
        "customer_id": str(row[0]).strip(),
        "first_name":  str(row[1] or "").strip(),
        "last_name":   str(row[2] or "").strip(),
        "account_id":  int(row[3]),
        "mobile":      str(row[4] or "").strip(),
        "balance":     float(row[5] or 0),
    }
