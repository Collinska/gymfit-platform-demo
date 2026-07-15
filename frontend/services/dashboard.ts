import type { DashboardSummary } from "@/types/operations";

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return {
    activeMembers: 0,
    checkinsToday: 0,
    openSyncIssues: 0,
    kioskStatus: "Ready",
  };
}
