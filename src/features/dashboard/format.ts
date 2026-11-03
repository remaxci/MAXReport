import { formatEvolution, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { evolution } from "@/lib/metrics/snapshots";
import type { Kpi } from "./data";

// Affichage des indicateurs (pages, rapports imprimés).

export function formatKpi(kpi: Pick<Kpi, "value" | "format" | "currency">): string {
  switch (kpi.format) {
    case "money":
      return kpi.value === null ? "—" : formatMoney(kpi.value, kpi.currency ?? "XOF");
    case "percent":
      return formatPercent(kpi.value, 1);
    case "count":
      return formatNumber(kpi.value);
  }
}

/** Évolution par rapport à la période précédente ; un taux varie en points. */
export function kpiEvolution(kpi: Kpi): string | null {
  if (kpi.previous === null) return null;
  if (kpi.format === "percent") {
    if (kpi.value === null) return null;
    const delta = kpi.value - kpi.previous;
    return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatNumber(Math.round(Math.abs(delta) * 10) / 10)} pt`;
  }
  return formatEvolution(evolution(kpi.value, kpi.previous));
}
