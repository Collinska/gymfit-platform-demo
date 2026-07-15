import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white shadow-subtle transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
