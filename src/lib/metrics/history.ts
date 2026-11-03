// Historique agrégé et date de bascule : docs/architecture.md, section 6.
// Avant la date de bascule d'une marque, les tableaux de bord lisent
// l'historique importé ; à partir de cette date, les données saisies.
// Jamais les deux sur un même jour.

import { addDays } from "@/lib/format";
import { convert, type Currency, type FxRate } from "./currency";

export type Range = { start: string; end: string };

export type HistoricalRow = {
  userId: string | null;
  metricKey: string;
  currency: string | null;
  value: number;
  start: string;
  end: string;
};

/** Part historique (avant la bascule) et part détaillée (à partir de la bascule) d'une période. */
export function splitAtCutover(period: Range, cutover: string | null): { historical: Range | null; detailed: Range | null } {
  if (!cutover || period.start >= cutover) return { historical: null, detailed: period };
  if (period.end < cutover) return { historical: period, detailed: null };
  return { historical: { start: period.start, end: addDays(cutover, -1) }, detailed: { start: cutover, end: period.end } };
}

/**
 * Total d'équipe d'un indicateur historique sur une plage : seules les lignes
 * entièrement comprises comptent ; les chiffres d'équipe (sans collaborateur)
 * priment, sinon la somme des chiffres individuels. Montants convertis à la
 * date de fin de chaque ligne ; sans taux, exclus et signalés.
 */
export function historicalTeamTotal(
  rows: readonly HistoricalRow[],
  metric: string,
  range: Range,
  options: { currency: Currency; rates: readonly FxRate[] },
): { value: number | null; excludedCurrencies: string[] } {
  const inRange = rows.filter((r) => r.metricKey === metric && r.start >= range.start && r.end <= range.end);
  const team = inRange.filter((r) => r.userId === null);
  const used = team.length > 0 ? team : inRange;
  if (used.length === 0) return { value: null, excludedCurrencies: [] };

  let value = 0;
  const excluded = new Set<string>();
  for (const row of used) {
    if (row.currency === null) {
      value += row.value;
      continue;
    }
    const converted = convert(row.value, row.currency as Currency, options.currency, row.end, options.rates);
    if (converted === null) excluded.add(row.currency);
    else value += converted;
  }
  return { value, excludedCurrencies: [...excluded].sort() };
}

/** Somme de deux parts d'une même période ; inconnue seulement si les deux le sont. */
export function combineParts(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Date de bascule réglée pour la marque (paramètres du module Imports). */
export function readCutover(settings: unknown): string | null {
  const raw = settings && typeof settings === "object" ? (settings as Record<string, unknown>).history_cutover : undefined;
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}
