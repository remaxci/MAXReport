import { canCompareSellers } from "@/features/sellers/comparison";
import { availableMetrics } from "@/lib/metrics/actuals";
import type { BrandSummary } from "@/server/authz/context";
import { can, type Access, type Permission } from "@/server/authz/permissions";
import { availableSections, SECTION_LABELS, type SectionKey } from "./data";

// Graphiques que chacun peut choisir d'afficher sur son tableau de bord. La liste
// ne suit que les modules et les droits : masquer un graphique n'enlève aucun
// droit, et ce choix n'ouvre aucune donnée (les graphiques restent lus sous la RLS).

export type ChartGroupKey = SectionKey | "planning";

export const chartId = (group: ChartGroupKey, key: string) => `${group}.${key}`;

const OPPORTUNITY_READ: Permission[] = ["opportunities.read_all", "opportunities.manage_all", "opportunities.manage_own"];

export const CHART_CATALOG: Record<ChartGroupKey, { key: string; label: string }[]> = {
  commercial: [
    { key: "revenue", label: "Chiffre d'affaires signé" },
    { key: "activity", label: "Opportunités, offres et contrats" },
    { key: "pipeline", label: "Pipeline par étape" },
    { key: "sellers_revenue", label: "CA signé par commercial" },
  ],
  objectives: [{ key: "objectives", label: "Taux d'atteinte des objectifs d'équipe" }],
  social: [
    { key: "accounts", label: "Nouveaux abonnés par compte" },
    { key: "followers", label: "Abonnés" },
    { key: "audience", label: "Impressions et interactions" },
  ],
  campaigns: [
    { key: "by_campaign_spend", label: "Dépense par campagne" },
    { key: "by_campaign_clicks", label: "Clics par campagne" },
    { key: "leads", label: "Leads des campagnes" },
    { key: "spend", label: "Dépense relevée des campagnes" },
  ],
  websites: [{ key: "sessions", label: "Sessions (par canal)" }],
  budgets: [{ key: "budgets", label: "Budgets : prévu, engagé, payé" }],
  planning: [{ key: "projects", label: "Avancement des projets" }],
};

export const CHART_GROUP_LABELS: Record<ChartGroupKey, string> = { ...SECTION_LABELS, planning: "Planification" };

export type ChartGroup = { key: ChartGroupKey; label: string; charts: { id: string; label: string }[] };

/** Graphiques proposés à cette personne pour cette marque, par groupe. */
export function chartGroups(brand: BrandSummary, access: Access): ChartGroup[] {
  const metrics = availableMetrics(brand.enabledModules);
  const opportunities = brand.enabledModules.includes("crm") && OPPORTUNITY_READ.some((p) => can(access, p, brand.id));
  const offered: Partial<Record<string, boolean>> = {
    "commercial.revenue": metrics.includes("revenue_signed"),
    "commercial.activity": metrics.some((m) => m === "opportunities_created" || m === "offers_sent" || m === "contracts_signed"),
    "commercial.pipeline": opportunities,
    "commercial.sellers_revenue": metrics.includes("revenue_signed") && canCompareSellers(access, brand.id),
  };
  const keys: ChartGroupKey[] = [...availableSections(brand, access)];
  if (brand.enabledModules.includes("planning") && can(access, "planning.read", brand.id)) keys.push("planning");
  return keys.flatMap((key) => {
    const charts = CHART_CATALOG[key].map((c) => ({ id: chartId(key, c.key), label: c.label })).filter((c) => offered[c.id] !== false);
    return charts.length > 0 ? [{ key, label: CHART_GROUP_LABELS[key], charts }] : [];
  });
}

/** Graphiques à masquer d'après le formulaire : ce qui est proposé et n'a pas été coché. */
export function hiddenFromForm(groups: readonly ChartGroup[], visible: ReadonlySet<string>): string[] {
  return groups.flatMap((g) => g.charts.map((c) => c.id)).filter((id) => !visible.has(id));
}

/** Retire les graphiques masqués d'une liste. */
export function withoutHidden<T extends { key: string }>(group: ChartGroupKey, charts: readonly T[], hidden: ReadonlySet<string>): T[] {
  return charts.filter((chart) => !hidden.has(chartId(group, chart.key)));
}

/** Vrai si tous les graphiques du groupe sont masqués : inutile de les charger. */
export function isGroupHidden(group: ChartGroup, hidden: ReadonlySet<string>): boolean {
  return group.charts.every((c) => hidden.has(c.id));
}
