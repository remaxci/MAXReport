import type { StatusCategory } from "@/features/settings/constants";
import { addDays } from "@/lib/format";
import { isOpen } from "./rules";

// Dépendances, alertes de dates et charge. « B dépend de A » : B commence quand
// A est terminée. La base refuse déjà les boucles ; la même vérification ici
// évite de proposer un choix qu'elle refuserait.

export type Dependency = { taskId: string; dependsOnId: string };

/** Vrai si « taskId dépend de dependsOnId » fermerait une boucle, même indirecte. */
export function createsCycle(deps: readonly Dependency[], taskId: string, dependsOnId: string): boolean {
  if (taskId === dependsOnId) return true;
  const next = new Map<string, string[]>();
  for (const d of deps) next.set(d.taskId, [...(next.get(d.taskId) ?? []), d.dependsOnId]);
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return false;
}

type Dated = { startOn: string | null; dueOn: string | null; category: StatusCategory };

/**
 * Tâche bloquée : un de ses prédécesseurs est encore à faire. Un prédécesseur
 * terminé ou annulé ne bloque plus.
 */
export function isBlocked(predecessors: readonly { category: StatusCategory }[]): boolean {
  return predecessors.some((p) => isOpen(p.category));
}

/**
 * Dates incompatibles : la tâche commence (ou, sans début, finit) avant
 * l'échéance de son prédécesseur, alors que les deux restent à faire.
 * Le même jour est admis : A se termine, B démarre.
 */
export function dependencyConflict(task: Dated, predecessor: Dated): boolean {
  if (!isOpen(task.category) || !isOpen(predecessor.category)) return false;
  const begins = task.startOn ?? task.dueOn;
  return begins !== null && predecessor.dueOn !== null && begins < predecessor.dueOn;
}

/** La tâche finit après le jalon auquel elle est rattachée, jalon pas encore atteint. */
export function milestoneConflict(
  task: { dueOn: string | null; category: StatusCategory },
  milestone: { dueOn: string; reachedOn: string | null },
): boolean {
  return isOpen(task.category) && milestone.reachedOn === null && task.dueOn !== null && task.dueOn > milestone.dueOn;
}

// ---------------------------------------------------------------------
// Semaines
// ---------------------------------------------------------------------

const DAY = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Lundi de la semaine d'une date. */
export function weekStart(iso: string): string {
  return addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7));
}

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function isoWeek(iso: string): number {
  const thursday = toDate(addDays(weekStart(iso), 3));
  const firstDay = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - firstDay) / DAY / 7) + 1;
}

/** `count` semaines consécutives, désignées par leur lundi, à partir de celle de `from`. */
export function weeksFrom(from: string, count: number): string[] {
  const monday = weekStart(from);
  return Array.from({ length: count }, (_, i) => addDays(monday, i * 7));
}

function workingDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const weekday = toDate(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(day);
  }
  return days;
}

// ---------------------------------------------------------------------
// Charge
// ---------------------------------------------------------------------

export type WorkloadTask = Dated & { assigneeId: string | null; estimateHours: number | null; progress: number };

export type Workload = {
  /** Heures par collaborateur, puis par semaine (clé : lundi). */
  weeks: Map<string, Map<string, number>>;
  /** Heures des tâches sans aucune date, par collaborateur. */
  undated: Map<string, number>;
  /** Tâches à faire sans estimation, par collaborateur : elles ne sont pas comptées. */
  unestimated: Map<string, number>;
};

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

/**
 * Charge restante de chaque collaborateur. Pour chaque tâche à faire qui lui est
 * confiée : heures restantes = estimation × part non réalisée, réparties à parts
 * égales sur les jours ouvrés (lundi → vendredi) qui restent de sa période, à
 * partir d'aujourd'hui. Une tâche en retard pèse sur aujourd'hui. Sans jour
 * ouvré dans la période, tout va sur son premier jour.
 */
export function workload(tasks: readonly WorkloadTask[], today: string): Workload {
  const result: Workload = { weeks: new Map(), undated: new Map(), unestimated: new Map() };
  for (const task of tasks) {
    if (!task.assigneeId || !isOpen(task.category)) continue;
    if (task.estimateHours === null || task.estimateHours <= 0) {
      add(result.unestimated, task.assigneeId, 1);
      continue;
    }
    const remaining = task.estimateHours * (1 - Math.min(Math.max(task.progress, 0), 100) / 100);
    if (remaining <= 0) continue;
    const a = task.startOn ?? task.dueOn;
    const b = task.dueOn ?? task.startOn;
    if (a === null || b === null) {
      add(result.undated, task.assigneeId, remaining);
      continue;
    }
    const [start, end] = a <= b ? [a, b] : [b, a];
    const from = start > today ? start : today;
    const to = end > from ? end : from;
    const days = workingDays(from, to);
    if (days.length === 0) days.push(from);
    const weeks = result.weeks.get(task.assigneeId) ?? new Map<string, number>();
    for (const day of days) add(weeks, weekStart(day), remaining / days.length);
    result.weeks.set(task.assigneeId, weeks);
  }
  return result;
}

/** Niveau d'une semaine par rapport à la capacité : libre, chargée (≥ 80 %), surchargée. */
export function loadLevel(hours: number, capacity: number): "free" | "busy" | "over" {
  if (hours > capacity) return "over";
  return hours >= capacity * 0.8 ? "busy" : "free";
}

/** Capacité hebdomadaire lue dans l'URL (heures, 1 à 80), 40 par défaut. */
export function parseCapacity(value: string | undefined): number {
  const hours = Number(value);
  return Number.isFinite(hours) && hours >= 1 && hours <= 80 ? Math.round(hours) : 40;
}
