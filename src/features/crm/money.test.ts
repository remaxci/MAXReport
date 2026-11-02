import { describe, expect, it } from "vitest";
import { sumInCurrency } from "./money";

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
