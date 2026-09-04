"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { formatDate, initials } from "@/components/dashboard/dashboard-widgets";

export type CardMember = {
  id?: number | string | null;
  first_name?: string | null;
  last_name?: string | null;
  erp_customer_id?: string | null;
  card_id?: string | null;
  photo_url?: string | null;
  plan_name?: string | null;
  membership_end?: string | null;
  display_status?: string | null;
};

type Brand = { biz_name: string; biz_logo_url: string };

const STATUS_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
  active:        { label: "Active",  bg: "#e6f7f4", fg: "#0d9488" },
  frozen:        { label: "Frozen",  bg: "#fef3e2", fg: "#b45309" },
  expired:       { label: "Expired", bg: "#fdecec", fg: "#dc2626" },
  no_membership: { label: "No Plan", bg: "#f1f1f3", fg: "#64748b" },
};

/**
 * NOTE on the encoded value: the spec for this card calls it "card_id", but the
 * live kiosk check-in lookup (app/kiosk/page.tsx -> GET /api/members/[id])
 * resolves members by erp_customer_id first (falling back to the internal
 * numeric id) — it never matches on the `card_id` column. The existing
 * check-in QR on the member profile already encodes erp_customer_id for
 * exactly this reason. To satisfy STEP 4 ("the identical identifier your
 * kiosk check-in logic already looks up"), this card encodes the SAME value:
 * erp_customer_id, falling back to card_id / id only if erp_customer_id is
 * unset. See the chat report for the full discrepancy note.
 */
export function scanValueFor(member: CardMember): string {
  return String(member.erp_customer_id ?? member.card_id ?? member.id ?? "");
}

export function MembershipCard({ member }: { member: CardMember }) {
  const [brand, setBrand] = useState<Brand>({ biz_name: "Fitness Mania", biz_logo_url: "" });
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("/api/branding", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setBrand({ biz_name: d.biz_name || "Fitness Mania", biz_logo_url: d.biz_logo_url || "" }))
      .catch(() => {});
  }, []);

  const name = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "Member";
  const scanValue = scanValueFor(member);
  const status = String(member.display_status ?? "no_membership");
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.no_membership;

  useEffect(() => {
    if (!barcodeRef.current || !scanValue) return;
    try {
      JsBarcode(barcodeRef.current, scanValue, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 34, // renders in the SVG's own unit space; scaled to the mm-sized container below
        width: 1.4,
        background: "transparent",
        lineColor: "#1c1c1e",
      });
    } catch {
      // Invalid/empty value for CODE128 — leave the strip blank rather than crash the card.
    }
  }, [scanValue]);

  return (
    <div
      className="membership-card"
      style={{
        width: "85.6mm",
        height: "54mm",
        borderRadius: "3.2mm",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #ffffff 0%, #f0fdfa 55%, #e6f7f4 100%)",
        border: "0.5mm solid #0d9488",
        boxShadow: "0 4px 18px rgba(15, 23, 42, 0.12)",
        fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif",
        padding: "4mm",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Teal accent stripe along the left edge */}
      <div
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: "2mm",
          background: "linear-gradient(180deg, #0d9488, #14b8a6)",
        }}
      />

      {/* ── Top row: logo + photo ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginLeft: "1.5mm" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5mm", minWidth: 0 }}>
          {brand.biz_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.biz_logo_url} alt={brand.biz_name} style={{ height: "7mm", maxWidth: "22mm", objectFit: "contain" }} />
          ) : (
            <div
              style={{
                width: "7mm", height: "7mm", borderRadius: "1.6mm", background: "#0d9488",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <span style={{ color: "#fff", fontSize: "2.6mm", fontWeight: 800 }}>FM</span>
            </div>
          )}
          <span style={{ fontSize: "2.6mm", fontWeight: 700, color: "#0d9488", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {brand.biz_name}
          </span>
        </div>

        {member.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photo_url}
            alt={name}
            style={{ width: "11mm", height: "11mm", borderRadius: "50%", objectFit: "cover", border: "0.4mm solid #ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
          />
        ) : (
          <div
            style={{
              width: "11mm", height: "11mm", borderRadius: "50%", background: "#0d9488",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "0.4mm solid #ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            <span style={{ color: "#fff", fontSize: "3.4mm", fontWeight: 700 }}>{initials(name)}</span>
          </div>
        )}
      </div>

      {/* ── Name + ID + plan ── */}
      <div style={{ marginLeft: "1.5mm", marginTop: "2.5mm", minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "4mm", fontWeight: 800, color: "#1c1c1e", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </p>
        <p style={{ margin: "0.6mm 0 0", fontSize: "2.4mm", fontFamily: "Courier New, monospace", color: "#64748b", letterSpacing: "0.03em" }}>
          ID: {member.erp_customer_id ?? "—"}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginTop: "2mm" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "2.9mm", fontWeight: 700, color: "#0d9488", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "34mm" }}>
              {member.plan_name || "No active plan"}
            </p>
            <p style={{ margin: "0.4mm 0 0", fontSize: "2.2mm", color: "#94a3b8" }}>
              {member.membership_end ? `Expires ${formatDate(member.membership_end)}` : "No expiry on file"}
            </p>
          </div>
          <span
            style={{
              fontSize: "2.2mm", fontWeight: 700, padding: "0.8mm 2mm", borderRadius: "10mm",
              background: statusStyle.bg, color: statusStyle.fg, whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {statusStyle.label}
          </span>
        </div>
      </div>

      {/* ── Bottom row: barcode strip (left) + QR (bottom-right) ── */}
      <div style={{ marginTop: "auto", marginLeft: "1.5mm", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "2mm" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {scanValue ? (
            <svg ref={barcodeRef} style={{ width: "100%", height: "9mm", display: "block" }} />
          ) : null}
          <p style={{ margin: "0.3mm 0 0", fontSize: "1.9mm", fontFamily: "Courier New, monospace", color: "#94a3b8", letterSpacing: "0.04em" }}>
            {scanValue || "—"}
          </p>
        </div>

        {scanValue ? (
          <div style={{ background: "#ffffff", padding: "1mm", borderRadius: "1.2mm", border: "0.2mm solid #e5e5ea", flexShrink: 0 }}>
            <QRCodeSVG value={scanValue} size={300} level="M" style={{ width: "28mm", height: "28mm", display: "block" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
