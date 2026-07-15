"""Sales register report endpoints — /erp/reports/..."""

from __future__ import annotations

import logging
import os
from datetime import date
from typing import Optional

import pyodbc
from fastapi import APIRouter, HTTPException, Query

from db import erp_conn

log = logging.getLogger("erp_api.reports")
router = APIRouter(prefix="/erp/reports", tags=["reports"])


# Sales become visible the instant they're rung up and fully paid, even before
# the ERP's day-close posts them (Status 0 -> 2). This mirrors the sync worker's
# "Option B" logic so the Sales Register / Day Audit match what the gym app shows.
# Requires the SaleHeader alias to be `sh`.
PAID_OR_POSTED = """(
        sh.Status = 2
        OR (
            sh.Status = 0
            AND sh.BillAmount <= (
                SELECT ISNULL(SUM(sp.Amount), 0)
                FROM SalePayment sp
                WHERE sp.SerialNumber = sh.SerialNumber
                  AND ISNULL(sp.IsDeleted, 0) = 0
            )
        )
    )"""


# ── A) Sales by Invoice ────────────────────────────────────────────────────────

@router.get("/sales-by-invoice")
def sales_by_invoice(
    date_from:   str           = Query(..., description="YYYY-MM-DD"),
    date_to:     str           = Query(..., description="YYYY-MM-DD"),
    location_id: Optional[int] = Query(None),
):
    sql = f"""
        SELECT
            sh.SerialNumber,
            CONVERT(VARCHAR(20), sh.VoucherDate, 120) AS VoucherDate,
            CAST(sh.VchIDYMD AS VARCHAR) + '/' + CAST(sh.VchNumber AS VARCHAR) AS InvoiceNo,
            sh.CustomerID,
            cm.FirstName + ' ' + cm.LastName AS CustomerName,
            cm.Mobile,
            sh.BillAmount,
            sh.SubTotal,
            sh.TaxTotal,
            sh.LocationID,
            sh.UserID,
            um.UserName
        FROM SaleHeader sh
        JOIN CustomerMaster cm ON cm.CustomerID = sh.CustomerID
        JOIN UserMaster um ON um.UserID = sh.UserID
        WHERE sh.TableName = N'MEMBER'
          AND {PAID_OR_POSTED}
          AND sh.VoucherDate >= ?
          AND sh.VoucherDate < DATEADD(day, 1, CAST(? AS DATE))
          AND (? IS NULL OR sh.LocationID = ?)
        ORDER BY sh.VoucherDate DESC
    """
    loc = location_id  # may be None
    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql, date_from, date_to, loc, loc)
            rows = cur.fetchall()
    except pyodbc.Error as exc:
        log.error("sales-by-invoice DB error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    invoices = []
    total_amount = 0.0
    total_tax    = 0.0
    total_net    = 0.0

    for r in rows:
        bill = float(r.BillAmount or 0)
        tax  = float(r.TaxTotal  or 0)
        net  = float(r.SubTotal  or 0) - tax   # SubTotal in ERP = gross; net = gross - tax
        invoices.append({
            "serial_number":  str(r.SerialNumber),
            "voucher_date":   str(r.VoucherDate),
            "invoice_no":     str(r.InvoiceNo),
            "customer_id":    str(r.CustomerID).strip(),
            "customer_name":  str(r.CustomerName or "").strip(),
            "mobile":         str(r.Mobile or "").strip(),
            "bill_amount":    bill,
            "sub_total":      float(r.SubTotal or 0),
            "tax_total":      tax,
            "net_amount":     round(float(r.SubTotal or 0) - tax, 2),
            "location_id":    int(r.LocationID or 0),
            "user_id":        int(r.UserID or 0),
            "user_name":      str(r.UserName or "").strip(),
        })
        total_amount += bill
        total_tax    += tax
        total_net    += round(float(r.SubTotal or 0) - tax, 2)

    return {
        "invoices": invoices,
        "summary": {
            "total_sales":  len(invoices),
            "total_amount": round(total_amount, 2),
            "total_tax":    round(total_tax,    2),
            "total_net":    round(total_net,    2),
        },
    }


# ── B) Sales by Product ────────────────────────────────────────────────────────

@router.get("/sales-by-product")
def sales_by_product(
    date_from:     str           = Query(..., description="YYYY-MM-DD"),
    date_to:       str           = Query(..., description="YYYY-MM-DD"),
    group_id:      Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
):
    sql = f"""
        SELECT
            sd.ProductID,
            pm.ProductName,
            pm.ProductGroupID,
            pgm.ProductGroupName,
            pgm.DepartmentID,
            dm.DepartmentName,
            SUM(sd.Quantity)                        AS TotalQty,
            SUM(sd.FinalSaleRate * sd.Quantity)     AS TotalAmount,
            SUM(sd.TaxAmount1)                      AS TotalTax,
            SUM(sd.TaxableValue1)                   AS TotalNet,
            COUNT(DISTINCT sd.SerialNumber)         AS InvoiceCount
        FROM saledetail sd
        JOIN SaleHeader sh        ON sh.SerialNumber   = sd.SerialNumber
        JOIN ProductMaster pm     ON pm.ProductID      = sd.ProductID
        JOIN ProductGroupMaster pgm ON pgm.ProductGroupID = pm.ProductGroupID
        JOIN DepartmentMaster dm  ON dm.DepartmentID   = pgm.DepartmentID
        WHERE sh.TableName = N'MEMBER'
          AND {PAID_OR_POSTED}
          AND sh.VoucherDate >= ?
          AND sh.VoucherDate < DATEADD(day, 1, CAST(? AS DATE))
          AND (? IS NULL OR pm.ProductGroupID = ?)
          AND (? IS NULL OR pgm.DepartmentID  = ?)
        GROUP BY
            sd.ProductID, pm.ProductName,
            pm.ProductGroupID, pgm.ProductGroupName,
            pgm.DepartmentID, dm.DepartmentName
        ORDER BY TotalAmount DESC
    """
    grp  = group_id
    dept = department_id
    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql, date_from, date_to, grp, grp, dept, dept)
            rows = cur.fetchall()
    except pyodbc.Error as exc:
        log.error("sales-by-product DB error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    products = []
    total_qty    = 0.0
    total_amount = 0.0
    total_tax    = 0.0
    total_net    = 0.0

    for r in rows:
        qty  = float(r.TotalQty    or 0)
        amt  = float(r.TotalAmount or 0)
        tax  = float(r.TotalTax    or 0)
        net  = float(r.TotalNet    or 0)
        products.append({
            "product_id":        str(r.ProductID).strip(),
            "product_name":      str(r.ProductName or "").strip(),
            "product_group_id":  int(r.ProductGroupID  or 0),
            "product_group_name": str(r.ProductGroupName or "").strip(),
            "department_id":     int(r.DepartmentID or 0),
            "department_name":   str(r.DepartmentName or "").strip(),
            "total_qty":         round(qty,  2),
            "total_amount":      round(amt,  2),
            "total_tax":         round(tax,  2),
            "total_net":         round(net,  2),
            "invoice_count":     int(r.InvoiceCount or 0),
        })
        total_qty    += qty
        total_amount += amt
        total_tax    += tax
        total_net    += net

    return {
        "products": products,
        "summary": {
            "total_qty":    round(total_qty,    2),
            "total_amount": round(total_amount, 2),
            "total_tax":    round(total_tax,    2),
            "total_net":    round(total_net,    2),
        },
    }


# ── D) Day Audit ──────────────────────────────────────────────────────────────

MOP_NAMES = {1: "Cash", 542: "Cheque/Prime Bank", 543: "M-Pesa", 544: "Pesapal"}
MOP_IDS   = list(MOP_NAMES.keys())          # [1, 542, 543, 544]
MOP_PLACEHOLDERS = ",".join("?" * len(MOP_IDS))


@router.get("/day-audit")
def day_audit(
    date:        str           = Query(default="", description="YYYY-MM-DD; defaults to today"),
    location_id: Optional[int] = Query(None),
):
    audit_date = date or "CAST(GETDATE() AS DATE)"
    date_param = date if date else None   # None → SQL uses GETDATE()

    # ── SECTION 1: Deposits by MOP ────────────────────────────────────────────
    sql_deposits_mop = f"""
        SELECT
            tc.AccountID AS mop_account_id,
            COUNT(DISTINCT tm.SerialNumber) AS tx_count,
            SUM(tc.DebitAmount) AS total_amount
        FROM TransactionMaster tm
        JOIN TransactionChild tc ON tc.SerialNumber = tm.SerialNumber
        WHERE tm.VoucherID = 7
          AND CAST(tm.VoucherDate AS DATE) = CAST(? AS DATE)
          AND tc.AccountID IN ({MOP_PLACEHOLDERS})
          AND (? IS NULL OR tm.LocationID = ?)
        GROUP BY tc.AccountID
        ORDER BY total_amount DESC
    """

    # ── SECTION 2: Sales by User ───────────────────────────────────────────────
    sql_sales_user = f"""
        SELECT
            um.UserID,
            um.UserName,
            COUNT(DISTINCT sh.SerialNumber) AS invoice_count,
            SUM(sh.BillAmount)              AS total_sales,
            SUM(sh.TaxTotal)                AS total_tax,
            SUM(sh.SubTotal - sh.TaxTotal)  AS total_net
        FROM SaleHeader sh
        JOIN UserMaster um ON um.UserID = sh.UserID
        WHERE sh.TableName = N'MEMBER'
          AND {PAID_OR_POSTED}
          AND CAST(sh.VoucherDate AS DATE) = CAST(? AS DATE)
          AND (? IS NULL OR sh.LocationID = ?)
        GROUP BY um.UserID, um.UserName
        ORDER BY total_sales DESC
    """

    # ── SECTION 3: Deposits by User ───────────────────────────────────────────
    sql_deposits_user = f"""
        SELECT
            um.UserID,
            um.UserName,
            COUNT(DISTINCT tm.SerialNumber) AS tx_count,
            SUM(tc.DebitAmount)             AS total_amount
        FROM TransactionMaster tm
        JOIN TransactionChild tc ON tc.SerialNumber = tm.SerialNumber
        JOIN UserMaster um        ON um.UserID = tm.UserID
        WHERE tm.VoucherID = 7
          AND CAST(tm.VoucherDate AS DATE) = CAST(? AS DATE)
          AND tc.AccountID IN ({MOP_PLACEHOLDERS})
          AND (? IS NULL OR tm.LocationID = ?)
        GROUP BY um.UserID, um.UserName
        ORDER BY total_amount DESC
    """

    # ── SECTION 4: Transaction log (individual receipts) ──────────────────────
    sql_tx_log = f"""
        SELECT TOP 200
            tm.SerialNumber,
            CONVERT(VARCHAR(20), tm.VoucherDate, 120) AS voucher_date,
            tm.VchNumber,
            tc.AccountID   AS mop_account_id,
            tc.DebitAmount AS amount,
            cm.FirstName + ' ' + cm.LastName AS member_name,
            cm_acc.AccountID AS member_account_id,
            tm.Narration,
            um.UserName
        FROM TransactionMaster tm
        JOIN TransactionChild tc      ON tc.SerialNumber  = tm.SerialNumber AND tc.AccountID IN ({MOP_PLACEHOLDERS})
        JOIN TransactionChild tc_mem  ON tc_mem.SerialNumber = tm.SerialNumber AND tc_mem.CreditAmount > 0
        JOIN AccountMaster am_mem     ON am_mem.AccountID = tc_mem.AccountID
        LEFT JOIN CustomerMaster cm   ON cm.AccountID    = tc_mem.AccountID
        LEFT JOIN AccountMaster cm_acc ON cm_acc.AccountID = tc_mem.AccountID
        JOIN UserMaster um            ON um.UserID = tm.UserID
        WHERE tm.VoucherID = 7
          AND CAST(tm.VoucherDate AS DATE) = CAST(? AS DATE)
          AND (? IS NULL OR tm.LocationID = ?)
        ORDER BY tm.VoucherDate DESC
    """

    try:
        with erp_conn() as conn:
            cur = conn.cursor()

            # Section 1
            date_val = date if date else "today"
            d = date if date else "GETDATE()"
            # Always pass the date as a string; SQL Server will cast it
            effective_date = date if date else __import__("datetime").date.today().isoformat()
            loc = location_id

            cur.execute(sql_deposits_mop, effective_date, *MOP_IDS, loc, loc)
            dep_mop_rows = cur.fetchall()

            # Section 2
            cur.execute(sql_sales_user, effective_date, loc, loc)
            sales_user_rows = cur.fetchall()

            # Section 3
            cur.execute(sql_deposits_user, effective_date, *MOP_IDS, loc, loc)
            dep_user_rows = cur.fetchall()

            # Section 4 — try; gracefully skip if JOIN is too complex
            tx_log = []
            try:
                cur.execute(sql_tx_log, *MOP_IDS, effective_date, loc, loc)
                tx_log_rows = cur.fetchall()
                for r in tx_log_rows:
                    tx_log.append({
                        "serial_number":     str(r[0]),
                        "voucher_date":      str(r[1]),
                        "vch_number":        int(r[2] or 0),
                        "mop_account_id":    int(r[3] or 0),
                        "mop_name":          MOP_NAMES.get(int(r[3] or 0), f"Account {r[3]}"),
                        "amount":            float(r[4] or 0),
                        "member_name":       str(r[5] or "").strip(),
                        "narration":         str(r[7] or "").strip(),
                        "user_name":         str(r[8] or "").strip(),
                    })
            except pyodbc.Error as exc:
                log.warning("Day audit tx log query failed (non-fatal): %s", exc)

    except pyodbc.Error as exc:
        log.error("day-audit DB error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Build response
    deposits_by_mop = []
    total_deposits  = 0.0
    for r in dep_mop_rows:
        acct_id = int(r[0])
        amt     = float(r[2] or 0)
        deposits_by_mop.append({
            "mop_account_id": acct_id,
            "payment_method": MOP_NAMES.get(acct_id, f"Account {acct_id}"),
            "tx_count":       int(r[1] or 0),
            "total_amount":   round(amt, 2),
        })
        total_deposits += amt

    sales_by_user = []
    total_sales   = 0.0
    total_tax     = 0.0
    total_net     = 0.0
    total_invoices = 0
    for r in sales_user_rows:
        s = float(r[3] or 0)
        t = float(r[4] or 0)
        n = float(r[5] or 0)
        sales_by_user.append({
            "user_id":       int(r[0] or 0),
            "user_name":     str(r[1] or "").strip(),
            "invoice_count": int(r[2] or 0),
            "total_sales":   round(s, 2),
            "total_tax":     round(t, 2),
            "total_net":     round(n, 2),
        })
        total_sales   += s
        total_tax     += t
        total_net     += n
        total_invoices += int(r[2] or 0)

    deposits_by_user = []
    for r in dep_user_rows:
        deposits_by_user.append({
            "user_id":      int(r[0] or 0),
            "user_name":    str(r[1] or "").strip(),
            "tx_count":     int(r[2] or 0),
            "total_amount": round(float(r[3] or 0), 2),
        })

    return {
        "date":        effective_date,
        "location_id": location_id,
        "deposits_by_mop":  deposits_by_mop,
        "sales_by_user":    sales_by_user,
        "deposits_by_user": deposits_by_user,
        "tx_log":           tx_log,
        "summary": {
            "total_deposits":   round(total_deposits, 2),
            "total_sales":      round(total_sales,    2),
            "total_tax":        round(total_tax,      2),
            "total_net":        round(total_net,      2),
            "total_invoices":   total_invoices,
            "variance":         round(total_deposits - total_sales, 2),
        },
    }


# ── E) Revenue Summary (ALL product groups — powers the Analytics dashboard) ───

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Product group that represents a gym membership (day pass, monthly, etc.).
# A "new member" = a customer whose FIRST paid membership purchase is in-period.
MEMBERSHIP_GROUP_ID = int(os.getenv("MEMBERSHIP_GROUP_ID", "107"))


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _add_months(d: date, delta: int) -> date:
    """First-of-month `delta` months away from `d` (delta may be negative)."""
    m0 = d.year * 12 + (d.month - 1) + delta
    return date(m0 // 12, (m0 % 12) + 1, 1)


@router.get("/revenue-summary")
def revenue_summary(location_id: Optional[int] = Query(None)):
    """Total POS revenue across ALL product groups (memberships + retail + F&B),
    using the same paid-or-posted rule as the sales register. Member-count
    metrics stay in Supabase; this endpoint only covers money taken."""
    today       = date.today()
    start_this  = _month_start(today)
    start_next  = _add_months(start_this, 1)
    start_last  = _add_months(start_this, -1)
    six_start   = _add_months(start_this, -5)
    loc         = location_id

    # Invoice-level totals (BillAmount is the whole invoice across all products).
    totals_sql = f"""
        SELECT ISNULL(SUM(sh.BillAmount), 0) AS revenue, COUNT(*) AS sales
        FROM SaleHeader sh
        WHERE sh.TableName = N'MEMBER'
          AND {PAID_OR_POSTED}
          AND sh.VoucherDate >= ?
          AND (? IS NULL OR sh.VoucherDate < ?)
          AND (? IS NULL OR sh.LocationID = ?)
    """

    trend_sql = f"""
        SELECT YEAR(sh.VoucherDate) AS yr, MONTH(sh.VoucherDate) AS mo,
               ISNULL(SUM(sh.BillAmount), 0) AS revenue, COUNT(*) AS sales
        FROM SaleHeader sh
        WHERE sh.TableName = N'MEMBER'
          AND {PAID_OR_POSTED}
          AND sh.VoucherDate >= ?
          AND (? IS NULL OR sh.LocationID = ?)
        GROUP BY YEAR(sh.VoucherDate), MONTH(sh.VoucherDate)
        ORDER BY yr, mo
    """

    top_sql = f"""
        SELECT TOP 5 pm.ProductName,
               COUNT(DISTINCT sd.SerialNumber) AS cnt,
               ISNULL(SUM(sd.FinalSaleRate * sd.Quantity), 0) AS revenue
        FROM SaleDetail sd
        JOIN SaleHeader sh    ON sh.SerialNumber = sd.SerialNumber
        JOIN ProductMaster pm ON pm.ProductID    = sd.ProductID
        WHERE sh.TableName = N'MEMBER'
          AND {PAID_OR_POSTED}
          AND sh.VoucherDate >= ?
          AND (? IS NULL OR sh.LocationID = ?)
        GROUP BY pm.ProductName
        ORDER BY revenue DESC
    """

    # New members = customers whose FIRST paid membership purchase falls in-period.
    # Uses first purchase date, not sync/created time, so a backfill can't inflate it.
    new_members_sql = f"""
        SELECT COUNT(*) FROM (
            SELECT sh.CustomerID, MIN(sh.VoucherDate) AS first_date
            FROM SaleHeader sh
            JOIN SaleDetail sd    ON sd.SerialNumber = sh.SerialNumber
            JOIN ProductMaster pm ON pm.ProductID    = sd.ProductID
            WHERE sh.TableName = N'MEMBER'
              AND pm.ProductGroupID = ?
              AND {PAID_OR_POSTED}
            GROUP BY sh.CustomerID
        ) t
        WHERE t.first_date >= ? AND t.first_date < ?
    """

    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            # This month (no upper bound → pass None for the < ? guard)
            cur.execute(totals_sql, start_this.isoformat(), None, None, loc, loc)
            r = cur.fetchone()
            rev_this, sales_this = float(r[0] or 0), int(r[1] or 0)
            # Last month (bounded)
            cur.execute(totals_sql, start_last.isoformat(), 1, start_this.isoformat(), loc, loc)
            r = cur.fetchone()
            rev_last, sales_last = float(r[0] or 0), int(r[1] or 0)
            # 6-month trend
            cur.execute(trend_sql, six_start.isoformat(), loc, loc)
            trend_rows = cur.fetchall()
            # Top products this month
            cur.execute(top_sql, start_this.isoformat(), loc, loc)
            top_rows = cur.fetchall()
            # New members this month / last month (by first membership purchase)
            cur.execute(new_members_sql, MEMBERSHIP_GROUP_ID,
                        start_this.isoformat(), start_next.isoformat())
            new_this = int(cur.fetchone()[0] or 0)
            cur.execute(new_members_sql, MEMBERSHIP_GROUP_ID,
                        start_last.isoformat(), start_this.isoformat())
            new_last = int(cur.fetchone()[0] or 0)
    except pyodbc.Error as exc:
        log.error("revenue-summary DB error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    monthly_revenue = [
        {
            "month":   f"{_MONTHS[int(r[1]) - 1]} {str(int(r[0]))[2:]}",
            "revenue": round(float(r[2] or 0), 2),
            "sales":   int(r[3] or 0),
        }
        for r in trend_rows
    ]
    top_plans = [
        {
            "plan_name": str(r[0] or "").strip(),
            "count":     int(r[1] or 0),
            "revenue":   round(float(r[2] or 0), 2),
        }
        for r in top_rows
    ]

    change_pct = ((rev_this - rev_last) / rev_last * 100) if rev_last > 0 else 0.0

    return {
        "revenue_this_month": round(rev_this, 2),
        "revenue_last_month": round(rev_last, 2),
        "revenue_change_pct": round(change_pct, 2),
        "sales_this_month":   sales_this,
        "sales_last_month":   sales_last,
        "monthly_revenue":    monthly_revenue,
        "top_plans":          top_plans,
        "new_this_month":     new_this,
        "new_last_month":     new_last,
    }


# ── F) Staff Performance ──────────────────────────────────────────────────────

@router.get("/staff-performance")
def staff_performance(
    date_from:   str           = Query(..., description="YYYY-MM-DD"),
    date_to:     str           = Query(..., description="YYYY-MM-DD"),
    location_id: Optional[int] = Query(None),
):
    """Sales and deposits handled per staff user for the period. Sales use the
    same paid-or-posted rule as the rest of the reports so today's activity counts."""
    loc = location_id

    sales_sql = f"""
        SELECT um.UserName, um.UserID,
               COUNT(DISTINCT sh.SerialNumber) AS Invoices,
               ISNULL(SUM(sh.BillAmount), 0)   AS TotalSales
        FROM SaleHeader sh
        JOIN UserMaster um ON um.UserID = sh.UserID
        WHERE sh.TableName = N'MEMBER'
          AND {PAID_OR_POSTED}
          AND sh.VoucherDate >= ?
          AND sh.VoucherDate < DATEADD(day, 1, CAST(? AS DATE))
          AND (? IS NULL OR sh.LocationID = ?)
        GROUP BY um.UserID, um.UserName
        ORDER BY TotalSales DESC
    """

    deposits_sql = f"""
        SELECT um.UserName, um.UserID,
               COUNT(DISTINCT tm.SerialNumber) AS Deposits,
               ISNULL(SUM(tc.DebitAmount), 0)  AS TotalDeposited
        FROM TransactionMaster tm
        JOIN TransactionChild tc ON tc.SerialNumber = tm.SerialNumber
        JOIN UserMaster um       ON um.UserID       = tm.UserID
        WHERE tm.VoucherID = 7
          AND tc.AccountID IN ({MOP_PLACEHOLDERS})
          AND tm.VoucherDate >= ?
          AND tm.VoucherDate < DATEADD(day, 1, CAST(? AS DATE))
          AND (? IS NULL OR tm.LocationID = ?)
        GROUP BY um.UserID, um.UserName
        ORDER BY TotalDeposited DESC
    """

    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            cur.execute(sales_sql, date_from, date_to, loc, loc)
            sales_rows = cur.fetchall()
            cur.execute(deposits_sql, *MOP_IDS, date_from, date_to, loc, loc)
            dep_rows = cur.fetchall()
    except pyodbc.Error as exc:
        log.error("staff-performance DB error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    sales_by_user = [
        {
            "user_name":   str(r[0] or "").strip(),
            "user_id":     int(r[1] or 0),
            "invoices":    int(r[2] or 0),
            "total_sales": round(float(r[3] or 0), 2),
        }
        for r in sales_rows
    ]
    deposits_by_user = [
        {
            "user_name":       str(r[0] or "").strip(),
            "user_id":         int(r[1] or 0),
            "deposits":        int(r[2] or 0),
            "total_deposited": round(float(r[3] or 0), 2),
        }
        for r in dep_rows
    ]

    return {"sales_by_user": sales_by_user, "deposits_by_user": deposits_by_user}


# ── C) Filters ────────────────────────────────────────────────────────────────

@router.get("/filters")
def get_filters():
    sql_groups = """
        SELECT DISTINCT pgm.ProductGroupID, pgm.ProductGroupName
        FROM ProductGroupMaster pgm
        JOIN ProductMaster pm   ON pm.ProductGroupID  = pgm.ProductGroupID
        JOIN RestMenuChild rmc  ON rmc.ProductID       = pm.ProductID
        JOIN RestMenuMaster rmm ON rmm.MenuID          = rmc.MenuID
        WHERE rmm.IsActive = 1
        ORDER BY pgm.ProductGroupName
    """
    sql_depts = """
        SELECT DepartmentID, DepartmentName
        FROM DepartmentMaster
        WHERE DepartmentName != N'[None]'
        ORDER BY DepartmentName
    """
    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql_groups)
            group_rows = cur.fetchall()
            cur.execute(sql_depts)
            dept_rows = cur.fetchall()
    except pyodbc.Error as exc:
        log.error("filters DB error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "groups": [
            {"id": int(r[0]), "name": str(r[1]).strip()}
            for r in group_rows
        ],
        "departments": [
            {"id": int(r[0]), "name": str(r[1]).strip()}
            for r in dept_rows
        ],
    }
