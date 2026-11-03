import { describe, expect, it } from "vitest";
import { actualValue, availableMetrics, comesFromReports, knownActual, toActualRows, type ActualRow } from "./actuals";

const ME = "user-me";
const COLLEAGUE = "user-colleague";

const rows: ActualRow[] = toActualRows([
  { user_id: ME, metric_key: "calls", currency: null, value: 15 },
  { user_id: COLLEAGUE, metric_key: "calls", currency: null, value: 10 },
  // Collègues regroupés (lecteur sans droit sur le détail de l'équipe)
  { user_id: null, metric_key: "calls", currency: null, value: 7 },
  { user_id: ME, metric_key: "revenue_signed", currency: "XOF", value: 1_000_000 },
  { user_id: ME, metric_key: "revenue_signed", currency: "EUR", value: 1_000 },
  { user_id: COLLEAGUE, metric_key: "revenue_signed", currency: "USD", value: 500 },
]);

describe("actualValue", () => {
  it("isole le réalisé d'un collaborateur", () => {
    expect(actualValue(rows, "calls", ME)).toEqual({ value: 15, excludedCurrencies: [] });
  });

  it("additionne toute l'équipe, collègues regroupés compris", () => {
    expect(actualValue(rows, "calls", null).value).toBe(32);
  });

  it("vaut 0 pour un indicateur sans ligne", () => {
    expect(actualValue(rows, "contracts_signed", ME).value).toBe(0);
  });

  it("convertit le chiffre d'affaires via la parité fixe XOF/EUR", () => {
    const result = actualValue(rows, "revenue_signed", ME, { currency: "XOF" });
    expect(result.value).toBeCloseTo(1_000_000 + 655_957, 6);
    expect(result.excludedCurrencies).toEqual([]);
  });

  it("exclut et signale les montants sans taux connu, sans les compter pour 0", () => {
    const result = actualValue(rows, "revenue_signed", null, { currency: "XOF" });
    expect(result.value).toBeCloseTo(1_655_957, 6);
    expect(result.excludedCurrencies).toEqual(["USD"]);
  });
});

describe("availableMetrics", () => {
  it("propose tous les indicateurs quand tous les modules sont actifs", () => {
    expect(availableMetrics(["activities", "crm", "offers", "memos", "contracts"])).toHaveLength(8);
  });

  it("écarte les indicateurs sans source", () => {
    expect(availableMetrics(["crm", "contracts"])).toEqual([
      "opportunities_created",
      "contracts_signed",
      "revenue_signed",
    ]);
    expect(availableMetrics(["activities"])).toEqual([
      "calls",
      "emails_sent",
      "qualified_meetings",
      "opportunities_created",
      "memos_sent",
    ]);
  });
});

describe("comesFromReports", () => {
  it("rattache appels, e-mails et rendez-vous aux fiches hebdomadaires", () => {
    expect(comesFromReports("calls", ["crm"])).toBe(true);
    expect(comesFromReports("qualified_meetings", [])).toBe(true);
  });

  it("prend les opportunités et mémos des registres quand les modules sont actifs", () => {
    expect(comesFromReports("opportunities_created", ["crm"])).toBe(false);
    expect(comesFromReports("opportunities_created", [])).toBe(true);
    expect(comesFromReports("memos_sent", ["memos"])).toBe(false);
    expect(comesFromReports("memos_sent", ["crm"])).toBe(true);
  });

  it("ne rattache jamais offres et contrats aux fiches", () => {
    expect(comesFromReports("offers_sent", [])).toBe(false);
    expect(comesFromReports("revenue_signed", [])).toBe(false);
  });
});

describe("knownActual", () => {
  it("rend inconnu un indicateur de fiche sans fiche soumise", () => {
    expect(knownActual(rows, "emails_sent", ME, ["activities", "crm"]).value).toBeNull();
  });

  it("garde 0 pour un registre sans enregistrement", () => {
    expect(knownActual(rows, "contracts_signed", ME, ["activities", "crm", "contracts"]).value).toBe(0);
  });

  it("additionne normalement quand des lignes existent", () => {
    expect(knownActual(rows, "calls", null, ["activities"]).value).toBe(32);
  });
});

describe("actualValue avec taux saisis", () => {
  it("convertit le chiffre d'affaires en USD au taux de la fin de période", () => {
    const rates = [{ date: "2026-10-31", from: "USD" as const, to: "XOF" as const, rate: 600 }];
    const result = actualValue(rows, "revenue_signed", COLLEAGUE, { currency: "XOF", date: "2026-11-30", rates });
    expect(result).toEqual({ value: 300000, excludedCurrencies: [] });
  });
});
