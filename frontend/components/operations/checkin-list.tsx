import { Badge } from "@/components/ui/badge";
import type { Checkin } from "@/types/operations";

type CheckinListProps = {
  checkins: Checkin[];
};

export function CheckinList({ checkins }: CheckinListProps) {
  return (
    <section className="rounded-lg border border-border bg-panel shadow-subtle">
      <div className="divide-y divide-border">
        {checkins.map((checkin) => (
          <div key={checkin.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">{checkin.memberName}</div>
              <div className="text-sm text-muted">{checkin.checkedInAt}</div>
            </div>
            <Badge tone={checkin.status === "accepted" ? "success" : "warning"}>{checkin.status}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
