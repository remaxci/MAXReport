import { describe, expect, it } from "vitest";
import { periodRange } from "@/lib/periods";
import { hasKnownValue, pointLabel, pointTitle, seriesPeriods, shares, sumKnown } from "./series";

describe("séries temporelles", () => {
  it("douze mois qui se terminent par le mois affiché, du plus ancien au plus récent", () => {
    const periods = seriesPeriods(periodRange("month", "2026-11-15"));
    expect(periods).toHaveLength(12);
    expect(periods[0]).toEqual({ kind: "month", start: "2025-12-01", end: "2025-12-31" });
    expect(periods[11]).toEqual({ kind: "month", start: "2026-11-01", end: "2026-11-30" });
  });

  it("treize semaines ISO, huit trimestres, cinq ans", () => {
    const weeks = seriesPeriods(periodRange("week", "2026-11-03"));
    expect(weeks).toHaveLength(13);
    expect(weeks[12].start).toBe("2026-11-02");
    expect(weeks[0].start).toBe("2026-08-10");
    expect(seriesPeriods(periodRange("quarter", "2026-11-03"))[0].start).toBe("2025-01-01");
    expect(seriesPeriods(periodRange("year", "2026-11-03")).map((p) => p.start.slice(0, 4))).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });

  it("libellés courts sur l'axe, complets dans l'info-bulle", () => {
    expect(pointLabel(periodRange("week", "2026-11-03"))).toBe("S45");
    expect(pointLabel(periodRange("month", "2026-11-03"))).toBe("nov. 26");
    expect(pointLabel(periodRange("quarter", "2026-11-03"))).toBe("T4 26");
    expect(pointLabel(periodRange("year", "2026-11-03"))).toBe("2026");
    expect(pointTitle(periodRange("month", "2026-11-03"))).toBe("Novembre 2026");
  });

  it("une somme sans aucune valeur connue reste inconnue, jamais 0", () => {
    expect(sumKnown([null, null])).toBeNull();
    expect(sumKnown([])).toBeNull();
    expect(sumKnown([null, 3, 0, undefined, 2])).toBe(5);
  });

  it("parts de chaque marque dans le total connu", () => {
    expect(shares({ a: 30, b: 10, c: null })).toEqual({ a: 75, b: 25, c: null });
    expect(shares({ a: 0, b: 0 })).toEqual({ a: null, b: null });
    expect(shares({ a: null })).toEqual({ a: null });
  });

  it("détecte une série entièrement vide", () => {
    const rows = [{ values: { x: null, y: null } }, { values: { x: null, y: 0 } }];
    expect(hasKnownValue(rows, ["x"])).toBe(false);
    expect(hasKnownValue(rows, ["x", "y"])).toBe(true);
  });
});
