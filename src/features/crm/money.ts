import { convert, type Currency } from "@/lib/metrics/currency";

/**
 * Somme de montants dans une devise cible : XOF et EUR via la parité fixe ;
 * les montants sans taux connu (USD, tant que les taux ne sont pas saisis)
 * sont comptés à part, jamais pour zéro.
 */
export function sumInCurrency(
  items: { amount: number | null; currency: string | null }[],
  target: Currency,
  date: string,
): { total: number; excluded: number } {
  let total = 0;
  let excluded = 0;
  for (const item of items) {
    if (item.amount === null || item.currency === null) continue;
    const value = convert(item.amount, item.currency as Currency, target, date, []);
    if (value === null) excluded += 1;
    else total += value;
  }
  return { total, excluded };
}
