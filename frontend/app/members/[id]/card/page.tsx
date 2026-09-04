"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { MembershipCard, scanValueFor, type CardMember } from "@/components/MembershipCard";
import { Dict, LoadingBlock, fetchJson, statusValue } from "@/components/dashboard/dashboard-widgets";

type MemberDetail = { member: Dict; memberships: Dict[] };

export default function MembershipCardPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const json = await fetchJson<MemberDetail>(`/api/members/${params.id}`);
        if (!cancelled) setDetail(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load member");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const member = detail?.member ?? {};
  const currentMembership = detail?.memberships?.[0] ?? {};

  const cardMember: CardMember = {
    id: member.id as number | string | undefined,
    first_name: member.first_name as string | null,
    last_name: member.last_name as string | null,
    erp_customer_id: member.erp_customer_id as string | null,
    card_id: member.card_id as string | null,
    photo_url: member.photo_url as string | null,
    plan_name: (currentMembership.plan_name as string | null) ?? null,
    membership_end: (currentMembership.membership_end as string | null) ?? null,
    display_status: statusValue(currentMembership),
  };

  const scanValue = scanValueFor(cardMember);

  return (
    <div className="flex min-h-screen bg-[#f2f2f7]">
      {/* Hidden entirely at print time by the CSS below. */}
      <div className="no-print">
        <Sidebar />
      </div>

      <main className="flex-1 p-7 min-w-0">
        <div className="no-print max-w-[900px] mx-auto mb-6">
          <Link href={`/members/${params.id}`} className="text-sm text-slate-400 hover:text-teal-600 transition-colors">
            ← Back to member profile
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Membership Card</h1>
          <p className="text-sm text-slate-500 mt-1">
            Print on card stock, or display this screen at the turnstile scanner for the demo.
          </p>
        </div>

        {loading ? (
          <div className="no-print max-w-[900px] mx-auto">
            <LoadingBlock text="Loading member…" />
          </div>
        ) : null}
        {error ? (
          <div className="no-print max-w-[900px] mx-auto px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        ) : null}

        {detail ? (
          <div className="max-w-[900px] mx-auto flex flex-col items-center">
            {/* Scaled up for on-screen legibility; the card itself stays at true
                85.6mm x 54mm dimensions so print output is exact card size. */}
            <div className="card-preview-scale">
              <MembershipCard member={cardMember} />
            </div>

            <div className="no-print flex flex-col items-center gap-3 mt-10">
              {!scanValue ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
                  This member has no ERP customer ID or card ID on file — the QR/barcode will be blank.
                </p>
              ) : null}
              <div className="flex gap-3">
                <button onClick={() => window.print()} className="ios-btn-primary text-sm px-6">
                  🖨 Print Card
                </button>
                <Link href={`/members/${params.id}`} className="ios-btn-secondary text-sm px-6">
                  Done
                </Link>
              </div>
              <p className="text-xs text-slate-400 max-w-sm text-center leading-relaxed">
                QR and barcode both encode the same identifier ({scanValue || "—"}) that the kiosk scanner
                looks up — either can be scanned interchangeably.
              </p>
            </div>
          </div>
        ) : null}
      </main>

      <style>{`
        .card-preview-scale {
          transform: scale(3.4);
          transform-origin: top center;
          margin-bottom: 8.5rem; /* compensates for the visual space the scale-up consumes */
        }

        @media print {
          .no-print { display: none !important; }

          body * { visibility: hidden; }
          .membership-card, .membership-card * { visibility: visible; }

          .card-preview-scale {
            transform: none;
            margin: 0;
          }

          .membership-card {
            position: absolute;
            top: 0;
            left: 0;
            box-shadow: none !important;
          }

          @page {
            size: 85.6mm 54mm;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
