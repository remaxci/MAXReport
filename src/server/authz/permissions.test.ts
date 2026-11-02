import { describe, expect, it } from "vitest";
import { buildAccess, can, canAssignRole, canSomewhere } from "./permissions";

const BRAND_X = "brand-x";
const BRAND_Y = "brand-y";

const brandAdminX = buildAccess([
  {
    brandId: BRAND_X,
    permissions: ["brand.read", "brand.settings", "members.read", "members.manage"],
  },
]);

const direction = buildAccess([
  { brandId: null, permissions: ["brand.read", "members.read", "audit.read"] },
]);

describe("can", () => {
  it("accorde une permission sur la marque affectée", () => {
    expect(can(brandAdminX, "members.manage", BRAND_X)).toBe(true);
  });

  it("isole les marques entre elles", () => {
    expect(can(brandAdminX, "brand.read", BRAND_Y)).toBe(false);
  });

  it("refuse une permission de marque sans marque précisée", () => {
    expect(can(brandAdminX, "members.manage")).toBe(false);
  });

  it("étend un rôle global à toutes les marques", () => {
    expect(can(direction, "brand.read", BRAND_X)).toBe(true);
    expect(can(direction, "brand.read", BRAND_Y)).toBe(true);
    expect(can(direction, "brand.read")).toBe(true);
  });

  it("ne donne pas plus que les permissions du rôle global", () => {
    expect(can(direction, "brand.settings", BRAND_X)).toBe(false);
    expect(can(direction, "members.manage", BRAND_X)).toBe(false);
  });

  it("cumule plusieurs affectations", () => {
    const access = buildAccess([
      { brandId: BRAND_X, permissions: ["brand.read"] },
      { brandId: BRAND_Y, permissions: ["brand.read", "members.read"] },
    ]);
    expect(can(access, "members.read", BRAND_X)).toBe(false);
    expect(can(access, "members.read", BRAND_Y)).toBe(true);
  });

  it("n'accorde rien sans affectation", () => {
    expect(can(buildAccess([]), "brand.read", BRAND_X)).toBe(false);
  });
});

describe("canSomewhere", () => {
  it("détecte une permission tenue sur une seule marque", () => {
    expect(canSomewhere(brandAdminX, "members.manage")).toBe(true);
    expect(canSomewhere(brandAdminX, "users.manage")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("autorise un rôle inclus dans ses propres droits", () => {
    expect(canAssignRole(brandAdminX, ["brand.read", "members.read"], BRAND_X)).toBe(true);
  });

  it("refuse un rôle plus étendu que le sien", () => {
    expect(canAssignRole(brandAdminX, ["brand.read", "roles.manage"], BRAND_X)).toBe(false);
  });

  it("refuse sur une marque où l'on n'a pas les droits", () => {
    expect(canAssignRole(brandAdminX, ["brand.read"], BRAND_Y)).toBe(false);
  });

  it("autorise tout au gestionnaire global des utilisateurs", () => {
    const superAdmin = buildAccess([{ brandId: null, permissions: ["users.manage"] }]);
    expect(canAssignRole(superAdmin, ["roles.manage"], BRAND_Y)).toBe(true);
  });
});
