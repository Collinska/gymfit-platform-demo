"use client";

export type ReceiptData = {
  serial_number:  string;
  customer_name:  string;
  customer_id:    string;
  member_phone:   string;
  member_email:   string;
  date:           string;
  time:           string;
  items: Array<{
    display_name:   string;
    quantity:       number;
    rate:           number;
    tax_amount:     number;
    taxable_value:  number;
    line_total:     number;
    product_id:     string;
    tax_id:         number;
    tax_rate:       number;
    mrp:            number;
  }>;
  subtotal:       number;
  tax_total:      number;
  bill_amount:    number;
  payment_method: string;
};

function pad(s: string, width: number, right = false): string {
  const str = String(s);
  if (str.length >= width) return str.slice(0, width);
  return right ? str.padStart(width) : str.padEnd(width);
}

function fmt(n: number) {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const W = 32;
const LINE = "─".repeat(W);

export function ReceiptPreview({ receipt }: { receipt: ReceiptData }) {
  return (
    <pre className="font-mono text-[11px] leading-[1.55] text-[#1c1c1e] bg-white rounded-xl p-4 overflow-x-auto whitespace-pre select-text">
      {/* Header */}
      {pad("Fitness Mania Ltd", W, false).replace(/^(.*)$/, (s) => s.padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W))}
      {"\n"}
      {pad("P.O. Box 46826-00100", W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {pad("Parklands.", W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {pad("+254 708 419 865, +254 782 633 633", W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {pad("PIN: P051155539A", W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {LINE}
      {"\n"}
      {pad("SALE RECEIPT", W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {pad(`${receipt.date}  ${receipt.time}`, W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {LINE}
      {"\n"}
      {`Receipt : ${receipt.serial_number}\n`}
      {`Member  : ${receipt.customer_name}\n`}
      {`ID      : ${receipt.customer_id}\n`}
      {receipt.member_phone ? `Phone   : ${receipt.member_phone}\n` : ""}
      {receipt.member_email ? `Email   : ${receipt.member_email}\n` : ""}
      {LINE}
      {"\n"}
      {receipt.items.map((item) => {
        const name = pad(item.display_name, 22);
        const total = pad(`KES ${fmt(item.line_total)}`, 10, true);
        return `${name}\n  ${item.quantity} x ${pad(`KES ${fmt(item.rate)}`, 12)}  ${total}\n`;
      }).join("")}
      {LINE}
      {"\n"}
      {receipt.tax_total > 0
        ? `${pad("Subtotal", 20)} KES ${pad(fmt(receipt.subtotal), 10, true)}\n${pad("Tax", 20)} KES ${pad(fmt(receipt.tax_total), 10, true)}\n${LINE}\n`
        : ""}
      {`${pad("TOTAL", 20)} KES ${pad(fmt(receipt.bill_amount), 10, true)}\n`}
      {LINE}
      {"\n"}
      {`Payment : ${receipt.payment_method}\n`}
      {LINE}
      {"\n"}
      {pad("PayBill No: 763766", W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {pad("A/c No: 0766687146", W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {pad("Lipa Na Mpesa Till: 716286", W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {pad("Business No: 247247  A/c: 284495", W, false).replace(/^(.*)$/, (s) =>
        s.trim().padStart(Math.floor((W + s.trim().length) / 2)).padEnd(W),
      )}
      {"\n"}
      {LINE}
    </pre>
  );
}
