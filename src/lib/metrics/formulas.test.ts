import { describe, expect, it } from "vitest";
import {
  pairedRatio,
  achievementRate,
  conversionRate,
  cpc,
  cpl,
  cpm,
  ctr,
  engagementRate,
  ratio,
  roas,
} from "./formulas";

describe("ratio", () => {
  it("divise et applique le facteur", () => {
    expect(ratio(1, 4, 100)).toBe(25);
  });

  it("renvoie null si un terme manque (absence ≠ zéro)", () => {
    expect(ratio(null, 10)).toBeNull();
    expect(ratio(10, undefined)).toBeNull();
  });

  it("renvoie null si le dénominateur vaut 0", () => {
    expect(ratio(5, 0)).toBeNull();
  });

  it("accepte un numérateur à 0", () => {
    expect(ratio(0, 10)).toBe(0);
  });
});

describe("indicateurs publicitaires", () => {
  const spend = 150_000; // XOF
  const impressions = 60_000;
  const clicks = 1_200;
  const leads = 30;

  it("CTR = clics ÷ impressions × 100", () => {
    expect(ctr(clicks, impressions)).toBe(2);
  });

  it("CPC = dépense ÷ clics", () => {
    expect(cpc(spend, clicks)).toBe(125);
  });

  it("CPM = dépense ÷ impressions × 1 000", () => {
    expect(cpm(spend, impressions)).toBe(2_500);
  });

  it("CPL = dépense ÷ leads", () => {
    expect(cpl(spend, leads)).toBe(5_000);
  });

  it("ROAS = valeur des conversions ÷ dépense", () => {
    expect(roas(600_000, spend)).toBe(4);
  });

  it("n/d sans clics plutôt qu'un CPC infini", () => {
    expect(cpc(spend, 0)).toBeNull();
  });
});

describe("autres taux", () => {
  it("taux de conversion d'un site", () => {
    expect(conversionRate(45, 1_500)).toBe(3);
  });

  it("taux d'atteinte d'un objectif", () => {
    expect(achievementRate(12, 10)).toBe(120);
  });
});

describe("taux d'engagement", () => {
  it("se calcule sur la portée quand elle est connue", () => {
    expect(engagementRate(50, 1_000, 4_000)).toEqual({ value: 5, basis: "reach" });
  });

  it("se replie sur les impressions et le signale", () => {
    expect(engagementRate(50, null, 4_000)).toEqual({
      value: 1.25,
      basis: "impressions",
    });
  });

  it("renvoie n/d sans portée ni impressions", () => {
    expect(engagementRate(50, null, 0)).toEqual({ value: null, basis: null });
  });
});

describe("ratio d'un total sur des chiffres incomplets", () => {
  const facebook = { clicks: 1074, impressions: null };
  const linkedin = { clicks: 587, impressions: 11711 };

  it("des clics sans impressions ne gonflent pas le taux", () => {
    const result = pairedRatio([facebook, linkedin], "clicks", "impressions", 100);
    expect(result.value).toBeCloseTo(5.01, 2);
    expect(result.left).toBe(1);
  });

  it("aucune ligne complète : inconnu, jamais 0", () => {
    expect(pairedRatio([facebook], "clicks", "impressions", 100)).toEqual({ value: null, left: 1 });
    expect(pairedRatio([], "clicks", "impressions", 100)).toEqual({ value: null, left: 0 });
  });

  it("lignes complètes additionnées ; une ligne vide n'est pas signalée", () => {
    const result = pairedRatio([linkedin, { clicks: 13, impressions: 289 }, { clicks: null, impressions: null }], "clicks", "impressions", 100);
    expect(result.value).toBeCloseTo(5, 5);
    expect(result.left).toBe(0);
  });

  it("dénominateur nul : inconnu", () => {
    expect(pairedRatio([{ clicks: 5, impressions: 0 }], "clicks", "impressions", 100).value).toBeNull();
  });
});
