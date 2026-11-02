// Indicateurs commerciaux suivis par les objectifs, et réalisés agrégés
// (fonction SQL `metric_actuals`). Une seule source par indicateur :
// docs/architecture.md, section 6.

import { convert, type Currency } from "./currency";

export const METRIC_KEYS = [
  "calls",
  "emails_sent",
  "qualified_meetings",
  "opportunities_created",
  "offers_sent",
  "memos_sent",
  "contracts_signed",
  "revenue_signed",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRICS: Record<MetricKey, { label: string; source: string; money?: true }> = {
  calls: { label: "Appels", source: "Fiches hebdomadaires (prospection et relance)" },
  emails_sent: { label: "E-mails envoyés", source: "Fiches hebdomadaires" },
  qualified_meetings: { label: "Rendez-vous qualifiés", source: "Fiches hebdomadaires" },
  opportunities_created: {
    label: "Opportunités créées",
    source: "CRM (date de création), ou fiches hebdomadaires sans le module CRM",
  },
  offers_sent: { label: "Offres envoyées", source: "Registre des offres (date d'envoi)" },
  memos_sent: {
    label: "Mémos envoyés",
    source: "Registre des mémos (date d'envoi), ou fiches hebdomadaires sans le module",
  },
  contracts_signed: { label: "Contrats signés", source: "Contrats (date de signature)" },
  revenue_signed: { label: "Chiffre d'affaires signé", source: "Contrats (montant signé)", money: true },
};

export function isMetricKey(value: string): value is MetricKey {
  return (METRIC_KEYS as readonly string[]).includes(value);
}

/**
 * Indicateur tiré des fiches hebdomadaires (et non d'un registre) : sans fiche
 * soumise sur la période, sa valeur est inconnue, pas nulle.
 */
export function comesFromReports(metric: MetricKey, enabledModules: readonly string[]): boolean {
  if (metric === "calls" || metric === "emails_sent" || metric === "qualified_meetings") return true;
  if (metric === "opportunities_created") return !enabledModules.includes("crm");
  if (metric === "memos_sent") return !enabledModules.includes("memos");
  return false;
}

/**
 * Indicateurs mesurables pour une marque selon ses modules : les offres et les
 * contrats n'ont pas de déclaration de repli, ils exigent leur registre.
 */
export function availableMetrics(enabledModules: readonly string[]): MetricKey[] {
  return METRIC_KEYS.filter((metric) => {
    if (metric === "offers_sent") return enabledModules.includes("offers");
    if (metric === "contracts_signed" || metric === "revenue_signed") return enabledModules.includes("contracts");
    if (comesFromReports(metric, enabledModules)) return enabledModules.includes("activities");
    return true;
  });
}

/** Ligne renvoyée par `metric_actuals` ; userId null = collègues regroupés. */
export type ActualRow = { userId: string | null; metricKey: string; currency: string | null; value: number };

export function toActualRows(
  data: { user_id: string | null; metric_key: string; currency: string | null; value: number }[],
): ActualRow[] {
  return data.map((r) => ({ userId: r.user_id, metricKey: r.metric_key, currency: r.currency, value: Number(r.value) }));
}

export type ActualValue = {
  value: number;
  /** Devises de montants laissés de côté faute de taux de change (jamais comptés pour 0). */
  excludedCurrencies: string[];
};

/**
 * Réalisé d'un indicateur : pour un collaborateur, ou pour toute l'équipe
 * (`userId` null, toutes lignes confondues). Les montants sont convertis dans
 * la devise demandée ; ceux sans taux connu sont exclus et signalés.
 */
export function actualValue(
  rows: readonly ActualRow[],
  metric: MetricKey,
  userId: string | null,
  options: { currency?: Currency; date?: string } = {},
): ActualValue {
  let value = 0;
  const excluded = new Set<string>();
  for (const row of rows) {
    if (row.metricKey !== metric) continue;
    if (userId !== null && row.userId !== userId) continue;
    if (!METRICS[metric].money) {
      value += row.value;
      continue;
    }
    const target = options.currency ?? "XOF";
    const converted = row.currency
      ? convert(row.value, row.currency as Currency, target, options.date ?? "9999-12-31", [])
      : null;
    if (converted === null) excluded.add(row.currency ?? "?");
    else value += converted;
  }
  return { value, excludedCurrencies: [...excluded].sort() };
}

/**
 * Réalisé affichable : inconnu (null) quand l'indicateur dépend des fiches
 * hebdomadaires et qu'aucune fiche soumise ne le renseigne (`metric_actuals`
 * renvoie une ligne par fiche comptée, même à 0). Un registre sans ligne vaut 0.
 */
export function knownActual(
  rows: readonly ActualRow[],
  metric: MetricKey,
  userId: string | null,
  enabledModules: readonly string[],
  options: { currency?: Currency; date?: string } = {},
): { value: number | null; excludedCurrencies: string[] } {
  const matched = rows.some((r) => r.metricKey === metric && (userId === null || r.userId === userId));
  if (!matched && comesFromReports(metric, enabledModules)) return { value: null, excludedCurrencies: [] };
  return actualValue(rows, metric, userId, options);
}
