import { describe, expect, it } from "vitest";
import { addDays, formatBytes, formatDate, formatMoney, formatNumber, formatPercent, todayIso } from "./format";

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
  });
});
