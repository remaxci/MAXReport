import { describe, expect, it } from "vitest";
import { connectorPath, dayOffset, ganttBar, ganttTicks, ganttWindow, taskSpan } from "./gantt";
import {
  createsCycle,
  dependencyConflict,
  isBlocked,
  isoWeek,
  loadLevel,
  milestoneConflict,
  parseCapacity,
  weekStart,
  weeksFrom,
  workload,
  type WorkloadTask,
} from "./schedule";

describe("dépendances", () => {
  // B attend A, C attend B.
  const deps = [
    { taskId: "b", dependsOnId: "a" },
    { taskId: "c", dependsOnId: "b" },
  ];

  it("refuse les boucles, même indirectes, comme la base", () => {
    expect(createsCycle(deps, "a", "a")).toBe(true);
    expect(createsCycle(deps, "a", "b")).toBe(true);
    expect(createsCycle(deps, "a", "c")).toBe(true);
  });

  it("accepte une dépendance qui ne referme rien", () => {
    expect(createsCycle(deps, "c", "a")).toBe(false);
    expect(createsCycle(deps, "d", "c")).toBe(false);
    expect(createsCycle([], "a", "b")).toBe(false);
  });

  it("bloquée tant qu'un prédécesseur reste à faire ; terminé ou annulé ne bloque plus", () => {
    expect(isBlocked([{ category: "success" }, { category: "active" }])).toBe(true);
    expect(isBlocked([{ category: "draft" }])).toBe(true);
    expect(isBlocked([{ category: "success" }, { category: "closed" }, { category: "failure" }])).toBe(false);
    expect(isBlocked([])).toBe(false);
  });
});

describe("alertes de dates", () => {
  const a = { startOn: "2026-11-02", dueOn: "2026-11-10", category: "active" as const };

  it("la tâche commence avant l'échéance de son prédécesseur", () => {
    expect(dependencyConflict({ startOn: "2026-11-09", dueOn: "2026-11-20", category: "draft" }, a)).toBe(true);
  });

  it("le même jour est admis, le lendemain aussi", () => {
    expect(dependencyConflict({ startOn: "2026-11-10", dueOn: "2026-11-20", category: "draft" }, a)).toBe(false);
    expect(dependencyConflict({ startOn: "2026-11-11", dueOn: "2026-11-20", category: "draft" }, a)).toBe(false);
  });

  it("sans date de début, c'est l'échéance de la tâche qui compte", () => {
    expect(dependencyConflict({ startOn: null, dueOn: "2026-11-05", category: "draft" }, a)).toBe(true);
    expect(dependencyConflict({ startOn: null, dueOn: null, category: "draft" }, a)).toBe(false);
  });

  it("plus d'alerte si l'une des deux est terminée ou annulée", () => {
    const early = { startOn: "2026-11-01", dueOn: "2026-11-05", category: "draft" as const };
    expect(dependencyConflict(early, { ...a, category: "success" })).toBe(false);
    expect(dependencyConflict({ ...early, category: "closed" }, a)).toBe(false);
  });

  it("jalon : la tâche finit après lui, tant qu'il n'est pas atteint", () => {
    const milestone = { dueOn: "2026-11-15", reachedOn: null };
    expect(milestoneConflict({ dueOn: "2026-11-16", category: "active" }, milestone)).toBe(true);
    expect(milestoneConflict({ dueOn: "2026-11-15", category: "active" }, milestone)).toBe(false);
    expect(milestoneConflict({ dueOn: "2026-11-16", category: "success" }, milestone)).toBe(false);
    expect(milestoneConflict({ dueOn: "2026-11-16", category: "active" }, { ...milestone, reachedOn: "2026-11-14" })).toBe(false);
    expect(milestoneConflict({ dueOn: null, category: "active" }, milestone)).toBe(false);
  });
});

describe("semaines", () => {
  it("lundi de la semaine et numéro ISO", () => {
    expect(weekStart("2026-11-03")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(isoWeek("2026-11-03")).toBe(45);
    expect(isoWeek("2026-01-01")).toBe(1);
    // 2026 compte 53 semaines : le vendredi 1er janvier 2027 en fait partie.
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(isoWeek("2027-01-04")).toBe(1);
  });

  it("semaines consécutives à partir de celle du jour", () => {
    expect(weeksFrom("2026-11-05", 3)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });
});

describe("charge", () => {
  const today = "2026-11-03"; // mardi
  const task = (over: Partial<WorkloadTask>): WorkloadTask => ({
    assigneeId: "u1",
    startOn: "2026-11-09",
    dueOn: "2026-11-13",
    estimateHours: 10,
    progress: 0,
    category: "active",
    ...over,
  });

  it("répartit les heures sur les jours ouvrés de la période", () => {
    // Du lundi 9 au lundi 16 : 6 jours ouvrés, 5 dans la semaine du 9, 1 dans celle du 16.
    const { weeks } = workload([task({ dueOn: "2026-11-16", estimateHours: 12 })], today);
    expect(weeks.get("u1")?.get("2026-11-09")).toBeCloseTo(10);
    expect(weeks.get("u1")?.get("2026-11-16")).toBeCloseTo(2);
  });

  it("compte seulement le reste à faire, à partir d'aujourd'hui", () => {
    // Commencée le lundi 2, finit le vendredi 6, à moitié faite : 4 h sur 4 jours ouvrés restants.
    const { weeks } = workload([task({ startOn: "2026-11-02", dueOn: "2026-11-06", estimateHours: 8, progress: 50 })], today);
    expect(weeks.get("u1")?.get("2026-11-02")).toBeCloseTo(4);
  });

  it("une tâche en retard pèse sur la semaine en cours", () => {
    const { weeks } = workload([task({ startOn: "2026-10-20", dueOn: "2026-10-30" })], today);
    expect(weeks.get("u1")?.get("2026-11-02")).toBeCloseTo(10);
  });

  it("période sur un week-end : tout sur son premier jour", () => {
    const { weeks } = workload([task({ startOn: "2026-11-14", dueOn: "2026-11-15" })], today);
    expect(weeks.get("u1")?.get("2026-11-09")).toBeCloseTo(10);
  });

  it("met à part les tâches sans date et compte celles sans estimation", () => {
    const result = workload(
      [
        task({ startOn: null, dueOn: null, estimateHours: 3 }),
        task({ estimateHours: null }),
        task({ estimateHours: 0 }),
      ],
      today,
    );
    expect(result.undated.get("u1")).toBe(3);
    expect(result.unestimated.get("u1")).toBe(2);
    expect(result.weeks.size).toBe(0);
  });

  it("ignore les tâches terminées, annulées, sans responsable ou finies à 100 %", () => {
    const result = workload(
      [task({ category: "success" }), task({ category: "closed" }), task({ assigneeId: null }), task({ progress: 100 })],
      today,
    );
    expect(result.weeks.size).toBe(0);
    expect(result.unestimated.size).toBe(0);
  });

  it("niveau par rapport à la capacité, et capacité lue dans l'URL", () => {
    expect(loadLevel(20, 40)).toBe("free");
    expect(loadLevel(32, 40)).toBe("busy");
    expect(loadLevel(40, 40)).toBe("busy");
    expect(loadLevel(40.5, 40)).toBe("over");
    expect(parseCapacity("35")).toBe(35);
    expect(parseCapacity("0")).toBe(40);
    expect(parseCapacity("abc")).toBe(40);
    expect(parseCapacity(undefined)).toBe(40);
  });
});

describe("Gantt", () => {
  const window = ganttWindow({ year: 2026, month: 11 });

  it("fenêtre de trois mois, de novembre à janvier", () => {
    expect(window).toEqual({ start: "2026-11-01", end: "2027-01-31", days: 92 });
    expect(dayOffset("2026-11-10", window)).toBe(9);
  });

  it("période d'une tâche, à partir d'une seule date si besoin", () => {
    expect(taskSpan({ startOn: "2026-11-02", dueOn: "2026-11-06" })).toEqual({ start: "2026-11-02", end: "2026-11-06" });
    expect(taskSpan({ startOn: null, dueOn: "2026-11-06" })).toEqual({ start: "2026-11-06", end: "2026-11-06" });
    expect(taskSpan({ startOn: "2026-11-09", dueOn: "2026-11-06" })).toEqual({ start: "2026-11-06", end: "2026-11-09" });
    expect(taskSpan({ startOn: null, dueOn: null })).toBeNull();
  });

  it("barre en jours, fin incluse, coupée aux bords", () => {
    expect(ganttBar({ start: "2026-11-02", end: "2026-11-06" }, window)).toEqual({ from: 1, to: 6, clippedStart: false, clippedEnd: false });
    expect(ganttBar({ start: "2026-10-20", end: "2026-11-01" }, window)).toEqual({ from: 0, to: 1, clippedStart: true, clippedEnd: false });
    expect(ganttBar({ start: "2027-01-30", end: "2027-02-10" }, window)).toEqual({ from: 90, to: 92, clippedStart: false, clippedEnd: true });
    expect(ganttBar({ start: "2027-02-01", end: "2027-02-10" }, window)).toBeNull();
  });

  it("repères : trois mois qui couvrent la fenêtre, lundis numérotés", () => {
    const ticks = ganttTicks(window);
    expect(ticks.months.map((m) => m.label)).toEqual(["Novembre 2026", "Décembre 2026", "Janvier 2027"]);
    expect(ticks.months.reduce((sum, m) => sum + m.days, 0)).toBe(92);
    expect(ticks.weeks[0]).toEqual({ date: "2026-11-02", week: 45, at: 1 });
    expect(ticks.weeks.every((w) => w.at >= 0 && w.at < 92)).toBe(true);
  });

  it("trait de dépendance : coudé, et contournement si la tâche commence trop tôt", () => {
    expect(connectorPath(100, 10, 200, 40)).toBe("M100 10 H108 V40 H200");
    expect(connectorPath(100, 10, 90, 40)).toBe("M100 10 H108 V25 H82 V40 H90");
  });
});
