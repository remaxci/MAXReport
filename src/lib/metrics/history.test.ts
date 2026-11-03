import { describe, expect, it } from "vitest";
import { combineParts, historicalTeamTotal, readCutover, splitAtCutover, type HistoricalRow } from "./history";

describe("splitAtCutover", () => {
  const year = { start: "2026-01-01", end: "2026-12-31" };

  it("lit tout en détail sans date de bascule ou après elle", () => {
    expect(splitAtCutover(year, null)).toEqual({ historical: null, detailed: year });
    expect(splitAtCutover(year, "2025-07-01")).toEqual({ historical: null, detailed: year });
  });

  it("lit tout dans l'historique avant la bascule", () => {
    expect(splitAtCutover(year, "2027-01-01")).toEqual({ historical: year, detailed: null });
  });

  it("coupe une période à cheval, sans recouvrement", () => {
    expect(splitAtCutover(year, "2026-07-01")).toEqual({
      historical: { start: "2026-01-01", end: "2026-06-30" },
      detailed: { start: "2026-07-01", end: "2026-12-31" },
    });
  });
});

describe("historicalTeamTotal", () => {
  const rows: HistoricalRow[] = [
    { userId: null, metricKey: "calls", currency: null, value: 900, start: "2025-01-01", end: "2025-12-31" },
    { userId: "u1", metricKey: "calls", currency: null, value: 500, start: "2025-01-01", end: "2025-12-31" },
    { userId: "u1", metricKey: "contracts_signed", currency: null, value: 3, start: "2025-01-01", end: "2025-06-30" },
    { userId: "u2", metricKey: "contracts_signed", currency: null, value: 2, start: "2025-01-01", end: "2025-06-30" },
    { userId: null, metricKey: "revenue_signed", currency: "EUR", value: 1000, start: "2025-01-01", end: "2025-12-31" },
    { userId: null, metricKey: "revenue_signed", currency: "USD", value: 100, start: "2025-01-01", end: "2025-12-31" },
  ];
  const year = { start: "2025-01-01", end: "2025-12-31" };
  const options = { currency: "XOF" as const, rates: [] };

  it("retient le chiffre d'équipe quand il existe", () => {
    expect(historicalTeamTotal(rows, "calls", year, options).value).toBe(900);
  });

  it("additionne les collaborateurs sans chiffre d'équipe", () => {
    expect(historicalTeamTotal(rows, "contracts_signed", year, options).value).toBe(5);
  });

  it("ignore les lignes qui débordent de la plage", () => {
    expect(historicalTeamTotal(rows, "calls", { start: "2025-01-01", end: "2025-06-30" }, options).value).toBeNull();
  });

  it("convertit les montants et signale ceux sans taux", () => {
    const result = historicalTeamTotal(rows, "revenue_signed", year, options);
    expect(result.value).toBeCloseTo(655_957, 6);
    expect(result.excludedCurrencies).toEqual(["USD"]);
  });
});

describe("combineParts et readCutover", () => {
  it("additionne les parts connues", () => {
    expect(combineParts(10, 5)).toBe(15);
    expect(combineParts(null, 5)).toBe(5);
    expect(combineParts(null, null)).toBeNull();
  });

  it("lit la date de bascule de la marque", () => {
    expect(readCutover({ history_cutover: "2026-07-01" })).toBe("2026-07-01");
    expect(readCutover({ history_cutover: "juillet" })).toBeNull();
    expect(readCutover(null)).toBeNull();
  });
});
