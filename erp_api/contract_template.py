"""Placeholder membership contract PDF (A4) — pre-filled with member + plan
details and business branding (name/address/PIN/logo) from platform_settings
via business_settings.get_business_details(), the same helper receipts use."""

from __future__ import annotations

import io
import urllib.request
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from business_settings import get_business_details

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
SIGNATURE_BLOCK_H = 45 * mm  # reserved space kept clear at the bottom of a page

TERMS = [
    ("1. MEMBERSHIP TERMS & DURATION", [
        "This membership entitles the Member to access the gym facilities for the duration of the",
        "selected plan stated above. The membership is personal and non-transferable. Access is",
        "subject to the gym's operating hours and any facility-specific rules in force at the time of use.",
    ]),
    ("2. PAYMENT & RENEWAL POLICY", [
        "Membership fees are due in full at the time of enrolment or renewal. Membership lapses",
        "automatically at the end of the paid period unless renewed in advance. No pro-rated refunds",
        "are issued for unused portions of a membership period except where required by law.",
    ]),
    ("3. GYM RULES & CONDUCT", [
        "Members must follow posted gym rules, use equipment safely and as instructed, rerack",
        "weights and wipe down equipment after use, and treat staff and other members with respect.",
        "Management reserves the right to suspend or terminate membership for conduct that",
        "endangers others or breaches these rules.",
    ]),
    ("4. HEALTH & LIABILITY WAIVER", [
        "The Member confirms they are physically fit to participate in gym activities and assumes all",
        "risk of injury arising from their use of the facility and its equipment. The gym, its owners, and",
        "staff are not liable for any injury, loss, or damage except where caused by the gym's proven",
        "gross negligence.",
    ]),
    ("5. CANCELLATION / FREEZE POLICY", [
        "Members may request a temporary freeze of their membership for medical or travel reasons,",
        "subject to management approval and any applicable freeze-day limits. Cancellations must be",
        "requested in writing at the front desk; fees already paid are non-refundable unless otherwise",
        "agreed in writing.",
    ]),
]


def _fetch_logo(logo_url: str):
    """Return a reportlab ImageReader for the business logo, or None."""
    if not logo_url:
        return None
    try:
        with urllib.request.urlopen(logo_url, timeout=10) as resp:
            data = resp.read()
        return ImageReader(io.BytesIO(data))
    except Exception:
        return None


# Contact email shown on printed contracts specifically — intentionally NOT
# biz["email"] (platform_settings.biz_email), which stays whatever the front
# desk has configured elsewhere (Settings, wrap emails, receipts). Change here
# only if the contract's own contact address needs to change.
CONTRACT_CONTACT_EMAIL = "info@fitnessmania.com"


def _draw_header(c: canvas.Canvas, biz: dict) -> float:
    """Logo (if set) + business name/address/contact/PIN. Returns the y cursor
    just below the header rule, ready for the next section."""
    y = PAGE_H - MARGIN
    logo = _fetch_logo(biz.get("logo_url", ""))
    logo_bottom = None

    if logo is not None:
        iw, ih = logo.getSize()
        max_w, max_h = 38 * mm, 16 * mm
        scale = min(max_w / iw, max_h / ih)
        lw, lh = iw * scale, ih * scale
        logo_bottom = y - lh
        c.drawImage(logo, MARGIN, logo_bottom, width=lw, height=lh, mask="auto")
        text_x = MARGIN + lw + 6 * mm
    else:
        text_x = MARGIN

    c.setFont("Helvetica-Bold", 15)
    c.drawString(text_x, y - 6 * mm, biz["name"])

    line_y = y - 11.5 * mm
    c.setFont("Helvetica", 9)
    for line in (biz.get("address_line1"), biz.get("address_line2")):
        if line:
            c.drawString(text_x, line_y, line)
            line_y -= 4.2 * mm

    contact_bits = [b for b in (biz.get("phone"), CONTRACT_CONTACT_EMAIL) if b]
    if contact_bits:
        c.drawString(text_x, line_y, "  ·  ".join(contact_bits))
        line_y -= 4.2 * mm
    if biz.get("pin"):
        c.drawString(text_x, line_y, f"PIN: {biz['pin']}")
        line_y -= 4.2 * mm  # advance past the PIN line too, so the rule below clears it

    # Rule sits a fixed gap below whichever is lower: the last text line drawn,
    # or the logo (a tall/square logo can extend past a short text block).
    lowest = line_y if logo_bottom is None else min(line_y, logo_bottom)
    rule_y = lowest - 3 * mm

    c.setLineWidth(0.6)
    c.line(MARGIN, rule_y, PAGE_W - MARGIN, rule_y)
    return rule_y - 8 * mm


def generate_contract_pdf(member: dict) -> bytes:
    """member: {customer_id, first_name, last_name, mobile, email, plan_name,
    membership_start} — all plain strings (or None), already formatted by the
    caller. Returns the finished PDF as bytes."""
    biz = get_business_details()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    y = _draw_header(c, biz)

    # ── Title ──
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(PAGE_W / 2, y, "MEMBERSHIP AGREEMENT")
    y -= 12 * mm

    # ── Member details ──
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN, y, "MEMBER DETAILS")
    y -= 6 * mm

    def row(label: str, value) -> None:
        nonlocal y
        c.setFont("Helvetica", 10)
        c.drawString(MARGIN, y, f"{label}:")
        c.drawString(MARGIN + 40 * mm, y, str(value) if value not in (None, "") else "—")
        y -= 6 * mm

    full_name = f"{member.get('first_name', '')} {member.get('last_name', '')}".strip()
    row("Member Name", full_name)
    row("Member ID", member.get("customer_id"))
    row("Mobile", member.get("mobile"))
    row("Email", member.get("email"))
    row("Membership Plan", member.get("plan_name"))
    row("Start Date", member.get("membership_start"))
    row("Agreement Date", date.today().strftime("%d %b %Y"))

    y -= 4 * mm
    c.line(MARGIN, y, PAGE_W - MARGIN, y)
    y -= 10 * mm

    # ── Terms sections (page-breaks if a section won't fit) ──
    for heading, lines in TERMS:
        needed = 6 * mm + len(lines) * 4.6 * mm + 4 * mm
        if y - needed < MARGIN + SIGNATURE_BLOCK_H:
            c.showPage()
            y = _draw_header(c, biz)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(MARGIN, y, heading)
        y -= 6 * mm
        c.setFont("Helvetica", 9.2)
        for line in lines:
            c.drawString(MARGIN, y, line)
            y -= 4.6 * mm
        y -= 4 * mm

    # ── Signature block ──
    if y - SIGNATURE_BLOCK_H < MARGIN:
        c.showPage()
        y = _draw_header(c, biz)
    y -= 6 * mm
    c.line(MARGIN, y, PAGE_W - MARGIN, y)
    y -= 12 * mm

    col2 = PAGE_W / 2 + 5 * mm
    c.setFont("Helvetica", 10)
    c.drawString(MARGIN, y, "Member Signature: __________________________")
    c.drawString(col2, y, "Date: ______________")
    y -= 14 * mm
    c.drawString(MARGIN, y, "Gym Representative Signature: ______________")
    c.drawString(col2, y, "Date: ______________")

    c.showPage()
    c.save()
    return buf.getvalue()
