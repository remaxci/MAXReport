import { describe, expect, it } from "vitest";
import { addDays, formatBytes, formatDate, formatMoney, formatEvolution, formatNumber, formatPercent, splitAmount, todayIso } from "./format";

// Intl insère des espaces insécables : on les normalise pour comparer.
const plain = (value: string) => value.replace(/[  ]/g, " ");

describe("formatMoney", () => {
  it("affiche le franc CFA sans décimales", () => {
    expect(plain(formatMoney(1500000, "XOF"))).toBe("1 500 000 F CFA");
  });

  it("affiche l'euro avec deux décimales", () => {
    expect(plain(formatMoney(1234.5, "EUR"))).toBe("1 234,50 €");
  });

  it("affiche un tiret sans montant", () => {
    expect(formatMoney(null, null)).toBe("—");
  });
});

describe("dates", () => {
  it("formate une date en français", () => {
    expect(formatDate("2026-11-12")).toBe("12 nov. 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("donne la date du jour à Abidjan (UTC)", () => {
    expect(todayIso(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-02");
  });

  it("ajoute des jours en changeant de mois", () => {
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
  });
});

describe("formatBytes", () => {
  it("choisit l'unité", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(2048)).toBe("2 Ko");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3,5 Mo");
  });
});

describe("formatNumber et formatPercent", () => {
  it("formate en français", () => {
    expect(plain(formatNumber(12500))).toBe("12 500");
    expect(plain(formatPercent(87.5))).toBe("88 %");
  });

  it("n'affiche jamais 0 pour une valeur absente", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatPercent(null)).toBe("n/d");
    expect(formatEvolution(null)).toBe("n/d");
  });

  it("garde les décimales demandées et signe les évolutions", () => {
    expect(plain(formatPercent(2.345, 1))).toBe("2,3 %");
    expect(plain(formatEvolution(12))).toBe("+12 %");
    expect(plain(formatEvolution(-3.5))).toBe("−3,5 %");
  });
});

describe("montant et devise séparés", () => {
  it("la devise peut passer à la ligne", () => {
    const { amount, unit } = splitAmount(formatMoney(86_000_000, "XOF"));
    expect(amount.replace(/\D/g, "")).toBe("86000000");
    expect(unit?.replace(/[\s\u00a0\u202f]/g, "")).toBe("FCFA");
    expect(splitAmount(formatMoney(1250, "EUR")).unit).toBe("€");
  });

  it("un pourcentage, un nombre ou une valeur inconnue restent entiers", () => {
    expect(splitAmount("41,7 %")).toEqual({ amount: "41,7 %", unit: null });
    expect(splitAmount("41,7\u00a0%")).toEqual({ amount: "41,7\u00a0%", unit: null });
    expect(splitAmount("5\u202f850")).toEqual({ amount: "5\u202f850", unit: null });
    expect(splitAmount("—")).toEqual({ amount: "—", unit: null });
    expect(splitAmount("n/d")).toEqual({ amount: "n/d", unit: null });
  });
});
