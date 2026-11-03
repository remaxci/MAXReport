import { describe, expect, it } from "vitest";
import { compareTasks, dueBucket, isOverdue, parseTaskFilters, projectProgress } from "./rules";

const TODAY = "2026-11-03";

describe("isOverdue", () => {
  it("en retard : échéance passée et tâche encore à faire", () => {
    expect(isOverdue({ dueOn: "2026-11-02", category: "active" }, TODAY)).toBe(true);
    expect(isOverdue({ dueOn: "2026-11-02", category: "draft" }, TODAY)).toBe(true);
  });

  it("jamais pour une tâche terminée ou annulée, ni le jour même, ni sans échéance", () => {
    expect(isOverdue({ dueOn: "2026-11-02", category: "success" }, TODAY)).toBe(false);
    expect(isOverdue({ dueOn: "2026-11-02", category: "closed" }, TODAY)).toBe(false);
    expect(isOverdue({ dueOn: TODAY, category: "active" }, TODAY)).toBe(false);
    expect(isOverdue({ dueOn: null, category: "active" }, TODAY)).toBe(false);
  });
});

describe("dueBucket", () => {
  it("classe les échéances", () => {
    expect(dueBucket("2026-10-30", TODAY)).toBe("overdue");
    expect(dueBucket(TODAY, TODAY)).toBe("today");
    expect(dueBucket("2026-11-10", TODAY)).toBe("week");
    expect(dueBucket("2026-11-11", TODAY)).toBe("later");
    expect(dueBucket(null, TODAY)).toBe("none");
  });
});

describe("projectProgress", () => {
  it("sans estimation : chaque tâche pèse 1, l'avancement saisi compte", () => {
    expect(
      projectProgress([
        { category: "success", progress: 100, estimateHours: null },
        { category: "active", progress: 50, estimateHours: null },
        { category: "draft", progress: 0, estimateHours: null },
        { category: "draft", progress: 0, estimateHours: null },
      ]),
    ).toBe(38);
  });

  it("avec estimations : pondération par les heures, tâches non estimées ignorées", () => {
    expect(
      projectProgress([
        { category: "success", progress: 100, estimateHours: 30 },
        { category: "active", progress: 0, estimateHours: 10 },
        { category: "active", progress: 90, estimateHours: null },
      ]),
    ).toBe(75);
  });

  it("une tâche terminée vaut 100 % même si l'avancement saisi est faux", () => {
    expect(projectProgress([{ category: "success", progress: 20, estimateHours: null }])).toBe(100);
  });

  it("les tâches annulées ne comptent pas ; rien à mesurer : null", () => {
    expect(
      projectProgress([
        { category: "closed", progress: 0, estimateHours: null },
        { category: "success", progress: 100, estimateHours: null },
      ]),
    ).toBe(100);
    expect(projectProgress([{ category: "closed", progress: 0, estimateHours: null }])).toBeNull();
    expect(projectProgress([])).toBeNull();
  });
});

describe("compareTasks", () => {
  it("échéance la plus proche d'abord, sans échéance à la fin, puis la plus urgente", () => {
    const tasks = [
      { title: "C", dueOn: null, priority: "urgent" as const },
      { title: "B", dueOn: "2026-11-05", priority: "low" as const },
      { title: "A", dueOn: "2026-11-05", priority: "urgent" as const },
      { title: "D", dueOn: "2026-11-04", priority: "normal" as const },
    ];
    expect([...tasks].sort(compareTasks).map((t) => t.title)).toEqual(["D", "A", "B", "C"]);
  });
});

describe("parseTaskFilters", () => {
  const ID = "0f8c2d3e-1a2b-4c5d-8e9f-0a1b2c3d4e5f";

  it("lit les filtres connus", () => {
    expect(
      parseTaskFilters({ q: " plan ", statut: ID, responsable: "aucun", priorite: "high", echeance: "retard", archives: "1" }),
    ).toEqual({ q: "plan", status: ID, assignee: "aucun", priority: "high", project: undefined, due: "retard", archived: true });
  });

  it("ignore les valeurs inconnues", () => {
    expect(parseTaskFilters({ statut: "x'; drop", priorite: "max", echeance: "demain" })).toEqual({
      q: undefined,
      status: undefined,
      assignee: undefined,
      priority: undefined,
      project: undefined,
      due: undefined,
      archived: false,
    });
  });
});
