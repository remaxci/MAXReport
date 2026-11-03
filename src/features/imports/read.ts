import ExcelJS from "exceljs";
import { parseCsv } from "./csv";
import type { Cell } from "./values";

// Lecture d'un fichier envoyé (CSV ou Excel) en en-têtes et lignes brutes.
// Les dates Excel deviennent AAAA-MM-JJ ; le reste reste texte ou nombre.

export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_COLUMNS = 60;
/** Taille décompressée maximale d'un classeur Excel (protection contre les « bombes zip »). */
export const MAX_XLSX_UNCOMPRESSED = 60 * 1024 * 1024;
export const IMPORT_ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type Sheet = {
  headers: string[];
  rows: Cell[][];
  /** Numéro, dans le fichier, de la première ligne de données. */
  firstLine: number;
};

export type ReadResult = { ok: true; sheet: Sheet } | { ok: false; message: string };

/** UTF-8 si le fichier en est, sinon Windows-1252 (CSV enregistré par Excel). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function excelCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("formula" in value || "sharedFormula" in value) return excelCell((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  if ("hyperlink" in value) return String((value as ExcelJS.CellHyperlinkValue).text ?? "");
  if ("error" in value) return null;
  return null;
}

/**
 * Taille totale décompressée annoncée par le répertoire central d'une archive
 * zip (un fichier .xlsx en est une), sans rien décompresser. null : archive
 * illisible, ou au format zip64 (fichiers de plus de 4 Go).
 */
export function zipUncompressedSize(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fin du répertoire central : signature 0x06054b50, dans les 64 derniers Ko.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return null;
    const size = view.getUint32(offset + 24, true);
    if (size === 0xffffffff) return null;
    total += size;
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return total;
}

/** En-têtes uniques et non vides ; colonnes et lignes vides de fin retirées. */
export function shapeSheet(table: Cell[][], headerIndex = 0): ReadResult {
  const isEmpty = (c: Cell) => c === null || (typeof c === "string" && c.trim() === "");
  let start = headerIndex;
  while (start < table.length && table[start].every(isEmpty)) start++;
  if (start >= table.length) return { ok: false, message: "Le fichier est vide." };

  const width = Math.max(...table.slice(start).map((row) => {
    let w = row.length;
    while (w > 0 && isEmpty(row[w - 1])) w--;
    return w;
  }));
  if (width > MAX_IMPORT_COLUMNS) return { ok: false, message: `${MAX_IMPORT_COLUMNS} colonnes au maximum.` };

  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, i) => {
    const raw = table[start][i];
    const base = (raw === null ? "" : String(raw)).trim() || `Colonne ${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });

  const rows = table.slice(start + 1).map((row) => Array.from({ length: width }, (_, i) => row[i] ?? null));
  while (rows.length > 0 && rows[rows.length - 1].every(isEmpty)) rows.pop();
  if (rows.length === 0) return { ok: false, message: "Le fichier ne contient aucune ligne de données." };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `${MAX_IMPORT_ROWS} lignes au maximum par fichier.` };
  return { ok: true, sheet: { headers, rows, firstLine: start + 2 } };
}

export async function readSpreadsheet(name: string, bytes: Uint8Array): Promise<ReadResult> {
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "csv") {
    const table = parseCsv(decodeText(bytes)).map((row) => row.map((c): Cell => (c === "" ? null : c)));
    return shapeSheet(table);
  }
  if (extension !== "xlsx") return { ok: false, message: "Format non accepté : CSV ou Excel (.xlsx)." };

  const inflated = zipUncompressedSize(bytes);
  if (inflated === null) return { ok: false, message: "Fichier Excel illisible." };
  if (inflated > MAX_XLSX_UNCOMPRESSED) return { ok: false, message: "Classeur trop volumineux une fois décompressé." };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    return { ok: false, message: "Fichier Excel illisible." };
  }
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) return { ok: false, message: "Le fichier est vide." };
  if (sheet.rowCount > MAX_IMPORT_ROWS + 50) return { ok: false, message: `${MAX_IMPORT_ROWS} lignes au maximum par fichier.` };

  const table: Cell[][] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: Cell[] = [];
    for (let c = 1; c <= Math.min(sheet.columnCount, MAX_IMPORT_COLUMNS + 1); c++) cells.push(excelCell(row.getCell(c).value));
    table.push(cells);
  }
  return shapeSheet(table);
}
