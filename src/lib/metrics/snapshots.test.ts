import { describe, expect, it } from "vitest";
import { aggregateSnapshots, evolution, type SnapshotValues } from "./snapshots";

const FIELDS = { followers: "stock", impressions: "flow", reach: "exact" } as const;
const NOVEMBER = { start: "2026-11-01", end: "2026-11-30" };

const week = (start: string, end: string, values: Record<string, number | null>): SnapshotValues => ({
  periodStart: start,
  periodEnd: end,
  values,
});

const weeks = [
  week("2026-11-02", "2026-11-08", { followers: 1000, impressions: 5000, reach: 3000 }),
  week("2026-11-09", "2026-11-15", { followers: 1040, impressions: 6000, reach: 3500 }),
  week("2026-11-16", "2026-11-22", { followers: null, impressions: null, reach: 2000 }),
];

describe("aggregateSnapshots", () => {
  it("additionne les flux et garde la dernière valeur connue des stocks", () => {
    const result = aggregateSnapshots(weeks, NOVEMBER, FIELDS);
    expect(result.values.impressions).toBe(11000);
    // La dernière semaine n'a pas d'abonnés saisis : on garde le dernier relevé connu.
    expect(result.values.followers).toBe(1040);
    expect(result.counted).toBe(3);
  });

  it("n'additionne jamais une portée : inconnue hors période exacte", () => {
    expect(aggregateSnapshots(weeks, NOVEMBER, FIELDS).values.reach).toBeNull();
    const firstWeek = aggregateSnapshots(weeks, { start: "2026-11-02", end: "2026-11-08" }, FIELDS);
    expect(firstWeek.values.reach).toBe(3000);
  });

  it("ne compte pas un relevé à cheval sur la période, et le signale", () => {
    const rows = [...weeks, week("2026-11-30", "2026-12-06", { impressions: 9999 })];
    const result = aggregateSnapshots(rows, NOVEMBER, FIELDS);
    expect(result.values.impressions).toBe(11000);
    expect(result.straddling).toBe(1);
  });

  it("laisse vide une période sans relevé (jamais 0)", () => {
    const result = aggregateSnapshots(weeks, { start: "2026-10-01", end: "2026-10-31" }, FIELDS);
    expect(result.values).toEqual({ followers: null, impressions: null, reach: null });
    expect(result.counted).toBe(0);
  });

  it("garde 0 quand 0 a été saisi", () => {
    const result = aggregateSnapshots([week("2026-11-02", "2026-11-08", { impressions: 0 })], NOVEMBER, FIELDS);
    expect(result.values.impressions).toBe(0);
  });
});

describe("evolution", () => {
  it("calcule la variation en %", () => {
    expect(evolution(120, 100)).toBeCloseTo(20, 6);
    expect(evolution(80, 100)).toBeCloseTo(-20, 6);
  });

  it("renvoie null sans référence exploitable", () => {
    expect(evolution(100, null)).toBeNull();
    expect(evolution(null, 100)).toBeNull();
    expect(evolution(100, 0)).toBeNull();
  });
});
