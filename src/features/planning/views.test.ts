import { describe, expect, it } from "vitest";
import { compareCards, planMove, POSITION_STEP } from "./board";
import { monthGrid, monthKey, monthLabel, parseMonth, shiftMonth } from "./calendar";
import { barPosition, parseYear, pointPosition, projectSpan, yearRange, yearTicks } from "./timeline";

describe("planMove", () => {
  const column = [
    { id: "a", position: 1024 },
    { id: "b", position: 2048 },
    { id: "c", position: 3072 },
  ];

  it("colonne vide : position 0", () => {
    expect(planMove([], "x", null)).toEqual([{ id: "x", position: 0 }]);
  });

  it("en fin de colonne, ou avant une carte absente", () => {
    expect(planMove(column, "x", null)).toEqual([{ id: "x", position: 3072 + POSITION_STEP }]);
    expect(planMove(column, "x", "inconnue")).toEqual([{ id: "x", position: 3072 + POSITION_STEP }]);
  });

  it("en tête, puis entre deux cartes : seule la carte déplacée change", () => {
    expect(planMove(column, "x", "a")).toEqual([{ id: "x", position: 0 }]);
    expect(planMove(column, "x", "b")).toEqual([{ id: "x", position: 1536 }]);
  });

  it("une carte déjà dans la colonne est d'abord retirée de sa place", () => {
    expect(planMove(column, "c", "a")).toEqual([{ id: "c", position: 0 }]);
  });

  it("sans écart, la colonne est renumérotée (seules les positions qui changent)", () => {
    const tight = [
      { id: "a", position: 0 },
      { id: "b", position: 0 },
      { id: "c", position: 1 },
    ];
    expect(planMove(tight, "x", "b")).toEqual([
      { id: "a", position: 1024 },
      { id: "x", position: 2048 },
      { id: "b", position: 3072 },
      { id: "c", position: 4096 },
    ]);
  });

  it("ordre d'affichage : position, échéance, titre", () => {
    const cards = [
      { title: "B", position: 0, dueOn: null },
      { title: "A", position: 0, dueOn: "2026-11-10" },
      { title: "C", position: -5, dueOn: null },
    ];
    expect([...cards].sort(compareCards).map((c) => c.title)).toEqual(["C", "A", "B"]);
  });
});

describe("calendrier", () => {
  it("lit le mois de l'URL, sinon celui du jour", () => {
    expect(parseMonth("2026-02", "2026-11-03")).toEqual({ year: 2026, month: 2 });
    expect(parseMonth("2026-13", "2026-11-03")).toEqual({ year: 2026, month: 11 });
    expect(parseMonth(undefined, "2026-11-03")).toEqual({ year: 2026, month: 11 });
  });

  it("passe d'une année à l'autre", () => {
    expect(monthKey(shiftMonth({ year: 2026, month: 12 }, 1))).toBe("2027-01");
    expect(monthKey(shiftMonth({ year: 2026, month: 1 }, -1))).toBe("2025-12");
    expect(monthLabel({ year: 2026, month: 11 })).toBe("Novembre 2026");
  });

  it("grille de novembre 2026 : du lundi 26 octobre au dimanche 6 décembre", () => {
    const weeks = monthGrid({ year: 2026, month: 11 });
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(weeks[0][6]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(weeks[5][6]).toEqual({ date: "2026-12-06", inMonth: false });
  });

  it("février 2027, commencé un lundi : quatre semaines pile", () => {
    const weeks = monthGrid({ year: 2027, month: 2 });
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0].date).toBe("2027-02-01");
    expect(weeks[3][6].date).toBe("2027-02-28");
  });
});

describe("feuille de route", () => {
  const range = yearRange(2026);

  it("lit l'année de l'URL, sinon celle du jour", () => {
    expect(parseYear("2027", "2026-11-03")).toBe(2027);
    expect(parseYear("abc", "2026-11-03")).toBe(2026);
  });

  it("place une période sur l'année, fin incluse", () => {
    expect(barPosition({ start: "2026-01-01", end: "2026-12-31" }, range)).toEqual({ left: 0, width: 100 });
    const july = barPosition({ start: "2026-07-01", end: "2026-07-31" }, range)!;
    expect(july.left).toBeCloseTo(49.59, 1);
    expect(july.width).toBeCloseTo(8.49, 1);
  });

  it("coupe aux bords de l'année ; rien si hors de l'année", () => {
    expect(barPosition({ start: "2025-10-01", end: "2026-01-31" }, range)?.left).toBe(0);
    // 1er décembre : 334 jours écoulés sur 365.
    expect(barPosition({ start: "2026-12-01", end: "2027-03-31" }, range)?.left).toBeCloseTo(91.51, 1);
    expect(barPosition({ start: "2027-01-01", end: "2027-02-01" }, range)).toBeNull();
    expect(pointPosition("2025-12-31", range)).toBeNull();
    expect(pointPosition("2026-01-01", range)).toBe(0);
  });

  it("date un projet par ses jalons quand une date manque", () => {
    expect(projectSpan({ startOn: "2026-02-01", endOn: null }, ["2026-05-01", "2026-03-15"])).toEqual({
      start: "2026-02-01",
      end: "2026-05-01",
    });
    expect(projectSpan({ startOn: null, endOn: null }, ["2026-06-01"])).toEqual({ start: "2026-06-01", end: "2026-06-01" });
    expect(projectSpan({ startOn: null, endOn: null }, [])).toBeNull();
  });

  it("repères : 4 trimestres et 12 mois qui couvrent toute l'année", () => {
    const ticks = yearTicks(2026);
    expect(ticks.quarters.map((q) => q.label)).toEqual(["T1 2026", "T2 2026", "T3 2026", "T4 2026"]);
    expect(ticks.months[0].label).toBe("janv");
    const lastMonth = ticks.months[11];
    expect(lastMonth.left + lastMonth.width).toBeCloseTo(100, 1);
  });
});
