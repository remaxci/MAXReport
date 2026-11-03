import { describe, expect, it } from "vitest";
import type { BrandSummary } from "@/server/authz/context";
import { buildAccess } from "@/server/authz/permissions";
import { availableSections } from "./data";

const brand = (modules: string[]): BrandSummary => ({
  id: "brand-x",
  code: "X",
  slug: "x",
  name: "Marque X",
  primaryColor: null,
  reportingCurrency: "XOF",
  isActive: true,
  enabledModules: modules,
});
const ALL = ["activities", "crm", "offers", "memos", "contracts", "objectives", "social", "campaigns", "websites", "budgets"];

describe("availableSections", () => {
  it("montre à un commercial le commercial et les objectifs, jamais le marketing ni les budgets", () => {
    const rep = buildAccess([{ brandId: "brand-x", permissions: ["brand.read", "activities.manage_own"] }]);
    expect(availableSections(brand(ALL), rep)).toEqual(["commercial", "objectives"]);
  });

  it("montre tout à la lecture de la marque qui détient les droits de lecture", () => {
    const viewer = buildAccess([{ brandId: "brand-x", permissions: ["brand.read", "marketing.read", "budgets.read"] }]);
    expect(availableSections(brand(ALL), viewer)).toEqual(["commercial", "objectives", "social", "campaigns", "websites", "budgets"]);
  });

  it("cache les sections dont le module est désactivé", () => {
    const viewer = buildAccess([{ brandId: "brand-x", permissions: ["brand.read", "marketing.read", "budgets.read"] }]);
    expect(availableSections(brand(["social", "budgets"]), viewer)).toEqual(["social", "budgets"]);
  });

  it("ne montre rien d'une autre marque", () => {
    const other = buildAccess([{ brandId: "brand-y", permissions: ["brand.read", "marketing.read"] }]);
    expect(availableSections(brand(ALL), other)).toEqual([]);
  });
});
