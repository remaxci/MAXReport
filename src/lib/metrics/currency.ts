// Conversion de devises : docs/architecture.md, section 6.
// Le montant d'origine est toujours conservé ; la conversion se fait au calcul.

export const CURRENCIES = ["XOF", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Parité fixe du franc CFA (UEMOA) : 1 EUR = 655,957 XOF. */
export const XOF_PER_EUR = 655.957;

export type FxRate = {
  /** Date d'effet, au format AAAA-MM-JJ. */
  date: string;
  from: Currency;
  to: Currency;
  rate: number;
};

/**
 * Taux de `from` vers `to` applicable à `date` : le dernier taux connu à cette
 * date (direct ou inverse). EUR ↔ XOF utilise la parité fixe. Les autres paires
 * passent par l'euro si nécessaire. Renvoie null si aucun taux n'est connu.
 */
export function rateAt(
  from: Currency,
  to: Currency,
  date: string,
  rates: readonly FxRate[],
): number | null {
  if (from === to) return 1;
  if (from === "EUR" && to === "XOF") return XOF_PER_EUR;
  if (from === "XOF" && to === "EUR") return 1 / XOF_PER_EUR;

  const known = latestRate(from, to, date, rates);
  if (known !== null) return known;

  // Passage par l'euro (ex. USD → XOF avec un taux USD → EUR).
  if (from !== "EUR" && to !== "EUR") {
    const toEur = rateAt(from, "EUR", date, rates);
    const fromEur = rateAt("EUR", to, date, rates);
    if (toEur !== null && fromEur !== null) return toEur * fromEur;
  }

  return null;
}

/**
 * Convertit un montant. Renvoie null si le taux manque : l'appelant doit alors
 * exclure le montant du total et le signaler, jamais le compter pour 0.
 */
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  date: string,
  rates: readonly FxRate[],
): number | null {
  const rate = rateAt(from, to, date, rates);
  return rate === null ? null : amount * rate;
}

function latestRate(
  from: Currency,
  to: Currency,
  date: string,
  rates: readonly FxRate[],
): number | null {
  let best: { date: string; rate: number } | null = null;

  for (const r of rates) {
    if (r.date > date || r.rate <= 0) continue;
    const rate =
      r.from === from && r.to === to
        ? r.rate
        : r.from === to && r.to === from
          ? 1 / r.rate
          : null;
    if (rate !== null && (best === null || r.date > best.date)) {
      best = { date: r.date, rate };
    }
  }

  return best?.rate ?? null;
}
