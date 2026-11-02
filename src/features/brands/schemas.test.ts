import { describe, expect, it } from "vitest";
import { brandCreateSchema, slugify } from "./schemas";

describe("slugify", () => {
  it("retire accents, espaces et ponctuation", () => {
    expect(slugify("RE/MAX Côte d'Ivoire")).toBe("re-max-cote-d-ivoire");
  });

  it("ne laisse pas de tiret en bord", () => {
    expect(slugify("  Athypik Design  ")).toBe("athypik-design");
  });

  it("limite la longueur à 40 caractères", () => {
    expect(slugify("a".repeat(60)).length).toBe(40);
  });
});

describe("brandCreateSchema", () => {
  const valid = {
    name: "RE/MAX Côte d'Ivoire",
    code: "rmxci",
    slug: "remax-ci",
    primaryColor: "",
    reportingCurrency: "XOF",
  };

  it("normalise le code en majuscules et la couleur vide en null", () => {
    const parsed = brandCreateSchema.parse(valid);
    expect(parsed.code).toBe("RMXCI");
    expect(parsed.primaryColor).toBeNull();
  });

  it("refuse un code avec espace ou trop long", () => {
    expect(brandCreateSchema.safeParse({ ...valid, code: "RM CI" }).success).toBe(false);
    expect(brandCreateSchema.safeParse({ ...valid, code: "ABCDEFGHIJK" }).success).toBe(false);
  });

  it("refuse une adresse avec majuscules ou espaces", () => {
    expect(brandCreateSchema.safeParse({ ...valid, slug: "remax ci" }).success).toBe(false);
  });

  it("refuse une devise hors XOF, USD, EUR", () => {
    expect(brandCreateSchema.safeParse({ ...valid, reportingCurrency: "GBP" }).success).toBe(false);
  });
});
