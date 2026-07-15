import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
};

const toneClass = {
  neutral: "bg-background text-foreground",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={cn("rounded-md px-2 py-1 text-xs font-medium", toneClass[tone])}>{children}</span>;
}
