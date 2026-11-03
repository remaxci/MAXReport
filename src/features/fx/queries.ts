import { cache } from "react";
import type { Currency, FxRate } from "@/lib/metrics/currency";
import { createClient } from "@/lib/supabase/server";

// Taux de change communs à toutes les marques (lecture ouverte aux personnes connectées).

export type FxRateRow = FxRate & { id: string; source: string; createdAt: string };

export async function listFxRates(limit = 2000): Promise<FxRateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fx_rates")
    .select("id, rate_date, from_currency, to_currency, rate, source, created_at")
    .order("rate_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    date: r.rate_date,
    from: r.from_currency as Currency,
    to: r.to_currency as Currency,
    rate: Number(r.rate),
    source: r.source,
    createdAt: r.created_at,
  }));
}

/** Taux utilisés pour convertir les montants (EUR/XOF : parité fixe, hors table). Lus une fois par requête. */
export const getFxRates = cache(async (): Promise<FxRate[]> => {
  return (await listFxRates()).map(({ date, from, to, rate }) => ({ date, from, to, rate }));
});
