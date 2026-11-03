// Agrégation des relevés de performance sur une période : docs/architecture.md,
// section 6 (stocks, flux et indicateurs non additifs).
// - flux (impressions, clics, dépense…) : somme ;
// - stock (abonnés) : dernière valeur connue de la période ;
// - non additif (portée, utilisateurs uniques) : valeur relevée pour la
//   période exacte, sinon inconnue.
// Seuls les relevés entièrement compris dans la période comptent ; ceux qui
// débordent d'une borne sont signalés, jamais répartis au prorata.

import { ratio } from "./formulas";

export type Aggregation = "flow" | "stock" | "exact";

export type SnapshotValues = {
  periodStart: string;
  periodEnd: string;
  values: Readonly<Record<string, number | null>>;
};

export type Aggregated<K extends string> = {
  values: Record<K, number | null>;
  /** Relevés entièrement compris dans la période. */
  counted: number;
  /** Relevés à cheval sur une borne : non comptés. */
  straddling: number;
};

export function aggregateSnapshots<K extends string>(
  rows: readonly SnapshotValues[],
  period: { start: string; end: string },
  fields: Readonly<Record<K, Aggregation>>,
): Aggregated<K> {
  const contained = rows.filter((r) => r.periodStart >= period.start && r.periodEnd <= period.end);
  const straddling = rows.filter(
    (r) => r.periodStart <= period.end && r.periodEnd >= period.start && !contained.includes(r),
  ).length;

  const values = {} as Record<K, number | null>;
  for (const key of Object.keys(fields) as K[]) {
    const known = contained.filter((r) => r.values[key] != null);
    switch (fields[key]) {
      case "flow":
        values[key] = known.length === 0 ? null : known.reduce<number>((sum, r) => sum + (r.values[key] as number), 0);
        break;
      case "stock": {
        const latest = known.reduce<SnapshotValues | null>(
          (best, r) => (best === null || r.periodEnd > best.periodEnd ? r : best),
          null,
        );
        values[key] = latest ? (latest.values[key] as number) : null;
        break;
      }
      case "exact": {
        const exact = known.find((r) => r.periodStart === period.start && r.periodEnd === period.end);
        values[key] = exact ? (exact.values[key] as number) : null;
        break;
      }
    }
  }
  return { values, counted: contained.length, straddling };
}

/** Évolution en % par rapport à une valeur de référence ; null si l'une manque ou si la référence vaut 0. */
export function evolution(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return ratio(current - previous, previous, 100);
}
