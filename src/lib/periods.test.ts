import { describe, expect, it } from "vitest";
import {
  elapsedShare,
  isIsoDate,
  isoWeek,
  isoWeekStart,
  mondaysBetween,
  parsePeriodKind,
  periodLabel,
  periodRange,
  sameLastYear,
  shiftPeriod,
} from "./periods";

describe("isIsoDate", () => {
  it("accepte une date existante", () => {
    expect(isIsoDate("2026-11-02")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("refuse les dates impossibles ou mal formées", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("02/11/2026")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe("semaine ISO", () => {
  it("ramène chaque jour au lundi de sa semaine", () => {
    expect(isoWeekStart("2026-11-02")).toBe("2026-11-02"); // lundi
    expect(isoWeekStart("2026-11-05")).toBe("2026-11-02"); // jeudi
    expect(isoWeekStart("2026-11-08")).toBe("2026-11-02"); // dimanche
  });

  it("traverse les changements de mois et d'année", () => {
    expect(isoWeekStart("2026-01-01")).toBe("2025-12-29");
    expect(isoWeekStart("2026-03-01")).toBe("2026-02-23");
  });

  it("numérote les semaines selon la norme ISO 8601", () => {
    expect(isoWeek("2026-11-02")).toEqual({ year: 2026, week: 45 });
    expect(isoWeek("2026-01-01")).toEqual({ year: 2026, week: 1 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2024-12-30")).toEqual({ year: 2025, week: 1 });
  });
});

describe("periodRange", () => {
  it("couvre la semaine du lundi au dimanche", () => {
    expect(periodRange("week", "2026-11-05")).toEqual({ kind: "week", start: "2026-11-02", end: "2026-11-08" });
  });

  it("couvre le mois, février bissextile compris", () => {
    expect(periodRange("month", "2026-11-17")).toEqual({ kind: "month", start: "2026-11-01", end: "2026-11-30" });
    expect(periodRange("month", "2028-02-10").end).toBe("2028-02-29");
  });

  it("couvre le trimestre et l'année", () => {
    expect(periodRange("quarter", "2026-11-17")).toEqual({ kind: "quarter", start: "2026-10-01", end: "2026-12-31" });
    expect(periodRange("quarter", "2026-02-01")).toEqual({ kind: "quarter", start: "2026-01-01", end: "2026-03-31" });
    expect(periodRange("year", "2026-11-17")).toEqual({ kind: "year", start: "2026-01-01", end: "2026-12-31" });
  });
});

describe("shiftPeriod", () => {
  it("passe à la période précédente ou suivante", () => {
    expect(shiftPeriod(periodRange("week", "2026-11-02"), -1).start).toBe("2026-10-26");
    expect(shiftPeriod(periodRange("month", "2026-12-15"), 1)).toEqual({ kind: "month", start: "2027-01-01", end: "2027-01-31" });
    expect(shiftPeriod(periodRange("quarter", "2026-02-01"), -1)).toEqual({ kind: "quarter", start: "2025-10-01", end: "2025-12-31" });
    expect(shiftPeriod(periodRange("year", "2026-06-01"), 1).start).toBe("2027-01-01");
  });
});

describe("sameLastYear", () => {
  it("compare à la même période de l'année précédente", () => {
    expect(sameLastYear(periodRange("month", "2026-11-17"))).toEqual({ kind: "month", start: "2025-11-01", end: "2025-11-30" });
    expect(sameLastYear(periodRange("quarter", "2026-11-17")).start).toBe("2025-10-01");
    expect(sameLastYear(periodRange("year", "2026-11-17")).start).toBe("2025-01-01");
    // Semaine : 52 semaines plus tôt, toujours un lundi.
    expect(sameLastYear(periodRange("week", "2026-11-02"))).toEqual({ kind: "week", start: "2025-11-03", end: "2025-11-09" });
  });
});

describe("libellés", () => {
  it("présente chaque période en français", () => {
    expect(periodLabel(periodRange("week", "2026-11-02"))).toBe("Semaine 45 · 2 nov. – 8 nov. 2026");
    expect(periodLabel(periodRange("month", "2026-11-02"))).toBe("novembre 2026");
    expect(periodLabel(periodRange("quarter", "2026-11-02"))).toBe("T4 2026");
    expect(periodLabel(periodRange("year", "2026-11-02"))).toBe("2026");
  });

  it("lit le type de période de l'URL, avec une valeur par défaut", () => {
    expect(parsePeriodKind("trimestre", "week")).toBe("quarter");
    expect(parsePeriodKind("n-importe-quoi", "month")).toBe("month");
    expect(parsePeriodKind(undefined, "week")).toBe("week");
  });
});

describe("mondaysBetween", () => {
  it("liste les semaines qui commencent dans la période", () => {
    expect(mondaysBetween("2026-11-01", "2026-11-30")).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
    expect(mondaysBetween("2026-11-03", "2026-11-08")).toEqual([]);
  });
});

describe("elapsedShare", () => {
  it("mesure l'avancement de la période, jour courant inclus", () => {
    expect(elapsedShare("2026-11-01", "2026-11-30", "2026-10-31")).toBe(0);
    expect(elapsedShare("2026-11-01", "2026-11-30", "2026-11-15")).toBeCloseTo(0.5, 6);
    expect(elapsedShare("2026-11-01", "2026-11-30", "2026-12-01")).toBe(1);
  });
});
