"use client";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { RequireModule } from "@/components/RequireModule";

export default function DashboardPage() {
  return (
    <RequireModule module="dashboard">
      <DashboardClient />
    </RequireModule>
  );
}
