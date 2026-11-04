import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BrandSummary } from "@/server/authz/context";
import { buildAccess, type Permission } from "@/server/authz/permissions";
import { CHART_CATALOG, chartGroups, chartId, hiddenFromForm, isGroupHidden, withoutHidden, type ChartGroupKey } from "./chart-catalog";

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
const ids = (groups: ReturnType<typeof chartGroups>) => groups.flatMap((g) => g.charts.map((c) => c.id));
const READER: Permission[] = ["brand.read", "activities.read_all", "objectives.read_all", "offers.read_all", "memos.read_all", "opportunities.read_all", "contracts.read_all", "marketing.read", "budgets.read", "planning.read"];

describe("catalogue", () => {
  it("identifiants uniques, et conformes à la contrainte de la base", () => {
    const all = (Object.keys(CHART_CATALOG) as ChartGroupKey[]).flatMap((group) => CHART_CATALOG[group].map((c) => chartId(group, c.key)));
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id).toMatch(/^[a-z0-9_.]+$/);
  });

  it("chaque graphique du tableau de bord figure au catalogue : aucun ne manque au filtre", () => {
    const source = readFileSync(new URL("./charts.ts", import.meta.url), "utf8");
    const keys = [...source.matchAll(/^\s+key: "([a-z_]+)",\s*\r?\n\s+title:/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    const catalog = Object.values(CHART_CATALOG).flat().map((c) => c.key);
    for (const key of keys) expect(catalog, key).toContain(key);
    expect(catalog).toContain("sellers_revenue");
  });
});

describe("graphiques proposés", () => {
  it("selon les modules et les droits", () => {
    const reader = ids(chartGroups(brand(), access(READER)));
    expect(reader).toContain("commercial.revenue");
    expect(reader).toContain("commercial.sellers_revenue");
    expect(reader).toContain("planning.projects");
    expect(reader).toContain("social.followers");

    const withoutPlanning = ids(chartGroups(brand(ALL_MODULES.filter((m) => m !== "planning")), access(READER)));
    expect(withoutPlanning).not.toContain("planning.projects");

    const withoutContracts = ids(chartGroups(brand(ALL_MODULES.filter((m) => m !== "contracts")), access(READER)));
    expect(withoutContracts).not.toContain("commercial.revenue");
    expect(withoutContracts).not.toContain("commercial.sellers_revenue");
  });

  it("un commercial ne se voit pas proposer la comparaison", () => {
    const rep = ids(chartGroups(brand(), access(["brand.read", "activities.manage_own", "offers.manage_own", "contracts.manage_own", "opportunities.manage_own"])));
    expect(rep).not.toContain("commercial.sellers_revenue");
    expect(rep).toContain("commercial.revenue");
  });

  it("rien sur une autre marque", () => {
    expect(chartGroups({ ...brand(), id: "y" }, access(READER))).toEqual([]);
  });
});

describe("choix enregistré", () => {
  const groups = chartGroups(brand(), access(READER));

  it("ce qui n'est pas coché est masqué ; le texte reçu n'est jamais retenu", () => {
    const hidden = hiddenFromForm(groups, new Set(["commercial.revenue", "n_importe_quoi", "<script>"]));
    expect(hidden).toContain("commercial.activity");
    expect(hidden).not.toContain("commercial.revenue");
    expect(hidden).not.toContain("n_importe_quoi");
    expect(hidden).not.toContain("<script>");
  });

  it("tout coché : rien de masqué ; un nouveau graphique reste donc visible par défaut", () => {
    expect(hiddenFromForm(groups, new Set(ids(groups)))).toEqual([]);
  });

  it("retire les graphiques masqués, et repère un groupe entièrement masqué", () => {
    const charts = [{ key: "followers" }, { key: "audience" }];
    expect(withoutHidden("social", charts, new Set(["social.followers"]))).toEqual([{ key: "audience" }]);
    const social = groups.find((g) => g.key === "social")!;
    expect(isGroupHidden(social, new Set(["social.followers"]))).toBe(false);
    expect(isGroupHidden(social, new Set(["social.followers", "social.audience"]))).toBe(true);
  });
});
