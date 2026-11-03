import type { StatusCategory } from "@/features/settings/constants";
import { PRIORITIES, type Priority } from "./config";

// Règles de la planification. Elles s'appuient sur la catégorie du statut,
// jamais sur son libellé : terminé = « succès », annulé = « clôturé » ou « échec ».

/** Tâche encore à faire : statut « brouillon » ou « en cours ». */
export function isOpen(category: StatusCategory): boolean {
  return category === "draft" || category === "active";
}

/** En retard : échéance passée et tâche encore à faire. */
export function isOverdue(task: { dueOn: string | null; category: StatusCategory }, today: string): boolean {
  return task.dueOn !== null && task.dueOn < today && isOpen(task.category);
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: "En retard",
  today: "Aujourd'hui",
  week: "Dans les 7 jours",
  later: "Plus tard",
  none: "Sans échéance",
};

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Regroupement des tâches à faire selon leur échéance. */
export function dueBucket(dueOn: string | null, today: string): DueBucket {
  if (dueOn === null) return "none";
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  if (dueOn <= addDays(today, 7)) return "week";
  return "later";
}

export type ProgressInput = { category: StatusCategory; progress: number; estimateHours: number | null };

/**
 * Avancement d'un projet. Les tâches annulées (« clôturé », « échec ») ne
 * comptent pas. Avec des estimations, chaque tâche pèse ses heures (les
 * tâches sans estimation sont ignorées) ; sinon chaque tâche pèse 1. Une tâche
 * terminée compte pour 100 %, une autre pour son avancement saisi.
 * null : aucune tâche à mesurer.
 */
export function projectProgress(tasks: readonly ProgressInput[]): number | null {
  const counted = tasks.filter((t) => t.category !== "closed" && t.category !== "failure");
  const weighted = counted.some((t) => t.estimateHours !== null && t.estimateHours > 0);
  let total = 0;
  let done = 0;
  for (const task of counted) {
    const weight = weighted ? (task.estimateHours ?? 0) : 1;
    if (weight <= 0) continue;
    total += weight;
    done += weight * (task.category === "success" ? 1 : Math.min(Math.max(task.progress, 0), 100) / 100);
  }
  return total === 0 ? null : Math.round((done / total) * 100);
}

export type TaskFilters = {
  q?: string;
  status?: string;
  assignee?: string;
  priority?: Priority;
  project?: string;
  due?: "retard" | "semaine";
  archived: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : undefined;
}

/** Filtres de la liste des tâches, lus dans l'URL (valeurs inconnues ignorées). */
export function parseTaskFilters(query: Record<string, string | string[] | undefined>): TaskFilters {
  const id = (key: string) => {
    const v = one(query[key]);
    return v && (UUID.test(v) || v === "aucun") ? v : undefined;
  };
  const priority = one(query.priorite);
  const due = one(query.echeance);
  return {
    q: one(query.q)?.slice(0, 100),
    status: id("statut"),
    assignee: id("responsable"),
    priority: (PRIORITIES as readonly string[]).includes(priority ?? "") ? (priority as Priority) : undefined,
    project: id("projet"),
    due: due === "retard" || due === "semaine" ? due : undefined,
    archived: one(query.archives) === "1",
  };
}

/** Ordre d'affichage : en retard d'abord, puis échéance, puis priorité. */
export function compareTasks(
  a: { dueOn: string | null; priority: Priority; title: string },
  b: { dueOn: string | null; priority: Priority; title: string },
): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  // PRIORITIES va de la moins à la plus urgente.
  if (a.priority !== b.priority) return PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority);
  return a.title.localeCompare(b.title, "fr");
}
