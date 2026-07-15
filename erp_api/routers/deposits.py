"""POST /erp/deposits — record a cash/cheque/mpesa receipt into the ERP ledger."""

from __future__ import annotations

import logging
from datetime import datetime

import pyodbc
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import erp_conn

log = logging.getLogger("erp_api.deposits")
router = APIRouter(prefix="/erp/deposits", tags=["deposits"])

VOUCHER_ID = 7      # Receipt voucher type (confirmed from VoucherMaster)
TOBY_CREDIT = 42
TOBY_DEBIT  = 43
REF_TYPE    = 47

PAYMENT_METHOD_ACCOUNTS = {
    "cash":   1,    # Cash
    "mpesa":  543,  # Mpesa Account
    "cheque": 542,  # Prime Bank KES A/C 3000171374
}


class CreateDepositRequest(BaseModel):
    account_id:     int
    amount:         float
    payment_method: str = "cash"
    narration:      str = ""


class CreateDepositResponse(BaseModel):
    serial_number: str
    vch_number:    int
    amount:        float


@router.post("", response_model=CreateDepositResponse, status_code=201)
def create_deposit(body: CreateDepositRequest) -> CreateDepositResponse:
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than zero")

    method_key = body.payment_method.lower().replace("-", "")
    if method_key not in PAYMENT_METHOD_ACCOUNTS:
        raise HTTPException(status_code=400, detail=f"Invalid payment method: {body.payment_method!r}")
    contra_account_id = PAYMENT_METHOD_ACCOUNTS[method_key]

    today = datetime.now()
    vch_id_ymd = today.strftime("%y%m%d")   # e.g. "250623"

    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            try:
                # ── STEP 1 — Next SerialNumber for TransactionMaster ──────────────
                # AutoNumber TableName is 'TransactionMaster' (exact case from DB).
                cur.execute(
                    """
                    UPDATE AutoNumber SET LastNumber = LastNumber + 1
                     WHERE TableName = 'TransactionMaster'
                       AND FieldName  = 'SerialNumber'
                    """
                )
                cur.execute(
                    """
                    SELECT LastNumber FROM AutoNumber
                     WHERE TableName = 'TransactionMaster'
                       AND FieldName  = 'SerialNumber'
                    """
                )
                row = cur.fetchone()
                if row is None:
                    raise RuntimeError("AutoNumber row missing for TransactionMaster/SerialNumber")
                raw_serial: int = int(row[0])
                serial_number_str   = f"{raw_serial}.0001"
                serial_number_float = float(serial_number_str)

                # ── STEP 2 — Next VchNumber for Receipt + current year ────────────
                cur.execute(
                    """
                    SELECT ISNULL(MAX(VchNumber), 0) + 1
                      FROM transactionmaster
                     WHERE YEAR(VoucherDate) = YEAR(GETDATE())
                       AND VoucherID = ?
                    """,
                    VOUCHER_ID,
                )
                row = cur.fetchone()
                vch_number: int = int(row[0]) if row else 1

                narration = body.narration or f"{body.payment_method.upper()} receipt"

                # ── STEP 3 — Insert transactionmaster ─────────────────────────────
                cur.execute(
                    """
                    INSERT INTO transactionmaster (
                        SerialNumber, VoucherDate,
                        VchIDPrefix, VchIDYMD, VchNumber, VoucherID,
                        Narration, UserID, SessionID,
                        IsDeleted, IsOpening, IsAudited,
                        CreateLocationID, LocationID, ModifyLocationID,
                        StationID, BatchID, BilledTo,
                        RecordDateTime, AuditBy, AuditDate, AuditLocation,
                        AuditRemarks, Link, ReservationID,
                        FolioNo, RegnNo, SHE,
                        UDFField1, UDFField2, UDFField3, UDFField4, UDFField5,
                        UDFField6, UDFField7, UDFField8, UDFField9, UDFField10
                    ) VALUES (
                        ?, GETDATE(),
                        '', ?, ?, ?,
                        ?, 1, '0001CR',
                        0, 0, 0,
                        1, 1, 1,
                        1, '000001', 0,
                        GETDATE(), 0, GETDATE(), 0,
                        '', '', '',
                        '', '', 0,
                        '', '', '', '', '',
                        '', '', '', '', ''
                    )
                    """,
                    serial_number_float,
                    vch_id_ymd, vch_number, VOUCHER_ID,
                    narration,
                )

                # ── STEP 4 — refmaster (credit member account) ────────────────────
                cur.execute(
                    """
                    INSERT INTO refmaster (
                        SerialNumber, AccountID, ToBy,
                        RefType, RefName, RefDate,
                        DebitAmount, CreditAmount,
                        IsDeleted, DueDate
                    ) VALUES (?, ?, ?, ?, '', GETDATE(), 0, ?, 0, GETDATE())
                    """,
                    serial_number_float, body.account_id, TOBY_CREDIT,
                    REF_TYPE, body.amount,
                )

                # ── STEP 5 — transactionchild: credit member account ──────────────
                cur.execute(
                    """
                    INSERT INTO transactionchild (
                        SerialNumber, ToBy, AccountID, ContraID,
                        DebitAmount, CreditAmount,
                        CostCenterID, ReconciliationDate, AssessableValue, Narration
                    ) VALUES (?, ?, ?, ?, 0, ?, 1, GETDATE(), 0, '')
                    """,
                    serial_number_float, TOBY_CREDIT,
                    body.account_id, contra_account_id,
                    body.amount,
                )

                # ── STEP 6 — transactionchild: debit cash account ─────────────────
                cur.execute(
                    """
                    INSERT INTO transactionchild (
                        SerialNumber, ToBy, AccountID, ContraID,
                        DebitAmount, CreditAmount,
                        CostCenterID, ReconciliationDate, AssessableValue, Narration
                    ) VALUES (?, ?, ?, ?, ?, 0, 1, GETDATE(), 0, '')
                    """,
                    serial_number_float, TOBY_DEBIT,
                    contra_account_id, body.account_id,
                    body.amount,
                )

                conn.commit()
                log.info(
                    "Deposit recorded: Serial=%s VchNo=%s Amount=%.2f AccountID=%s",
                    serial_number_str, vch_number, body.amount, body.account_id,
                )
                return CreateDepositResponse(
                    serial_number=serial_number_str,
                    vch_number=vch_number,
                    amount=body.amount,
                )

            except Exception:
                conn.rollback()
                raise

    except HTTPException:
        raise
    except pyodbc.Error as exc:
        log.error("ERP DB error recording deposit: %s", exc)
        raise HTTPException(status_code=500, detail=f"ERP database error: {exc}") from exc
    except Exception as exc:
        log.error("Unexpected error recording deposit: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
