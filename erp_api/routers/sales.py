"""POST /erp/sales — post a membership sale into saleheader + saledetail."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List

import pyodbc
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import erp_conn

log = logging.getLogger("erp_api.sales")
router = APIRouter(prefix="/erp/sales", tags=["sales"])

# VoucherID=16 is 'Sale' in VoucherMaster (14 is 'Sale Order' — wrong).
VOUCHER_ID = 16
TABLE_NAME = "MEMBER"
SALE_TYPE  = 4
SALE_MODE  = 1
LAYOUT_ID  = 37   # "Menu" layout — used by all real sales


class SaleItem(BaseModel):
    product_id:    str
    quantity:      int
    sale_rate:     float
    mrp:           float
    tax_id:        int   = 0
    tax_rate:      float = 0.0
    tax_amount:    float = 0.0
    taxable_value: float = 0.0


class CreateSaleRequest(BaseModel):
    customer_id:          str
    account_id:           int
    items:                List[SaleItem]
    subtotal:             float
    tax_total:            float
    bill_amount:          float
    session_id:           str  = "0001CR"
    enforce_stock_check:  bool = True


class CreateSaleResponse(BaseModel):
    serial_number: str
    vch_number:    int
    bill_amount:   float
    gl_serial:     str = ""


@router.post("", response_model=CreateSaleResponse, status_code=201)
def create_sale(body: CreateSaleRequest) -> CreateSaleResponse:
    if not body.items:
        raise HTTPException(status_code=400, detail="items list must not be empty")
    if body.bill_amount <= 0:
        raise HTTPException(status_code=400, detail="bill_amount must be greater than zero")

    qty_total = sum(item.quantity for item in body.items)
    today = datetime.now()
    vch_id_ymd = today.strftime("%y%m%d")   # e.g. "250623"

    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            try:
                # ── STEP 1 — Next SerialNumber for SaleHeader ─────────────────────
                # AutoNumber TableName is 'SaleHeader' (exact case from DB).
                cur.execute(
                    """
                    UPDATE AutoNumber SET LastNumber = LastNumber + 1
                     WHERE TableName = 'SaleHeader'
                       AND FieldName  = 'SerialNumber'
                    """
                )
                cur.execute(
                    """
                    SELECT LastNumber FROM AutoNumber
                     WHERE TableName = 'SaleHeader'
                       AND FieldName  = 'SerialNumber'
                    """
                )
                row = cur.fetchone()
                if row is None:
                    raise RuntimeError("AutoNumber row missing for SaleHeader/SerialNumber")
                raw_serial: int = int(row[0])
                serial_number_str   = f"{raw_serial}.0001"
                serial_number_float = float(serial_number_str)

                # ── STEP 2 — Next VchNumber for Sale voucher type + year ──────────
                cur.execute(
                    """
                    SELECT ISNULL(MAX(VchNumber), 0) + 1
                      FROM saleheader
                     WHERE YEAR(VoucherDate) = YEAR(GETDATE())
                       AND VoucherID = ?
                    """,
                    VOUCHER_ID,
                )
                row = cur.fetchone()
                vch_number: int = int(row[0]) if row else 1

                # ── STEP 3 — Insert saleheader ────────────────────────────────────
                # SaleAccountID (not AccountID) is the correct column name.
                # All NOT NULL columns are explicitly provided.
                cur.execute(
                    """
                    INSERT INTO saleheader (
                        SerialNumber, VoucherDate,
                        VchIDPrefix, VchIDYMD, VchNumber, VoucherID,
                        LayoutID, TableName, SaleMode, Status,
                        CustomerID, LinkCustomerID, CompanyName,
                        SaleAccountID, AccountSerialNumber, CompanyID,
                        BillAmount, SubTotal, TaxTotal, QtyTotal,
                        RoundOffAmt, CRMPoints, CRMPointsToParent,
                        BillReference, Narration, Remarks, MobiWallet,
                        IsPrinted, IsAudited, AuditBy, AuditDate,
                        AuditLocation, AuditRemarks,
                        CreateLocationID, LocationID, ModifyLocationID,
                        UserID, StationID, SessionID, RecordDateTime,
                        PriceListID, ServiceModeID, NoOfPax,
                        DateTimeIn, DateTimeOut,
                        DueDate, DeliveryDateTime, AssignDateTime,
                        DeliverDateTime, DeliveryStatus,
                        DriverID, AssignUser, DeliveredUser,
                        PmntUser, PmntDate, PrepareUser, PrepareDate,
                        BilledTo, HDSerial, TripID, OtherSWEntry,
                        PlaceOfSupply, BusinessType, Packages,
                        DeliveryType, Addresstype,
                        StreetNumber, StreetID, LocalityID,
                        CityID, StateID, CountryID, Pincode,
                        SOSerialNumber, TagOfTable,
                        BatchID, ReservationID, DiscountCouponID,
                        Link, TPVchNo, TPChannel,
                        GSTINNumberCustomer, GSTINNumberECommerce,
                        UDFField1, UDFField2, UDFField3, UDFField4, UDFField5,
                        UDFField6, UDFField7, UDFField8, UDFField9, UDFField10
                    ) VALUES (
                        ?, GETDATE(),
                        '', ?, ?, ?,
                        ?, ?, ?, 0,
                        ?, '', '',
                        ?, 0, 0,
                        ?, ?, ?, ?,
                        0, 0, 0,
                        '', '', '', '',
                        0, 0, 0, GETDATE(),
                        0, '',
                        15, 15, 15,
                        1, 1, ?, GETDATE(),
                        1, 1, 1,
                        GETDATE(), GETDATE(),
                        GETDATE(), GETDATE(), GETDATE(),
                        GETDATE(), 0,
                        0, 0, 0,
                        0, GETDATE(), 0, GETDATE(),
                        0, 0, 0, 0,
                        1, 848, 0,
                        648, 648,
                        '', 1, 1,
                        1, 1, 1, '',
                        0, '',
                        '000001', '', '',
                        '', '', '',
                        '', '',
                        '', '', '', '', '',
                        '', '', '', '', ''
                    )
                    """,
                    serial_number_float,
                    vch_id_ymd, vch_number, VOUCHER_ID,
                    LAYOUT_ID, TABLE_NAME, SALE_MODE,
                    body.customer_id,
                    body.account_id,
                    body.bill_amount, body.subtotal, body.tax_total, qty_total,
                    body.session_id,
                )

                # ── STEP 3b — Stock check (before any inserts) ───────────────────
                # ItemType=164 means physical stocked goods; all others are services.
                if body.enforce_stock_check:
                    out_of_stock = []
                    for item in body.items:
                        cur.execute(
                            "SELECT ItemType, ProductName FROM ProductMaster WHERE ProductID = ?",
                            item.product_id,
                        )
                        pm = cur.fetchone()
                        if pm and int(pm[0]) != 164:
                            continue  # service item — skip stock check
                        # Physical good — check stock.
                        # Stock stores multiple batch/lot rows per product; the
                        # available quantity is the SUM, not any single row.
                        cur.execute(
                            """
                            SELECT SUM(Quantity) FROM Stock
                             WHERE ProductID   = ?
                               AND WarehouseID = 10
                               AND LocationID  = 15
                            """,
                            item.product_id,
                        )
                        stock_row = cur.fetchone()
                        qty_avail = float(stock_row[0]) if stock_row and stock_row[0] is not None else 0.0
                        if qty_avail <= 0:
                            product_name = str(pm[1]).strip() if pm else item.product_id
                            out_of_stock.append({"product_id": item.product_id, "product_name": product_name})
                    if out_of_stock:
                        raise HTTPException(
                            status_code=400,
                            detail={"error": "Out of stock", "items": out_of_stock},
                        )

                # ── STEP 4 — Insert saledetail + stock deduction per item ─────────
                # Also collect SaleAccountID per item for GL routing in STEP 6.
                sale_account_map: dict[int, float] = {}   # {sale_account_id: taxable_value_sum}

                for item in body.items:
                    final_sale_rate = item.sale_rate

                    cur.execute(
                        """
                        INSERT INTO saledetail (
                            SerialNumber, SaleType,
                            ProductID, ChildID, LocationCode, ModifierProductID,
                            WarehouseID, Quantity, MRP, SaleRate, FinalSaleRate,
                            Remarks, SalesPersonID,
                            TaxID, TaxRate, IncludeInRate,
                            TaxID1, TaxRate1, TaxAmount1, TaxableValue1,
                            TaxID2, TaxRate2, TaxAmount2, TaxableValue2,
                            TaxID3, TaxRate3, TaxAmount3, TaxableValue3,
                            TaxID4, TaxRate4, TaxAmount4, TaxableValue4,
                            DiscountProduct, DiscountManual, DiscountFinal,
                            ProductDiscount, CustomerDiscount, PriceListDiscount,
                            SPCommPercent, SPCommAmt,
                            SchemeID, SchemeDiscPercent, SchemeDiscAmt,
                            SCSerialNumber, SOSerialNumber, KOTNumber,
                            ChargesPercent, ChargesAmount,
                            PerUnitID, IsPrinted, MenuID,
                            CancellationReasonID, PrinterID,
                            AlternateQty, AlternateUnitID, ConversionFactor,
                            UnitID, InputRate, InputRateUnitID, InputRatePerQty,
                            SeatID, VoidDateTime, VoidUserID,
                            UserID, StationID, UserStationID,
                            CalcMethod, StatusID, OrderNumber
                        ) VALUES (
                            ?, ?,
                            ?, '', '', '000D',
                            10, ?, ?, ?, ?,
                            '', 1,
                            ?, ?, 1,
                            ?, ?, ?, ?,
                            0, 0, 0, 0,
                            0, 0, 0, 0,
                            0, 0, 0, 0,
                            0, 0, 0,
                            0, 0, 0,
                            0, 0,
                            1, 0, 0,
                            0, 0, 0,
                            0, 0,
                            0, 0, 13,
                            0, 0,
                            0, 1, 0,
                            1, 0, 1, 0,
                            1, GETDATE(), 0,
                            1, 1, 0,
                            0, 0, ''
                        )
                        """,
                        serial_number_float, SALE_TYPE,
                        item.product_id,
                        item.quantity, item.mrp, item.sale_rate,
                        final_sale_rate,
                        item.tax_id, item.tax_rate,
                        item.tax_id, item.tax_rate, item.tax_amount, item.taxable_value,
                    )

                    # Stock deduction is handled automatically by Sale_Trigger on saledetail INSERT.
                    # No manual Stock UPDATE needed.

                    # Collect SaleAccountID for GL routing
                    cur.execute(
                        "SELECT ISNULL(SaleAccountID, 0) FROM ProductMaster WHERE ProductID = ?",
                        item.product_id,
                    )
                    pm_row = cur.fetchone()
                    sale_acct = int(pm_row[0]) if pm_row and pm_row[0] else 0
                    if sale_acct == 0:
                        sale_acct = 3   # fallback: generic Sales A/C
                    sale_account_map[sale_acct] = sale_account_map.get(sale_acct, 0.0) + item.taxable_value

                # ── STEP 5 — SalePayment: MOPID=2 Credit Sale ────────────────────
                cur.execute(
                    """
                    INSERT INTO SalePayment (
                        SerialNumber, MOPID, Amount, TenderAmount,
                        ReturnAmount, DocumentNo, BankName, RefName,
                        ExchangeRate, IsTIP, IsDeleted, CRMPoints, CardSerial,
                        Remarks, Response
                    ) VALUES (
                        ?, 2, ?, ?,
                        0, '', '', '',
                        1, 0, 0, 0, 0,
                        '', ''
                    )
                    """,
                    serial_number_float, body.bill_amount, body.bill_amount,
                )

                # ── STEP 6 — GL debit entry (TransactionMaster + child rows) ──────


                # 5a. Next SerialNumber for TransactionMaster
                cur.execute(
                    """
                    UPDATE AutoNumber SET LastNumber = LastNumber + 1
                     WHERE TableName = 'transactionmaster'
                       AND FieldName  = 'SerialNumber'
                    """
                )
                cur.execute(
                    """
                    SELECT LastNumber FROM AutoNumber
                     WHERE TableName = 'transactionmaster'
                       AND FieldName  = 'SerialNumber'
                    """
                )
                row = cur.fetchone()
                if row is None:
                    raise RuntimeError("AutoNumber row missing for transactionmaster/SerialNumber")
                tm_raw: int = int(row[0])
                tm_serial_str   = f"{tm_raw}.0001"
                tm_serial_float = float(tm_serial_str)

                # 5b. Next VchNumber for VoucherID=16 in transactionmaster
                cur.execute(
                    """
                    SELECT ISNULL(MAX(VchNumber), 0) + 1
                      FROM transactionmaster
                     WHERE YEAR(VoucherDate) = YEAR(GETDATE())
                       AND VoucherID = 16
                    """
                )
                row = cur.fetchone()
                tm_vch_number: int = int(row[0]) if row else 1

                # 5c. Insert TransactionMaster
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
                        '', ?, ?, 16,
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
                    tm_serial_float,
                    vch_id_ymd, tm_vch_number,
                    serial_number_str,   # narration = sale serial
                )

                # 5d. Debit member GL account — one row for full bill_amount (toby=42)
                first_sale_acct = next(iter(sale_account_map))
                cur.execute(
                    """
                    INSERT INTO transactionchild (
                        SerialNumber, ToBy, AccountID, ContraID,
                        DebitAmount, CreditAmount,
                        CostCenterID, ReconciliationDate, AssessableValue, Narration
                    ) VALUES (?, 42, ?, ?, ?, 0, 1, GETDATE(), 0, '')
                    """,
                    tm_serial_float, body.account_id, first_sale_acct, body.bill_amount,
                )

                # 5e. Credit each revenue account with its taxable_value share (toby=43)
                total_credited = 0.0
                for sale_acct_id, taxable_sum in sale_account_map.items():
                    cur.execute(
                        """
                        INSERT INTO transactionchild (
                            SerialNumber, ToBy, AccountID, ContraID,
                            DebitAmount, CreditAmount,
                            CostCenterID, ReconciliationDate, AssessableValue, Narration
                        ) VALUES (?, 43, ?, ?, 0, ?, 1, GETDATE(), 0, '')
                        """,
                        tm_serial_float, sale_acct_id, body.account_id, taxable_sum,
                    )
                    total_credited += taxable_sum

                # 5f. Credit VAT output account (571) with tax_total
                if body.tax_total:
                    cur.execute(
                        """
                        INSERT INTO transactionchild (
                            SerialNumber, ToBy, AccountID, ContraID,
                            DebitAmount, CreditAmount,
                            CostCenterID, ReconciliationDate, AssessableValue, Narration
                        ) VALUES (?, 43, 571, ?, 0, ?, 1, GETDATE(), 0, '')
                        """,
                        tm_serial_float, body.account_id, body.tax_total,
                    )
                    total_credited += body.tax_total

                # Verify GL balance before commit
                assert abs(total_credited - body.bill_amount) < 0.02, (
                    f"GL imbalance: credits={total_credited:.2f} debits={body.bill_amount:.2f}"
                )

                # 5f. Link SaleHeader to this transaction
                bill_ref = f"{vch_id_ymd}/{tm_vch_number}"
                cur.execute(
                    "UPDATE SaleHeader SET BillReference=? WHERE SerialNumber=?",
                    bill_ref, serial_number_float,
                )

                conn.commit()
                log.info(
                    "Sale posted: Serial=%s VchNo=%s BillAmount=%.2f CustomerID=%s GL=%s",
                    serial_number_str, vch_number, body.bill_amount, body.customer_id, tm_serial_str,
                )
                return CreateSaleResponse(
                    serial_number=serial_number_str,
                    vch_number=vch_number,
                    bill_amount=body.bill_amount,
                    gl_serial=tm_serial_str,
                )

            except Exception:
                conn.rollback()
                raise

    except HTTPException:
        raise
    except pyodbc.Error as exc:
        log.error("ERP DB error posting sale: %s", exc)
        raise HTTPException(status_code=500, detail=f"ERP database error: {exc}") from exc
    except Exception as exc:
        log.error("Unexpected error posting sale: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
