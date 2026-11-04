import { cache } from "react";
import { readCutover, type HistoricalRow } from "@/lib/metrics/history";
import { createClient } from "@/lib/supabase/server";

// Lectures propres aux tableaux de bord, sous la RLS de l'utilisateur. Celles que
// partagent indicateurs et graphiques sont lues une fois par requête (cache).

/** Date de bascule de l'historique (paramètres du module Imports), ou null. */
export const getHistoryCutover = cache(async (brandId: string): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_modules")
    .select("settings")
    .eq("brand_id", brandId)
    .eq("module_key", "imports")
    .maybeSingle();
  if (error) throw error;
  return readCutover(data?.settings);
});

export const listHistoricalRows = cache(async (brandId: string): Promise<HistoricalRow[]> => {
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
});

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

/** Offres envoyées dans la période et abouties, par commercial responsable. */
export async function getOfferOutcomesByOwner(brandId: string, from: string, to: string): Promise<Map<string, { sent: number; success: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_documents")
    .select("owner_id, statuses(category)")
    .eq("brand_id", brandId)
    .eq("kind", "offer")
    .is("archived_at", null)
    .gte("sent_on", from)
    .lte("sent_on", to)
    .limit(20000);
  if (error) throw error;
  const outcomes = new Map<string, { sent: number; success: number }>();
  for (const row of data as unknown as { owner_id: string; statuses: { category: string } | null }[]) {
    const current = outcomes.get(row.owner_id) ?? { sent: 0, success: 0 };
    outcomes.set(row.owner_id, { sent: current.sent + 1, success: current.success + (row.statuses?.category === "success" ? 1 : 0) });
  }
  return outcomes;
}

/** Graphiques que la personne connectée a masqués sur le tableau de bord de cette marque. */
export async function getHiddenCharts(brandId: string, userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dashboard_chart_preferences")
    .select("hidden")
    .eq("brand_id", brandId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.hidden ?? [];
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

export type PipelineStage = { id: string; label: string; position: number; isActive: boolean };

/** Étapes « en cours » du pipeline, dans leur ordre (entonnoir). */
export async function getOpenStages(brandId: string): Promise<PipelineStage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, label, position, is_active")
    .eq("brand_id", brandId)
    .eq("category", "open")
    .order("position");
  if (error) throw error;
  return data.map((s) => ({ id: s.id, label: s.label, position: s.position, isActive: s.is_active }));
}

/** Opportunités non archivées visibles (RLS : toutes, ou les siennes), avec leur étape. */
export async function getOpportunityStages(brandId: string): Promise<{ stageId: string; amount: number | null; currency: string | null }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("stage_id, amount, currency")
    .eq("brand_id", brandId)
    .is("archived_at", null)
    .limit(20000);
  if (error) throw error;
  return data.map((o) => ({ stageId: o.stage_id, amount: o.amount === null ? null : Number(o.amount), currency: o.currency }));
}
