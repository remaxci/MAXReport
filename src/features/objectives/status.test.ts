import { describe, expect, it } from "vitest";
import { parseObjectiveState, readObjective } from "./status";

const NOVEMBER = { start: "2026-11-01", end: "2026-11-30" };

describe("readObjective", () => {
  it("compare le taux d'atteinte à l'avancement de la période", () => {
    // Mi-novembre : 50 % de la période écoulée.
    expect(readObjective(60, 100, NOVEMBER, "2026-11-15")).toMatchObject({ rate: 60, status: "on_track" });
    expect(readObjective(30, 100, NOVEMBER, "2026-11-15")).toMatchObject({ rate: 30, status: "behind" });
  });

  it("signale un objectif atteint, même avant la fin", () => {
    expect(readObjective(120, 100, NOVEMBER, "2026-11-10").status).toBe("achieved");
  });

  it("clôt la période : non atteint sous 100 %", () => {
    expect(readObjective(80, 100, NOVEMBER, "2026-12-02")).toMatchObject({ rate: 80, elapsed: 100, status: "missed" });
  });

  it("distingue un objectif à venir", () => {
    expect(readObjective(0, 100, NOVEMBER, "2026-10-20")).toMatchObject({ elapsed: 0, status: "upcoming" });
  });

  it("ne transforme jamais un réalisé inconnu en 0 %", () => {
    expect(readObjective(null, 100, NOVEMBER, "2026-11-15")).toMatchObject({ rate: null, status: "unknown" });
  });
});

describe("parseObjectiveState", () => {
  it("lit l'onglet de l'URL, « en cours » par défaut", () => {
    expect(parseObjectiveState("termines")).toBe("past");
    expect(parseObjectiveState("a-venir")).toBe("upcoming");
    expect(parseObjectiveState(undefined)).toBe("current");
    expect(parseObjectiveState("autre")).toBe("current");
  });
});
