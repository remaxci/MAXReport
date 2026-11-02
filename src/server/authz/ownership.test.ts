import { describe, expect, it } from "vitest";
import { OPPORTUNITY_PERMISSIONS, ownedAccess } from "./ownership";
import { buildAccess } from "./permissions";

const brand = "brand-x";

describe("ownedAccess", () => {
  it("un commercial ne gère que ses fiches", () => {
    const rep = ownedAccess(buildAccess([{ brandId: brand, permissions: ["opportunities.manage_own"] }]), OPPORTUNITY_PERMISSIONS, brand);
    expect(rep).toMatchObject({ canRead: true, readAll: false, canCreate: true, canAssign: false });
    expect(rep.canManage("moi", "moi")).toBe(true);
    expect(rep.canManage("autre", "moi")).toBe(false);
  });

  it("le responsable voit, gère et réattribue tout", () => {
    const manager = ownedAccess(
      buildAccess([{ brandId: brand, permissions: ["opportunities.read_all", "opportunities.manage_all"] }]),
      OPPORTUNITY_PERMISSIONS,
      brand,
    );
    expect(manager).toMatchObject({ canRead: true, readAll: true, canCreate: true, canAssign: true });
    expect(manager.canManage("autre", "moi")).toBe(true);
  });

  it("la lecture seule ne crée ni ne modifie", () => {
    const viewer = ownedAccess(buildAccess([{ brandId: brand, permissions: ["opportunities.read_all"] }]), OPPORTUNITY_PERMISSIONS, brand);
    expect(viewer).toMatchObject({ canRead: true, readAll: true, canCreate: false, canAssign: false });
    expect(viewer.canManage("moi", "moi")).toBe(false);
  });

  it("aucun droit sur une autre marque", () => {
    const rep = ownedAccess(buildAccess([{ brandId: brand, permissions: ["opportunities.manage_own"] }]), OPPORTUNITY_PERMISSIONS, "brand-y");
    expect(rep.canRead).toBe(false);
  });
});
