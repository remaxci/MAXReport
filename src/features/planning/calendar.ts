// Calendrier mensuel : grille du lundi au dimanche couvrant le mois entier.

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type Month = { year: number; month: number };

/** Mois de l'URL (AAAA-MM), ou celui de la date du jour. */
export function parseMonth(value: string | undefined, today: string): Month {
  const match = value ? MONTH.exec(value) : null;
  if (match) {
    const year = Number(match[1]);
    if (year >= 2000 && year <= 2100) return { year, month: Number(match[2]) };
  }
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

export function monthKey(m: Month): string {
  return `${m.year}-${String(m.month).padStart(2, "0")}`;
}

export function shiftMonth(m: Month, delta: number): Month {
  const index = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

const LABEL = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

export function monthLabel(m: Month): string {
  const label = LABEL.format(new Date(Date.UTC(m.year, m.month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Semaines (lundi → dimanche) qui couvrent le mois ; chaque jour indique s'il appartient au mois. */
export function monthGrid(m: Month): { date: string; inMonth: boolean }[][] {
  const first = new Date(Date.UTC(m.year, m.month - 1, 1));
  const last = new Date(Date.UTC(m.year, m.month, 0));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + ((7 - last.getUTCDay()) % 7));

  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    if ((day.getUTCDay() + 6) % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ date: iso(day), inMonth: day.getUTCMonth() === m.month - 1 });
  }
  return weeks;
}
