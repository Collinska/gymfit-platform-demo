"use client";

import { useState } from "react";
import { ReceiptPreview, type ReceiptData } from "./ReceiptPreview";

type PrinterType = "thermal" | "pdf" | "pdfcreator";

const PRINTER_LABELS: Record<PrinterType, string> = {
  thermal:    "🖨 Thermal Printer",
  pdf:        "📄 Save as PDF",
  pdfcreator: "📄 PDF Creator",
};

export function ReceiptModal({
  receipt,
  printerType,
  onPrint,
  onSkip,
}: {
  receipt:     ReceiptData;
  printerType: PrinterType;
  onPrint:     (pt: PrinterType) => Promise<void>;
  onSkip:      () => void;
}) {
  const [printing, setPrinting]             = useState(false);
  const [printError, setPrintError]         = useState<string | null>(null);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [activePrinter, setActivePrinter]   = useState<PrinterType>(printerType);

  async function handlePrint(pt: PrinterType) {
    setPrinting(true);
    setPrintError(null);
    try {
      await onPrint(pt);
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : "Print failed. Check printer and try again.");
      setPrinting(false);
    }
  }

  function handleClose() {
    if (printing) return;
    setShowConfirm(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#f2f2f7] shrink-0">
          <div>
            <h2 className="font-bold text-[#1c1c1e] text-base">Sale Preview</h2>
            <p className="text-[11px] text-slate-400 font-normal mt-0.5">Print receipt before posting to ERP</p>
          </div>
          <button
            onClick={handleClose}
            disabled={printing}
            className="w-7 h-7 rounded-full bg-[#f2f2f7] flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-[#e5e5ea] transition-colors disabled:opacity-40"
          >
            ×
          </button>
        </div>

        {/* Receipt preview */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ReceiptPreview receipt={receipt} />
        </div>

        {/* Print error */}
        {printError && (
          <div className="mx-5 mb-3 px-3 py-2 bg-red-50 rounded-xl text-xs text-red-700 font-medium shrink-0">
            {printError}
          </div>
        )}

        {/* Actions */}
        <div className="px-5 pb-5 shrink-0 border-t border-[#f2f2f7] pt-4 space-y-2">
          {/* Printer tabs */}
          <div className="flex gap-1.5 mb-3">
            {(Object.keys(PRINTER_LABELS) as PrinterType[]).map((pt) => (
              <button
                key={pt}
                onClick={() => setActivePrinter(pt)}
                disabled={printing}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40 ${
                  activePrinter === pt
                    ? "bg-teal-600 text-white"
                    : "bg-[#f2f2f7] text-slate-500 hover:bg-[#e5e5ea]"
                }`}
              >
                {PRINTER_LABELS[pt]}
              </button>
            ))}
          </div>

          <button
            onClick={() => handlePrint(activePrinter)}
            disabled={printing}
            className="ios-btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {printing ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Printing & posting…
              </>
            ) : (
              `Print & Post Sale`
            )}
          </button>
        </div>
      </div>

      {/* Cancel confirmation overlay */}
      {showConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-6 w-full max-w-xs mx-4">
            <h3 className="font-bold text-[#1c1c1e] mb-2">Skip printing?</h3>
            <p className="text-sm text-slate-500 mb-5">
              The sale will not be processed if you skip. The cart will remain intact.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 ios-btn-primary text-sm"
              >
                Go back
              </button>
              <button
                onClick={() => { setShowConfirm(false); onSkip(); }}
                className="flex-1 py-3 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
              >
                Cancel sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
