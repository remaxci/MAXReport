import { parseNumber } from "@/features/custom-fields/parse";
import { isIsoDate, PERIOD_KINDS, periodRange, type PeriodKind } from "@/lib/periods";
import type { Measure } from "./config";

// Lecture d'un relevé saisi : période et mesures. Un champ laissé vide reste
// vide (null) ; 0 n'est enregistré que s'il est saisi.

export type ParsedSnapshot =
  | { ok: true; periodStart: string; periodEnd: string; values: Record<string, number | null> }
  | { ok: false; errors: Record<string, string> };

const MAX_COUNT = 1e12;
const MAX_DAYS = 366;

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

export function parseSnapshotForm(measures: readonly Measure[], form: Readonly<Record<string, string>>): ParsedSnapshot {
  const errors: Record<string, string> = {};

  // Période : semaine, mois, trimestre ou année contenant une date, ou dates libres.
  let periodStart = "";
  let periodEnd = "";
  const kind = form.periodKind;
  if (kind === "custom") {
    if (!isIsoDate(form.periodStart)) errors.periodStart = "Date de début invalide.";
    if (!isIsoDate(form.periodEnd)) errors.periodEnd = "Date de fin invalide.";
    if (!errors.periodStart && !errors.periodEnd) {
      periodStart = form.periodStart;
      periodEnd = form.periodEnd;
      if (periodEnd < periodStart) errors.periodEnd = "La fin précède le début.";
      else if (daysBetween(periodStart, periodEnd) > MAX_DAYS) errors.periodEnd = "Un relevé couvre un an au plus.";
    }
  } else if ((PERIOD_KINDS as readonly string[]).includes(kind)) {
    if (!isIsoDate(form.anchor)) errors.anchor = "Choisissez une date dans la période.";
    else ({ start: periodStart, end: periodEnd } = periodRange(kind as PeriodKind, form.anchor));
  } else {
    errors.periodKind = "Période invalide.";
  }

  const values: Record<string, number | null> = {};
  for (const measure of measures) {
    const raw = (form[measure.key] ?? "").trim();
    if (raw === "") {
      values[measure.key] = null;
      continue;
    }
    const value = parseNumber(raw);
    if (value === null || !Number.isFinite(value)) errors[measure.key] = "Nombre attendu.";
    else if (value < 0) errors[measure.key] = "Valeur positive attendue.";
    else if (value > MAX_COUNT) errors[measure.key] = "Valeur trop grande.";
    else if (!measure.money && !Number.isInteger(value)) errors[measure.key] = "Nombre entier attendu.";
    else if (measure.money && /[.,]\d{3,}$/.test(raw)) errors[measure.key] = "Deux décimales au plus.";
    else values[measure.key] = value;
  }

  if (Object.keys(errors).length === 0 && Object.values(values).every((v) => v === null)) {
    errors[measures[0].key] = "Saisissez au moins une mesure.";
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, periodStart, periodEnd, values };
}

/** La ventilation des sessions par canal ne peut pas dépasser le total. */
export function channelsExceedTotal(values: Readonly<Record<string, number | null>>, channelKeys: readonly string[]): boolean {
  const total = values.sessions;
  if (total == null) return false;
  return channelKeys.reduce((sum, key) => sum + (values[key] ?? 0), 0) > total;
}
