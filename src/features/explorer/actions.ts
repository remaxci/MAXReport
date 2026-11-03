"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { acceptsWidget, canCreateDashboard, canManageDashboard, getDashboard, moveItem } from "./dashboards";
import { MAX_WIDGETS, widgetSchema, type ExplorerSettings } from "./settings";

// Tableaux de bord personnalisés. Droits revérifiés ici, écriture sous RLS ;
// les réglages enregistrés sont validés (jamais de chiffres, jamais de champ libre).

const uuid = z.uuid();
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const dashboardSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(120, "120 caractères au maximum."),
  description: z.preprocess(blank, z.string().trim().max(500, "500 caractères au maximum.").optional()),
  shared: z.preprocess((v) => v === "1" || v === "on", z.boolean()),
});

function duplicateName(error: { code?: string }): ActionState | null {
  return error.code === "23505"
    ? { ok: false, message: "Vérifiez les champs signalés.", fieldErrors: { name: ["Un tableau porte déjà ce nom."] } }
    : null;
}

/** Nouveau tableau, dans la marque courante ou pour la Direction (`scope=direction`). */
export async function createDashboard(brandSlug: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, brandSlug);
  if (!brand) return forbidden();
  const brandId = formData.get("scope") === "direction" ? null : brand.id;
  if (!canCreateDashboard(ctx, brandId)) return forbidden();
  const parsed = dashboardSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_dashboards")
    .insert({ brand_id: brandId, name: parsed.data.name, description: parsed.data.description ?? null, is_shared: parsed.data.shared })
    .select("id")
    .single();
  if (error) return duplicateName(error) ?? failed(error);
  redirect(`/m/${brand.slug}/tableaux/${data.id}`);
}

/** Tableau modifiable par l'utilisateur (RLS, puis mêmes règles côté serveur), ou null. */
async function manageable(dashboardId: string) {
  if (!uuid.safeParse(dashboardId).success) return null;
  const ctx = await getAuthContext();
  const dashboard = await getDashboard(dashboardId);
  if (!dashboard || !canManageDashboard(ctx, dashboard)) return null;
  return { ctx, dashboard };
}

export async function updateDashboard(dashboardId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const found = await manageable(dashboardId);
  if (!found) return forbidden();
  const parsed = dashboardSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  // Rendre personnel le tableau d'un autre : refusé (il disparaîtrait pour son auteur).
  if (!parsed.data.shared && found.dashboard.createdBy !== found.ctx.userId) {
    return { ok: false, message: "Seul l'auteur peut rendre ce tableau personnel." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_dashboards")
    .update({ name: parsed.data.name, description: parsed.data.description ?? null, is_shared: parsed.data.shared })
    .eq("id", dashboardId)
    .select("id");
  if (error) return duplicateName(error) ?? failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Tableau enregistré." };
}

export async function deleteDashboard(dashboardId: string, brandSlug: string, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  const found = await manageable(dashboardId);
  if (!found) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase.from("custom_dashboards").delete().eq("id", dashboardId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  const brand = findBrand(found.ctx, brandSlug);
  redirect(brand ? `/m/${brand.slug}/tableaux` : "/");
}

async function saveWidgets(dashboardId: string, widgets: unknown[]): Promise<ActionState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("custom_dashboards").update({ widgets: widgets as never }).eq("id", dashboardId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return null;
}

/** Ajoute le graphique de l'explorateur (réglages revalidés) au tableau choisi. */
export async function addWidget(settings: ExplorerSettings, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const dashboardId = String(formData.get("dashboardId") ?? "");
  const found = await manageable(dashboardId);
  if (!found) {
    return { ok: false, message: "Vérifiez les champs signalés.", fieldErrors: { dashboardId: ["Choisissez un tableau que vous pouvez modifier."] } };
  }
  const title = String(formData.get("title") ?? "").trim();
  const parsed = widgetSchema.safeParse({ ...settings, ...(title ? { title } : {}) });
  if (!parsed.success) return invalid(parsed.error);
  if (!acceptsWidget(found.dashboard, parsed.data)) {
    return { ok: false, message: "Un tableau de marque ne reçoit que des graphiques de sa marque : choisissez un tableau Direction." };
  }
  if (found.dashboard.raw.length >= MAX_WIDGETS) return { ok: false, message: `${MAX_WIDGETS} graphiques au maximum par tableau.` };
  const error = await saveWidgets(dashboardId, [...found.dashboard.raw, parsed.data]);
  if (error) return error;
  refresh();
  return { ok: true, message: `Ajouté à « ${found.dashboard.name} ».` };
}

export async function moveWidget(dashboardId: string, index: number, delta: -1 | 1, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  const found = await manageable(dashboardId);
  if (!found || !Number.isInteger(index)) return forbidden();
  const error = await saveWidgets(dashboardId, moveItem(found.dashboard.raw, index, delta));
  if (error) return error;
  refresh();
  return { ok: true, message: "Ordre enregistré." };
}

export async function removeWidget(dashboardId: string, index: number, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  const found = await manageable(dashboardId);
  if (!found || !Number.isInteger(index) || index < 0 || index >= found.dashboard.raw.length) return forbidden();
  const error = await saveWidgets(dashboardId, found.dashboard.raw.filter((_, i) => i !== index));
  if (error) return error;
  refresh();
  return { ok: true, message: "Graphique retiré." };
}
