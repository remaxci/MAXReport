import { describe, expect, it } from "vitest";
import type { BrandSummary } from "@/server/authz/context";
import { buildAccess, type Permission } from "@/server/authz/permissions";
import { dashboardTabs, readDashboardTab, tabParams, tabSections } from "./tabs";

const ALL_MODULES = ["social", "campaigns", "websites", "activities", "crm", "offers", "memos", "contracts", "objectives", "budgets", "reports", "imports", "planning"];
const brand = (modules: string[] = ALL_MODULES): BrandSummary => ({
  id: "x",
  code: "X",
  slug: "x",
  name: "X",
  primaryColor: null,
  reportingCurrency: "XOF",
  isActive: true,
  enabledModules: modules,
});
const access = (permissions: Permission[]) => buildAccess([{ brandId: "x", permissions }]);
const READER: Permission[] = ["brand.read", "marketing.read", "budgets.read", "planning.read"];
const slugs = (tabs: ReturnType<typeof dashboardTabs>) => tabs.map((t) => t.slug);

describe("onglets proposés", () => {
  it("un par section ouverte, dans l'ordre du tableau de bord, puis Tout", () => {
    expect(slugs(dashboardTabs(brand(), access(READER)))).toEqual([
      "commercial",
      "objectifs",
      "reseaux-sociaux",
      "campagnes",
      "sites-web",
      "budgets",
      "planification",
      "tout",
    ]);
  });

  it("selon les modules activés", () => {
    const tabs = slugs(dashboardTabs(brand(ALL_MODULES.filter((m) => m !== "social" && m !== "planning")), access(READER)));
    expect(tabs).not.toContain("reseaux-sociaux");
    expect(tabs).not.toContain("planification");
    expect(tabs).toContain("campagnes");
  });

  it("selon les droits : pas de marketing, de budgets ni de planification sans leur permission", () => {
    const tabs = slugs(dashboardTabs(brand(), access(["brand.read"])));
    expect(tabs).toEqual(["commercial", "objectifs", "tout"]);
  });

  it("une seule section : pas d'onglet Tout ; aucune : aucun onglet", () => {
    expect(slugs(dashboardTabs(brand(["contracts"]), access(["brand.read"])))).toEqual(["commercial"]);
    expect(dashboardTabs({ ...brand(), id: "y" }, access(READER))).toEqual([]);
  });
});

describe("onglet demandé", () => {
  const tabs = dashboardTabs(brand(), access(READER));

  it("lu dans l'adresse ; sinon le premier", () => {
    expect(readDashboardTab("campagnes", tabs)?.key).toBe("campaigns");
    expect(readDashboardTab(undefined, tabs)?.key).toBe("commercial");
  });

  it("une section non ouverte ou inconnue redonne le premier onglet, sans rien afficher de plus", () => {
    const restricted = dashboardTabs(brand(), access(["brand.read"]));
    expect(readDashboardTab("budgets", restricted)?.key).toBe("commercial");
    expect(readDashboardTab("n-importe-quoi", restricted)?.key).toBe("commercial");
    expect(readDashboardTab("commercial", [])).toBeNull();
  });

  it("charge seulement la section de l'onglet", () => {
    expect(tabSections(readDashboardTab("campagnes", tabs)!)).toEqual(["campaigns"]);
    expect(tabSections(readDashboardTab("planification", tabs)!)).toEqual([]);
    expect(tabSections(readDashboardTab("tout", tabs)!)).toBeUndefined();
  });

  it("l'onglet par défaut n'allonge pas l'adresse", () => {
    expect(tabParams(tabs[0], tabs)).toEqual({});
    expect(tabParams(readDashboardTab("tout", tabs), tabs)).toEqual({ section: "tout" });
    expect(tabParams(null, [])).toEqual({});
  });
});
