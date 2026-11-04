import { describe, expect, it } from "vitest";
import { pointLabel, pointTitle, rangePoints, seriesPeriods } from "./metrics/series";
import {
  dateInputValue,
  daysInRange,
  MAX_RANGE_DAYS,
  parseDateInput,
  periodFromQuery,
  periodLabel,
  periodRange,
  periodSearch,
  rangePeriod,
  sameLastYear,
  shiftPeriod,
} from "./periods";

const TODAY = "2026-11-04";

describe("saisie d'une date", () => {
  it("JJ/MM/AAAA et AAAA-MM-JJ, jamais de date inventée", () => {
    expect(parseDateInput("10/09/2026")).toBe("2026-09-10");
    expect(parseDateInput(" 1/9/2026 ")).toBe("2026-09-01");
    expect(parseDateInput("2026-09-10")).toBe("2026-09-10");
    expect(parseDateInput("31/02/2026")).toBeNull();
    expect(parseDateInput("20/13/2026")).toBeNull();
    expect(parseDateInput("demain")).toBeNull();
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput(undefined)).toBeNull();
  });

  it("le champ affiche JJ/MM/AAAA", () => {
    expect(dateInputValue("2026-09-10")).toBe("10/09/2026");
  });
});

describe("intervalle", () => {
  it("l'exemple demandé : du 10/09/2026 au 20/10/2026", () => {
    const period = periodFromQuery("intervalle", "10/09/2026", TODAY, "month", "20/10/2026");
    expect(period).toEqual({ kind: "range", start: "2026-09-10", end: "2026-10-20" });
    expect(daysInRange(period.start, period.end)).toBe(41);
    expect(periodLabel(period)).toContain("sept");
    expect(periodLabel(period)).toContain("oct");
  });

  it("bornes inversées remises dans l'ordre, un seul jour accepté", () => {
    expect(rangePeriod("2026-10-20", "2026-09-10")).toEqual({ kind: "range", start: "2026-09-10", end: "2026-10-20" });
    expect(rangePeriod("2026-09-10", "2026-09-10").end).toBe("2026-09-10");
  });

  it("durée plafonnée", () => {
    const period = rangePeriod("2000-01-01", "2026-01-01");
    expect(daysInRange(period.start, period.end)).toBe(MAX_RANGE_DAYS);
  });

  it("incomplet ou invalide : la période par défaut, jamais une erreur", () => {
    expect(periodFromQuery("intervalle", "10/09/2026", TODAY).kind).toBe("month");
    expect(periodFromQuery("intervalle", "10/09/2026", TODAY).start).toBe("2026-09-01");
    expect(periodFromQuery("intervalle", "n'importe quoi", TODAY, "month", "20/10/2026").start).toBe("2026-11-01");
    expect(periodFromQuery("intervalle", "31/02/2026", TODAY, "month", "20/10/2026").start).toBe("2026-11-01");
  });

  it("les périodes habituelles ne changent pas", () => {
    expect(periodFromQuery("trimestre", "2026-11-01", TODAY)).toEqual(periodRange("quarter", "2026-11-01"));
    expect(periodFromQuery(undefined, undefined, TODAY)).toEqual(periodRange("month", TODAY));
    expect(periodSearch(periodRange("month", TODAY))).toBe("periode=mois&du=2026-11-01");
  });

  it("l'adresse redonne le même intervalle (pages, onglets, export Excel)", () => {
    const period = rangePeriod("2026-09-10", "2026-10-20");
    const search = periodSearch(period);
    expect(search).toBe("periode=intervalle&du=2026-09-10&au=2026-10-20");
    const params = new URLSearchParams(search);
    expect(periodFromQuery(params.get("periode") ?? undefined, params.get("du") ?? undefined, TODAY, "month", params.get("au") ?? undefined)).toEqual(period);
  });

  it("période précédente de même durée, juste avant", () => {
    const period = rangePeriod("2026-09-10", "2026-10-20");
    expect(shiftPeriod(period, -1)).toEqual({ kind: "range", start: "2026-07-31", end: "2026-09-09" });
    expect(shiftPeriod(period, 1)).toEqual({ kind: "range", start: "2026-10-21", end: "2026-11-30" });
    expect(sameLastYear(period).kind).toBe("range");
  });
});

describe("points des graphiques d'un intervalle", () => {
  it("par semaine jusqu'à 92 jours, coupés aux bornes, sans trou ni recouvrement", () => {
    const points = rangePoints(rangePeriod("2026-09-10", "2026-10-20"));
    expect(points.every((p) => p.kind === "week")).toBe(true);
    expect(points[0]).toEqual({ kind: "week", start: "2026-09-10", end: "2026-09-13" });
    expect(points[1]).toEqual({ kind: "week", start: "2026-09-14", end: "2026-09-20" });
    expect(points[points.length - 1]).toEqual({ kind: "week", start: "2026-10-19", end: "2026-10-20" });
    expect(points.reduce((sum, p) => sum + daysInRange(p.start, p.end), 0)).toBe(41);
  });

  it("par mois, trimestre puis année selon la durée", () => {
    expect(rangePoints(rangePeriod("2026-01-15", "2026-10-20"))[0]).toEqual({ kind: "month", start: "2026-01-15", end: "2026-01-31" });
    expect(rangePoints(rangePeriod("2023-01-15", "2026-10-20"))[0].kind).toBe("quarter");
    expect(rangePoints(rangePeriod("2018-01-15", "2026-10-20"))[0].kind).toBe("year");
  });

  it("le nombre de points reste raisonnable", () => {
    for (const [a, b] of [["2026-08-01", "2026-10-31"], ["2024-11-01", "2026-10-31"], ["2020-11-01", "2026-10-31"], ["2016-11-05", "2026-11-04"]]) {
      expect(rangePoints(rangePeriod(a, b)).length).toBeLessThanOrEqual(25);
    }
  });

  it("seriesPeriods : l'intervalle lui-même, pas les périodes d'avant", () => {
    const period = rangePeriod("2026-09-10", "2026-10-20");
    const points = seriesPeriods(period);
    expect(points[0].start).toBe(period.start);
    expect(points[points.length - 1].end).toBe(period.end);
    expect(seriesPeriods(periodRange("month", TODAY))).toHaveLength(12);
    expect(seriesPeriods(periodRange("month", TODAY), 3)).toHaveLength(3);
  });

  it("un point coupé affiche ses dates exactes, un point entier son nom habituel", () => {
    const [first] = rangePoints(rangePeriod("2026-01-15", "2026-10-20"));
    expect(pointLabel(first)).toContain("janv");
    expect(pointTitle(first)).not.toBe("Janvier 2026");
    expect(pointTitle(first)).toContain("15");
    expect(pointTitle(periodRange("month", "2026-02-10"))).toBe("Février 2026");
  });
});
