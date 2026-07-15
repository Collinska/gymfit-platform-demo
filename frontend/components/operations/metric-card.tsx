import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type MetricCardProps = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning";
};

const toneClass = {
  neutral: "text-primary",
  success: "text-success",
  warning: "text-warning",
};

export function MetricCard({ label, value, icon: Icon, tone = "neutral" }: MetricCardProps) {
  return (
    <section className="rounded-lg border border-border bg-panel p-4 shadow-subtle">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted">{label}</span>
        <Icon className={cn("h-5 w-5", toneClass[tone])} />
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </section>
  );
}
