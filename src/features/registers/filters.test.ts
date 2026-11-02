import { describe, expect, it } from "vitest";
import { buildAccess } from "@/server/authz/permissions";
import { canAssignOwner, canManageDocument, canReadAll, canReadRegister } from "./config";
import { filtersToQuery, followUpState, isExpired, parseFilters } from "./filters";

const UUID = "00000000-0000-4000-8000-000000000004";

describe("parseFilters", () => {
  it("lit les filtres de l'URL", () => {
    expect(
      parseFilters({
        q: "  Alpha  ",
        statut: UUID,
        commercial: UUID,
        du: "2026-01-01",
        au: "2026-12-31",
        relance: "en_retard",
        archives: "1",
      }),
    ).toEqual({
      q: "Alpha",
      status: UUID,
      owner: UUID,
      from: "2026-01-01",
      to: "2026-12-31",
      followUp: "overdue",
      archived: true,
    });
  });

  it("ignore les valeurs invalides", () => {
    expect(parseFilters({ statut: "pas-un-uuid", du: "01/01/2026", relance: "autre" })).toEqual({});
  });

  it("neutralise les caractères de la syntaxe de filtre", () => {
    expect(parseFilters({ q: "a,b(c)%*" }).q).toBe("a b c");
  });

  it("se retranscrit en paramètres d'URL", () => {
    expect(filtersToQuery({ q: "Alpha", followUp: "week" })).toBe("?q=Alpha&relance=semaine");
    expect(filtersToQuery({})).toBe("");
  });
});

describe("followUpState", () => {
  const today = "2026-11-02";

  it("signale une relance en retard, du jour ou proche", () => {
    expect(followUpState("2026-10-30", "active", today)).toBe("overdue");
    expect(followUpState("2026-11-02", "active", today)).toBe("today");
    expect(followUpState("2026-11-08", "draft", today)).toBe("soon");
    expect(followUpState("2026-11-20", "active", today)).toBeNull();
  });

  it("ignore les documents clôturés", () => {
    expect(followUpState("2026-10-30", "success", today)).toBeNull();
    expect(followUpState("2026-10-30", "failure", today)).toBeNull();
  });
});

describe("isExpired", () => {
  it("n'expire qu'une offre encore en cours", () => {
    expect(isExpired("2026-10-31", "active", "2026-11-02")).toBe(true);
    expect(isExpired("2026-10-31", "success", "2026-11-02")).toBe(false);
    expect(isExpired(null, "active", "2026-11-02")).toBe(false);
  });
});

describe("droits sur les registres", () => {
  const brand = "brand-x";
  const me = "user-me";
  const other = "user-other";
  const rep = buildAccess([{ brandId: brand, permissions: ["offers.manage_own"] }]);
  const manager = buildAccess([{ brandId: brand, permissions: ["offers.read_all", "offers.manage_all"] }]);
  const viewer = buildAccess([{ brandId: brand, permissions: ["offers.read_all"] }]);

  it("un commercial ne gère que ses offres", () => {
    expect(canReadRegister(rep, "offer", brand)).toBe(true);
    expect(canReadAll(rep, "offer", brand)).toBe(false);
    expect(canManageDocument(rep, "offer", brand, me, me)).toBe(true);
    expect(canManageDocument(rep, "offer", brand, other, me)).toBe(false);
    expect(canAssignOwner(rep, "offer", brand)).toBe(false);
  });

  it("le responsable gère et réattribue tout", () => {
    expect(canManageDocument(manager, "offer", brand, other, me)).toBe(true);
    expect(canAssignOwner(manager, "offer", brand)).toBe(true);
  });

  it("la lecture seule ne modifie rien", () => {
    expect(canReadAll(viewer, "offer", brand)).toBe(true);
    expect(canManageDocument(viewer, "offer", brand, me, me)).toBe(false);
  });

  it("les droits sur les offres ne donnent rien sur les mémos", () => {
    expect(canReadRegister(manager, "memo", brand)).toBe(false);
  });
});
