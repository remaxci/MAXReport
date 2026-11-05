import type { BrandSummary } from "@/server/authz/context";
import { can, type Access } from "@/server/authz/permissions";
import type { ChartGroupKey } from "./chart-catalog";
import { availableSections, type SectionKey } from "./data";

// Onglets du tableau de bord : un par section ouverte à cette personne (modules
// actifs et droits), puis « Tout ». Chaque onglet ne charge que ce qu'il affiche.

export type DashboardTab = { key: ChartGroupKey | "all"; slug: string; label: string };

const SECTION_TABS: (DashboardTab & { key: ChartGroupKey })[] = [
  { key: "commercial", slug: "commercial", label: "Commercial" },
  { key: "objectives", slug: "objectifs", label: "Objectifs" },
  { key: "social", slug: "reseaux-sociaux", label: "Réseaux sociaux" },
  { key: "campaigns", slug: "campagnes", label: "Campagnes" },
  { key: "websites", slug: "sites-web", label: "Sites web" },
  { key: "budgets", slug: "budgets", label: "Budgets" },
  { key: "planning", slug: "planification", label: "Planification" },
];

const ALL_TAB: DashboardTab = { key: "all", slug: "tout", label: "Tout" };

/** Onglets proposés ; « Tout » seulement s'il y a plusieurs sections à réunir. */
export function dashboardTabs(brand: BrandSummary, access: Access): DashboardTab[] {
  const sections = availableSections(brand, access);
  const planning = brand.enabledModules.includes("planning") && can(access, "planning.read", brand.id);
  const tabs = SECTION_TABS.filter((tab) => (tab.key === "planning" ? planning : sections.includes(tab.key)));
  return tabs.length > 1 ? [...tabs, ALL_TAB] : tabs;
}

/** Onglet demandé dans l'adresse ; par défaut, ou s'il n'est pas ouvert à la personne, le premier. */
export function readDashboardTab(value: string | undefined, tabs: readonly DashboardTab[]): DashboardTab | null {
  return tabs.find((tab) => tab.slug === value) ?? tabs[0] ?? null;
}

/** Sections de chiffres à charger pour un onglet ; `undefined` : toutes celles ouvertes. */
export function tabSections(tab: DashboardTab): SectionKey[] | undefined {
  if (tab.key === "all") return undefined;
  return tab.key === "planning" ? [] : [tab.key];
}

/** Paramètre d'adresse d'un onglet : aucun pour le premier, l'onglet par défaut. */
export function tabParams(tab: DashboardTab | null, tabs: readonly DashboardTab[]): Record<string, string> {
  return tab && tab !== tabs[0] ? { section: tab.slug } : {};
}
