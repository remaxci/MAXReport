import type { Chart, ChartRow } from "@/features/dashboard/chart-data";
import type { KpiFormat } from "@/features/dashboard/data";
import { availableMetrics, knownActual, METRICS, type ActualRow, type MetricKey } from "@/lib/metrics/actuals";
import type { Currency, FxRate } from "@/lib/metrics/currency";
import { ratio } from "@/lib/metrics/formulas";
import { shares } from "@/lib/metrics/series";
import { can, type Access } from "@/server/authz/permissions";

// Comparaison des commerciaux, sans accès à la base. Mêmes règles que le reste :
// une valeur inconnue reste « — » (jamais 0), et un montant sans taux de change
// est exclu et signalé.

/**
 * Même règle que `metric_actuals` : seuls ces droits donnent les chiffres de chacun.
 * Sans eux, la base regroupe les collègues : aucune comparaison n'est possible.
 */
export function canCompareSellers(access: Access, brandId: string): boolean {
  return can(access, "activities.read_all", brandId) || can(access, "objectives.read_all", brandId);
}

export type Person = { id: string; label: string };

/** Taux de transformation d'un commercial : offres envoyées et abouties. */
export type OfferOutcome = { sent: number; success: number };

export type SellerColumn = { key: string; label: string; format: KpiFormat };
export type SellerRow = { id: string; label: string; values: Record<string, number | null> };
export type SellerComparison = {
  columns: SellerColumn[];
  rows: SellerRow[];
  total: SellerRow;
  excludedCurrencies: string[];
};

export const DEFAULT_SELLER_SORT = "revenue_signed";

const metricColumn = (key: MetricKey): SellerColumn => ({ key, label: METRICS[key].label, format: METRICS[key].money ? "money" : "count" });

/** Colonnes dans l'ordre de lecture : résultat d'abord, puis l'activité qui l'explique. */
export function sellerColumns(enabledModules: readonly string[], options: { offerRate: boolean }): SellerColumn[] {
  const metrics = availableMetrics(enabledModules);
  const has = (metric: MetricKey) => metrics.includes(metric);
  return [
    ...(has("revenue_signed")
      ? [metricColumn("revenue_signed"), { key: "revenue_share", label: "Part du CA", format: "percent" as const }]
      : []),
    ...(has("contracts_signed") ? [metricColumn("contracts_signed")] : []),
    ...(has("revenue_signed") && has("contracts_signed") ? [{ key: "average_deal", label: "Contrat moyen", format: "money" as const }] : []),
    ...(has("offers_sent") ? [metricColumn("offers_sent")] : []),
    ...(has("offers_sent") && options.offerRate ? [{ key: "offer_rate", label: "Taux de transformation", format: "percent" as const }] : []),
    ...(["opportunities_created", "memos_sent", "calls", "emails_sent", "qualified_meetings"] as const).filter(has).map(metricColumn),
  ];
}

/** Commerciaux suivis, plus toute personne ayant un réalisé sur la période. */
export function comparedPeople(tracked: readonly Person[], rows: readonly ActualRow[], labels: ReadonlyMap<string, string>): Person[] {
  const ids = new Set(tracked.map((p) => p.id));
  for (const row of rows) if (row.userId) ids.add(row.userId);
  const known = new Map([...labels, ...tracked.map((p): [string, string] => [p.id, p.label])]);
  return [...ids]
    .map((id) => ({ id, label: known.get(id) ?? "Ancien collaborateur" }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export function buildSellerComparison(input: {
  actuals: readonly ActualRow[];
  people: readonly Person[];
  enabledModules: readonly string[];
  currency: Currency;
  rates: readonly FxRate[];
  date: string;
  /** Résultats des offres par commercial ; absent si le lecteur ne voit pas toutes les offres. */
  outcomes?: ReadonlyMap<string, OfferOutcome>;
}): SellerComparison {
  const { actuals, people, enabledModules, currency, rates, date, outcomes } = input;
  const columns = sellerColumns(enabledModules, { offerRate: outcomes !== undefined });
  const metrics = availableMetrics(enabledModules);
  const options = { currency, rates, date };
  const excluded = new Set<string>();

  const read = (userId: string | null, outcome: OfferOutcome | undefined): Record<string, number | null> => {
    const values: Record<string, number | null> = {};
    for (const metric of metrics) {
      const result = knownActual(actuals, metric, userId, enabledModules, options);
      result.excludedCurrencies.forEach((c) => excluded.add(c));
      values[metric] = result.value;
    }
    values.average_deal = ratio(values.revenue_signed, values.contracts_signed);
    values.offer_rate = outcome ? ratio(outcome.success, outcome.sent, 100) : null;
    return values;
  };

  const rows: SellerRow[] = people.map((person) => ({ id: person.id, label: person.label, values: read(person.id, outcomes?.get(person.id)) }));
  const revenueShares = shares(Object.fromEntries(rows.map((r) => [r.id, r.values.revenue_signed ?? null])));
  for (const row of rows) row.values.revenue_share = revenueShares[row.id] ?? null;

  const allOutcomes = outcomes ? [...outcomes.values()].reduce((a, b) => ({ sent: a.sent + b.sent, success: a.success + b.success }), { sent: 0, success: 0 }) : undefined;
  const total: SellerRow = { id: "total", label: `Total (${rows.length} ${rows.length > 1 ? "commerciaux" : "commercial"})`, values: read(null, allOutcomes) };
  total.values.revenue_share = total.values.revenue_signed ? 100 : null;

  return { columns, rows, total, excludedCurrencies: [...excluded].sort() };
}

/** Du plus grand au plus petit ; une valeur inconnue passe après tout chiffre connu. */
export function sortSellers(rows: readonly SellerRow[], key: string): SellerRow[] {
  return [...rows].sort((a, b) => {
    const [x, y] = [a.values[key] ?? null, b.values[key] ?? null];
    if (x === null && y === null) return a.label.localeCompare(b.label, "fr");
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || a.label.localeCompare(b.label, "fr");
  });
}

/** Tri demandé s'il correspond à une colonne affichée, sinon le CA (ou la première colonne). */
export function readSellerSort(value: string | undefined, columns: readonly SellerColumn[]): string {
  if (value && columns.some((c) => c.key === value)) return value;
  return columns.some((c) => c.key === DEFAULT_SELLER_SORT) ? DEFAULT_SELLER_SORT : (columns[0]?.key ?? DEFAULT_SELLER_SORT);
}

/** Au-delà de huit commerciaux, les suivants sont regroupés : jamais de neuvième couleur. */
export const MAX_SELLER_SERIES = 8;

/**
 * Couleur d'une courbe : elle suit la personne (ordre alphabétique), jamais son
 * classement. Au-delà de la limite, les derniers partagent le créneau « Autres ».
 */
export function sellerSlots(people: readonly Person[]): Map<string, { key: string; label: string; color: number }> {
  const sorted = [...people].sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const grouped = sorted.length > MAX_SELLER_SERIES;
  return new Map(
    sorted.map((person, index) => {
      const color = Math.min(index + 1, MAX_SELLER_SERIES);
      const others = grouped && color === MAX_SELLER_SERIES;
      return [person.id, { key: others ? "autres" : `c${color}`, label: others ? "Autres commerciaux" : person.label, color }];
    }),
  );
}

const sellerRows = (rows: readonly SellerRow[], keys: readonly string[]): ChartRow[] =>
  rows.map((row) => ({ key: row.id, label: row.label, values: Object.fromEntries(keys.map((k) => [k, row.values[k] ?? null])) }));

/** Le CA signé par commercial, seul graphique de comparaison repris au tableau de bord. */
export function sellerRevenueChart(comparison: SellerComparison, currency: Currency): Chart | null {
  if (!comparison.columns.some((c) => c.key === "revenue_signed") || comparison.rows.length === 0) return null;
  return {
    key: "sellers_revenue",
    title: "CA signé par commercial",
    description: "Période affichée ; la part de chacun figure dans le tableau.",
    kind: "hbar",
    format: "money",
    currency,
    rowHeader: "Commercial",
    series: [{ key: "revenue_signed", label: "CA signé", color: 1 }],
    rows: sellerRows(sortSellers(comparison.rows, "revenue_signed"), ["revenue_signed", "revenue_share"]),
    extras: [{ key: "revenue_share", label: "Part du CA", format: "percent" }],
    notes: excludedNote(comparison.excludedCurrencies),
  };
}

export const excludedNote = (currencies: readonly string[]) => (currencies.length > 0 ? [`Montants en ${currencies.join(", ")} exclus faute de taux de change.`] : []);

/** Graphiques de la page de comparaison, à partir du tableau des commerciaux. */
export function sellerCharts(comparison: SellerComparison, currency: Currency): Chart[] {
  const has = (key: string) => comparison.columns.some((c) => c.key === key);
  const rows = comparison.rows;
  if (rows.length === 0) return [];
  const charts: Chart[] = [];

  const revenue = sellerRevenueChart(comparison, currency);
  if (revenue) charts.push(revenue);

  const funnel = (["opportunities_created", "offers_sent", "contracts_signed"] as const).filter(has);
  if (funnel.length > 0) {
    charts.push({
      key: "sellers_funnel",
      title: "Opportunités, offres et contrats par commercial",
      kind: "bar",
      format: "count",
      rowHeader: "Commercial",
      series: funnel.map((metric, index) => ({ key: metric, label: METRICS[metric].label, color: index + 1 })),
      rows: sellerRows(rows, funnel),
      notes: [],
    });
  }

  const contacts = (["calls", "emails_sent"] as const).filter(has);
  if (contacts.length > 0) {
    charts.push({
      key: "sellers_contacts",
      title: "Appels et e-mails par commercial",
      description: "D'après les fiches hebdomadaires soumises : sans fiche, la valeur reste inconnue.",
      kind: "bar",
      format: "count",
      rowHeader: "Commercial",
      series: contacts.map((metric, index) => ({ key: metric, label: METRICS[metric].label, color: index + 1 })),
      rows: sellerRows(rows, contacts),
      notes: [],
    });
  }

  if (has("qualified_meetings")) {
    charts.push({
      key: "sellers_meetings",
      title: "Rendez-vous qualifiés par commercial",
      kind: "hbar",
      format: "count",
      rowHeader: "Commercial",
      series: [{ key: "qualified_meetings", label: METRICS.qualified_meetings.label, color: 1 }],
      rows: sellerRows(sortSellers(rows, "qualified_meetings"), ["qualified_meetings"]),
      notes: [],
    });
  }
  return charts;
}
