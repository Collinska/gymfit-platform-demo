import type { ReactNode } from "react";
import { ModuleNav } from "@/components/layout/module-nav";

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AppShell({ title, subtitle, children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <ModuleNav />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-border pb-5">
          <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
