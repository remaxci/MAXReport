import { addDays } from "@/lib/format";
import { type Month, monthKey, shiftMonth } from "./calendar";
import { isoWeek, weekStart } from "./schedule";

// Gantt : une fenêtre de quelques mois, un jour = une colonne de largeur fixe.
// Les positions sont en jours depuis le début de la fenêtre ; la vue les
// multiplie par la largeur d'un jour.

export const GANTT_MONTHS = 3;

export type GanttWindow = { start: string; end: string; days: number };

const DAY = 86_400_000;
const time = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function ganttWindow(first: Month, months = GANTT_MONTHS): GanttWindow {
  const start = `${monthKey(first)}-01`;
  const last = shiftMonth(first, months - 1);
  const end = new Date(Date.UTC(last.year, last.month, 0)).toISOString().slice(0, 10);
  return { start, end, days: Math.round((time(end) - time(start)) / DAY) + 1 };
}

/** Jours écoulés entre le début de la fenêtre et `date` (négatif avant). */
export function dayOffset(date: string, window: GanttWindow): number {
  return Math.round((time(date) - time(window.start)) / DAY);
}

/** Période d'une tâche : son début et son échéance, l'un complétant l'autre. */
export function taskSpan(task: { startOn: string | null; dueOn: string | null }): { start: string; end: string } | null {
  const start = task.startOn ?? task.dueOn;
  const end = task.dueOn ?? task.startOn;
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

export type GanttBar = { from: number; to: number; clippedStart: boolean; clippedEnd: boolean };

/**
 * Barre d'une période, en jours : `from` inclus, `to` exclu (la fin est incluse
 * dans la barre). Coupée aux bords ; null si entièrement hors de la fenêtre.
 */
export function ganttBar(span: { start: string; end: string }, window: GanttWindow): GanttBar | null {
  if (span.end < window.start || span.start > window.end) return null;
  return {
    from: Math.max(dayOffset(span.start, window), 0),
    to: Math.min(dayOffset(span.end, window) + 1, window.days),
    clippedStart: span.start < window.start,
    clippedEnd: span.end > window.end,
  };
}

const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Repères : mois (avec leur largeur) et lundis de la fenêtre (avec leur numéro de semaine). */
export function ganttTicks(window: GanttWindow): {
  months: { label: string; from: number; days: number }[];
  weeks: { date: string; week: number; at: number }[];
} {
  const months: { label: string; from: number; days: number }[] = [];
  for (let day = window.start; day <= window.end; ) {
    const date = new Date(`${day}T00:00:00Z`);
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const label = MONTH_LABEL.format(date);
    const from = dayOffset(day, window);
    months.push({ label: label.charAt(0).toUpperCase() + label.slice(1), from, days: Math.min(dayOffset(next, window), window.days) - from });
    day = next;
  }
  const weeks: { date: string; week: number; at: number }[] = [];
  let monday = weekStart(window.start);
  if (monday < window.start) monday = addDays(monday, 7);
  for (; monday <= window.end; monday = addDays(monday, 7)) {
    weeks.push({ date: monday, week: isoWeek(monday), at: dayOffset(monday, window) });
  }
  return { months, weeks };
}

/**
 * Trait coudé d'une dépendance, en pixels : de la fin du prédécesseur
 * (x1, y1) au début de la tâche qui l'attend (x2, y2).
 */
export function connectorPath(x1: number, y1: number, x2: number, y2: number, gap = 8): string {
  if (x2 - x1 >= gap * 2) {
    const mid = x1 + gap;
    return `M${x1} ${y1} H${mid} V${y2} H${x2}`;
  }
  // La tâche commence avant la fin de son prédécesseur : le trait contourne par l'entre-deux des lignes.
  const middle = (y1 + y2) / 2;
  return `M${x1} ${y1} H${x1 + gap} V${middle} H${x2 - gap} V${y2} H${x2}`;
}
