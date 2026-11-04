"use server";

import { refresh } from "next/cache";
import { failed, forbidden, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { chartGroups, hiddenFromForm } from "./chart-catalog";

// Choix des graphiques : préférences de la personne connectée seulement (RLS).
// Seuls les graphiques proposés à cette personne sont retenus, jamais le texte reçu.

export async function saveChartPreferences(slug: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) return forbidden();
  const hidden = hiddenFromForm(chartGroups(brand, ctx.access), new Set(formData.getAll("visible").map(String)));
  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_chart_preferences")
    .upsert({ user_id: ctx.userId, brand_id: brand.id, hidden }, { onConflict: "user_id,brand_id" });
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Choix enregistré." };
}
