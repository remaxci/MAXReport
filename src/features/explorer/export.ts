import ExcelJS from "exceljs";
import type { Chart, ChartColumn } from "@/features/dashboard/chart-data";
import { workbookResponse } from "@/features/dashboard/export";
import { formatDateTime, todayIso } from "@/lib/format";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { loadExploration } from "./data";
import { explorerBrands, explorerIndicators } from "./scope";
import { parseSettings } from "./settings";

// Export Excel de l'explorateur : le tableau du graphique, mêmes droits et
// mêmes chiffres qu'à l'écran (RLS).

const NUMBER_FORMATS: Record<ChartColumn["format"], string> = { count: "#,##0", money: "#,##0", percent: '0.0" %"' };

/** Une feuille : titre, une ligne par période, une colonne par série, puis les remarques. */
export function chartWorkbook(chart: Chart): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MAXreport";
  const sheet = workbook.addWorksheet("Données");
  const columns: ChartColumn[] = [
    ...chart.series.map((s) => ({ key: s.key, label: s.label, format: chart.format, currency: chart.currency })),
    ...(chart.extras ?? []),
  ];
  sheet.columns = [{ width: 24 }, ...columns.map(() => ({ width: 22 }))];
  sheet.addRow([chart.title]).font = { bold: true, size: 14 };
  if (chart.description) sheet.addRow([chart.description]);
  sheet.addRow([`Généré le ${formatDateTime(new Date().toISOString())} par MAXreport`]).font = { italic: true, color: { argb: "FF666666" } };
  sheet.addRow([]);
  sheet.addRow([
    "Période",
    ...columns.map((c) => (c.format === "money" && c.currency ? `${c.label} (${c.currency})` : c.format === "percent" ? `${c.label} (%)` : c.label)),
  ]).font = { bold: true };
  for (const row of chart.rows) {
    const line = sheet.addRow([row.title ?? row.label, ...columns.map((c) => row.values[c.key] ?? null)]);
    columns.forEach((c, i) => {
      line.getCell(i + 2).numFmt = NUMBER_FORMATS[c.format];
    });
  }
  if (chart.notes.length > 0) {
    sheet.addRow([]);
    for (const note of chart.notes) sheet.addRow([note]).font = { italic: true };
  }
  sheet.addRow([]);
  sheet.addRow(["Cellule vide : aucune donnée (jamais 0)."]).font = { italic: true, color: { argb: "FF666666" } };
  return workbook;
}

export async function exportExploration(request: Request, slug: string): Promise<Response> {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) return new Response("Page introuvable.", { status: 404 });
  if (!can(ctx.access, "brand.read", brand.id)) return new Response("Accès refusé.", { status: 403 });
  const params = new URL(request.url).searchParams;
  const query = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));
  const brands = explorerBrands(ctx, brand);
  const { fallback } = explorerIndicators(ctx, brands, brand);
  if (!fallback) return new Response("Aucun indicateur disponible.", { status: 404 });
  const { end, ...settings } = parseSettings(query, { brands, defaultBrandId: brand.id, defaultIndicator: fallback });
  const exploration = await loadExploration(settings, { brands, access: ctx.access, end: end ?? todayIso() });
  if (!exploration || exploration.measured.length === 0) return new Response("Rien à exporter.", { status: 404 });
  return workbookResponse(chartWorkbook(exploration.chart), `MAXreport-explorateur-${exploration.indicator.key}-${end ?? todayIso()}.xlsx`);
}
