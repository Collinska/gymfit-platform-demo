"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, LayoutDashboard, Monitor, UserCheck, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/kiosk", label: "Kiosk", icon: Monitor },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/members", label: "Members", icon: Users },
  { href: "/checkins", label: "Check-ins", icon: UserCheck },
];

export function ModuleNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-panel">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-2 font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" />
          <span>GYMFIT Operations</span>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted transition hover:bg-background hover:text-foreground",
                  active && "bg-background text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
