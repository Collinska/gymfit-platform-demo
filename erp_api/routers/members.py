"""POST /erp/members — create a new customer in the ERP (accountmaster + CustomerMaster)."""

from __future__ import annotations

import logging

import pyodbc
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import erp_conn
import demo_mode

log = logging.getLogger("erp_api.members")
router = APIRouter(prefix="/erp/members", tags=["members"])


class CreateMemberRequest(BaseModel):
    first_name: str
    last_name:  str
    mobile:     str = ""
    email:      str = ""
    card_id:    str = ""
    is_active:  bool = True


class CreateMemberResponse(BaseModel):
    customer_id: str
    account_id:  int
    ml_number:   int


@router.post("", response_model=CreateMemberResponse, status_code=201)
def create_member(body: CreateMemberRequest) -> CreateMemberResponse:
    if not body.first_name.strip():
        raise HTTPException(status_code=400, detail="first_name is required")

    if demo_mode.DEMO_MODE:
        result = demo_mode.create_member(
            body.first_name.strip(), body.last_name.strip(), body.mobile, body.email,
        )
        return CreateMemberResponse(**result)

    full_name = f"{body.first_name.strip()} {body.last_name.strip()}".strip()

    try:
        with erp_conn() as conn:
            cur = conn.cursor()
            try:
                # ── STEP 1 — Increment and fetch MLNumber ──────────────────────────
                cur.execute("UPDATE Server SET RunningMasterNumber = RunningMasterNumber + 1")
                cur.execute("SELECT RunningMasterNumber FROM Server")
                row = cur.fetchone()
                if row is None:
                    raise RuntimeError("Server table returned no rows")
                ml_number: int = int(row[0])

                # ── STEP 2 — Insert accountmaster ──────────────────────────────────
                # Column names match actual schema (SQL Server is case-insensitive).
                # Only columns we know about are set; the rest use DB defaults.
                cur.execute(
                    """
                    INSERT INTO accountmaster (
                        AccountName, GroupID, CostCenter, BillWiseDetail,
                        CreditLimit, PriceListID, VATClassID,
                        IntRate, IntRatePer,
                        CityID, StateID, CountryID, StreetID, LocalityID,
                        EMail, TeamID, TeamIDReport,
                        UseInPayroll,
                        LogUser, LogLocation, LogSession,
                        MLNumber,
                        DebitAmount, CreditAmount,
                        IsFixed, IsActive,
                        Phone, Website, Remarks, ContactPerson, ContactPersonMobile,
                        CSTNo, VATNo, PANNo, ServiceTaxNo, Pincode, AccountCode,
                        Address1, Address2, Address3, GSTINNo,
                        AMField1, AMField2, AMField3, AMField4, AMField5,
                        AMField6, AMField7, AMField8, AMField9, AMField10,
                        Link, CreditDays
                    ) VALUES (
                        ?, 8, 0, 1,
                        1.00, 1, 1,
                        0.00, 356,
                        1, 1, 1, 1, 1,
                        ?, '', '',
                        0,
                        1, 1, '0001CR',
                        ?,
                        0, 0,
                        0, 1,
                        '', '', '', '', '',
                        '', '', '', '', '', '',
                        '', '', '', '',
                        '', '', '', '', '',
                        '', '', '', '', '',
                        '', 0
                    )
                    """,
                    full_name, body.email, ml_number,
                )

                # SCOPE_IDENTITY() is the safest way; fall back to MAX if NULL
                cur.execute("SELECT SCOPE_IDENTITY()")
                row = cur.fetchone()
                if row and row[0] is not None:
                    account_id = int(row[0])
                else:
                    cur.execute("SELECT MAX(AccountID) FROM accountmaster")
                    row = cur.fetchone()
                    account_id = int(row[0]) if row and row[0] is not None else 0

                log.info("accountmaster inserted: AccountID=%s MLNumber=%s", account_id, ml_number)

                # ── STEP 3 — Determine next CustomerID (numeric IDs only) ──────────
                # Filter to purely numeric IDs before casting (TRY_CAST unavailable on SQL 2008).
                cur.execute(
                    """
                    SELECT ISNULL(MAX(CAST(CustomerID AS INT)), 0)
                      FROM CustomerMaster
                     WHERE CustomerID NOT LIKE '%[^0-9]%'
                    """
                )
                row = cur.fetchone()
                next_int = int(row[0]) + 1 if row else 1
                customer_id = str(next_int).zfill(5)

                # CardID has a UNIQUE index (IX_CustomerMaster); an empty value
                # collides once any blank-card row exists. Follow the ERP's own
                # convention of CardID == CustomerID when no physical card is given.
                card_id_value = (body.card_id or "").strip() or customer_id

                # ── STEP 4 — Insert CustomerMaster ────────────────────────────────
                cur.execute(
                    """
                    INSERT INTO CustomerMaster (
                        CustomerID, SalutationID, FirstName, LastName,
                        CompanyName, CardID,
                        CustomerTypeID, CardTypeID, AllowCreditSale,
                        AccountID, PriceListId, LocationIDMain,
                        CardIssueDate, CardExpiryDate,
                        IsActive, IsFixed, Status, Block,
                        CardAssign, CardSerial, CardLocationID,
                        OpeningPoint, EarnedPoint, RedeemedPoint,
                        Limit, Spent, Deposit,
                        Phone, Mobile, Fax, Email, WebSite,
                        Address1, Address2, Address3,
                        CityID, StateID, Pincode, CountryId,
                        Address1A, Address2A, Address3A,
                        CityIDA, StateIDA, PincodeA, CountryIdA,
                        PhoneA, MobileA, FaxA, EmailA, WebSiteA,
                        LocalityID, LocalityIDA,
                        StreetNumber, StreetNumberA, StreetID, StreetIDA,
                        LocationID, LocationIDAlternate,
                        TeamID, SendEmail, SendSMS,
                        Nationality, Gender, BillingAddress, CircularAddress,
                        DeliveryType, BusinessType,
                        SpouseName, POSRemarks, Remarks, Picture1, Picture2,
                        Password, FingerScan, Link,
                        LogUser, LogLocation, LogSession,
                        MLNumber,
                        CMField1, CMField2, CMField3, CMField4, CMField5,
                        CMField6, CMField7, CMField8, CMField9, CMField10,
                        GSTINNo, ReferralPointAwarded, VisitCount,
                        BirthDate, AnniversaryDate
                    ) VALUES (
                        -- CustomerID, SalutationID=1 (FK to FormatMaster), FirstName, LastName
                        ?, 1, ?, ?,
                        -- CompanyName='', CardID
                        '', ?,
                        -- CustomerTypeID, CardTypeID, AllowCreditSale
                        1, 1, 1,
                        -- AccountID, PriceListId, LocationIDMain
                        ?, 1, 1,
                        -- CardIssueDate, CardExpiryDate
                        GETDATE(), DATEADD(year, 20, GETDATE()),
                        -- IsActive, IsFixed, Status, Block
                        1, 0, 0, 0,
                        -- CardAssign, CardSerial, CardLocationID
                        0, 0, 1,
                        -- OpeningPoint, EarnedPoint, RedeemedPoint
                        0, 0, 0,
                        -- Limit, Spent, Deposit
                        0, 0, 0,
                        -- Phone, Mobile, Fax, Email, WebSite
                        '', ?, '', ?, '',
                        -- Address1, Address2, Address3
                        '', '', '',
                        -- CityID, StateID, Pincode, CountryId
                        1, 1, '', 1,
                        -- Address1A, Address2A, Address3A
                        '', '', '',
                        -- CityIDA, StateIDA, PincodeA, CountryIdA
                        1, 1, '', 1,
                        -- PhoneA, MobileA, FaxA, EmailA, WebSiteA
                        '', '', '', '', '',
                        -- LocalityID, LocalityIDA
                        1, 1,
                        -- StreetNumber, StreetNumberA, StreetID, StreetIDA
                        '', '', 1, 1,
                        -- LocationID, LocationIDAlternate
                        1, 1,
                        -- TeamID='', SendEmail, SendSMS
                        '', 0, 0,
                        -- Nationality, Gender, BillingAddress, CircularAddress
                        0, 446, 648, 650,
                        -- DeliveryType, BusinessType
                        648, 848,
                        -- SpouseName, POSRemarks, Remarks, Picture1, Picture2
                        '', '', '', '', '',
                        -- Password, FingerScan, Link
                        '', '', '',
                        -- LogUser, LogLocation, LogSession
                        1, 1, '0001CR',
                        -- MLNumber
                        ?,
                        -- CMField1-10
                        '', '', '', '', '',
                        '', '', '', '', '',
                        -- GSTINNo, ReferralPointAwarded, VisitCount
                        '', 0, 0,
                        -- BirthDate, AnniversaryDate
                        GETDATE(), GETDATE()
                    )
                    """,
                    customer_id,
                    body.first_name.strip(), body.last_name.strip(),
                    card_id_value,
                    account_id,
                    body.mobile, body.email,
                    ml_number,
                )

                conn.commit()
                log.info(
                    "ERP member created: CustomerID=%s AccountID=%s MLNumber=%s",
                    customer_id, account_id, ml_number,
                )
                return CreateMemberResponse(
                    customer_id=customer_id,
                    account_id=account_id,
                    ml_number=ml_number,
                )

            except Exception:
                conn.rollback()
                raise

    except HTTPException:
        raise
    except pyodbc.Error as exc:
        log.error("ERP DB error creating member: %s", exc)
        raise HTTPException(status_code=500, detail=f"ERP database error: {exc}") from exc
    except Exception as exc:
        log.error("Unexpected error creating member: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
