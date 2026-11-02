import { describe, expect, it } from "vitest";
import { convert, rateAt, XOF_PER_EUR, type FxRate } from "./currency";

const rates: FxRate[] = [
  { date: "2026-09-01", from: "USD", to: "XOF", rate: 560 },
  { date: "2026-10-01", from: "USD", to: "XOF", rate: 575 },
];

describe("parité EUR / XOF", () => {
  it("1 EUR = 655,957 XOF, sans table de taux", () => {
    expect(convert(1, "EUR", "XOF", "2026-01-15", [])).toBe(XOF_PER_EUR);
  });

  it("conversion inverse XOF → EUR", () => {
    expect(convert(655_957, "XOF", "EUR", "2026-01-15", [])).toBeCloseTo(1_000, 6);
  });
});

describe("taux datés", () => {
  it("même devise : montant inchangé", () => {
    expect(convert(1_000, "XOF", "XOF", "2026-10-15", [])).toBe(1_000);
  });

  it("prend le dernier taux connu à la date de l'opération", () => {
    expect(convert(10, "USD", "XOF", "2026-09-20", rates)).toBe(5_600);
    expect(convert(10, "USD", "XOF", "2026-10-02", rates)).toBe(5_750);
  });

  it("utilise un taux saisi dans l'autre sens", () => {
    expect(convert(5_750, "XOF", "USD", "2026-10-02", rates)).toBeCloseTo(10, 9);
  });

  it("passe par l'euro quand c'est nécessaire", () => {
    const viaEur: FxRate[] = [{ date: "2026-10-01", from: "USD", to: "EUR", rate: 0.9 }];
    expect(rateAt("USD", "XOF", "2026-10-10", viaEur)).toBeCloseTo(0.9 * XOF_PER_EUR, 9);
  });

  it("renvoie null si aucun taux n'existe à cette date", () => {
    expect(convert(10, "USD", "XOF", "2026-08-31", rates)).toBeNull();
    expect(convert(10, "USD", "EUR", "2026-10-10", [])).toBeNull();
  });
});
