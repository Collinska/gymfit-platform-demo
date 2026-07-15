"use client";

import { useEffect, useRef, useState } from "react";
import { BackLink } from "@/components/BackLink";

// ── helpers ────────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── types ──────────────────────────────────────────────────────────────────────

type InvoiceRow = {
  serial_number: string;
  voucher_date:  string;
  invoice_no:    string;
  customer_id:   string;
  customer_name: string;
  mobile:        string;
  bill_amount:   number;
  sub_total:     number;
  tax_total:     number;
  net_amount:    number;
  location_id:   number;
  user_name:     string;
};

type InvoiceSummary = {
  total_sales:  number;
  total_amount: number;
  total_tax:    number;
  total_net:    number;
};

type ProductRow = {
  product_id:          string;
  product_name:        string;
  product_group_id:    number;
  product_group_name:  string;
  department_id:       number;
  department_name:     string;
  total_qty:           number;
  total_amount:        number;
  total_tax:           number;
  total_net:           number;
  invoice_count:       number;
};

type ProductSummary = {
  total_qty:    number;
  total_amount: number;
  total_tax:    number;
  total_net:    number;
};

type FilterOption = { id: number; name: string };
type GroupBy = "product" | "group" | "department";

// ── shared filter bar ──────────────────────────────────────────────────────────

function FilterBar({
  dateFrom, dateTo,
  onDateFrom, onDateTo,
  onSearch, onExport,
  loading,
  children,
}: {
  dateFrom:   string;
  dateTo:     string;
  onDateFrom: (v: string) => void;
  onDateTo:   (v: string) => void;
  onSearch:   () => void;
  onExport:   () => void;
  loading:    boolean;
  children?:  React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-3 mb-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-400">Date From</label>
        <input
          type="date" value={dateFrom}
          onChange={(e) => onDateFrom(e.target.value)}
          className="h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-400">Date To</label>
        <input
          type="date" value={dateTo}
          onChange={(e) => onDateTo(e.target.value)}
          className="h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>
      {children}
      <div className="flex gap-2 ml-auto">
        <button
          onClick={onSearch} disabled={loading}
          className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading…" : "Search"}
        </button>
        <button
          onClick={onExport}
          className="h-9 px-4 rounded-xl border border-[#e5e5ea] bg-white hover:bg-[#f2f2f7] text-sm font-medium text-[#1c1c1e] transition-colors"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}

// ── By Invoice tab ─────────────────────────────────────────────────────────────

function InvoiceTab() {
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo,   setDateTo]   = useState(today());
  const [rows,     setRows]     = useState<InvoiceRow[]>([]);
  const [summary,  setSummary]  = useState<InvoiceSummary | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const searchedRef = useRef(false);

  async function fetchData() {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const res = await fetch(`/api/reports/sales-by-invoice?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setRows(d.invoices ?? []);
      setSummary(d.summary ?? null);
      searchedRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    const header = ["Date", "Invoice No", "Customer ID", "Customer", "Mobile", "User", "Net", "Tax", "Total"];
    const dataRows = rows.map((r) => [
      r.voucher_date.slice(0, 16),
      r.invoice_no, r.customer_id, r.customer_name, r.mobile, r.user_name,
      String(r.net_amount), String(r.tax_total), String(r.bill_amount),
    ]);
    downloadCSV([header, ...dataRows], `sales_by_invoice_${dateFrom}_${dateTo}.csv`);
  }

  return (
    <div>
      <FilterBar
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFrom={setDateFrom} onDateTo={setDateTo}
        onSearch={fetchData} onExport={exportCSV} loading={loading}
      />

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-2xl mb-4">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {!searchedRef.current && !loading ? (
          <p className="text-sm text-slate-400 text-center py-10">Select a date range and click Search</p>
        ) : rows.length === 0 && !loading ? (
          <p className="text-sm text-slate-400 text-center py-10">No sales found for this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f2f2f7] text-left">
                  {["Date", "Invoice No", "Customer", "Mobile", "User"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                  {["Net", "Tax", "Total"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f2f7]">
                {rows.map((r) => (
                  <tr key={r.serial_number} className="hover:bg-[#f9f9fb] transition-colors">
                    <td className="px-4 py-3 text-[#1c1c1e] whitespace-nowrap">{r.voucher_date.slice(0, 10)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.invoice_no}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1c1c1e]">{r.customer_name}</p>
                      <p className="text-xs text-slate-400">{r.customer_id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.mobile || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.user_name}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmt(r.net_amount)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmt(r.tax_total)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1c1c1e]">{fmt(r.bill_amount)}</td>
                  </tr>
                ))}
              </tbody>
              {summary && (
                <tfoot>
                  <tr className="border-t-2 border-[#e5e5ea] bg-[#f9f9fb]">
                    <td colSpan={5} className="px-4 py-3 text-sm font-bold text-[#1c1c1e]">
                      {summary.total_sales} invoice{summary.total_sales !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_net)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_tax)}</td>
                    <td className="px-4 py-3 text-right font-bold text-teal-700">KES {fmt(summary.total_amount)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── By Product tab ─────────────────────────────────────────────────────────────

type GroupRow = { name: string; qty: number; amount: number; tax: number; net: number; deptName?: string };
type DeptRow  = { name: string; qty: number; amount: number; tax: number; net: number };

function ProductTab({ groups, departments }: { groups: FilterOption[]; departments: FilterOption[] }) {
  const [dateFrom,  setDateFrom]  = useState(today());
  const [dateTo,    setDateTo]    = useState(today());
  const [groupId,   setGroupId]   = useState("");
  const [deptId,    setDeptId]    = useState("");
  const [groupBy,   setGroupBy]   = useState<GroupBy>("product");
  const [rows,      setRows]      = useState<ProductRow[]>([]);
  const [summary,   setSummary]   = useState<ProductSummary | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const searchedRef = useRef(false);

  async function fetchData() {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (groupId) qs.set("group_id", groupId);
      if (deptId)  qs.set("department_id", deptId);
      const res = await fetch(`/api/reports/sales-by-product?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setRows(d.products ?? []);
      setSummary(d.summary ?? null);
      searchedRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const groupedByGroup: GroupRow[] = Object.values(
    rows.reduce<Record<string, GroupRow>>((acc, r) => {
      const k = r.product_group_name;
      if (!acc[k]) acc[k] = { name: k, deptName: r.department_name, qty: 0, amount: 0, tax: 0, net: 0 };
      acc[k].qty    += r.total_qty;
      acc[k].amount += r.total_amount;
      acc[k].tax    += r.total_tax;
      acc[k].net    += r.total_net;
      return acc;
    }, {}),
  ).sort((a, b) => b.amount - a.amount);

  const groupedByDept: DeptRow[] = Object.values(
    rows.reduce<Record<string, DeptRow>>((acc, r) => {
      const k = r.department_name;
      if (!acc[k]) acc[k] = { name: k, qty: 0, amount: 0, tax: 0, net: 0 };
      acc[k].qty    += r.total_qty;
      acc[k].amount += r.total_amount;
      acc[k].tax    += r.total_tax;
      acc[k].net    += r.total_net;
      return acc;
    }, {}),
  ).sort((a, b) => b.amount - a.amount);

  function exportCSV() {
    let header: string[];
    let dataRows: string[][];
    if (groupBy === "product") {
      header = ["Product ID", "Product", "Group", "Department", "Qty", "Net", "Tax", "Total", "Invoices"];
      dataRows = rows.map((r) => [
        r.product_id, r.product_name, r.product_group_name, r.department_name,
        String(r.total_qty), String(r.total_net), String(r.total_tax), String(r.total_amount),
        String(r.invoice_count),
      ]);
    } else if (groupBy === "group") {
      header = ["Product Group", "Department", "Qty", "Net", "Tax", "Total"];
      dataRows = groupedByGroup.map((r) => [r.name, r.deptName ?? "", String(r.qty), String(r.net), String(r.tax), String(r.amount)]);
    } else {
      header = ["Department", "Qty", "Net", "Tax", "Total"];
      dataRows = groupedByDept.map((r) => [r.name, String(r.qty), String(r.net), String(r.tax), String(r.amount)]);
    }
    downloadCSV([header, ...dataRows], `sales_by_product_${dateFrom}_${dateTo}.csv`);
  }

  const totalRows = groupBy === "product" ? rows.length : groupBy === "group" ? groupedByGroup.length : groupedByDept.length;

  return (
    <div>
      <FilterBar
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFrom={setDateFrom} onDateTo={setDateTo}
        onSearch={fetchData} onExport={exportCSV} loading={loading}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Product Group</label>
          <select
            value={groupId} onChange={(e) => setGroupId(e.target.value)}
            className="h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            <option value="">All Groups</option>
            {groups.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Department</label>
          <select
            value={deptId} onChange={(e) => setDeptId(e.target.value)}
            className="h-9 px-3 rounded-xl border border-[#e5e5ea] text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Group By</label>
          <div className="flex h-9 bg-[#f2f2f7] rounded-xl p-0.5 gap-0.5">
            {(["product", "group", "department"] as GroupBy[]).map((opt) => (
              <button
                key={opt} onClick={() => setGroupBy(opt)}
                className={`flex-1 px-3 rounded-[9px] text-xs font-medium capitalize transition-all ${
                  groupBy === opt ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-[#1c1c1e]"
                }`}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </FilterBar>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-2xl mb-4">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {!searchedRef.current && !loading ? (
          <p className="text-sm text-slate-400 text-center py-10">Select a date range and click Search</p>
        ) : rows.length === 0 && !loading ? (
          <p className="text-sm text-slate-400 text-center py-10">No sales found for this period</p>
        ) : (
          <div className="overflow-x-auto">

            {groupBy === "product" && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f2f2f7] text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Product</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Group</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Department</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Qty</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Net</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Tax</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Inv</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f2f7]">
                  {rows.map((r) => (
                    <tr key={r.product_id} className="hover:bg-[#f9f9fb] transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#1c1c1e]">{r.product_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{r.product_id}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{r.product_group_name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{r.department_name}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(r.total_qty)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(r.total_net)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(r.total_tax)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1c1c1e]">{fmt(r.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{r.invoice_count}</td>
                    </tr>
                  ))}
                </tbody>
                {summary && (
                  <tfoot>
                    <tr className="border-t-2 border-[#e5e5ea] bg-[#f9f9fb]">
                      <td colSpan={3} className="px-4 py-3 text-sm font-bold text-[#1c1c1e]">
                        {totalRows} product{totalRows !== 1 ? "s" : ""} · {fmt(summary.total_qty)} units
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_qty)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_net)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_tax)}</td>
                      <td className="px-4 py-3 text-right font-bold text-teal-700">KES {fmt(summary.total_amount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}

            {groupBy === "group" && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f2f2f7] text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Product Group</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Department</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Qty</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Net</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Tax</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f2f7]">
                  {groupedByGroup.map((r) => (
                    <tr key={r.name} className="hover:bg-[#f9f9fb] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#1c1c1e]">{r.name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{r.deptName}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(r.qty)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(r.net)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(r.tax)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1c1c1e]">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {summary && (
                  <tfoot>
                    <tr className="border-t-2 border-[#e5e5ea] bg-[#f9f9fb]">
                      <td colSpan={2} className="px-4 py-3 text-sm font-bold text-[#1c1c1e]">{totalRows} group{totalRows !== 1 ? "s" : ""}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_qty)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_net)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_tax)}</td>
                      <td className="px-4 py-3 text-right font-bold text-teal-700">KES {fmt(summary.total_amount)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}

            {groupBy === "department" && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f2f2f7] text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Department</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Qty</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Net</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Tax</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f2f7]">
                  {groupedByDept.map((r) => (
                    <tr key={r.name} className="hover:bg-[#f9f9fb] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#1c1c1e]">{r.name}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(r.qty)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(r.net)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(r.tax)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1c1c1e]">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {summary && (
                  <tfoot>
                    <tr className="border-t-2 border-[#e5e5ea] bg-[#f9f9fb]">
                      <td className="px-4 py-3 text-sm font-bold text-[#1c1c1e]">{totalRows} dept{totalRows !== 1 ? "s" : ""}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_qty)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_net)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#1c1c1e]">{fmt(summary.total_tax)}</td>
                      <td className="px-4 py-3 text-right font-bold text-teal-700">KES {fmt(summary.total_amount)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "invoice" | "product";

export default function SalesRegisterPage() {
  const [tab,         setTab]         = useState<Tab>("invoice");
  const [groups,      setGroups]      = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);

  useEffect(() => {
    fetch("/api/reports/filters")
      .then((r) => r.json())
      .then((d) => { setGroups(d.groups ?? []); setDepartments(d.departments ?? []); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#f2f2f7]">
      <div className="bg-white border-b border-[#e5e5ea] px-6 py-4">
        <div className="flex items-center gap-3 max-w-6xl mx-auto">
          <BackLink href="/pos/reports" label="Back to Reports" />
          <div>
            <h1 className="text-lg font-bold text-[#1c1c1e]">Sales Register</h1>
            <p className="text-xs text-slate-400">Transactions and product analytics</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-6xl mx-auto">
        <div className="flex gap-1 bg-[#e5e5ea] rounded-xl p-1 w-fit mb-5">
          {([["invoice", "By Invoice"], ["product", "By Product"]] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t} onClick={() => setTab(t as Tab)}
              className={`px-5 py-1.5 rounded-[9px] text-sm font-medium transition-all ${
                tab === t ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-[#1c1c1e]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "invoice" && <InvoiceTab />}
        {tab === "product" && <ProductTab groups={groups} departments={departments} />}
      </div>
    </div>
  );
}
