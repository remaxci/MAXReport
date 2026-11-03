import { getActuals } from "@/features/activities/queries";
import { knownActual, type ActualRow } from "@/lib/metrics/actuals";
import type { Currency, FxRate } from "@/lib/metrics/currency";
import type { BrandSummary } from "@/server/authz/context";
import type { Objective } from "./queries";
import { readObjective, type ObjectiveReading } from "./status";

// Réalisé et lecture d'objectifs (page Objectifs, tableaux de bord).

export type EvaluatedObjective = {
  objective: Objective;
  actual: { value: number | null; excludedCurrencies: string[] };
  reading: ObjectiveReading;
};

/** Réalisés calculés une fois par période distincte, sous la RLS de l'utilisateur. */
export async function evaluateObjectives(
  brand: BrandSummary,
  objectives: readonly Objective[],
  rates: readonly FxRate[],
  today: string,
): Promise<EvaluatedObjective[]> {
  const periodKey = (o: Objective) => `${o.periodStart}|${o.periodEnd}`;
  const periods = [...new Map(objectives.map((o) => [periodKey(o), o])).values()];
  const actualsByPeriod = new Map<string, ActualRow[]>(
    await Promise.all(periods.map(async (o) => [periodKey(o), await getActuals(brand.id, o.periodStart, o.periodEnd)] as const)),
  );
  return objectives.map((objective) => {
    const actual = knownActual(actualsByPeriod.get(periodKey(objective)) ?? [], objective.metric, objective.userId, brand.enabledModules, {
      currency: (objective.currency ?? brand.reportingCurrency) as Currency,
      date: objective.periodEnd,
      rates,
    });
    const reading = readObjective(actual.value, objective.target, { start: objective.periodStart, end: objective.periodEnd }, today);
    return { objective, actual, reading };
  });
}
