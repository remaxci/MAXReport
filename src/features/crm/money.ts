import { convert, type Currency, type FxRate } from "@/lib/metrics/currency";

/**
 * Somme de montants dans une devise cible : XOF et EUR via la parité fixe,
 * les autres paires au dernier taux saisi à la date du montant (à défaut,
 * `date`) ; les montants sans taux connu sont comptés à part, jamais pour zéro.
 */
export function sumInCurrency(
  items: { amount: number | null; currency: string | null; date?: string }[],
  target: Currency,
  date: string,
  rates: readonly FxRate[] = [],
): { total: number; excluded: number } {
  let total = 0;
  let excluded = 0;
  for (const item of items) {
    if (item.amount === null || item.currency === null) continue;
    const value = convert(item.amount, item.currency as Currency, target, item.date ?? date, rates);
    if (value === null) excluded += 1;
    else total += value;
  }
  return { total, excluded };
}
