// Séries temporelles des graphiques : périodes consécutives qui se terminent
// par la période affichée. Chaque point se calcule avec les mêmes règles que
// les indicateurs (flux additionnés, stocks en dernière valeur connue, valeurs
// non additives sur la période exacte seulement). Une valeur inconnue reste
// null : un trou dans la courbe, jamais un 0.

import { daysInRange, isoWeek, periodLabel, periodRange, rangeLabel, shiftPeriod, type Period, type PeriodKind } from "@/lib/periods";
import { addDays } from "@/lib/format";

/** Nombre de points d'une série selon le découpage de la période affichée. */
export const SERIES_LENGTH: Record<PeriodKind, number> = { week: 13, month: 12, quarter: 8, year: 5 };

/**
 * Découpage d'un intervalle libre : les graphiques en montrent l'évolution à
 * l'intérieur, par semaine, mois, trimestre ou année selon sa durée. Le premier
 * et le dernier point sont coupés aux bornes de l'intervalle.
 */
export function rangePoints(period: Period): Period[] {
  const days = daysInRange(period.start, period.end);
  const kind: PeriodKind = days <= 92 ? "week" : days <= 732 ? "month" : days <= 2196 ? "quarter" : "year";
  const points: Period[] = [];
  for (let cursor = period.start; cursor <= period.end; ) {
    const full = periodRange(kind, cursor);
    points.push({ kind, start: cursor, end: full.end < period.end ? full.end : period.end });
    cursor = addDays(full.end, 1);
  }
  return points;
}

/** Périodes de la série, de la plus ancienne à `last` incluse ; pour un intervalle, ses points. */
export function seriesPeriods(last: Period, count?: number): Period[] {
  if (last.kind === "range") return rangePoints(last);
  const length = count ?? SERIES_LENGTH[last.kind];
  return Array.from({ length }, (_, i) => shiftPeriod(last, i - (length - 1)));
}

const SHORT_MONTH = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

/** Libellé court d'un point sur l'axe : « S45 », « nov. 26 », « T4 26 », « 2026 ». */
export function pointLabel(period: Period): string {
  const date = new Date(`${period.start}T00:00:00Z`);
  const year = String(date.getUTCFullYear());
  switch (period.kind) {
    case "range":
      return rangeLabel(period.start, period.end);
    case "week":
      return `S${isoWeek(period.start).week}`;
    case "month":
      return `${SHORT_MONTH.format(date)} ${year.slice(2)}`;
    case "quarter":
      return `T${Math.floor(date.getUTCMonth() / 3) + 1} ${year.slice(2)}`;
    case "year":
      return year;
  }
}

/** Libellé complet d'un point (info-bulle, tableau) : celui de la période. */
export function pointTitle(period: Period): string {
  // Point coupé aux bornes d'un intervalle : ses dates exactes, pas le mois entier.
  if (period.kind !== "range") {
    const full = periodRange(period.kind, period.start);
    if (full.start !== period.start || full.end !== period.end) return rangeLabel(period.start, period.end);
  }
  const label = periodLabel(period);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Somme des valeurs connues ; null si aucune ne l'est (jamais 0 par défaut). */
export function sumKnown(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter((v): v is number => v !== null && v !== undefined);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/**
 * Part de chaque entrée dans le total des valeurs connues, en %. null pour une
 * valeur inconnue, ou pour toutes si le total est inconnu ou nul.
 */
export function shares(values: Readonly<Record<string, number | null>>): Record<string, number | null> {
  const total = sumKnown(Object.values(values));
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === null || total === null || total === 0 ? null : (value / total) * 100]),
  );
}

/** Vrai si au moins une valeur des clés données est connue sur l'un des points. */
export function hasKnownValue(rows: readonly { values: Readonly<Record<string, number | null>> }[], keys: readonly string[]): boolean {
  return rows.some((row) => keys.some((key) => row.values[key] !== null && row.values[key] !== undefined));
}
