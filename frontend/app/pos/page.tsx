"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, POSMember, POSMenu, POSProduct } from "@/types/pos";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import type { ReceiptData } from "@/components/pos/ReceiptPreview";
import { BackLink } from "@/components/BackLink";

// ── helpers ──────────────────────────────────────────────────────────────────

function calcTax(product: POSProduct, qty: number) {
  const rate = product.rate;
  let tax_amount: number;
  if (product.tax_value > 0) {
    tax_amount = product.include_in_rate
      ? rate - rate / (1 + product.tax_value / 100)
      : (rate * product.tax_value) / 100;
  } else {
    tax_amount = 0;
  }
  const taxable_value = rate - tax_amount;
  return {
    tax_amount: parseFloat((tax_amount).toFixed(2)),
    taxable_value: parseFloat((taxable_value).toFixed(2)),
    line_total: parseFloat((rate * qty).toFixed(2)),
  };
}

function fmt(n: number) {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Toast ─────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error";

function Toast({ message, type, onClose }: { message: string; type: ToastType; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-ios-lg text-sm font-medium max-w-sm ${
        type === "success" ? "bg-teal-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 text-lg leading-none">×</button>
    </div>
  );
}

// ── Deposit Modal ─────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ["Cash", "M-Pesa", "Cheque"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Rentals — fixed set of service items shown under their own POS filter tab.
// 000I Bath Towel · 000J Bath Towel Replacement · 000K Locker Service
// 000L Small Towel · 000M Locker Money 10
const RENTAL_PRODUCT_IDS = new Set(["000I", "000J", "000K", "000L", "000M"]);

function DepositModal({
  member,
  printerType,
  onClose,
  onSuccess,
}: {
  member: POSMember;
  printerType: string;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}) {
  const memberName = `${member.first_name} ${member.last_name}`.trim();
  const [amount, setAmount]       = useState("");
  const [method, setMethod]       = useState<PaymentMethod>("Cash");
  const [mpesaCode, setMpesaCode] = useState("");
  const [chequeNo, setChequeNo]   = useState("");
  const [bankName, setBankName]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const narration =
    method === "M-Pesa"
      ? `M-Pesa Deposit - ${mpesaCode.trim() || "???"} - ${memberName}`
      : method === "Cheque"
      ? `Cheque Deposit - ${bankName.trim() || "???"} Chq#${chequeNo.trim() || "???"} - ${memberName}`
      : `Cash Deposit - ${memberName}`;

  const extraFieldsValid =
    method === "M-Pesa"  ? mpesaCode.trim().length > 0
    : method === "Cheque" ? chequeNo.trim().length > 0 && bankName.trim().length > 0
    : true;

  function switchMethod(m: PaymentMethod) {
    setMethod(m);
    setMpesaCode("");
    setChequeNo("");
    setBankName("");
    setError(null);
  }

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount"); return; }
    if (!extraFieldsValid) { setError("Please fill in all required fields"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pos/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id:     member.account_id,
          amount:         amt,
          payment_method: method.toLowerCase().replace("-", ""),
          narration,
          customer_name:  memberName,
          printer:        printerType,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Deposit failed: ${res.status}`);
      }
      onSuccess(member.balance + amt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-3xl shadow-ios-lg p-6 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[#1c1c1e]">Record Deposit</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          {memberName} — current balance:{" "}
          <span className="font-semibold text-[#1c1c1e]">KES {fmt(member.balance)}</span>
        </p>

        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Amount (KES)
        </label>
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="ios-input text-lg font-semibold mb-4"
        />

        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Payment Method
        </label>
        <div className="flex gap-2 mb-4">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              onClick={() => switchMethod(m)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                method === m
                  ? "bg-teal-600 text-white"
                  : "bg-[#f2f2f7] text-slate-600 hover:bg-[#e5e5ea]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* M-Pesa extra field */}
        {method === "M-Pesa" && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              M-Pesa Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={mpesaCode}
              onChange={(e) => setMpesaCode(e.target.value.toUpperCase())}
              placeholder="e.g. QK7X3RT2PO"
              className="ios-input"
            />
          </div>
        )}

        {/* Cheque extra fields */}
        {method === "Cheque" && (
          <div className="mb-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Cheque No <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 000123"
                className="ios-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Bank Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Equity Bank"
                className="ios-input"
              />
            </div>
          </div>
        )}

        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Narration
        </label>
        <p className="text-sm text-slate-500 bg-[#f2f2f7] rounded-xl px-3 py-2 mb-5">{narration}</p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading || !extraFieldsValid}
          className="ios-btn-primary w-full disabled:opacity-50"
        >
          {loading ? "Processing…" : "Confirm Deposit"}
        </button>
      </div>
    </div>
  );
}

// ── Member Panel ──────────────────────────────────────────────────────────────

type SearchResult = POSMember & { is_active: boolean; card_id: string };

function MemberPanel({
  selected,
  onSelect,
  printerType,
  onBalanceRefresh,
  balanceRefreshing,
}: {
  selected: POSMember | null;
  onSelect: (m: POSMember) => void;
  printerType: string;
  onBalanceRefresh?: () => void;
  balanceRefreshing?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Balance is owned by the parent (POSPage) and passed in via `selected.balance`,
  // so the display and the cart never diverge.
  const currentBalance = selected?.balance ?? 0;

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setShowDropdown(false); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/pos/members/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.members ?? []);
      setShowDropdown(true);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleInput(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 400);
  }

  function selectMember(m: SearchResult) {
    onSelect(m);
    setQuery(`${m.first_name} ${m.last_name}`.trim());
    setShowDropdown(false);
  }

  const initials = selected
    ? `${selected.first_name[0] ?? ""}${selected.last_name?.[0] ?? ""}`.toUpperCase()
    : "";

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder="Search by name, card ID, or mobile"
          className="ios-input"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            Searching…
          </span>
        )}
        {showDropdown && results.length > 0 && (
          <div className="absolute z-20 w-full top-full mt-1 bg-white rounded-xl shadow-ios-md overflow-hidden">
            {results.map((m) => (
              <button
                key={m.customer_id}
                onClick={() => selectMember(m)}
                className="w-full text-left px-4 py-3 hover:bg-teal-50 border-b border-[#f2f2f7] last:border-0 transition-colors"
              >
                <p className="text-sm font-semibold text-[#1c1c1e]">
                  {m.first_name} {m.last_name}
                </p>
                <p className="text-xs text-slate-500">
                  ID: {m.customer_id} · Card: {m.card_id || "—"} · Balance: KES {fmt(m.balance)}
                </p>
              </button>
            ))}
          </div>
        )}
        {showDropdown && results.length === 0 && !searching && query.trim() && (
          <div className="absolute z-20 w-full top-full mt-1 bg-white rounded-xl shadow-ios-md px-4 py-3 text-sm text-slate-400">
            No members found
          </div>
        )}
      </div>

      {/* Member card */}
      {selected ? (
        <div className="bg-white rounded-2xl shadow-ios overflow-hidden">
          <div className="flex">
            <div className="w-2 bg-teal-500 shrink-0" />
            <div className="flex-1 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                  <span className="text-teal-700 font-bold text-sm">{initials}</span>
                </div>
                <div>
                  <p className="font-bold text-[#1c1c1e]">
                    {selected.first_name} {selected.last_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    ID: {selected.customer_id} · {selected.mobile || "No mobile"}
                  </p>
                </div>
              </div>

              <div className="bg-[#f2f2f7] rounded-xl px-3 py-2.5 mb-3">
                <p className="text-xs text-slate-500 font-medium mb-0.5">GL Balance</p>
                <p className={`text-3xl font-bold ${currentBalance >= 0 ? "text-teal-600" : "text-red-600"}`}>
                  KES {fmt(currentBalance)}
                </p>
                {balanceRefreshing && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    Updating balance…
                  </p>
                )}
              </div>

              <button
                onClick={() => setShowDeposit(true)}
                disabled={balanceRefreshing}
                className="ios-btn-primary w-full text-sm disabled:opacity-50"
              >
                {balanceRefreshing ? "Updating balance…" : "+ Deposit"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-[#e5e5ea] rounded-2xl p-6 text-center">
          <p className="text-sm text-slate-400">Search for a member to load their account</p>
        </div>
      )}

      {showDeposit && selected && (
        <DepositModal
          member={selected}
          printerType={printerType}
          onClose={() => setShowDeposit(false)}
          onSuccess={() => {
            onBalanceRefresh?.();
            setShowDeposit(false);
          }}
        />
      )}
    </div>
  );
}

// ── Cart ──────────────────────────────────────────────────────────────────────

function CartPanel({
  cart,
  member,
  printerType,
  enforceStockCheck,
  onQtyChange,
  onRemove,
  onClear,
  onToast,
  onBalanceRefresh,
  balanceRefreshing,
}: {
  cart: CartItem[];
  member: POSMember | null;
  printerType: "thermal" | "pdf" | "pdfcreator";
  enforceStockCheck: boolean;
  onQtyChange: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
  onBalanceRefresh: () => void;
  balanceRefreshing: boolean;
}) {
  const [receiptData, setReceiptData]   = useState<ReceiptData | null>(null);
  const [showReceipt, setShowReceipt]   = useState(false);
  const [stockError, setStockError]     = useState<string | null>(null);

  const subtotal      = cart.reduce((s, i) => s + i.line_total, 0);
  const taxTotal      = cart.reduce((s, i) => s + i.tax_amount * i.quantity, 0);
  const total         = subtotal;
  const memberBalance = member?.balance ?? 0;
  const insufficient  = memberBalance < total;

  function handleProcessSale() {
    if (!member || !cart.length || insufficient) return;
    const now     = new Date();
    const date    = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
    const time    = now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });
    const tempRef = `TMP-${Date.now().toString().slice(-8)}`;

    setReceiptData({
      serial_number:  tempRef,
      customer_name:  `${member.first_name} ${member.last_name}`.trim(),
      customer_id:    member.customer_id,
      member_phone:   member.mobile ?? "",
      member_email:   (member as { email?: string }).email ?? "",
      date,
      time,
      items: cart.map((item) => ({
        display_name:  item.display_name,
        quantity:      item.quantity,
        rate:          item.rate,
        tax_amount:    parseFloat((item.tax_amount * item.quantity).toFixed(2)),
        taxable_value: parseFloat((item.taxable_value * item.quantity).toFixed(2)),
        line_total:    item.line_total,
        product_id:    item.product_id,
        tax_id:        item.tax_id || 1,
        tax_rate:      item.tax_value,
        mrp:           item.mrp || item.rate,
      })),
      subtotal:       parseFloat(subtotal.toFixed(2)),
      tax_total:      parseFloat(taxTotal.toFixed(2)),
      bill_amount:    parseFloat(total.toFixed(2)),
      payment_method: "Credit Sale",
    });
    setShowReceipt(true);
  }

  async function handlePrint(pt: "thermal" | "pdf" | "pdfcreator") {
    if (!receiptData || !member) throw new Error("No receipt data");

    // Step 1: Print
    const printRes = await fetch("/api/pos/print", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...receiptData, printer: pt }),
    });
    const printData = await printRes.json().catch(() => ({}));
    if (!printRes.ok || printData.printed === false) {
      throw new Error(printData.error ?? "Print failed");
    }

    // Step 2: Post to ERP
    const saleRes = await fetch("/api/pos/sale", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        customer_id:          member.customer_id,
        account_id:           member.account_id,
        enforce_stock_check:  enforceStockCheck,
        items: receiptData.items.map((i) => ({
          product_id:    i.product_id,
          quantity:      i.quantity,
          sale_rate:     i.rate,
          mrp:           i.mrp,
          tax_id:        i.tax_id,
          tax_rate:      i.tax_rate,
          tax_amount:    i.tax_amount,
          taxable_value: i.taxable_value,
        })),
        subtotal:    receiptData.subtotal,
        tax_total:   receiptData.tax_total,
        bill_amount: receiptData.bill_amount,
      }),
    });

    if (!saleRes.ok) {
      const errData = await saleRes.json().catch(() => ({}));
      const detail  = errData.detail ?? errData;
      if (saleRes.status === 400 && detail?.error === "Out of stock") {
        const names = (detail.items as Array<{ product_name: string }>)
          .map((x) => x.product_name)
          .join(", ");
        setStockError(`Out of stock: ${names}`);
        setShowReceipt(false);
        return;
      }
      console.error("ERP post failed after print:", receiptData);
      onToast("Receipt printed but sale failed to post. Contact admin.", "error");
      setShowReceipt(false);
      return;
    }
    setStockError(null);

    const saleData = await saleRes.json();
    onToast(`Sale complete — Receipt #${saleData.serial_number} · KES ${fmt(saleData.bill_amount ?? total)}`, "success");
    onClear();
    onBalanceRefresh();
    setShowReceipt(false);
    setReceiptData(null);
  }

  function handleSkip() {
    setShowReceipt(false);
    setReceiptData(null);
  }

  if (!cart.length) {
    return (
      <div className="border-t border-[#f2f2f7] pt-4 mt-4">
        <p className="text-sm text-slate-400 text-center py-6">Cart is empty — tap a product to add it</p>
      </div>
    );
  }

  return (
    <>
      <div className="border-t border-[#f2f2f7] pt-4 mt-4 flex flex-col gap-3">
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {cart.map((item) => (
            <div key={item.product_id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-slate-700 truncate">{item.display_name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setStockError(null); onQtyChange(item.product_id, -1); }}
                  className="w-6 h-6 rounded-lg bg-[#f2f2f7] hover:bg-[#e5e5ea] text-slate-700 font-bold text-xs flex items-center justify-center"
                >
                  −
                </button>
                <span className="w-5 text-center font-semibold text-[#1c1c1e]">{item.quantity}</span>
                <button
                  onClick={() => { setStockError(null); onQtyChange(item.product_id, 1); }}
                  className="w-6 h-6 rounded-lg bg-[#f2f2f7] hover:bg-[#e5e5ea] text-slate-700 font-bold text-xs flex items-center justify-center"
                >
                  +
                </button>
              </div>
              <span className="w-20 text-right font-semibold text-[#1c1c1e]">
                KES {fmt(item.line_total)}
              </span>
              <button
                onClick={() => { setStockError(null); onRemove(item.product_id); }}
                className="text-slate-300 hover:text-red-500 text-base leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t border-[#f2f2f7] pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>KES {fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Tax</span>
            <span>KES {fmt(taxTotal)}</span>
          </div>
          <div className="flex justify-between font-bold text-[#1c1c1e] text-base pt-1 border-t border-[#f2f2f7]">
            <span>Total</span>
            <span>KES {fmt(total)}</span>
          </div>
        </div>

        {member && insufficient && !balanceRefreshing && (
          <div className="bg-red-50 rounded-xl px-3 py-2 text-xs text-red-700 font-medium">
            Insufficient balance — member has KES {fmt(memberBalance)}, needs KES {fmt(total)}
          </div>
        )}

        {member && balanceRefreshing && (
          <div className="bg-amber-50 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            Updating balance — please wait before the next sale…
          </div>
        )}

        {stockError && (
          <div className="bg-red-50 rounded-xl px-3 py-2 text-xs text-red-700 font-medium flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{stockError} — remove the item or contact stock management.</span>
          </div>
        )}

        <button
          onClick={handleProcessSale}
          disabled={!member || insufficient || !cart.length || balanceRefreshing}
          className="ios-btn-primary w-full disabled:opacity-50"
        >
          {!member
            ? "Select a member first"
            : balanceRefreshing
            ? "Updating balance…"
            : insufficient
            ? "Insufficient Balance"
            : "Process Sale"}
        </button>
      </div>

      {showReceipt && receiptData && (
        <ReceiptModal
          receipt={receiptData}
          printerType={printerType}
          onPrint={handlePrint}
          onSkip={handleSkip}
        />
      )}
    </>
  );
}

// ── Product Grid ──────────────────────────────────────────────────────────────

function ProductGrid({
  menus,
  onAdd,
  stock,
  enforceStockCheck,
}: {
  menus: POSMenu[];
  onAdd: (product: POSProduct, customPrice?: number) => void;
  stock: Record<string, number>;
  enforceStockCheck: boolean;
}) {
  const [category, setCategory] = useState<"membership" | "pos" | "rental">("membership");

  // Flatten all departments and split into three buckets. Rentals are a fixed set
  // of service items (locker/towel) pulled out of Memberships; the rest split by
  // item type: memberships/services vs physical stock items (ItemType 164).
  const { membershipItems, posItems, rentalItems } = useMemo(() => {
    const seen = new Set<string>();
    const membership: POSProduct[] = [];
    const pos: POSProduct[] = [];
    const rental: POSProduct[] = [];
    for (const m of menus) {
      for (const p of m.items) {
        if (seen.has(p.product_id)) continue;
        seen.add(p.product_id);
        if (RENTAL_PRODUCT_IDS.has(p.product_id)) rental.push(p);
        else if (p.is_stock_item) pos.push(p);
        else membership.push(p);
      }
    }
    const byName = (a: POSProduct, b: POSProduct) =>
      a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base", numeric: true });
    membership.sort(byName);
    pos.sort(byName);
    rental.sort(byName);
    return { membershipItems: membership, posItems: pos, rentalItems: rental };
  }, [menus]);

  const items = category === "membership" ? membershipItems
              : category === "pos" ? posItems
              : rentalItems;

  function handleTap(product: POSProduct) {
    if (product.ask_price) {
      const raw = window.prompt(`Enter price for "${product.display_name}" (KES):`, String(product.rate));
      const price = parseFloat(raw ?? "");
      if (!isNaN(price) && price > 0) onAdd(product, price);
    } else {
      onAdd(product);
    }
  }

  if (!menus.length) {
    return <p className="text-sm text-slate-400 text-center py-10">Loading products…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "membership", label: "Memberships", count: membershipItems.length },
          { key: "pos",        label: "POS Items",    count: posItems.length },
          { key: "rental",     label: "Rentals",      count: rentalItems.length },
        ] as const).map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              category === c.key
                ? "bg-teal-600 text-white shadow-ios"
                : "bg-white text-slate-600 shadow-ios hover:bg-[#f2f2f7]"
            }`}
          >
            {c.label} <span className="opacity-60">({c.count})</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-3 overflow-y-auto max-h-[420px] pr-1">
        {items.length === 0 && (
          <p className="col-span-3 text-sm text-slate-400 text-center py-10">No items in this category.</p>
        )}
        {items.map((product) => {
          // stock map only contains stocked goods (ItemType 164). Products absent
          // from it are services (subscriptions etc.) — always sellable, no badge.
          const qty = stock[product.product_id];
          const isStocked = qty !== undefined;
          const outOfStock = isStocked && qty <= 0;
          const blocked = outOfStock && enforceStockCheck;
          return (
          <button
            key={product.product_id}
            onClick={() => { if (!blocked) handleTap(product); }}
            disabled={blocked}
            className={`bg-white rounded-xl p-3 text-left shadow-ios transition-all group ${
              blocked ? "opacity-50 cursor-not-allowed" : "hover:shadow-ios-md active:scale-95"
            }`}
          >
            <p className="text-xs font-bold text-[#1c1c1e] leading-snug mb-2 line-clamp-2 group-hover:text-teal-700">
              {product.display_name}
            </p>
            <p className="text-sm font-extrabold text-teal-600">KES {fmt(product.rate)}</p>
            {isStocked && (
              <div className="flex justify-end mt-1">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                  outOfStock ? "bg-red-50 text-red-600"
                  : qty <= 5 ? "bg-amber-50 text-amber-700"
                  : "bg-teal-50 text-teal-700"
                }`}>
                  {outOfStock ? "Out of stock" : `${fmt(qty)} in stock`}
                </span>
              </div>
            )}
          </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Printer Selector ──────────────────────────────────────────────────────────

type PrinterType = "thermal" | "pdf" | "pdfcreator";

const PRINTER_OPTIONS: { value: PrinterType; label: string }[] = [
  { value: "thermal",    label: "🖨 Thermal Printer" },
  { value: "pdf",        label: "📄 Save as PDF" },
  { value: "pdfcreator", label: "📄 PDF Creator" },
];

function PrinterSelector({ value, onChange }: { value: PrinterType; onChange: (v: PrinterType) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 font-normal shrink-0">Print to:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PrinterType)}
        className="text-[12px] text-[#1c1c1e] bg-[#f2f2f7] border-none rounded-lg px-2 py-1 outline-none cursor-pointer"
      >
        {PRINTER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Main POS Page ─────────────────────────────────────────────────────────────

export default function POSPage() {
  const [menus, setMenus]                       = useState<POSMenu[]>([]);
  const [member, setMember]                     = useState<POSMember | null>(null);
  const [cart, setCart]                         = useState<CartItem[]>([]);
  const [printerType, setPrinterType]           = useState<PrinterType>("thermal");
  const [refreshTick, setRefreshTick]           = useState(0);
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);
  const [toast, setToast]                       = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [enforceStockCheck, setEnforceStockCheck] = useState(true);
  const [stock, setStock]                       = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/pos/products")
      .then((r) => r.json())
      .then((d) => setMenus(d.menus ?? []))
      .catch(() => setMenus([]));

    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.pos_enforce_stock_check === "boolean") {
          setEnforceStockCheck(d.pos_enforce_stock_check);
        }
      })
      .catch(() => {});
  }, []);

  // Live stock levels — load on mount, refresh after every sale (refreshTick),
  // and poll every 60s so ERP purchases/changes appear while the page sits idle.
  useEffect(() => {
    let cancelled = false;
    const pull = () =>
      fetch("/api/pos/stock", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setStock(d.stock ?? {}); })
        .catch(() => {});

    pull();
    // Only poll while the tab is visible — avoids pointless fetches in background tabs.
    const id = setInterval(() => { if (document.visibilityState === "visible") pull(); }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshTick]);

  // Single source of truth for balance: refetch when a member is selected and
  // after any deposit/sale (refreshTick), and write it onto `member` so BOTH the
  // GL Balance display and the cart's insufficient-balance check use the same value.
  useEffect(() => {
    const cid = member?.customer_id;
    if (!cid) return;
    let cancelled = false;
    setBalanceRefreshing(true);
    fetch(`/api/pos/members/${encodeURIComponent(cid)}/balance`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.balance != null) {
          setMember((prev) => (prev && prev.customer_id === cid ? { ...prev, balance: d.balance } : prev));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setBalanceRefreshing(false); });
    return () => { cancelled = true; };
  }, [member?.customer_id, refreshTick]);

  function addToCart(product: POSProduct, customPrice?: number) {
    const effectiveProduct = customPrice
      ? { ...product, rate: customPrice }
      : product;
    const tax = calcTax(effectiveProduct, 1);

    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.product_id && !customPrice);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.product_id && !customPrice
            ? { ...i, quantity: i.quantity + 1, line_total: effectiveProduct.rate * (i.quantity + 1) }
            : i,
        );
      }
      return [
        ...prev,
        {
          ...effectiveProduct,
          quantity: 1,
          ...tax,
        },
      ];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product_id === productId
            ? { ...i, quantity: i.quantity + delta, line_total: i.rate * (i.quantity + delta) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product_id !== productId));
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f2f2f7]">
      <div className="shrink-0 bg-white border-b border-[#e5e5ea] px-5 py-2">
        <BackLink href="/dashboard" label="Back to Dashboard" />
      </div>
      <div className="flex flex-1 overflow-hidden">
      {/* LEFT — Member panel */}
      <div className="w-[38%] shrink-0 border-r border-[#e5e5ea] bg-white p-5 overflow-y-auto flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] text-slate-400 font-normal">Member</h2>
          <PrinterSelector value={printerType} onChange={setPrinterType} />
        </div>
        <MemberPanel selected={member} onSelect={setMember} printerType={printerType} onBalanceRefresh={() => setRefreshTick((t) => t + 1)} balanceRefreshing={balanceRefreshing} />
      </div>

      {/* RIGHT — Products + Cart */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Products */}
        <div className="flex-1 overflow-y-auto p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Products</h2>
          <ProductGrid menus={menus} onAdd={addToCart} stock={stock} enforceStockCheck={enforceStockCheck} />
        </div>

        {/* Cart */}
        <div className="bg-white border-t border-[#e5e5ea] px-5 pb-5 overflow-y-auto max-h-[46vh]">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-4 mb-1">Cart</h2>
          <CartPanel
            cart={cart}
            member={member}
            printerType={printerType}
            enforceStockCheck={enforceStockCheck}
            onQtyChange={changeQty}
            onRemove={removeFromCart}
            onClear={() => setCart([])}
            onToast={(msg, type) => setToast({ message: msg, type })}
            onBalanceRefresh={() => setRefreshTick((t) => t + 1)}
            balanceRefreshing={balanceRefreshing}
          />
        </div>
      </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
