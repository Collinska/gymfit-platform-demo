"""Warm, branded 'Gym Wrap' HTML — email-safe (inline styles + tables).

Business name / logo / contact come from platform_settings via get_business_details()."""

from __future__ import annotations

from business_settings import get_business_details

TEAL = "#0d9488"
CORAL = "#f97362"
AMBER = "#f59e0b"
INK = "#1c1c1e"
MUTED = "#8e8e93"


def _kes(n) -> str:
    try:
        return "KES {:,.0f}".format(float(n))
    except (TypeError, ValueError):
        return "KES 0"


def render_wrap_html(w: dict) -> str:
    member = w.get("member", {}) or {}
    chk = w.get("checkins", {}) or {}
    prod = w.get("productivity", {}) or {}
    items = w.get("items")  # None when no purchases
    month_label = w.get("month_label", "")
    first = (member.get("first_name") or "there").strip() or "there"

    biz = get_business_details()
    biz_name = biz["name"] or "Fitness Mania"
    biz_logo = biz.get("logo_url", "")

    total_visits = chk.get("total_visits", 0)
    fav_time = chk.get("favorite_time_block") or "—"
    fav_day = chk.get("favorite_day") or "—"
    streak = chk.get("longest_streak", 0)
    weeks3 = chk.get("weeks_with_3plus", 0)

    # ── vs gym average banner ──
    vs = prod.get("vs_average")
    vs_banner = ""
    if vs and vs.get("more_active_than_pct") is not None:
        vs_banner = f"""
        <tr><td style="padding:0 24px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:{CORAL};border-radius:12px;">
            <tr><td style="padding:14px 18px;color:#ffffff;font-size:15px;font-weight:600;text-align:center;">
              💪 You were more active than {vs['more_active_than_pct']}% of members
            </td></tr>
          </table>
        </td></tr>"""

    # ── vs last month ──
    change = prod.get("change_pct")
    direction = prod.get("direction", "flat")
    vs_last = ""
    if change is not None and prod.get("prev_visits", 0) > 0:
        color = TEAL if direction == "up" else (CORAL if direction == "down" else MUTED)
        arrow = "▲" if direction == "up" else ("▼" if direction == "down" else "•")
        vs_last = f"""
        <tr><td style="padding:2px 24px 8px;text-align:center;">
          <span style="color:{color};font-size:14px;font-weight:600;">
            {arrow} {abs(round(change))}% {'up from' if direction=='up' else ('down from' if direction=='down' else 'vs')} last month
          </span>
        </td></tr>"""

    # ── stat blocks row ──
    stat_cell = (
        'style="width:33.33%;padding:14px 8px;text-align:center;'
        'background:#faf7f5;border-radius:12px;"'
    )
    stat_row = f"""
    <tr><td style="padding:8px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
        <td {stat_cell}>
          <div style="font-size:20px;font-weight:700;color:{INK};">{fav_time}</div>
          <div style="font-size:11px;color:{MUTED};text-transform:uppercase;letter-spacing:.5px;">Favorite time</div>
        </td>
        <td {stat_cell}>
          <div style="font-size:20px;font-weight:700;color:{INK};">{fav_day}</div>
          <div style="font-size:11px;color:{MUTED};text-transform:uppercase;letter-spacing:.5px;">Favorite day</div>
        </td>
        <td {stat_cell}>
          <div style="font-size:20px;font-weight:700;color:{INK};">{streak} <span style="font-size:12px;">days</span></div>
          <div style="font-size:11px;color:{MUTED};text-transform:uppercase;letter-spacing:.5px;">Longest streak</div>
        </td>
      </tr></table>
    </td></tr>"""

    # ── consistency line ──
    consistency = f"""
    <tr><td style="padding:4px 24px 10px;text-align:center;">
      <span style="color:{AMBER};font-size:14px;font-weight:600;">🔥 {weeks3} week{'s' if weeks3 != 1 else ''} with 3+ visits</span>
    </td></tr>"""

    # ── purchases (only if items) ──
    purchases = ""
    if items and items.get("item_count", 0) > 0:
        rows = ""
        for it in items.get("list", []):
            rows += f"""
            <tr>
              <td style="padding:8px 6px;font-size:13px;color:{INK};border-bottom:1px solid #f0ece9;">{it.get('product_name','')}</td>
              <td style="padding:8px 6px;font-size:13px;color:{MUTED};text-align:center;border-bottom:1px solid #f0ece9;">{int(it.get('quantity',0))}</td>
              <td style="padding:8px 6px;font-size:13px;color:{INK};text-align:right;border-bottom:1px solid #f0ece9;">{_kes(it.get('line_total',0))}</td>
            </tr>"""
        purchases = f"""
        <tr><td style="padding:8px 24px 4px;">
          <div style="font-size:15px;font-weight:700;color:{INK};margin:10px 0 6px;">🛍️ Things you grabbed this month</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 6px;font-size:11px;color:{MUTED};text-transform:uppercase;">Item</td>
              <td style="padding:4px 6px;font-size:11px;color:{MUTED};text-transform:uppercase;text-align:center;">Qty</td>
              <td style="padding:4px 6px;font-size:11px;color:{MUTED};text-transform:uppercase;text-align:right;">Amount</td>
            </tr>
            {rows}
            <tr>
              <td colspan="2" style="padding:10px 6px;font-size:14px;font-weight:700;color:{INK};">Total spent</td>
              <td style="padding:10px 6px;font-size:14px;font-weight:700;color:{TEAL};text-align:right;">{_kes(items.get('total_spent',0))}</td>
            </tr>
          </table>
        </td></tr>"""

    contact = member.get("mobile") or biz.get("phone") or biz.get("email") or ""
    contact_line = f'<div style="font-size:12px;color:{MUTED};margin-top:4px;">Questions? Reach us{(" · " + contact) if contact else ""}</div>'

    logo_html = (
        f'<img src="{biz_logo}" alt="{biz_name}" '
        f'style="max-height:44px;max-width:180px;object-fit:contain;margin-bottom:8px;" />'
        if biz_logo else ""
    )

    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#faf7f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f5;padding:20px 0;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0"
         style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">

    <!-- Header band -->
    <tr><td style="background:{TEAL};padding:26px 24px;text-align:center;">
      {logo_html}
      <div style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.5px;opacity:.85;">{biz_name.upper()}</div>
      <div style="color:#ffffff;font-size:24px;font-weight:800;margin-top:4px;">Your {month_label} Gym Wrap 🎉</div>
    </td></tr>

    <!-- Greeting -->
    <tr><td style="padding:20px 24px 6px;text-align:center;">
      <div style="font-size:16px;color:{INK};">Hi {first}! Here's your month in review.</div>
    </td></tr>

    <!-- Hero -->
    <tr><td style="padding:10px 24px 6px;text-align:center;">
      <div style="font-size:60px;font-weight:800;color:{TEAL};line-height:1;">{total_visits}</div>
      <div style="font-size:14px;color:{MUTED};margin-top:4px;">gym visits this month</div>
    </td></tr>

    {vs_last}
    {stat_row}
    {vs_banner}
    {consistency}
    {purchases}

    <!-- Footer -->
    <tr><td style="padding:18px 24px 26px;text-align:center;border-top:1px solid #f0ece9;">
      <div style="font-size:15px;font-weight:700;color:{INK};">Keep it up! 🙌</div>
      <div style="font-size:13px;color:{MUTED};margin-top:2px;">— The {biz_name} Team</div>
      {contact_line}
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>"""
