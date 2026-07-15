"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useClickSound } from "@/hooks/useClickSound";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { ROLE_LABELS, type Module, type Role } from "@/lib/permissions";
import {
  BarChart3,
  Camera,
  Clock,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings,
  ShoppingCart,
  Snowflake,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ChildItem = {
  label: string;
  href:  string;
};

type NavItem = {
  label:    string;
  href?:    string;
  icon?:    LucideIcon;
  module?:  Module;
  children?: ChildItem[];
};

type NavSection = {
  section: string;
  items:   NavItem[];
};

const NAV: NavSection[] = [
  {
    section: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: "dashboard" }],
  },
  {
    section: "Operations",
    items: [
      { label: "Check-in Kiosk", href: "/kiosk",    icon: Camera, module: "kiosk" },
      { label: "Check-in Log",   href: "/checkins", icon: Clock,  module: "checkins" },
    ],
  },
  {
    section: "Members",
    items: [
      { label: "Member List",       href: "/members",  icon: Users,     module: "members" },
      { label: "Gym Wrap",          href: "/gym-wrap", icon: Sparkles,  module: "gym_wrap" },
      { label: "Leads",             href: "/leads",    icon: UserPlus,  module: "leads" },
      { label: "Freeze / Unfreeze", href: "/freeze",   icon: Snowflake, module: "freeze" },
    ],
  },
  {
    section: "Sales",
    items: [
      { label: "Point of Sale", href: "/pos", icon: ShoppingCart, module: "pos" },
      { label: "Reports", href: "/pos/reports", icon: BarChart3, module: "reports" },
    ],
  },
  {
    section: "Analytics",
    items: [
      { label: "Analytics",    href: "/analytics", icon: BarChart3,  module: "analytics" },
      { label: "Retention",    href: "/churn",     icon: HeartPulse, module: "churn" },
      { label: "ERP Sync Log", href: "/sync-log",  icon: RefreshCw,  module: "sync_log" },
    ],
  },
  {
    section: "System",
    items: [
      { label: "Settings", href: "/settings", icon: Settings, module: "settings" },
    ],
  },
];

type SidebarProps = {
  syncStatus?:  "active" | "error";
  lastSyncTime?: string;
};

export function Sidebar({ syncStatus = "active", lastSyncTime = "Just now" }: SidebarProps) {
  const pathname  = usePathname();
  const playClick = useClickSound();
  const { staff, hasModule } = useAuth();
  const me = staff ? { name: staff.name, role: staff.role } : null;
  const [brand, setBrand] = useState<{ biz_name: string; biz_logo_url: string }>({ biz_name: "Fitness Mania", biz_logo_url: "" });

  useEffect(() => {
    fetch("/api/branding", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setBrand({ biz_name: d.biz_name || "Fitness Mania", biz_logo_url: d.biz_logo_url || "" }))
      .catch(() => {});
  }, []);

  async function signOut() {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      /* ignore — still redirect */
    }
    // Full reload so AuthProvider clears the session state.
    window.location.href = "/login";
  }

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  return (
    <aside className="flex flex-col h-screen sticky top-0 w-[240px] shrink-0 overflow-hidden bg-[linear-gradient(180deg,#1f2a2a,#243130)] border-r border-white/5 shadow-[2px_0_24px_rgba(0,0,0,0.15)]">

      {/* ── Brand ── */}
      <div className="px-4 pt-[18px] pb-[14px] border-b border-white/[0.08] bg-white/[0.03]">
        <div className="flex items-center gap-2.5">
          {brand.biz_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.biz_logo_url} alt={brand.biz_name} className="h-[30px] max-w-[36px] object-contain rounded-[8px] shrink-0" />
          ) : (
            <div className="w-[30px] h-[30px] rounded-[10px] bg-teal-500 flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(13,148,136,0.4)]">
              <span className="text-white text-[11px] font-bold tracking-wide">FM</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#5eead4] leading-tight tracking-[-0.01em] truncate">{brand.biz_name}</p>
            <p className="text-[11px] text-[#6b7d78] font-normal leading-tight">Operations Console</p>
          </div>
        </div>
      </div>

      {/* ── Nav (scrolls invisibly; brand + footer stay pinned) ── */}
      <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 pt-3 pb-2 space-y-5">
        {NAV.map((group) => {
          const items = group.items.filter((item) => !item.module || hasModule(item.module));
          if (items.length === 0) return null;
          return (
          <div key={group.section}>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6b7d78] font-semibold px-2 mb-[3px] select-none">
              {group.section}
            </p>

            <div className="space-y-[1px]">
              {items.map((item) => {
                const Icon = item.icon;

                /* ── Item with children (sub-section) ── */
                if (item.children) {
                  const anyChildActive = item.children.some((c) => isActive(c.href));
                  // Parent highlights only on its own hub route (exact match), so a
                  // sub-report highlights the child, not the parent.
                  const parentActive = item.href ? pathname === item.href : false;
                  const parentTinted = parentActive || anyChildActive;
                  return (
                    <div key={item.label}>
                      {/* Parent row — links to the hub, still expands children */}
                      <Link
                        href={item.href ?? "#"}
                        onClick={playClick}
                        className={`flex items-center gap-[9px] pl-[6px] pr-2 py-[6px] rounded-[10px] border-l-2 text-[13px] leading-snug transition-colors duration-100 ${
                          parentActive
                            ? "bg-teal-500/15 text-[#5eead4] border-teal-400"
                            : "text-[#a8b3b0] hover:bg-white/[0.06] hover:text-white border-transparent"
                        }`}
                      >
                        {Icon && (
                          <Icon
                            size={15}
                            strokeWidth={1.4}
                            className={parentTinted ? "text-[#5eead4]" : "text-[#a8b3b0]"}
                            aria-hidden="true"
                          />
                        )}
                        <span className={parentTinted ? "font-medium" : "font-normal"}>
                          {item.label}
                        </span>
                      </Link>

                      {/* Children — indented */}
                      <div className="ml-[22px] space-y-[1px]">
                        {item.children.map((child) => {
                          const active = isActive(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={playClick}
                              className={`flex items-center gap-[7px] pl-3 pr-2 py-[5px] rounded-[10px] text-[13px] leading-snug transition-colors duration-100 ${
                                active
                                  ? "bg-teal-500/15 text-[#5eead4] font-medium"
                                  : "text-[#a8b3b0] hover:bg-white/[0.06] hover:text-white font-normal"
                              }`}
                            >
                              <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${active ? "bg-teal-300" : "bg-[#5a6b66]"}`} />
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                /* ── Regular link item ── */
                const active = item.href ? isActive(item.href) : false;
                return (
                  <Link
                    key={item.href ?? item.label}
                    href={item.href ?? "#"}
                    onClick={playClick}
                    className={`flex items-center gap-[9px] pl-[6px] pr-2 py-[6px] rounded-[10px] border-l-2 text-[13px] leading-snug transition-colors duration-100 ${
                      active
                        ? "bg-teal-500/15 text-[#5eead4] border-teal-400"
                        : "text-[#a8b3b0] hover:bg-white/[0.06] hover:text-white border-transparent"
                    }`}
                  >
                    {Icon && (
                      <Icon
                        size={15}
                        strokeWidth={1.4}
                        className={active ? "text-[#5eead4]" : "text-[#a8b3b0]"}
                        aria-hidden="true"
                      />
                    )}
                    <span className={active ? "font-medium" : "font-normal"}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="border-t border-white/[0.08]">
        {/* Signed-in staff + sign out */}
        <div className="px-3 py-3 flex items-center gap-2 border-b border-white/[0.06]">
          <div className="w-7 h-7 rounded-full bg-teal-500/20 text-[#5eead4] flex items-center justify-center text-[11px] font-bold shrink-0">
            {(me?.name ?? "?").trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-white font-medium truncate">{me?.name ?? "—"}</p>
            <p className="text-[11px] text-[#6b7d78] truncate">
              {me ? (ROLE_LABELS[me.role as Role] ?? me.role) : "Not signed in"}
            </p>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            className="w-7 h-7 rounded-lg text-[#a8b3b0] hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors shrink-0"
          >
            <LogOut size={15} strokeWidth={1.6} />
          </button>
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${syncStatus === "active" ? "bg-teal-400" : "bg-red-400"}`} />
            <span className="text-[11px] text-[#6b7d78] font-normal">ERP Sync</span>
          </div>
          <p className="text-[12px] text-[#a8b3b0] font-normal">{lastSyncTime}</p>
          <p className="text-[11px] text-[#6b7d78] font-normal">FR8RootDB → Supabase</p>
        </div>
      </div>
    </aside>
  );
}
