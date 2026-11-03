import ExcelJS from "exceljs";
import { formatDateTime } from "@/lib/format";
import { evolution } from "@/lib/metrics/snapshots";
import type { Kpi, Section } from "./data";

// Exports Excel des tableaux de bord et rapports : mêmes chiffres qu'à l'écran.

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const NUMBER_FORMATS: Record<Kpi["format"], string> = {
  count: "#,##0",
  money: "#,##0",
  percent: '0.0" %"',
};

function header(sheet: ExcelJS.Worksheet, title: string, subtitle: string) {
  sheet.addRow([title]).font = { bold: true, size: 14 };
  sheet.addRow([subtitle]);
  sheet.addRow([`Généré le ${formatDateTime(new Date().toISOString())} par MAXreport`]).font = { italic: true, color: { argb: "FF666666" } };
  sheet.addRow([]);
}

export function workbookResponse(workbook: ExcelJS.Workbook, fileName: string): Promise<Response> {
  return workbook.xlsx.writeBuffer().then(
    (buffer) =>
      new Response(buffer, {
        headers: {
          "Content-Type": XLSX,
          "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w.-]+/g, "-")}"`,
          "Cache-Control": "no-store",
        },
      }),
  );
}

/** Une feuille « Synthèse » : une section par bloc, une ligne par indicateur. */
export function sectionsWorkbook(title: string, subtitle: string, sections: Section[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MAXreport";
  const sheet = workbook.addWorksheet("Synthèse");
  sheet.columns = [{ width: 44 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 10 }, { width: 50 }];
  header(sheet, title, subtitle);

  for (const section of sections) {
    sheet.addRow([section.title]).font = { bold: true, size: 12 };
    const head = sheet.addRow(["Indicateur", "Valeur", "Période précédente", "Évolution", "Devise", "Remarque"]);
    head.font = { bold: true };
    for (const kpi of section.kpis) {
      const change = kpi.format === "percent" ? null : evolution(kpi.value, kpi.previous);
      const row = sheet.addRow([
        kpi.label,
        kpi.value,
        kpi.previous,
        change === null ? null : change / 100,
        kpi.format === "money" ? (kpi.currency ?? "") : kpi.format === "percent" ? "%" : "",
        kpi.hint ?? "",
      ]);
      row.getCell(2).numFmt = NUMBER_FORMATS[kpi.format];
      row.getCell(3).numFmt = NUMBER_FORMATS[kpi.format];
      row.getCell(4).numFmt = '+0.0%;-0.0%;0.0%';
    }
    for (const note of section.notes) sheet.addRow([note]).font = { italic: true, color: { argb: "FF666666" } };
    sheet.addRow([]);
  }
  return workbook;
}

export type DirectionColumn = { key: string; label: string; format: Kpi["format"] };
export type DirectionRow = { label: string; values: Record<string, number | null>; notes: string[] };

/** Vue Direction : une ligne par marque, puis le total consolidé. */
export function directionWorkbook(
  subtitle: string,
  columns: DirectionColumn[],
  rows: DirectionRow[],
  total: DirectionRow,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MAXreport";
  const sheet = workbook.addWorksheet("Vue Direction");
  sheet.columns = [{ width: 28 }, ...columns.map(() => ({ width: 18 })), { width: 60 }];
  header(sheet, "Vue Direction consolidée", subtitle);
  sheet.addRow(["Marque", ...columns.map((c) => c.label), "Remarques"]).font = { bold: true };
  for (const r of [...rows, total]) {
    const row = sheet.addRow([r.label, ...columns.map((c) => r.values[c.key] ?? null), r.notes.join(" ")]);
    columns.forEach((c, i) => (row.getCell(i + 2).numFmt = NUMBER_FORMATS[c.format]));
    if (r === total) row.font = { bold: true };
  }
  return workbook;
}
