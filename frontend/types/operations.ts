export type DashboardSummary = {
  activeMembers: number;
  checkinsToday: number;
  openSyncIssues: number;
  kioskStatus: string;
};

export type Member = {
  id: string;
  fullName: string;
  mobile: string | null;
  cardId: string | null;
  isActive: boolean;
};

export type Checkin = {
  id: string;
  memberName: string;
  checkedInAt: string;
  status: "accepted" | "review";
};

export type ReportDefinition = {
  id: string;
  name: string;
  metrics: string[];
};
