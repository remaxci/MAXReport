import { availableSections, type KpiFormat, type SectionKey } from "@/features/dashboard/data";
import { KINDS, type MarketingKind } from "@/features/marketing/config";
import { availableMetrics, METRIC_KEYS, METRICS, type MetricKey } from "@/lib/metrics/actuals";
import type { BrandSummary } from "@/server/authz/context";
import type { Access } from "@/server/authz/permissions";

// Indicateurs de l'explorateur : ceux des tableaux de bord qui ont un sens
// période par période et s'additionnent entre marques (flux et stocks). Les
// valeurs non additives (portée, utilisateurs uniques) n'y figurent pas : elles
// n'existent que pour la période exacte d'un relevé.

export type Indicator = {
  key: string;
  label: string;
  group: string;
  section: SectionKey;
  format: KpiFormat;
  source: { kind: "metric"; metric: MetricKey } | { kind: "snapshot"; snapshot: MarketingKind; field: string; money: boolean };
};

const SNAPSHOT_SECTIONS: Record<MarketingKind, SectionKey> = { social: "social", campaign: "campaigns", website: "websites" };

const snapshotIndicators = (kind: MarketingKind): Indicator[] =>
  [...KINDS[kind].measures, ...KINDS[kind].extraMeasures]
    .filter((m) => m.aggregation !== "exact")
    .map((m) => ({
      key: `${kind}.${m.key}`,
      label: KINDS[kind].extraMeasures.includes(m) ? `Sessions · ${m.label}` : m.label,
      group: KINDS[kind].title,
      section: SNAPSHOT_SECTIONS[kind],
      format: m.money ? "money" : "count",
      source: { kind: "snapshot", snapshot: kind, field: m.key, money: m.money === true },
    }));

export const INDICATORS: Indicator[] = [
  ...METRIC_KEYS.map(
    (metric): Indicator => ({
      key: `commercial.${metric}`,
      label: METRICS[metric].label,
      group: "Commercial",
      section: "commercial",
      format: METRICS[metric].money ? "money" : "count",
      source: { kind: "metric", metric },
    }),
  ),
  ...snapshotIndicators("social"),
  ...snapshotIndicators("campaign"),
  ...snapshotIndicators("website"),
];

const BY_KEY = new Map(INDICATORS.map((i) => [i.key, i]));

export function findIndicator(key: string | undefined): Indicator | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

export function isIndicatorKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** L'indicateur est mesurable pour cette marque (module actif) et ouvert à l'utilisateur (droits). */
export function indicatorAvailable(indicator: Indicator, brand: BrandSummary, access: Access): boolean {
  if (!availableSections(brand, access).includes(indicator.section)) return false;
  return indicator.source.kind === "metric" ? availableMetrics(brand.enabledModules).includes(indicator.source.metric) : true;
}
