"""POST /erp/print/sale-receipt and /erp/print/deposit-receipt — ESC/POS thermal + ReportLab PDF.
Business details (name/address/PIN/paybill/till) come from platform_settings; the PDF also
renders the logo at the top. Thermal stays text-only per requirements."""

from __future__ import annotations

import io
import logging
import subprocess
import traceback
import urllib.request
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from business_settings import get_business_details

log = logging.getLogger("erp_api.print_receipt")
router = APIRouter(prefix="/erp/print", tags=["print"])

RECEIPTS_DIR = Path(r"C:\Users\HP\Documents\New project\gymfit-platform\receipts")
RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)

RECEIPT_WIDTH = 226.77  # 80 mm in points


# ── Shared header/footer (text lines from business settings) ────────────────────

def _center(s: str, w: int = 32) -> str:
    return s[:w].center(w)


def _divider(w: int = 32) -> str:
    return "-" * w


def _header_lines(biz: dict, title: str) -> list[str]:
    lines = [_center(biz["name"])]
    if biz["address_line1"]:
        lines.append(_center(biz["address_line1"]))
    if biz["address_line2"]:
        lines.append(_center(biz["address_line2"]))
    if biz["phone"]:
        for part in [p.strip() for p in biz["phone"].split(",") if p.strip()]:
            lines.append(_center(part))
    if biz["pin"]:
        lines.append(_center(f"PIN: {biz['pin']}"))
    lines += [
        _divider(),
        _center(title),
        _center(datetime.now().strftime("%d-%b-%Y  %H:%M")),
        _divider(),
    ]
    return lines


def _footer_lines(biz: dict) -> list[str]:
    lines = [_divider()]
    if biz["paybill"]:
        lines.append(_center(f"PayBill No: {biz['paybill']}"))
    if biz["paybill_account"]:
        lines.append(_center(f"A/c No: {biz['paybill_account']}"))
    if biz["till"]:
        lines.append(_center(f"Lipa Na Mpesa Till: {biz['till']}"))
    if biz["business_no"] or biz["business_account"]:
        lines.append(_center(f"Business No: {biz['business_no']}  A/c: {biz['business_account']}"))
    lines.append(_divider())
    return lines


# ── PDF line builders ───────────────────────────────────────────────────────────

def _build_pdf_lines_sale(body, biz: dict) -> list[str]:
    lines = _header_lines(biz, "SALE RECEIPT")
    lines += [
        f"Receipt : {body.serial_number}",
        f"No      : {'TEMP' if body.vch_number == 0 else body.vch_number}",
        f"Member  : {body.customer_name}",
        f"ID      : {body.customer_id}",
    ]
    if body.member_phone:
        lines.append(f"Phone   : {body.member_phone}")
    if body.member_email:
        lines.append(f"Email   : {body.member_email}")
    lines.append(_divider())

    for item in body.items:
        name  = str(item.get("display_name", ""))[:22]
        qty   = item.get("quantity", 1)
        total = float(item.get("line_total", 0))
        lines.append(name)
        lines.append(f"  {qty} x           KES {total:>10.2f}")

    lines.append(_divider())
    if body.tax_total:
        lines.append(f"{'Subtotal':20s} KES {body.subtotal:>10.2f}")
        lines.append(f"{'Tax':20s} KES {body.tax_total:>10.2f}")
        lines.append(_divider())

    lines.append(f"{'TOTAL':20s} KES {body.bill_amount:>10.2f}")
    lines.append(_divider())
    lines.append("Payment : Credit Sale (GL Account)")
    lines += _footer_lines(biz)
    return lines


def _build_pdf_lines_deposit(body, biz: dict) -> list[str]:
    lines = _header_lines(biz, "DEPOSIT RECEIPT")
    lines += [
        f"Receipt : {body.serial_number}",
        f"No      : {'TEMP' if body.vch_number == 0 else body.vch_number}",
        f"Member  : {body.customer_name}",
        _divider(),
        f"{'AMOUNT':20s} KES {body.amount:>10.2f}",
        f"Method  : {body.payment_method.upper()}",
    ]
    if body.narration:
        lines.append(f"Ref     : {body.narration[:28]}")
    lines += _footer_lines(biz)
    return lines


def _fetch_logo(logo_url: str):
    """Return a reportlab ImageReader for the logo URL, or None."""
    if not logo_url:
        return None
    try:
        from reportlab.lib.utils import ImageReader
        with urllib.request.urlopen(logo_url, timeout=10) as resp:
            data = resp.read()
        return ImageReader(io.BytesIO(data))
    except Exception as exc:
        log.warning("Could not load receipt logo: %s", exc)
        return None


def generate_pdf_receipt(lines: list[str], filename_stem: str, biz: dict) -> str:
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm

    FONT      = "Courier"
    FONT_BOLD = "Courier-Bold"
    FONT_SIZE = 8
    LINE_H    = FONT_SIZE * 1.4
    MARGIN    = 4 * mm
    WIDTH     = 80 * mm

    # Logo (PDF only) — sized to fit width, capped height.
    logo = _fetch_logo(biz.get("logo_url", ""))
    logo_h = 0.0
    logo_w = 0.0
    if logo is not None:
        iw, ih = logo.getSize()
        max_w = WIDTH - 2 * MARGIN
        max_h = 22 * mm
        scale = min(max_w / iw, max_h / ih)
        logo_w, logo_h = iw * scale, ih * scale

    top_pad = (logo_h + 6) if logo is not None else 0
    height = LINE_H * len(lines) + MARGIN * 2 + 10 + top_pad

    output_path = str(RECEIPTS_DIR / f"{filename_stem}.pdf")
    c = canvas.Canvas(output_path, pagesize=(WIDTH, height))

    y = height - MARGIN
    if logo is not None:
        c.drawImage(logo, (WIDTH - logo_w) / 2, y - logo_h, width=logo_w, height=logo_h, mask="auto")
        y -= (logo_h + 6)

    y -= FONT_SIZE
    for line in lines:
        stripped = line.strip()
        if stripped == biz["name"] or stripped.startswith("TOTAL"):
            c.setFont(FONT_BOLD, FONT_SIZE)
        else:
            c.setFont(FONT, FONT_SIZE)
        c.drawString(MARGIN, y, line)
        y -= LINE_H

    c.save()
    return output_path


def _open_pdf(path: str):
    subprocess.Popen(["cmd", "/c", "start", "", path])


# ── Thermal helpers (text-only, no logo) ────────────────────────────────────────

def get_thermal_printer():
    from escpos.printer import Win32Raw
    return Win32Raw("80mm Series Printer")


def _header(p, title: str, biz: dict):
    p.set(align="center", bold=True, width=2, height=2)
    p.text(biz["name"] + "\n")
    p.set(align="center", bold=False, width=1, height=1)
    if biz["address_line1"]:
        p.text(biz["address_line1"] + "\n")
    if biz["address_line2"]:
        p.text(biz["address_line2"] + "\n")
    if biz["phone"]:
        p.text(biz["phone"] + "\n")
    if biz["pin"]:
        p.text(f"PIN: {biz['pin']}\n")
    p.text("-" * 32 + "\n")
    p.set(align="center", bold=True)
    p.text(f"{title}\n")
    p.set(bold=False)
    p.text(datetime.now().strftime("%d-%b-%Y  %H:%M") + "\n")
    p.text("-" * 32 + "\n")


def _footer(p, biz: dict):
    p.set(align="center", bold=False)
    p.text("-" * 32 + "\n")
    if biz["paybill"]:
        p.text(f"PayBill No: {biz['paybill']}\n")
    if biz["paybill_account"]:
        p.text(f"A/c No: {biz['paybill_account']}\n")
    if biz["till"]:
        p.text(f"Lipa Na Mpesa Till: {biz['till']}\n")
    if biz["business_no"] or biz["business_account"]:
        p.text(f"Business No: {biz['business_no']}  A/c: {biz['business_account']}\n")
    p.text("-" * 32 + "\n")


def _cut(p):
    p.ln(3)
    p.cut()


# ── Sale Receipt ──────────────────────────────────────────────────────────────

class SaleReceiptRequest(BaseModel):
    serial_number: str   = "TEMP"
    vch_number:    int   = 0
    bill_amount:   float
    customer_name: str
    customer_id:   str
    member_phone:  str   = ""
    member_email:  str   = ""
    items: list[dict]
    subtotal:      float = 0.0
    tax_total:     float = 0.0
    printer:       str   = "thermal"


@router.post("/sale-receipt")
def print_sale_receipt(body: SaleReceiptRequest):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    vchr = body.serial_number if body.vch_number == 0 else body.vch_number
    biz = get_business_details()

    if body.printer in ("pdf", "pdfcreator"):
        try:
            lines = _build_pdf_lines_sale(body, biz)
            path  = generate_pdf_receipt(lines, f"sale_{vchr}_{ts}", biz)
            _open_pdf(path)
            log.info("Sale PDF generated: %s", path)
            return {"printed": True, "serial_number": body.serial_number, "pdf_path": path}
        except Exception as exc:
            print("PDF GENERATION ERROR (sale):\n", traceback.format_exc(), flush=True)
            log.error("PDF generation error (sale): %s", exc)
            return JSONResponse({"printed": False, "error": str(exc)})

    try:
        p = get_thermal_printer()
    except Exception as exc:
        print("PRINTER OPEN ERROR (thermal):\n", traceback.format_exc(), flush=True)
        return JSONResponse({"printed": False, "error": f"Thermal printer not found: {exc}"})

    try:
        _header(p, "SALE RECEIPT", biz)

        vchr_label = "TEMP" if body.vch_number == 0 else str(body.vch_number)
        p.set(align="left")
        p.text(f"Receipt : {body.serial_number}\n")
        p.text(f"No      : {vchr_label}\n")
        p.text(f"Member  : {body.customer_name}\n")
        p.text(f"ID      : {body.customer_id}\n")
        if body.member_phone:
            p.text(f"Phone   : {body.member_phone}\n")
        if body.member_email:
            p.text(f"Email   : {body.member_email}\n")
        p.text("-" * 32 + "\n")

        for item in body.items:
            name  = str(item.get("display_name", ""))[:22]
            qty   = item.get("quantity", 1)
            total = float(item.get("line_total", 0))
            p.text(f"{name}\n")
            p.text(f"  {qty} x           KES {total:>10.2f}\n")

        p.text("-" * 32 + "\n")
        if body.tax_total:
            p.text(f"{'Subtotal':20s} KES {body.subtotal:>10.2f}\n")
            p.text(f"{'Tax':20s} KES {body.tax_total:>10.2f}\n")
            p.text("-" * 32 + "\n")

        p.set(bold=True)
        p.text(f"{'TOTAL':20s} KES {body.bill_amount:>10.2f}\n")
        p.set(bold=False)
        p.text("-" * 32 + "\n")
        p.text("Payment : Credit Sale (GL Account)\n")

        _footer(p, biz)
        _cut(p)
        log.info("Sale receipt printed on thermal: %s", body.serial_number)
        return {"printed": True, "serial_number": body.serial_number, "printer": "80mm Series Printer"}

    except Exception as exc:
        print("PRINT ERROR (sale thermal):\n", traceback.format_exc(), flush=True)
        log.error("Print error (sale thermal): %s", exc)
        return JSONResponse({"printed": False, "error": str(exc)})


# ── Deposit Receipt ───────────────────────────────────────────────────────────

class DepositReceiptRequest(BaseModel):
    serial_number:  str   = "TEMP"
    vch_number:     int   = 0
    amount:         float
    customer_name:  str
    payment_method: str   = "cash"
    narration:      str   = ""
    printer:        str   = "thermal"


@router.post("/deposit-receipt")
def print_deposit_receipt(body: DepositReceiptRequest):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    vchr = body.serial_number if body.vch_number == 0 else body.vch_number
    biz = get_business_details()

    if body.printer in ("pdf", "pdfcreator"):
        try:
            lines = _build_pdf_lines_deposit(body, biz)
            path  = generate_pdf_receipt(lines, f"deposit_{vchr}_{ts}", biz)
            _open_pdf(path)
            log.info("Deposit PDF generated: %s", path)
            return {"printed": True, "serial_number": body.serial_number, "pdf_path": path}
        except Exception as exc:
            print("PDF GENERATION ERROR (deposit):\n", traceback.format_exc(), flush=True)
            log.error("PDF generation error (deposit): %s", exc)
            return JSONResponse({"printed": False, "error": str(exc)})

    try:
        p = get_thermal_printer()
    except Exception as exc:
        print("PRINTER OPEN ERROR (thermal):\n", traceback.format_exc(), flush=True)
        return JSONResponse({"printed": False, "error": f"Thermal printer not found: {exc}"})

    try:
        _header(p, "DEPOSIT RECEIPT", biz)

        vchr_label = "TEMP" if body.vch_number == 0 else str(body.vch_number)
        p.set(align="left")
        p.text(f"Receipt : {body.serial_number}\n")
        p.text(f"No      : {vchr_label}\n")
        p.text(f"Member  : {body.customer_name}\n")
        p.text("-" * 32 + "\n")

        p.set(bold=True)
        p.text(f"{'AMOUNT':20s} KES {body.amount:>10.2f}\n")
        p.set(bold=False)
        p.text(f"Method  : {body.payment_method.upper()}\n")

        if body.narration:
            p.text(f"Ref     : {body.narration[:28]}\n")

        _footer(p, biz)
        _cut(p)
        log.info("Deposit receipt printed on thermal: %s", body.serial_number)
        return {"printed": True, "serial_number": body.serial_number, "printer": "80mm Series Printer"}

    except Exception as exc:
        print("PRINT ERROR (deposit thermal):\n", traceback.format_exc(), flush=True)
        log.error("Print error (deposit thermal): %s", exc)
        return JSONResponse({"printed": False, "error": str(exc)})
