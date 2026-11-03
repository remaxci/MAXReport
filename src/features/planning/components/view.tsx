import { CalendarDays, List, SquareKanban } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { PRIORITY_LABELS, TASK_FIELD_LABELS, type Priority } from "../config";
import type { TaskEvent } from "../queries";

const TASK_VIEWS = [
  { key: "liste", label: "Liste", path: "/taches", icon: List },
  { key: "kanban", label: "Kanban", path: "/taches/kanban", icon: SquareKanban },
  { key: "calendrier", label: "Calendrier", path: "/taches/calendrier", icon: CalendarDays },
] as const;

/** Passage d'une vue des tâches à l'autre (les filtres sont propres à chaque vue). */
export function TaskViewTabs({ base, current }: { base: string; current: (typeof TASK_VIEWS)[number]["key"] }) {
  return (
    <nav aria-label="Vues des tâches" className="flex w-fit gap-1 rounded-lg bg-muted p-1">
      {TASK_VIEWS.map((view) => (
        <Link
          key={view.key}
          href={`${base}${view.path}`}
          aria-current={view.key === current ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
            view.key === current ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <view.icon className="size-4" />
          {view.label}
        </Link>
      ))}
    </nav>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normal") return null;
  return (
    <Badge variant={priority === "urgent" ? "destructive" : priority === "high" ? "default" : "secondary"}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

/** Échéance, en rouge si dépassée sur une tâche encore à faire. */
export function DueDate({ dueOn, overdue }: { dueOn: string | null; overdue: boolean }) {
  if (!dueOn) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={overdue ? "font-medium text-destructive" : undefined}>
      {formatDate(dueOn)}
      {overdue && <span className="sr-only"> (en retard)</span>}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex min-w-24 items-center gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{value} %</span>
    </div>
  );
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function describe(event: TaskEvent): { title: string; detail?: string } {
  const p = event.payload;
  switch (event.type) {
    case "created":
      return { title: "Création" };
    case "updated": {
      const fields = Array.isArray(p.fields) ? p.fields.map((f) => TASK_FIELD_LABELS[str(f)] ?? str(f)) : [];
      return { title: "Modification", detail: fields.length ? fields.join(", ") : undefined };
    }
    case "status_changed":
      return { title: "Changement de statut", detail: `${str(p.from) || "—"} → ${str(p.to) || "—"}` };
    case "assigned":
      return { title: str(p.to) ? `Confiée à ${str(p.to)}` : "Responsable retiré" };
    case "due_changed":
      return { title: "Échéance modifiée", detail: `${formatDate(str(p.from) || null)} → ${formatDate(str(p.to) || null)}` };
    case "comment":
      return { title: "Commentaire", detail: str(p.text) };
    case "archived":
      return { title: "Archivée" };
    case "restored":
      return { title: "Restaurée" };
    default:
      return { title: event.type };
  }
}

export function TaskTimeline({ events, actorLabels }: { events: TaskEvent[]; actorLabels: Map<string, string> }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Aucun événement.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l pl-4">
      {events.map((event) => {
        const { title, detail } = describe(event);
        const actor = event.actorId ? (actorLabels.get(event.actorId) ?? "Un collaborateur") : "MAXreport";
        return (
          <li key={event.id} className="relative">
            <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
            <p className="text-sm font-medium">{title}</p>
            {detail && <p className="text-sm whitespace-pre-line text-muted-foreground">{detail}</p>}
            <p className="text-xs text-muted-foreground">
              {formatDateTime(event.occurredAt)} · {actor}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
