import { readCutover, type HistoricalRow } from "@/lib/metrics/history";
import { createClient } from "@/lib/supabase/server";

// Lectures propres aux tableaux de bord, sous la RLS de l'utilisateur.

/** Date de bascule de l'historique (paramètres du module Imports), ou null. */
export async function getHistoryCutover(brandId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_modules")
    .select("settings")
    .eq("brand_id", brandId)
    .eq("module_key", "imports")
    .maybeSingle();
  if (error) throw error;
  return readCutover(data?.settings);
}

export async function listHistoricalRows(brandId: string): Promise<HistoricalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("historical_metrics")
    .select("user_id, metric_key, currency, value, period_start, period_end")
    .eq("brand_id", brandId)
    .limit(20000);
  if (error) throw error;
  return data.map((r) => ({
    userId: r.user_id,
    metricKey: r.metric_key,
    currency: r.currency,
    value: Number(r.value),
    start: r.period_start,
    end: r.period_end,
  }));
}

/**
 * Offres (ou mémos) envoyées dans la période, et combien ont abouti (statut de
 * catégorie « succès ») : base du taux de transformation, par date d'envoi.
 */
export async function getDocumentOutcomes(
  brandId: string,
  kind: "offer" | "memo",
  from: string,
  to: string,
): Promise<{ sent: number; success: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_documents")
    .select("statuses(category)")
    .eq("brand_id", brandId)
    .eq("kind", kind)
    .is("archived_at", null)
    .gte("sent_on", from)
    .lte("sent_on", to)
    .limit(20000);
  if (error) throw error;
  const rows = data as unknown as { statuses: { category: string } | null }[];
  return { sent: rows.length, success: rows.filter((r) => r.statuses?.category === "success").length };
}

/** Opportunités en cours, avec la probabilité de leur étape (pipeline pondéré). */
export async function getOpenPipeline(brandId: string): Promise<{ amount: number | null; currency: string | null; probability: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("amount, currency, pipeline_stages(category, probability)")
    .eq("brand_id", brandId)
    .is("archived_at", null)
    .limit(20000);
  if (error) throw error;
  const rows = data as unknown as {
    amount: number | null;
    currency: string | null;
    pipeline_stages: { category: string; probability: number } | null;
  }[];
  return rows
    .filter((r) => r.pipeline_stages?.category === "open")
    .map((r) => ({ amount: r.amount === null ? null : Number(r.amount), currency: r.currency, probability: r.pipeline_stages!.probability }));
}
