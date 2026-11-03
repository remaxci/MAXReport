import { timeRows, type Chart, type ChartColumn, type ChartSeries } from "@/features/dashboard/chart-data";
import { commercialSeries, snapshotSeries } from "@/features/dashboard/charts";
import { getFxRates } from "@/features/fx/queries";
import { formatDate } from "@/lib/format";
import type { Currency, FxRate } from "@/lib/metrics/currency";
import { sumKnown } from "@/lib/metrics/series";
import { evolution } from "@/lib/metrics/snapshots";
import { periodLabel, type Period } from "@/lib/periods";
import type { BrandSummary } from "@/server/authz/context";
import type { Access } from "@/server/authz/permissions";
import { findIndicator, indicatorAvailable, type Indicator } from "./catalog";
import {
  COMPARISON_LABELS,
  comparisonPeriods,
  effectiveSettings,
  explorerPeriods,
  type ExplorerSettings,
} from "./settings";

const GRANULARITY_PLURALS = { week: "semaines", month: "mois", quarter: "trimestres" } as const;

// Calcul d'un graphique de l'explorateur : mêmes fonctions que les tableaux de
// bord, sous les droits de la personne qui regarde.

export type Exploration = {
  chart: Chart;
  indicator: Indicator;
  applied: ExplorerSettings;
  measured: BrandSummary[];
};

/** Couleur de chaque marque : son rang dans la liste des marques visibles (elle ne change pas avec la sélection). */
function brandSlots(all: readonly BrandSummary[], chosen: readonly BrandSummary[]): Map<string, number> {
  const slots = new Map<string, number>();
  const used = new Set<number>();
  for (const brand of chosen) {
    const wanted = all.findIndex((b) => b.id === brand.id) + 1;
    const slot = wanted >= 1 && wanted <= 8 && !used.has(wanted) ? wanted : [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !used.has(s))!;
    used.add(slot);
    slots.set(brand.id, slot);
  }
  return slots;
}

async function brandValues(
  indicator: Indicator,
  input: { brand: BrandSummary; periods: readonly Period[]; currency: Currency; rates: readonly FxRate[] },
): Promise<{ values: (number | null)[]; notes: string[] }> {
  if (indicator.source.kind === "metric") {
    const metric = indicator.source.metric;
    const { values, excluded, cutover } = await commercialSeries(input, [metric]);
    const notes = [
      ...(cutover && input.periods[0].start < cutover ? [`${input.brand.name} : historique importé avant le ${formatDate(cutover)}.`] : []),
      ...(excluded.length > 0 ? [`${input.brand.name} : montants en ${[...new Set(excluded)].sort().join(", ")} exclus faute de taux de change.`] : []),
    ];
    return { values: values.map((v) => v[metric]), notes };
  }
  const { snapshot, field, money } = indicator.source;
  const result = await snapshotSeries(input, snapshot, field, money);
  return { values: result.values, notes: result.notes.map((n) => `${input.brand.name} : ${n}`) };
}

/**
 * Graphique de l'explorateur. `brands` : marques actives visibles par
 * l'utilisateur ; une marque choisie qu'il ne voit pas, ou où l'indicateur n'est
 * pas mesurable (module, droits), est écartée et signalée. null : indicateur inconnu.
 */
export async function loadExploration(
  settings: ExplorerSettings,
  input: { brands: BrandSummary[]; access: Access; end: string; title?: string },
): Promise<Exploration | null> {
  const indicator = findIndicator(settings.indicator);
  if (!indicator) return null;
  const applied = effectiveSettings(settings);
  const chosen = applied.brandIds.map((id) => input.brands.find((b) => b.id === id)).filter((b): b is BrandSummary => b !== undefined);
  const measured = chosen.filter((b) => indicatorAvailable(indicator, b, input.access));
  const notes = [...applied.notes];
  const hidden = applied.brandIds.length - chosen.length;
  if (hidden > 0) notes.push(`${hidden} marque(s) non accessible(s) : écartée(s).`);
  const skipped = chosen.filter((b) => !measured.includes(b)).map((b) => b.name);
  if (skipped.length > 0) notes.push(`Indicateur non suivi pour : ${skipped.join(", ")} (module ou droits).`);

  const currency: Currency = indicator.format === "money" && measured.length === 1 ? ((measured[0].reportingCurrency || "XOF") as Currency) : "XOF";
  const periods = explorerPeriods(applied, input.end);
  const compared = measured.length === 1 ? comparisonPeriods(periods, applied.comparison) : null;
  const rates = await getFxRates();

  const current = await Promise.all(measured.map((brand) => brandValues(indicator, { brand, periods, currency, rates })));
  const comparison = compared ? await brandValues(indicator, { brand: measured[0], periods: compared, currency, rates }) : null;
  notes.push(...current.flatMap((c) => c.notes), ...(comparison?.notes ?? []));

  const slots = brandSlots(input.brands, measured);
  const series: ChartSeries[] = measured.map((b) => ({ key: `m${slots.get(b.id)}`, label: b.name, color: slots.get(b.id)! }));
  if (comparison) {
    series.push({ key: "comparaison", label: `${measured[0].name} · ${COMPARISON_LABELS[applied.comparison].toLowerCase()}`, color: "muted" });
  }
  const extras: ChartColumn[] = [];
  const money = indicator.format === "money" ? { currency } : {};
  if (measured.length > 1) extras.push({ key: "total", label: "Total", format: indicator.format, ...money });
  if (comparison) extras.push({ key: "evolution", label: "Évolution", format: "percent" });

  const rows = timeRows(periods, (_, i) => {
    const values: Record<string, number | null> = Object.fromEntries(measured.map((b, j) => [`m${slots.get(b.id)}`, current[j].values[i]]));
    if (measured.length > 1) values.total = sumKnown(measured.map((_, j) => current[j].values[i]));
    if (comparison) {
      values.comparaison = comparison.values[i];
      values.evolution = evolution(current[0]?.values[i] ?? null, comparison.values[i]);
    }
    return values;
  });

  const chart: Chart = {
    key: "exploration",
    title: input.title?.trim() || indicator.label,
    description: [
      indicator.group,
      `${periods.length} ${GRANULARITY_PLURALS[applied.granularity]} jusqu'à ${periodLabel(periods[periods.length - 1])}`,
      ...(indicator.format === "money" ? [`montants en ${currency}`] : []),
    ].join(" · "),
    kind: applied.chart,
    format: indicator.format,
    ...money,
    series,
    rows,
    extras,
    notes: [...new Set(notes)],
  };
  return { chart, indicator, applied, measured };
}
