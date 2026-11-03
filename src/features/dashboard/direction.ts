import { getFxRates } from "@/features/fx/queries";
import { availableMetrics } from "@/lib/metrics/actuals";
import { seriesPeriods, shares, sumKnown } from "@/lib/metrics/series";
import type { Period } from "@/lib/periods";
import type { BrandSummary } from "@/server/authz/context";
import type { Access } from "@/server/authz/permissions";
import { timeRows, type Chart } from "./chart-data";
import { commercialSeries } from "./charts";
import { availableSections, loadDashboard, type SectionKey } from "./data";
import type { DirectionColumn, DirectionRow } from "./export";

// Vue Direction : mêmes indicateurs que les tableaux de bord de marque, en XOF
// (devise de reporting de la Direction), puis le total consolidé. Seuls des
// flux s'additionnent entre marques ; la RLS s'applique à chaque marque.

const COLUMNS: (DirectionColumn & { section: SectionKey; kpi: string })[] = [
  { section: "commercial", kpi: "revenue_signed", key: "commercial.revenue_signed", label: "CA signé (XOF)", format: "money" },
  { section: "commercial", kpi: "contracts_signed", key: "commercial.contracts_signed", label: "Contrats signés", format: "count" },
  { section: "commercial", kpi: "opportunities_created", key: "commercial.opportunities_created", label: "Opportunités créées", format: "count" },
  { section: "commercial", kpi: "offers_sent", key: "commercial.offers_sent", label: "Offres envoyées", format: "count" },
  { section: "campaigns", kpi: "spend", key: "campaigns.spend", label: "Dépense campagnes (XOF)", format: "money" },
  { section: "campaigns", kpi: "leads", key: "campaigns.leads", label: "Leads", format: "count" },
  { section: "budgets", kpi: "engaged", key: "budgets.engaged", label: "Budget engagé (XOF)", format: "money" },
];
export const DIRECTION_COLUMNS: DirectionColumn[] = COLUMNS.map(({ key, label, format }) => ({ key, label, format }));

export async function loadDirection(brands: BrandSummary[], access: Access, period: Period): Promise<{ rows: DirectionRow[]; total: DirectionRow }> {
  const rates = await getFxRates();
  const rows = await Promise.all(
    brands.map(async (brand): Promise<DirectionRow> => {
      const sections = await loadDashboard({
        brand,
        access,
        period,
        currency: "XOF",
        sections: ["commercial", "campaigns", "budgets"],
        rates,
      });
      const values: Record<string, number | null> = {};
      for (const column of COLUMNS) {
        const section = sections.find((s) => s.key === column.section);
        values[column.key] = section?.kpis.find((k) => k.key === column.kpi)?.value ?? null;
      }
      // Seules les réserves qui affectent les totaux remontent dans la vue consolidée.
      const notes = sections.flatMap((s) => s.notes.filter((n) => n.includes("taux de change") || n.includes("historique")));
      return { label: brand.name, values, notes };
    }),
  );
  const values: Record<string, number | null> = {};
  for (const column of COLUMNS) {
    const known = rows.map((r) => r.values[column.key]).filter((v): v is number => v !== null && v !== undefined);
    values[column.key] = known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
  }
  return { rows, total: { label: `Total (${brands.length} marque(s))`, values, notes: [] } };
}

/** Au-delà de huit marques, les suivantes sont regroupées : jamais de neuvième couleur. */
const MAX_BRAND_SERIES = 8;

/**
 * Graphiques de la vue Direction (montants en XOF) : CA signé par marque sur la
 * période, avec la part de chacune, puis la tendance consolidée empilée par
 * marque. Dans la tendance, la couleur d'une marque suit son rang dans la liste
 * des marques actives : elle ne change pas quand une autre marque manque.
 */
export async function loadDirectionCharts(brands: BrandSummary[], access: Access, period: Period, rows: DirectionRow[]): Promise<Chart[]> {
  const rates = await getFxRates();
  const measured = brands.filter((b) => availableSections(b, access).includes("commercial") && availableMetrics(b.enabledModules).includes("revenue_signed"));
  const revenue = Object.fromEntries(brands.map((b, i) => [b.id, rows[i]?.values["commercial.revenue_signed"] ?? null]));
  const part = shares(Object.fromEntries(measured.map((b) => [b.id, revenue[b.id]])));
  const slot = new Map(brands.map((b, i) => [b.id, Math.min(i + 1, MAX_BRAND_SERIES)]));
  const grouped = brands.length > MAX_BRAND_SERIES;
  const seriesKey = (b: BrandSummary) => (grouped && slot.get(b.id) === MAX_BRAND_SERIES ? "autres" : `m${slot.get(b.id)}`);
  const missing = brands.filter((b) => !measured.includes(b)).map((b) => b.name);
  const notes = missing.length > 0 ? [`Sans contrats suivis (module ou droits) : ${missing.join(", ")}.`] : [];

  const periods = seriesPeriods(period);
  const perBrand = await Promise.all(measured.map((brand) => commercialSeries({ brand, periods, currency: "XOF", rates }, ["revenue_signed"])));
  const excluded = perBrand.flatMap((s) => s.excluded);
  const series = [...new Map(measured.map((b) => [seriesKey(b), b])).values()].map((b) => ({
    key: seriesKey(b),
    label: seriesKey(b) === "autres" ? "Autres marques" : b.name,
    color: slot.get(b.id)!,
  }));

  return [
    {
      key: "brand-revenue",
      title: "CA signé par marque (XOF)",
      description: "Période affichée ; la part de chaque marque figure dans le tableau.",
      kind: "hbar",
      format: "money",
      currency: "XOF",
      series: [{ key: "revenue", label: "CA signé", color: 1 }],
      rows: measured.map((b) => ({ key: b.id, label: b.name, values: { revenue: revenue[b.id], share: part[b.id] } })),
      extras: [{ key: "share", label: "Part", format: "percent" }],
      notes,
    },
    {
      key: "revenue-trend",
      title: "CA signé consolidé (XOF)",
      description: "Empilé par marque : la hauteur totale est le CA du groupe.",
      kind: "stacked",
      format: "money",
      currency: "XOF",
      series,
      rows: timeRows(periods, (_, i) => {
        const values: Record<string, number | null> = Object.fromEntries(series.map((s) => [s.key, null]));
        measured.forEach((b, j) => {
          const key = seriesKey(b);
          values[key] = sumKnown([values[key], perBrand[j].values[i].revenue_signed]);
        });
        return values;
      }),
      notes: [...new Set(excluded)].length > 0 ? [`Montants en ${[...new Set(excluded)].sort().join(", ")} exclus faute de taux de change.`] : [],
    },
  ];
}
