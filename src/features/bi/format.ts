// Mise en forme des jeux de données : colonnes dans l'ordre du catalogue,
// valeur absente = vide (jamais 0). En CSV, une cellule texte qui commence
// comme une formule (=, +, -, @) est neutralisée pour Excel.

export type Row = Record<string, unknown>;

export function orderRow(row: Row, columns: readonly string[]): Row {
  return Object.fromEntries(columns.map((column) => [column, row[column] ?? null]));
}

const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let text = typeof value === "string" ? value : JSON.stringify(value);
  if (FORMULA.test(text)) text = `'${text}`;
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV (RFC 4180, séparateur virgule, fins de ligne CRLF), en-tête compris. */
export function toCsv(rows: readonly Row[], columns: readonly string[]): string {
  const lines = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))];
  return `${lines.join("\r\n")}\r\n`;
}
