import { tableWorkbook, workbookResponse } from "@/features/dashboard/export";
import { todayIso } from "@/lib/format";
import { periodFromQuery, periodLabel } from "@/lib/periods";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { canCompareSellers, readSellerSort, sortSellers } from "./comparison";
import { loadSellerComparison } from "./data";

// Export Excel : mêmes droits et mêmes chiffres que la page (RLS).

export async function exportSellers(request: Request, slug: string): Promise<Response> {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) return new Response("Page introuvable.", { status: 404 });
  if (!canCompareSellers(ctx.access, brand.id)) return new Response("Accès refusé.", { status: 403 });
  const query = new URL(request.url).searchParams;
  const period = periodFromQuery(query.get("periode") ?? undefined, query.get("du") ?? undefined, todayIso());
  const comparison = await loadSellerComparison({ brand, access: ctx.access, period });
  const sort = readSellerSort(query.get("tri") ?? undefined, comparison.columns);
  const toRow = (r: (typeof comparison.rows)[number]) => ({ label: r.label, values: r.values, notes: [] });
  const workbook = tableWorkbook({
    sheet: "Commerciaux",
    title: `Comparaison des commerciaux · ${brand.name}`,
    subtitle: `Période : ${periodLabel(period)} · montants en ${comparison.currency}`,
    firstColumn: "Commercial",
    columns: comparison.columns,
    rows: sortSellers(comparison.rows, sort).map(toRow),
    total: { ...toRow(comparison.total), notes: comparison.notes },
  });
  return workbookResponse(workbook, `MAXreport-Commerciaux-${brand.code}-${period.start}.xlsx`);
}
