import { describe, expect, it } from "vitest";
import { budgetLevel, computeBudget, readWarningThreshold } from "./budget";
import type { FxRate } from "./currency";

const base = {
  currency: "XOF" as const,
  envelope: 10_000_000,
  invoicedCampaigns: new Set<string>(),
  platformSpend: [],
  rates: [] as FxRate[],
};

describe("computeBudget", () => {
  it("sépare engagé (engagé + payé) et réalisé (payé)", () => {
    const result = computeBudget({
      ...base,
      lines: [{ id: "print", amount: 1_000_000, campaignId: null }],
      expenses: [
        { lineId: "print", amount: 300_000, currency: "XOF", date: "2026-10-01", status: "committed" },
        { lineId: "print", amount: 200_000, currency: "XOF", date: "2026-10-05", status: "paid" },
      ],
    });
    expect(result.lines[0]).toMatchObject({ engaged: 500_000, paid: 200_000, consumption: 50, level: "ok", unbilled: null });
    expect(result).toMatchObject({ allocated: 1_000_000, unallocated: 9_000_000, engaged: 500_000, remaining: 9_500_000 });
  });

  it("alerte au seuil puis au-delà de 100 %", () => {
    expect(budgetLevel(79.9, 1, 80)).toBe("ok");
    expect(budgetLevel(80, 1, 80)).toBe("warning");
    expect(budgetLevel(100, 1, 80)).toBe("warning");
    expect(budgetLevel(100.5, 1, 80)).toBe("over");
    // Ligne sans montant mais déjà dépensée : dépassement.
    expect(budgetLevel(null, 10, 80)).toBe("over");
    expect(budgetLevel(null, 0, 80)).toBe("ok");
  });

  it("compte la dépense plateforme d'une campagne sans facture, marquée non facturée", () => {
    const result = computeBudget({
      ...base,
      lines: [{ id: "meta", amount: 1_000_000, campaignId: "camp-1" }],
      expenses: [],
      platformSpend: [
        { campaignId: "camp-1", amount: 400_000, currency: "XOF", date: "2026-10-31" },
        { campaignId: "camp-1", amount: 450_000, currency: "XOF", date: "2026-11-30" },
      ],
    });
    expect(result.lines[0]).toMatchObject({ engaged: 850_000, unbilled: 850_000, level: "warning" });
    expect(result.unbilled).toBe(850_000);
  });

  it("ne compte jamais les deux : dès qu'une facture existe, la dépense plateforme est ignorée", () => {
    const result = computeBudget({
      ...base,
      invoicedCampaigns: new Set(["camp-1"]),
      lines: [{ id: "meta", amount: 1_000_000, campaignId: "camp-1" }],
      expenses: [{ lineId: "meta", amount: 900_000, currency: "XOF", date: "2026-10-31", status: "paid" }],
      platformSpend: [{ campaignId: "camp-1", amount: 850_000, currency: "XOF", date: "2026-10-31" }],
    });
    expect(result.lines[0]).toMatchObject({ engaged: 900_000, paid: 900_000, unbilled: null });
  });

  it("convertit les devises et exclut les montants sans taux", () => {
    const lines = [{ id: "outils", amount: 1_000_000, campaignId: null }];
    const expenses = [
      { lineId: "outils", amount: 100, currency: "EUR", date: "2026-10-01", status: "paid" as const },
      { lineId: "outils", amount: 50, currency: "USD", date: "2026-10-01", status: "paid" as const },
    ];
    const without = computeBudget({ ...base, lines, expenses });
    expect(without.lines[0].engaged).toBeCloseTo(65_595.7, 6);
    expect(without.excluded).toBe(1);

    const rates: FxRate[] = [{ date: "2026-09-30", from: "USD", to: "XOF", rate: 600 }];
    const withRate = computeBudget({ ...base, lines, expenses, rates });
    expect(withRate.lines[0].engaged).toBeCloseTo(65_595.7 + 30_000, 6);
    expect(withRate.excluded).toBe(0);
  });
});

describe("readWarningThreshold", () => {
  it("lit le seuil de la marque, 80 % par défaut", () => {
    expect(readWarningThreshold({ warning_threshold: 90 })).toBe(90);
    expect(readWarningThreshold({})).toBe(80);
    expect(readWarningThreshold({ warning_threshold: 150 })).toBe(80);
    expect(readWarningThreshold(null)).toBe(80);
  });
});
