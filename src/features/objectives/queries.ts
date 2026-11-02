import { isMetricKey, type MetricKey } from "@/lib/metrics/actuals";
import { createClient } from "@/lib/supabase/server";
import type { ObjectiveState } from "./status";

// Lectures sous RLS : chacun voit ses objectifs et ceux de l'équipe ; ceux des
// collègues exigent objectives.read_all.

export type Objective = {
  id: string;
  /** null : objectif collectif (toute l'équipe de la marque). */
  userId: string | null;
  metric: MetricKey;
  periodStart: string;
  periodEnd: string;
  target: number;
  currency: string | null;
  comments: string | null;
};

const COLUMNS = "id, user_id, metric_key, period_start, period_end, target_value, currency, comments";

type RawObjective = {
  id: string;
  user_id: string | null;
  metric_key: string;
  period_start: string;
  period_end: string;
  target_value: number;
  currency: string | null;
  comments: string | null;
};

function toObjective(row: RawObjective): Objective | null {
  if (!isMetricKey(row.metric_key)) return null;
  return {
    id: row.id,
    userId: row.user_id,
    metric: row.metric_key,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    target: Number(row.target_value),
    currency: row.currency,
    comments: row.comments,
  };
}

/** Objectifs en cours, à venir ou terminés au jour donné. */
export async function listObjectives(brandId: string, state: ObjectiveState, today: string): Promise<Objective[]> {
  const supabase = await createClient();
  let query = supabase.from("objectives").select(COLUMNS).eq("brand_id", brandId);
  if (state === "current") query = query.lte("period_start", today).gte("period_end", today);
  if (state === "upcoming") query = query.gt("period_start", today);
  if (state === "past") query = query.lt("period_end", today);
  const { data, error } = await query
    .order("period_start", { ascending: state !== "past" })
    .order("metric_key")
    .limit(300);
  if (error) throw error;
  return data.map(toObjective).filter((o): o is Objective => o !== null);
}

export async function getObjective(brandId: string, id: string): Promise<Objective | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("objectives").select(COLUMNS).eq("brand_id", brandId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toObjective(data) : null;
}
