import { isIsoDate } from "@/lib/periods";

// Lecture des valeurs d'un fichier importé : dates et nombres dans les formats
// des exports courants (Excel français, Meta, Google). Une cellule vide
// donne null, jamais 0.

export type Cell = string | number | null;
export type DateFormat = "dmy" | "mdy";
export type NumberFormat = "fr" | "en";

/** Clé de comparaison : minuscules, sans accents ni ponctuation. */
export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function isBlank(value: Cell | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return false;
  return ["", "-", "—", "n/d", "na", "n/a"].includes(value.trim().toLowerCase());
}

export function cellText(value: Cell | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? String(value) : value.trim();
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function iso(year: number, month: number, day: number): string | null {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isIsoDate(value) ? value : null;
}

/** Date AAAA-MM-JJ, ou null si la cellule n'est pas une date lisible. */
export function parseDateValue(value: Cell, format: DateFormat): string | null {
  if (value === null) return null;
  if (typeof value === "number") {
    // Numéro de série Excel (jours depuis le 30/12/1899).
    if (!Number.isInteger(value) || value < 20000 || value > 80000) return null;
    return new Date(EXCEL_EPOCH + value * 86_400_000).toISOString().slice(0, 10);
  }
  const text = value.trim();
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T].*)?$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const [day, month] = format === "dmy" ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
    return iso(year, month, day);
  }
  if (/^\d{5}$/.test(text)) return parseDateValue(Number(text), format);
  return null;
}

const CURRENCY_MARK = /^(?:xof|f\s?cfa|cfa|fcfa|eur|usd|€|\$)\s*|\s*(?:xof|f\s?cfa|cfa|fcfa|eur|usd|€|\$)$/gi;

/** Nombre, ou null si la cellule n'en est pas un (signe compris). */
export function parseNumberValue(value: Cell, format: NumberFormat): number | null {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = value.trim().replace(CURRENCY_MARK, "").replace(/[\s  ]/g, "");
  if (format === "fr") {
    if (text.includes(",") && text.includes(".")) text = text.replace(/\./g, "");
    text = text.replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
