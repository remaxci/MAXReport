import { describe, expect, it } from "vitest";
import { knownTotal, sumInCurrency } from "./money";

describe("sumInCurrency", () => {
  it("additionne XOF et EUR via la parité fixe", () => {
    const result = sumInCurrency(
      [
        { amount: 1000000, currency: "XOF" },
        { amount: 1000, currency: "EUR" },
        { amount: null, currency: null },
      ],
      "XOF",
      "2026-11-02",
    );
    expect(result.total).toBeCloseTo(1000000 + 655957, 6);
    expect(result.excluded).toBe(0);
  });

  it("met de côté les montants sans taux connu (USD)", () => {
    const result = sumInCurrency([{ amount: 500, currency: "USD" }], "XOF", "2026-11-02");
    expect(result).toEqual({ total: 0, excluded: 1 });
  });
});

describe("sumInCurrency avec taux saisis", () => {
  it("convertit l'USD au dernier taux connu à la date de chaque montant", () => {
    const rates = [
      { date: "2026-09-30", from: "USD" as const, to: "XOF" as const, rate: 600 },
      { date: "2026-10-31", from: "USD" as const, to: "XOF" as const, rate: 610 },
    ];
    const result = sumInCurrency(
      [
        { amount: 100, currency: "USD", date: "2026-10-15" },
        { amount: 100, currency: "USD", date: "2026-11-02" },
      ],
      "XOF",
      "2026-11-02",
      rates,
    );
    expect(result).toEqual({ total: 60000 + 61000, excluded: 0 });
  });

  it("exclut un montant antérieur à tout taux saisi", () => {
    const rates = [{ date: "2026-10-31", from: "USD" as const, to: "XOF" as const, rate: 610 }];
    expect(sumInCurrency([{ amount: 100, currency: "USD", date: "2026-01-15" }], "XOF", "2026-11-02", rates)).toEqual({
      total: 0,
      excluded: 1,
    });
  });
});

describe("knownTotal", () => {
  it("rien de converti : inconnu, jamais 0", () => {
    const usd = [
      { amount: 44.06, currency: "USD" },
      { amount: 113, currency: "USD" },
    ];
    expect(knownTotal(sumInCurrency(usd, "XOF", "2026-11-01"))).toBeNull();
  });

  it("somme partielle gardée, exclusions signalées à part", () => {
    const sum = sumInCurrency([{ amount: 1000, currency: "XOF" }, { amount: 113, currency: "USD" }], "XOF", "2026-11-01");
    expect(sum.excluded).toBe(1);
    expect(knownTotal(sum)).toBe(1000);
  });

  it("aucun montant du tout : 0, comme un registre vide", () => {
    expect(knownTotal(sumInCurrency([], "XOF", "2026-11-01"))).toBe(0);
  });
});
