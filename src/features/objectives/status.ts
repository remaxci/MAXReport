import { achievementRate } from "@/lib/metrics/formulas";
import { elapsedShare } from "@/lib/periods";

// Lecture d'un objectif : taux d'atteinte comparé à l'avancement de la période.

export type ObjectiveStatus = "achieved" | "on_track" | "behind" | "missed" | "upcoming" | "unknown";

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  achieved: "Atteint",
  on_track: "En bonne voie",
  behind: "En retard",
  missed: "Non atteint",
  upcoming: "À venir",
  unknown: "Réalisé inconnu",
};

export type ObjectiveReading = {
  /** Taux d'atteinte en % (null si le réalisé est inconnu). */
  rate: number | null;
  /** Part écoulée de la période, en %. */
  elapsed: number;
  status: ObjectiveStatus;
};

export function readObjective(
  actual: number | null,
  target: number,
  period: { start: string; end: string },
  today: string,
): ObjectiveReading {
  const elapsed = elapsedShare(period.start, period.end, today) * 100;
  const rate = achievementRate(actual, target);
  if (today < period.start) return { rate, elapsed, status: rate !== null && rate >= 100 ? "achieved" : "upcoming" };
  if (rate === null) return { rate, elapsed, status: "unknown" };
  if (rate >= 100) return { rate, elapsed, status: "achieved" };
  if (today > period.end) return { rate, elapsed, status: "missed" };
  return { rate, elapsed, status: rate >= elapsed ? "on_track" : "behind" };
}

export type ObjectiveState = "current" | "upcoming" | "past";

export const OBJECTIVE_STATES: Record<ObjectiveState, { slug: string; label: string }> = {
  current: { slug: "en-cours", label: "En cours" },
  upcoming: { slug: "a-venir", label: "À venir" },
  past: { slug: "termines", label: "Terminés" },
};

export function parseObjectiveState(value: string | undefined): ObjectiveState {
  const found = (Object.keys(OBJECTIVE_STATES) as ObjectiveState[]).find((s) => OBJECTIVE_STATES[s].slug === value);
  return found ?? "current";
}
