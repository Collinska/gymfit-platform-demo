import type { ReportDefinition } from "@/types/operations";

export async function getReportIndex(): Promise<ReportDefinition[]> {
  return [
    {
      id: "attendance",
      name: "Attendance",
      metrics: ["Daily traffic", "Peak hours", "Rejected check-ins"],
    },
    {
      id: "sync-health",
      name: "Sync Health",
      metrics: ["Worker status", "Failed ERP rows", "Last successful run"],
    },
  ];
}
