import { Badge } from "@/components/ui/badge";
import type { FollowUpState } from "../filters";

export function StatusBadge({ label, color }: { label: string; color: string | null }) {
  return (
    <Badge
      variant="outline"
      className="gap-1.5"
      style={color ? { borderColor: color, color } : undefined}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}

const FOLLOW_UP_LABELS: Record<Exclude<FollowUpState, null>, string> = {
  overdue: "Relance en retard",
  today: "Relance aujourd'hui",
  soon: "Relance cette semaine",
};

export function FollowUpBadge({ state }: { state: FollowUpState }) {
  if (!state) return null;
  return (
    <Badge variant={state === "overdue" ? "destructive" : "secondary"}>{FOLLOW_UP_LABELS[state]}</Badge>
  );
}
