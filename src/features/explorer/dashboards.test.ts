import { describe, expect, it } from "vitest";
import type { Access } from "@/server/authz/permissions";
import { acceptsWidget, canCreateDashboard, canManageDashboard, moveItem } from "./dashboards";

const X = "00000000-0000-4000-9000-00000000000a";
const Y = "00000000-0000-4000-9000-00000000000b";
const access = (global: string[], byBrand: Record<string, string[]>): Access => ({
  global: new Set(global),
  byBrand: new Map(Object.entries(byBrand).map(([k, v]) => [k, new Set(v)])),
});

const manager = { userId: "u-manager", access: access([], { [X]: ["brand.read", "reports.manage"] }) };
const reader = { userId: "u-reader", access: access([], { [X]: ["brand.read"] }) };
const direction = { userId: "u-direction", access: access(["brand.read", "direction.read"], {}) };

describe("droits sur les tableaux personnalisés (mêmes règles que la base)", () => {
  it("créer : reports.manage sur la marque ; un tableau Direction exige la vue Direction", () => {
    expect(canCreateDashboard(manager, X)).toBe(true);
    expect(canCreateDashboard(manager, Y)).toBe(false);
    expect(canCreateDashboard(manager, null)).toBe(false);
    expect(canCreateDashboard(reader, X)).toBe(false);
    expect(canCreateDashboard(direction, null)).toBe(true);
    expect(canCreateDashboard(direction, X)).toBe(false);
  });

  it("modifier : un tableau partagé par tout gestionnaire, un tableau personnel par son auteur seulement", () => {
    const shared = { brandId: X, isShared: true, createdBy: "quelqu-un" };
    const personal = { brandId: X, isShared: false, createdBy: "u-manager" };
    expect(canManageDashboard(manager, shared)).toBe(true);
    expect(canManageDashboard(manager, personal)).toBe(true);
    expect(canManageDashboard({ ...manager, userId: "autre" }, personal)).toBe(false);
    expect(canManageDashboard(reader, shared)).toBe(false);
  });
});

describe("graphiques d'un tableau", () => {
  it("un tableau de marque ne reçoit que sa marque ; un tableau Direction, toutes", () => {
    expect(acceptsWidget({ brandId: X }, { brandIds: [X] })).toBe(true);
    expect(acceptsWidget({ brandId: X }, { brandIds: [Y] })).toBe(false);
    expect(acceptsWidget({ brandId: X }, { brandIds: [X, Y] })).toBe(false);
    expect(acceptsWidget({ brandId: null }, { brandIds: [X, Y] })).toBe(true);
  });

  it("réordonne sans sortir des bornes", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 5, -1)).toEqual(["a", "b", "c"]);
  });
});
