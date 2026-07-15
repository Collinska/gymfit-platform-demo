import { Badge } from "@/components/ui/badge";
import type { Member } from "@/types/operations";

type MemberTableProps = {
  members: Member[];
};

export function MemberTable({ members }: MemberTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-panel shadow-subtle">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="border-b border-border bg-background text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3">Member</th>
            <th className="px-4 py-3">Mobile</th>
            <th className="px-4 py-3">Card</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium">{member.fullName}</td>
              <td className="px-4 py-3 text-muted">{member.mobile ?? "Not recorded"}</td>
              <td className="px-4 py-3 text-muted">{member.cardId ?? "Not assigned"}</td>
              <td className="px-4 py-3">
                <Badge tone={member.isActive ? "success" : "neutral"}>{member.isActive ? "Active" : "Inactive"}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
