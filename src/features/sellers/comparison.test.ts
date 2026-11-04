import { describe, expect, it } from "vitest";
import { buildAccess, type Permission } from "@/server/authz/permissions";
import type { ActualRow } from "@/lib/metrics/actuals";
import {
  buildSellerComparison,
  canCompareSellers,
  comparedPeople,
  MAX_SELLER_SERIES,
  readSellerSort,
  sellerCharts,
  sellerColumns,
  sellerRevenueChart,
  sellerSlots,
  sortSellers,
} from "./comparison";

const MODULES = ["activities", "crm", "offers", "memos", "contracts"];
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const people = [
  { id: A, label: "Aminata" },
  { id: B, label: "Koffi" },
  { id: C, label: "Mariam" },
];
const actuals: ActualRow[] = [
  { userId: A, metricKey: "calls", currency: null, value: 40 },
  { userId: A, metricKey: "contracts_signed", currency: null, value: 2 },
  { userId: A, metricKey: "revenue_signed", currency: "XOF", value: 3_000_000 },
  { userId: B, metricKey: "calls", currency: null, value: 0 },
  { userId: B, metricKey: "contracts_signed", currency: null, value: 1 },
  { userId: B, metricKey: "revenue_signed", currency: "XOF", value: 1_000_000 },
];
const build = (rows = actuals, outcomes?: ReadonlyMap<string, { sent: number; success: number }>) =>
  buildSellerComparison({ actuals: rows, people, enabledModules: MODULES, currency: "XOF", rates: [], date: "2026-10-31", outcomes });
const row = (comparison: ReturnType<typeof build>, id: string) => comparison.rows.find((r) => r.id === id)!;

describe("droit de comparer", () => {
  const access = (permissions: Permission[]) => buildAccess([{ brandId: "x", permissions }]);

  it("mêmes droits que metric_actuals : un commercial ne compare pas", () => {
    expect(canCompareSellers(access(["activities.read_all"]), "x")).toBe(true);
    expect(canCompareSellers(access(["objectives.read_all"]), "x")).toBe(true);
    expect(canCompareSellers(access(["brand.read", "activities.manage_own", "offers.manage_own"]), "x")).toBe(false);
    expect(canCompareSellers(access(["activities.read_all"]), "y")).toBe(false);
  });
});

describe("tableau des commerciaux", () => {
  it("chiffres de chacun, part du CA et contrat moyen", () => {
    const comparison = build();
    expect(row(comparison, A).values.revenue_signed).toBe(3_000_000);
    expect(row(comparison, A).values.revenue_share).toBe(75);
    expect(row(comparison, B).values.revenue_share).toBe(25);
    expect(row(comparison, A).values.average_deal).toBe(1_500_000);
    expect(comparison.total.values.revenue_signed).toBe(4_000_000);
    expect(comparison.total.values.revenue_share).toBe(100);
    expect(comparison.total.label).toBe("Total (3 commerciaux)");
  });

  it("sans fiche, l'activité reste inconnue ; une fiche à 0 vaut 0 ; un registre vide vaut 0", () => {
    const comparison = build();
    expect(row(comparison, C).values.calls).toBeNull();
    expect(row(comparison, B).values.calls).toBe(0);
    expect(row(comparison, C).values.revenue_signed).toBe(0);
    expect(row(comparison, C).values.average_deal).toBeNull();
  });

  it("un montant sans taux de change est exclu et signalé, jamais compté pour 0 sans le dire", () => {
    const comparison = build([...actuals, { userId: C, metricKey: "revenue_signed", currency: "USD", value: 500 }]);
    expect(comparison.excludedCurrencies).toEqual(["USD"]);
    expect(sellerRevenueChart(comparison, "XOF")?.notes[0]).toContain("USD");
  });

  it("taux de transformation seulement si le lecteur voit toutes les offres", () => {
    expect(build().columns.some((c) => c.key === "offer_rate")).toBe(false);
    const comparison = build(actuals, new Map([[A, { sent: 4, success: 1 }]]));
    expect(comparison.columns.some((c) => c.key === "offer_rate")).toBe(true);
    expect(row(comparison, A).values.offer_rate).toBe(25);
    expect(row(comparison, B).values.offer_rate).toBeNull();
    expect(comparison.total.values.offer_rate).toBe(25);
  });

  it("colonnes selon les modules activés", () => {
    const keys = sellerColumns(["activities"], { offerRate: false }).map((c) => c.key);
    expect(keys).not.toContain("revenue_signed");
    expect(keys).not.toContain("offers_sent");
    expect(keys).toContain("calls");
  });
});

describe("personnes comparées", () => {
  it("les suivis et ceux qui ont un réalisé ; ancien collaborateur si le nom est inconnu", () => {
    const list = comparedPeople([{ id: A, label: "Aminata" }], [{ userId: B, metricKey: "calls", currency: null, value: 1 }, { userId: C, metricKey: "calls", currency: null, value: 1 }, { userId: null, metricKey: "calls", currency: null, value: 9 }], new Map([[B, "Koffi"]]));
    expect(list).toEqual([
      { id: A, label: "Aminata" },
      { id: C, label: "Ancien collaborateur" },
      { id: B, label: "Koffi" },
    ]);
  });
});

describe("classement", () => {
  it("du plus grand au plus petit ; l'inconnu après les chiffres connus", () => {
    const comparison = build();
    expect(sortSellers(comparison.rows, "revenue_signed").map((r) => r.id)).toEqual([A, B, C]);
    expect(sortSellers(comparison.rows, "calls").map((r) => r.id)).toEqual([A, B, C]);
  });

  it("tri limité aux colonnes affichées", () => {
    const columns = build().columns;
    expect(readSellerSort("calls", columns)).toBe("calls");
    expect(readSellerSort("mot_de_passe", columns)).toBe("revenue_signed");
    expect(readSellerSort(undefined, columns)).toBe("revenue_signed");
  });
});

describe("graphiques", () => {
  it("le CA trié, les autres dans l'ordre stable des personnes", () => {
    const charts = sellerCharts(build(), "XOF");
    expect(charts.map((c) => c.key)).toEqual(["sellers_revenue", "sellers_funnel", "sellers_contacts", "sellers_meetings"]);
    expect(charts[0].rows.map((r) => r.key)).toEqual([A, B, C]);
    expect(charts[0].rows[0].values.revenue_share).toBe(75);
    expect(charts[1].rows.map((r) => r.label)).toEqual(["Aminata", "Koffi", "Mariam"]);
    expect(charts.every((c) => c.rowHeader === "Commercial")).toBe(true);
  });

  it("aucun graphique sans commercial", () => {
    const empty = buildSellerComparison({ actuals: [], people: [], enabledModules: MODULES, currency: "XOF", rates: [], date: "2026-10-31" });
    expect(sellerCharts(empty, "XOF")).toEqual([]);
    expect(sellerRevenueChart(empty, "XOF")).toBeNull();
  });

  it("la couleur suit la personne, jamais de neuvième couleur", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, label: `Personne ${String(i).padStart(2, "0")}` }));
    const slots = sellerSlots(many);
    expect(slots.get("p0")).toEqual({ key: "c1", label: "Personne 00", color: 1 });
    expect(slots.get("p10")).toEqual({ key: "autres", label: "Autres commerciaux", color: MAX_SELLER_SERIES });
    expect(Math.max(...[...slots.values()].map((s) => s.color))).toBe(MAX_SELLER_SERIES);
    expect(sellerSlots(many.slice(0, 8)).get("p7")?.key).toBe("c8");
  });
});
