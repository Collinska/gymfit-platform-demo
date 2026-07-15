"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

const TEAL = "#0d9488";
const CORAL = "#f97362";

const STATUS_COLORS: Record<string, string> = {
  active:        "#0d9488",
  frozen:        "#f59e0b",
  expired:       "#f97362",
  no_membership: "#cbb8ae",
  unknown:       "#e2e8f0",
};

const kes = (n: number) => "KES " + (n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 });
const kFmt = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

// ── Shared warm tooltip ──────────────────────────────────────────────────────
function SoftTooltip({
  active, payload, label, render,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: string | number;
  render: (value: number, label: string) => { big: string; small: string };
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  const { big, small } = render(value, String(label ?? ""));
  return (
    <div className="rounded-xl bg-white px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.12)] border border-stone-100">
      <p className="text-sm font-bold text-stone-800">{big}</p>
      <p className="text-xs text-stone-400">{small}</p>
    </div>
  );
}

// ── A) Revenue area chart ────────────────────────────────────────────────────
export function RevenueAreaChart({ data }: { data: Array<{ month: string; revenue: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#eee7e2" strokeDasharray="3 6" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#a8a29e" }} dy={6} />
        <YAxis tickLine={false} axisLine={false} width={38} tick={{ fontSize: 12, fill: "#a8a29e" }} tickFormatter={kFmt} />
        <Tooltip content={<SoftTooltip render={(v, l) => ({ big: kes(v), small: l })} />} />
        <Area type="monotone" dataKey="revenue" stroke={TEAL} strokeWidth={2.5} fill="url(#revFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── B) Check-ins area chart ──────────────────────────────────────────────────
export function CheckinsAreaChart({ data }: { data: Array<{ day: string; count: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="chkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CORAL} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CORAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#eee7e2" strokeDasharray="3 6" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#a8a29e" }} dy={6} />
        <YAxis tickLine={false} axisLine={false} width={30} tick={{ fontSize: 12, fill: "#a8a29e" }} allowDecimals={false} />
        <Tooltip content={<SoftTooltip render={(v) => ({ big: `${v} check-ins`, small: "" })} />} />
        <Area type="monotone" dataKey="count" stroke={CORAL} strokeWidth={2.5} fill="url(#chkFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── C) Member status donut ───────────────────────────────────────────────────
export function MemberStatusDonut({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const pie = entries.map(([name, value]) => ({ name, value }));

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pie}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={85}
              paddingAngle={3}
              cornerRadius={6}
              stroke="none"
            >
              {pie.map((e) => (
                <Cell key={e.name} fill={STATUS_COLORS[e.name] ?? STATUS_COLORS.unknown} />
              ))}
            </Pie>
            <Tooltip content={<SoftTooltip render={(v, l) => ({ big: `${v}`, small: l.replace("_", " ") })} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-stone-800">{total.toLocaleString()}</span>
          <span className="text-xs text-stone-400">members</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {pie.map((e) => (
          <div key={e.name} className="flex items-center gap-2 text-xs">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[e.name] ?? STATUS_COLORS.unknown }} />
            <span className="capitalize text-stone-500">{e.name.replace("_", " ")}</span>
            <span className="ml-auto font-semibold text-stone-700">{e.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Warm restyled plan-mix (Top Plans) ───────────────────────────────────────
export function WarmPlanMix({ planMix }: { planMix: Record<string, number> }) {
  const entries = Object.entries(planMix);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (entries.length === 0) {
    return <p className="text-sm text-stone-400">No active plan data available.</p>;
  }
  return (
    <div className="space-y-3.5">
      {entries.map(([plan, count]) => {
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <div key={plan}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-stone-600 truncate pr-2">{plan}</span>
              <span className="text-stone-400 font-medium whitespace-nowrap">{count} · {pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${TEAL}, #0891b2)` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
