// Feuille de route : une année découpée en trimestres et en mois, et la
// position des projets (barres) et des jalons (points) sur cette frise.

export type Range = { start: string; end: string };

/** Année de l'URL, ou celle de la date du jour. */
export function parseYear(value: string | undefined, today: string): number {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : Number(today.slice(0, 4));
}

export function yearRange(year: number): Range {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

const DAY = 86_400_000;
const time = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Part (0 à 100) de la frise écoulée au début du jour `date`. */
function offset(date: string, range: Range): number {
  const total = time(range.end) + DAY - time(range.start);
  return ((time(date) - time(range.start)) / total) * 100;
}

/**
 * Barre d'une période sur la frise (en %), coupée aux bords de la frise.
 * null : période entièrement hors de la frise. La fin est incluse.
 */
export function barPosition(span: Range, range: Range): { left: number; width: number } | null {
  if (span.end < range.start || span.start > range.end) return null;
  const start = span.start < range.start ? range.start : span.start;
  const end = span.end > range.end ? range.end : span.end;
  const left = offset(start, range);
  const right = offset(end, range) + (100 * DAY) / (time(range.end) + DAY - time(range.start));
  return { left: round(left), width: round(Math.max(right - left, 0.4)) };
}

/** Position (en %) d'un jour sur la frise, ou null s'il est en dehors. */
export function pointPosition(date: string, range: Range): number | null {
  if (date < range.start || date > range.end) return null;
  return round(offset(date, range));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Période affichée d'un projet : ses dates, complétées par ses jalons quand
 * l'une manque. null : rien pour le dater.
 */
export function projectSpan(
  project: { startOn: string | null; endOn: string | null },
  milestoneDates: readonly string[],
): Range | null {
  const sorted = [...milestoneDates].sort();
  const start = project.startOn ?? sorted[0] ?? project.endOn;
  const end = project.endOn ?? sorted[sorted.length - 1] ?? project.startOn;
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

/** Repères de la frise : trimestres et mois, avec leur position. */
export function yearTicks(year: number): {
  quarters: { label: string; left: number; width: number }[];
  months: { label: string; left: number; width: number }[];
} {
  const range = yearRange(year);
  const months = Array.from({ length: 12 }, (_, i) => {
    const start = `${year}-${String(i + 1).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10);
    const bar = barPosition({ start, end }, range)!;
    return { label: MONTH_LABEL.format(new Date(Date.UTC(year, i, 1))).replace(".", ""), ...bar };
  });
  const quarters = [0, 1, 2, 3].map((q) => {
    const first = months[q * 3];
    const last = months[q * 3 + 2];
    return { label: `T${q + 1} ${year}`, left: first.left, width: round(last.left + last.width - first.left) };
  });
  return { quarters, months };
}
