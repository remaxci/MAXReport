import { sumInCurrency } from "@/features/crm/money";
import type { Currency, FxRate } from "@/lib/metrics/currency";
import { pointLabel, pointTitle } from "@/lib/metrics/series";
import type { Period } from "@/lib/periods";
import type { KpiFormat } from "./data";

// Données des graphiques, sans accès à la base : ce que la page envoie au
// composant graphique, et les règles de mise en forme testées à part.

export type ChartKind = "bar" | "stacked" | "line" | "hbar";

/**
 * Une série : sa couleur suit l'entité (créneau 1 à 8 de la palette), jamais son
 * rang ; « muted » pour une série de référence (comparaison), en gris.
 */
export type ChartSeries = { key: string; label: string; color: number | "muted" };

export type ChartRow = { key: string; label: string; title?: string; values: Record<string, number | null> };

/** Colonne du tableau seulement : une autre unité que celle du graphique. */
export type ChartColumn = { key: string; label: string; format: KpiFormat; currency?: string };

export type Chart = {
  key: string;
  title: string;
  description?: string;
  kind: ChartKind;
  format: KpiFormat;
  currency?: string;
  series: ChartSeries[];
  rows: ChartRow[];
  extras?: ChartColumn[];
  /** Titre de la première colonne du tableau, si les lignes ne sont pas des périodes. */
  rowHeader?: string;
  notes: string[];
};

/**
 * Nom d'une catégorie sur l'axe d'un graphique en barres : assez court pour que
 * les noms ne se chevauchent pas à la largeur réelle du graphique. Le nom complet
 * reste dans l'info-bulle et le tableau des valeurs.
 */
export function shortCategory(value: string, count: number, width: number): string {
  const available = width > 0 ? width - 60 : 480;
  const max = Math.max(4, Math.floor(available / Math.max(count, 1) / 7));
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Lignes d'une série temporelle : une par période, valeurs lues par `read`. */
export function timeRows(periods: readonly Period[], read: (period: Period, index: number) => Record<string, number | null>): ChartRow[] {
  return periods.map((period, index) => ({ key: period.start, label: pointLabel(period), title: pointTitle(period), values: read(period, index) }));
}

/**
 * Entonnoir du pipeline : opportunités par étape « en cours », dans l'ordre
 * des étapes. Une étape désactivée n'apparaît que si elle porte encore des
 * opportunités. Montant converti dans la devise cible ; sans taux, exclu et compté.
 */
export function stageFunnel(
  stages: readonly { id: string; label: string; isActive: boolean }[],
  opportunities: readonly { stageId: string; amount: number | null; currency: string | null }[],
  target: Currency,
  date: string,
  rates: readonly FxRate[],
): { rows: ChartRow[]; excluded: number } {
  let excluded = 0;
  const rows: ChartRow[] = [];
  for (const stage of stages) {
    const own = opportunities.filter((o) => o.stageId === stage.id);
    if (!stage.isActive && own.length === 0) continue;
    const known = own.filter((o) => o.amount !== null && o.currency !== null);
    const sum = sumInCurrency(known, target, date, rates);
    excluded += sum.excluded;
    rows.push({
      key: stage.id,
      label: stage.label,
      values: { count: own.length, amount: known.length - sum.excluded > 0 ? sum.total : null },
    });
  }
  return { rows, excluded };
}

/** Clés dont au moins une valeur est connue sur la série (canaux réellement relevés). */
export function knownKeys(rows: readonly ChartRow[], keys: readonly string[]): string[] {
  return keys.filter((key) => rows.some((row) => row.values[key] !== null && row.values[key] !== undefined));
}
