// Périodes de reporting : semaine ISO (du lundi au dimanche), mois, trimestre,
// année. Dates au format AAAA-MM-JJ ; Abidjan étant à UTC+0, tout se calcule
// en UTC.

import { addDays, formatDate } from "@/lib/format";

export const PERIOD_KINDS = ["week", "month", "quarter", "year"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  week: "Semaine",
  month: "Mois",
  quarter: "Trimestre",
  year: "Année",
};

/** Valeurs du paramètre d'URL `periode`. */
export const PERIOD_SLUGS: Record<PeriodKind, string> = {
  week: "semaine",
  month: "mois",
  quarter: "trimestre",
  year: "annee",
};

export type Period = { kind: PeriodKind; start: string; end: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Date AAAA-MM-JJ existante (refuse « 2026-02-30 »). */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function utc(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Lundi de la semaine ISO qui contient la date. */
export function isoWeekStart(date: string): string {
  const day = toDate(date).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** Numéro de semaine ISO (1 à 53) et année ISO correspondante. */
export function isoWeek(date: string): { year: number; week: number } {
  // L'année ISO est celle du jeudi ; la semaine 1 contient le 4 janvier.
  const monday = isoWeekStart(date);
  const year = toDate(addDays(monday, 3)).getUTCFullYear();
  const firstMonday = isoWeekStart(utc(year, 0, 4));
  const week = 1 + Math.round((toDate(monday).getTime() - toDate(firstMonday).getTime()) / (7 * DAY_MS));
  return { year, week };
}

/** Période d'un type donné qui contient la date. */
export function periodRange(kind: PeriodKind, date: string): Period {
  const d = toDate(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  switch (kind) {
    case "week": {
      const start = isoWeekStart(date);
      return { kind, start, end: addDays(start, 6) };
    }
    case "month":
      return { kind, start: utc(year, month, 1), end: utc(year, month + 1, 0) };
    case "quarter": {
      const first = Math.floor(month / 3) * 3;
      return { kind, start: utc(year, first, 1), end: utc(year, first + 3, 0) };
    }
    case "year":
      return { kind, start: utc(year, 0, 1), end: utc(year, 11, 31) };
  }
}

/** Période précédente (delta < 0) ou suivante (delta > 0). */
export function shiftPeriod(period: Period, delta: number): Period {
  const d = toDate(period.start);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  switch (period.kind) {
    case "week":
      return periodRange("week", addDays(period.start, 7 * delta));
    case "month":
      return periodRange("month", utc(year, month + delta, 1));
    case "quarter":
      return periodRange("quarter", utc(year, month + 3 * delta, 1));
    case "year":
      return periodRange("year", utc(year + delta, 0, 1));
  }
}

/**
 * Même période l'année précédente : la même semaine ISO 52 semaines plus tôt
 * (même jour de la semaine), ou le même mois, trimestre, année.
 */
export function sameLastYear(period: Period): Period {
  if (period.kind === "week") return periodRange("week", addDays(period.start, -364));
  const d = toDate(period.start);
  return periodRange(period.kind, utc(d.getUTCFullYear() - 1, d.getUTCMonth(), 1));
}

const MONTH_YEAR = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/** « Semaine 45 · 2 nov. – 8 nov. 2026 », « novembre 2026 », « T4 2026 », « 2026 ». */
export function periodLabel(period: Period): string {
  const d = toDate(period.start);
  switch (period.kind) {
    case "week":
      return `Semaine ${isoWeek(period.start).week} · ${DAY_MONTH.format(d)} – ${formatDate(period.end)}`;
    case "month":
      return MONTH_YEAR.format(d);
    case "quarter":
      return `T${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
    case "year":
      return String(d.getUTCFullYear());
  }
}

/** Période libre (objectifs) : « 1 nov. 2026 – 30 nov. 2026 ». */
export function rangeLabel(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

/** Type de période lu dans l'URL (`semaine`, `mois`…), sinon la valeur par défaut. */
export function parsePeriodKind(value: string | undefined, fallback: PeriodKind): PeriodKind {
  const found = PERIOD_KINDS.find((kind) => PERIOD_SLUGS[kind] === value);
  return found ?? fallback;
}

/** Lundis compris dans [start, end] : les semaines dont la fiche relève de la période. */
export function mondaysBetween(start: string, end: string): string[] {
  const mondays: string[] = [];
  let monday = isoWeekStart(start);
  if (monday < start) monday = addDays(monday, 7);
  for (; monday <= end; monday = addDays(monday, 7)) mondays.push(monday);
  return mondays;
}

/** Part écoulée de la période au jour donné, de 0 à 1 (jour courant inclus). */
export function elapsedShare(start: string, end: string, today: string): number {
  if (today < start) return 0;
  if (today >= end) return 1;
  const total = (toDate(end).getTime() - toDate(start).getTime()) / DAY_MS + 1;
  const elapsed = (toDate(today).getTime() - toDate(start).getTime()) / DAY_MS + 1;
  return elapsed / total;
}
