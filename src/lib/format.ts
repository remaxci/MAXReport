// Formats d'affichage en français. Dates au format AAAA-MM-JJ (colonnes `date`).

const MONEY = {
  XOF: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }),
  EUR: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }),
  USD: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }),
} as const;

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null || currency === null) return "—";
  const format = MONEY[currency as keyof typeof MONEY];
  return format ? format.format(amount) : `${amount} ${currency}`;
}

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Abidjan",
});

/** « 2026-11-12 » → « 12 nov. 2026 ». */
export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "—" : DATE.format(date);
}

/** Horodatage (timestamptz) à l'heure d'Abidjan. */
export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_TIME.format(date);
}

/** Date du jour à Abidjan (UTC+0), au format AAAA-MM-JJ. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}
