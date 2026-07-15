"use client";

import { RequireModule } from '@/components/RequireModule';
import Link from "next/link";
import { BarChart3, ClipboardList } from "lucide-react";
import { BackLink } from "@/components/BackLink";

const REPORT_CARDS = [
  {
    href:        "/pos/reports/sales-register",
    icon:        BarChart3,
    title:       "Sales Register",
    description: "Browse and filter invoices by date, product, group, or department. Export to CSV.",
    color:       "text-teal-600",
    bg:          "bg-teal-50",
  },
  {
    href:        "/pos/reports/day-audit",
    icon:        ClipboardList,
    title:       "Day Audit",
    description: "End-of-day reconciliation — deposits by payment method, sales by cashier, and full transaction log.",
    color:       "text-indigo-600",
    bg:          "bg-indigo-50",
  },
];

function ReportsHubPage() {
  return (
    <div className="min-h-screen bg-[#f2f2f7]">
      <div className="bg-white border-b border-[#e5e5ea] px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <BackLink href="/dashboard" label="Back to Dashboard" />
          <h1 className="text-lg font-bold text-[#1c1c1e] mt-2">Reports</h1>
          <p className="text-xs text-slate-400">Sales analytics and daily reconciliation</p>
        </div>
      </div>

      <div className="px-6 py-8 max-w-3xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {REPORT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="bg-white rounded-2xl shadow-sm px-6 py-6 flex flex-col gap-4 hover:shadow-md transition-shadow group"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.bg}`}>
                  <Icon size={22} className={card.color} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-semibold text-[#1c1c1e] group-hover:text-teal-700 transition-colors">{card.title}</p>
                  <p className="text-sm text-slate-400 mt-1 leading-relaxed">{card.description}</p>
                </div>
                <span className={`text-sm font-medium ${card.color}`}>Open →</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ReportsHubPageGuarded() {
  return <RequireModule module="reports"><ReportsHubPage /></RequireModule>;
}
