import { getFxRates } from "@/features/fx/queries";
import type { Period } from "@/lib/periods";
import type { BrandSummary } from "@/server/authz/context";
import type { Access } from "@/server/authz/permissions";
import { loadDashboard, type SectionKey } from "./data";
import type { DirectionColumn, DirectionRow } from "./export";

// Vue Direction : mêmes indicateurs que les tableaux de bord de marque, en XOF
// (devise de reporting de la Direction), puis le total consolidé. Seuls des
// flux s'additionnent entre marques ; la RLS s'applique à chaque marque.

const COLUMNS: (DirectionColumn & { section: SectionKey; kpi: string })[] = [
  { section: "commercial", kpi: "revenue_signed", key: "commercial.revenue_signed", label: "CA signé (XOF)", format: "money" },
  { section: "commercial", kpi: "contracts_signed", key: "commercial.contracts_signed", label: "Contrats signés", format: "count" },
  { section: "commercial", kpi: "opportunities_created", key: "commercial.opportunities_created", label: "Opportunités créées", format: "count" },
  { section: "commercial", kpi: "offers_sent", key: "commercial.offers_sent", label: "Offres envoyées", format: "count" },
  { section: "campaigns", kpi: "spend", key: "campaigns.spend", label: "Dépense campagnes (XOF)", format: "money" },
  { section: "campaigns", kpi: "leads", key: "campaigns.leads", label: "Leads", format: "count" },
  { section: "budgets", kpi: "engaged", key: "budgets.engaged", label: "Budget engagé (XOF)", format: "money" },
];
export const DIRECTION_COLUMNS: DirectionColumn[] = COLUMNS.map(({ key, label, format }) => ({ key, label, format }));

export async function loadDirection(brands: BrandSummary[], access: Access, period: Period): Promise<{ rows: DirectionRow[]; total: DirectionRow }> {
  const rates = await getFxRates();
  const rows = await Promise.all(
    brands.map(async (brand): Promise<DirectionRow> => {
      const sections = await loadDashboard({
        brand,
        access,
        period,
        currency: "XOF",
        sections: ["commercial", "campaigns", "budgets"],
        rates,
      });
      const values: Record<string, number | null> = {};
      for (const column of COLUMNS) {
        const section = sections.find((s) => s.key === column.section);
        values[column.key] = section?.kpis.find((k) => k.key === column.kpi)?.value ?? null;
      }
      // Seules les réserves qui affectent les totaux remontent dans la vue consolidée.
      const notes = sections.flatMap((s) => s.notes.filter((n) => n.includes("taux de change") || n.includes("historique")));
      return { label: brand.name, values, notes };
    }),
  );
  const values: Record<string, number | null> = {};
  for (const column of COLUMNS) {
    const known = rows.map((r) => r.values[column.key]).filter((v): v is number => v !== null && v !== undefined);
    values[column.key] = known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
  }
  return { rows, total: { label: `Total (${brands.length} marque(s))`, values, notes: [] } };
}
