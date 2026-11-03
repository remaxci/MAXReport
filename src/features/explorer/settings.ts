import { z } from "zod";
import { isIsoDate, periodRange, sameLastYear, shiftPeriod, type Period, type PeriodKind } from "@/lib/periods";
import { seriesPeriods } from "@/lib/metrics/series";
import { isIndicatorKey } from "./catalog";

// Réglages de l'explorateur : ce que l'adresse transporte et ce qu'un tableau de
// bord personnalisé enregistre. Jamais de chiffres : ils sont recalculés à
// chaque affichage, sous les droits de la personne qui regarde.

export const GRANULARITIES = ["week", "month", "quarter"] as const;
export type Granularity = (typeof GRANULARITIES)[number];
export const GRANULARITY_SLUGS: Record<Granularity, string> = { week: "semaine", month: "mois", quarter: "trimestre" };
export const GRANULARITY_LABELS: Record<Granularity, string> = { week: "Semaine", month: "Mois", quarter: "Trimestre" };

export const POINT_CHOICES = [6, 12, 24] as const;

export const COMPARISONS = ["none", "previous", "last_year"] as const;
export type Comparison = (typeof COMPARISONS)[number];
export const COMPARISON_SLUGS: Record<Comparison, string> = { none: "aucune", previous: "precedente", last_year: "annee" };
export const COMPARISON_LABELS: Record<Comparison, string> = {
  none: "Aucune",
  previous: "Période précédente",
  last_year: "Année précédente",
};

export const CHART_TYPES = ["line", "bar", "stacked"] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const CHART_SLUGS: Record<ChartType, string> = { line: "courbe", bar: "barres", stacked: "empile" };
export const CHART_LABELS: Record<ChartType, string> = { line: "Courbe", bar: "Barres", stacked: "Barres empilées (marques)" };

/** Au plus huit marques : jamais plus de séries que la palette n'a de couleurs. */
export const MAX_BRANDS = 8;

export type ExplorerSettings = {
  indicator: string;
  brandIds: string[];
  granularity: Granularity;
  points: number;
  comparison: Comparison;
  chart: ChartType;
};

/** Un graphique enregistré dans un tableau de bord : les réglages, un titre facultatif. */
export const widgetSchema = z.object({
  title: z.string().trim().max(120).optional(),
  indicator: z.string().refine(isIndicatorKey, "Indicateur inconnu."),
  brandIds: z.array(z.uuid()).min(1).max(MAX_BRANDS),
  granularity: z.enum(GRANULARITIES),
  points: z.number().int().refine((n) => (POINT_CHOICES as readonly number[]).includes(n), "Nombre de points invalide."),
  comparison: z.enum(COMPARISONS),
  chart: z.enum(CHART_TYPES),
});
export type Widget = z.infer<typeof widgetSchema>;

/** Au plus douze graphiques par tableau de bord (contrôlé aussi par la base). */
export const MAX_WIDGETS = 12;

/** Graphiques lisibles d'un tableau de bord ; ceux qui ne respectent plus le format sont écartés. */
export function readWidgets(value: unknown): { widgets: Widget[]; invalid: number } {
  const list = Array.isArray(value) ? value : [];
  const widgets: Widget[] = [];
  for (const item of list) {
    const parsed = widgetSchema.safeParse(item);
    if (parsed.success) widgets.push(parsed.data);
  }
  return { widgets, invalid: list.length - widgets.length };
}

type Query = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const fromSlug = <K extends string>(slugs: Record<K, string>, value: string | undefined, fallback: K): K =>
  (Object.entries(slugs) as [K, string][]).find(([, slug]) => slug === value)?.[0] ?? fallback;

/**
 * Réglages lus dans l'adresse. Valeurs inconnues ignorées ; marques désignées
 * par leur adresse (`marques=a&marques=b` ou `marques=a,b`), limitées à celles
 * fournies (celles que l'utilisateur voit), sinon la marque courante.
 */
export function parseSettings(
  query: Query,
  options: { brands: readonly { id: string; slug: string }[]; defaultBrandId: string; defaultIndicator: string },
): ExplorerSettings & { end: string | null } {
  const raw = query.marques;
  const slugs = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(",")).map((s) => s.trim());
  const brandIds = options.brands.filter((b) => slugs.includes(b.slug)).map((b) => b.id).slice(0, MAX_BRANDS);
  const indicator = one(query.indicateur);
  const points = Number(one(query.points));
  const end = one(query.jusquau);
  return {
    indicator: indicator && isIndicatorKey(indicator) ? indicator : options.defaultIndicator,
    brandIds: brandIds.length > 0 ? brandIds : [options.defaultBrandId],
    granularity: fromSlug(GRANULARITY_SLUGS, one(query.decoupage), "month"),
    points: (POINT_CHOICES as readonly number[]).includes(points) ? points : 12,
    comparison: fromSlug(COMPARISON_SLUGS, one(query.comparaison), "none"),
    chart: fromSlug(CHART_SLUGS, one(query.graphique), "line"),
    end: isIsoDate(end) ? end : null,
  };
}

/** Adresse de l'explorateur pour des réglages (ouvrir un graphique d'un tableau de bord). */
export function settingsSearch(settings: ExplorerSettings, brandSlugs: ReadonlyMap<string, string>, end?: string | null): string {
  const params = new URLSearchParams({
    indicateur: settings.indicator,
    decoupage: GRANULARITY_SLUGS[settings.granularity],
    points: String(settings.points),
    comparaison: COMPARISON_SLUGS[settings.comparison],
    graphique: CHART_SLUGS[settings.chart],
  });
  for (const id of settings.brandIds) {
    const slug = brandSlugs.get(id);
    if (slug) params.append("marques", slug);
  }
  if (end) params.set("jusquau", end);
  return params.toString();
}

/**
 * Réglages réellement appliqués : la comparaison porte sur une seule marque
 * (sinon les séries se multiplient) ; l'empilement n'a de sens qu'entre marques,
 * sans comparaison.
 */
export function effectiveSettings(settings: ExplorerSettings): ExplorerSettings & { notes: string[] } {
  const notes: string[] = [];
  let { comparison, chart } = settings;
  if (comparison !== "none" && settings.brandIds.length > 1) {
    comparison = "none";
    notes.push("La comparaison ne s'applique qu'à une seule marque.");
  }
  if (chart === "stacked" && (settings.brandIds.length < 2 || comparison !== "none")) {
    chart = "bar";
    if (settings.brandIds.length >= 2) notes.push("Barres empilées sans comparaison seulement.");
  }
  return { ...settings, comparison, chart, notes };
}

/** Périodes de la série : `points` périodes du découpage, jusqu'à celle qui contient `end`. */
export function explorerPeriods(settings: Pick<ExplorerSettings, "granularity" | "points">, end: string): Period[] {
  return seriesPeriods(periodRange(settings.granularity as PeriodKind, end), settings.points);
}

/** Périodes de comparaison, alignées point par point sur la série. */
export function comparisonPeriods(periods: readonly Period[], comparison: Comparison): Period[] | null {
  switch (comparison) {
    case "none":
      return null;
    case "previous":
      return periods.map((p) => shiftPeriod(p, -periods.length));
    case "last_year":
      return periods.map((p) => sameLastYear(p));
  }
}
