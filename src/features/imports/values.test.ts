import { describe, expect, it } from "vitest";
import { isBlank, normalizeKey, parseDateValue, parseNumberValue } from "./values";

describe("normalizeKey", () => {
  it("compare les en-têtes sans accents, casse ni ponctuation", () => {
    expect(normalizeKey("Début des rapports")).toBe("debutdesrapports");
    expect(normalizeKey("  Montant dépensé (XOF) ")).toBe("montantdepensexof");
  });
});

describe("isBlank", () => {
  it("considère vides les marques d'absence courantes, pas le zéro", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank(" - ")).toBe(true);
    expect(isBlank("n/d")).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank("0")).toBe(false);
  });
});

describe("parseDateValue", () => {
  it("lit les dates ISO, avec ou sans heure", () => {
    expect(parseDateValue("2026-10-01", "dmy")).toBe("2026-10-01");
    expect(parseDateValue("2026-10-01 00:00:00", "dmy")).toBe("2026-10-01");
    expect(parseDateValue("2026/10/01", "mdy")).toBe("2026-10-01");
  });

  it("lit jour/mois/année ou mois/jour/année selon le format choisi", () => {
    expect(parseDateValue("05/10/2026", "dmy")).toBe("2026-10-05");
    expect(parseDateValue("05/10/2026", "mdy")).toBe("2026-05-10");
    expect(parseDateValue("5.10.26", "dmy")).toBe("2026-10-05");
  });

  it("lit les numéros de série Excel", () => {
    expect(parseDateValue(46296, "dmy")).toBe("2026-10-01");
    expect(parseDateValue("46296", "dmy")).toBe("2026-10-01");
  });

  it("refuse les dates impossibles ou illisibles", () => {
    expect(parseDateValue("31/02/2026", "dmy")).toBeNull();
    expect(parseDateValue("13/10/2026", "mdy")).toBeNull();
    expect(parseDateValue("octobre", "dmy")).toBeNull();
    expect(parseDateValue(12, "dmy")).toBeNull();
  });
});

describe("parseNumberValue", () => {
  it("lit les nombres au format français", () => {
    expect(parseNumberValue("1 234,56", "fr")).toBe(1234.56);
    expect(parseNumberValue("1.234,56", "fr")).toBe(1234.56);
    expect(parseNumberValue("450 000 F CFA", "fr")).toBe(450000);
    expect(parseNumberValue("12,5", "fr")).toBe(12.5);
  });

  it("lit les nombres au format anglais", () => {
    expect(parseNumberValue("1,234.56", "en")).toBe(1234.56);
    expect(parseNumberValue("$1,500", "en")).toBe(1500);
  });

  it("garde les nombres déjà lus et refuse le reste", () => {
    expect(parseNumberValue(42, "fr")).toBe(42);
    expect(parseNumberValue("beaucoup", "fr")).toBeNull();
    expect(parseNumberValue("12%", "fr")).toBeNull();
    expect(parseNumberValue(null, "fr")).toBeNull();
  });
});
