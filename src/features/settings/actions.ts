"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { MODULE_KEYS } from "@/config/modules";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/server/authz/context";
import {
  REORDERABLE_TABLES,
  STATUS_CATEGORIES,
  STATUS_ENTITIES,
  type ReorderableTable,
  type StatusEntity,
} from "./constants";
import { uniqueKey } from "./keys";

// Toutes les actions : identifiants vérifiés, permission revérifiée côté
// serveur, puis écriture sous RLS. Les garde-fous de la base (clés figées,
// statut par défaut, étapes système) restent l'arbitre final.

const id = z.uuid();
const label = z.string().trim().min(1, "Le libellé est obligatoire.").max(80, "80 caractères au maximum.");
const color = z
  .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide.")])
  .optional()
  .transform((value) => value || null);
const probability = z.coerce
  .number({ error: "Nombre attendu." })
  .int("Nombre entier attendu.")
  .min(0, "Entre 0 et 100.")
  .max(100, "Entre 0 et 100.");

const labelSchema = z.object({ label });
const labelColorSchema = z.object({ label, color });
const statusCreateSchema = z.object({
  label,
  color,
  category: z.enum(STATUS_CATEGORIES, { error: "Catégorie invalide." }),
});
const stageSchema = z.object({ label, probability });

async function canSettings(brandId: string) {
  return id.safeParse(brandId).success && (await authorize("settings.manage", brandId)) !== null;
}

function done(message: string): ActionState {
  refresh();
  return { ok: true, message };
}

// ---------------------------------------------------------------------
// Modules (super-administrateur)
// ---------------------------------------------------------------------

export async function setModuleEnabled(
  brandId: string,
  moduleKey: string,
  enabled: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!id.safeParse(brandId).success || !(MODULE_KEYS as readonly string[]).includes(moduleKey)) {
    return forbidden();
  }
  if (!(await authorize("modules.manage"))) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_modules")
    .update({ enabled })
    .eq("brand_id", brandId)
    .eq("module_key", moduleKey)
    .select("module_key");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return done(enabled ? "Module activé." : "Module désactivé.");
}

// ---------------------------------------------------------------------
// Listes déroulantes
// ---------------------------------------------------------------------

export async function createOptionList(
  brandId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await canSettings(brandId))) return forbidden();
  const parsed = labelSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("option_lists")
    .select("key")
    .eq("brand_id", brandId);
  if (readError) return failed(readError);

  const { error } = await supabase.from("option_lists").insert({
    brand_id: brandId,
    key: uniqueKey(parsed.data.label, existing.map((l) => l.key)),
    label: parsed.data.label,
  });
  if (error) return failed(error);
  return done("Liste créée.");
}

export async function renameOptionList(
  brandId: string,
  listId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id.safeParse(listId).success || !(await canSettings(brandId))) return forbidden();
  const parsed = labelSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("option_lists")
    .update({ label: parsed.data.label })
    .eq("id", listId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return done("Liste renommée.");
}

export async function deleteOptionList(
  brandId: string,
  listId: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!id.safeParse(listId).success || !(await canSettings(brandId))) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("option_lists")
    .delete()
    .eq("id", listId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return done("Liste supprimée.");
}

export async function addOptionItem(
  brandId: string,
  listId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id.safeParse(listId).success || !(await canSettings(brandId))) return forbidden();
  const parsed = labelColorSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("option_items")
    .select("value, position")
    .eq("brand_id", brandId)
    .eq("list_id", listId);
  if (readError) return failed(readError);

  const { error } = await supabase.from("option_items").insert({
    brand_id: brandId,
    list_id: listId,
    value: uniqueKey(parsed.data.label, existing.map((i) => i.value)),
    label: parsed.data.label,
    color: parsed.data.color,
    position: Math.max(0, ...existing.map((i) => i.position)) + 10,
  });
  if (error) return failed(error);
  return done("Choix ajouté.");
}

export async function updateOptionItem(
  brandId: string,
  itemId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id.safeParse(itemId).success || !(await canSettings(brandId))) return forbidden();
  const parsed = labelColorSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("option_items")
    .update({ label: parsed.data.label, color: parsed.data.color })
    .eq("id", itemId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return done("Choix modifié.");
}

export async function setOptionItemActive(
  brandId: string,
  itemId: string,
  active: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!id.safeParse(itemId).success || !(await canSettings(brandId))) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("option_items")
    .update({ is_active: active })
    .eq("id", itemId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return done(active ? "Choix réactivé." : "Choix désactivé.");
}

// ---------------------------------------------------------------------
// Statuts
// ---------------------------------------------------------------------

export async function createStatus(
  brandId: string,
  entity: StatusEntity,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(STATUS_ENTITIES as readonly string[]).includes(entity)) return forbidden();
  if (!(await canSettings(brandId))) return forbidden();
  const parsed = statusCreateSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("statuses")
    .select("key, position")
    .eq("brand_id", brandId)
    .eq("entity", entity);
  if (readError) return failed(readError);

  const { error } = await supabase.from("statuses").insert({
    brand_id: brandId,
    entity,
    key: uniqueKey(parsed.data.label, existing.map((s) => s.key)),
    label: parsed.data.label,
    color: parsed.data.color,
    category: parsed.data.category,
    position: Math.max(0, ...existing.map((s) => s.position)) + 10,
  });
  if (error) return failed(error);
  return done("Statut ajouté.");
}

export async function updateStatus(
  brandId: string,
  statusId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id.safeParse(statusId).success || !(await canSettings(brandId))) return forbidden();
  const parsed = labelColorSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statuses")
    .update({ label: parsed.data.label, color: parsed.data.color })
    .eq("id", statusId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return done("Statut modifié.");
}

export async function setStatusActive(
  brandId: string,
  statusId: string,
  active: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!id.safeParse(statusId).success || !(await canSettings(brandId))) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statuses")
    .update({ is_active: active })
    .eq("id", statusId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return done(active ? "Statut réactivé." : "Statut désactivé.");
}

export async function setDefaultStatus(
  brandId: string,
  entity: StatusEntity,
  statusId: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!(STATUS_ENTITIES as readonly string[]).includes(entity)) return forbidden();
  if (!id.safeParse(statusId).success || !(await canSettings(brandId))) return forbidden();

  const supabase = await createClient();
  const { data: target, error: readError } = await supabase
    .from("statuses")
    .select("id, is_active")
    .eq("id", statusId)
    .eq("brand_id", brandId)
    .eq("entity", entity)
    .maybeSingle();
  if (readError) return failed(readError);
  if (!target) return forbidden();
  if (!target.is_active) return { ok: false, message: "Réactivez d'abord ce statut." };

  // Un seul statut par défaut par fiche : on retire l'ancien, puis on pose le nouveau.
  const { error: clearError } = await supabase
    .from("statuses")
    .update({ is_default: false })
    .eq("brand_id", brandId)
    .eq("entity", entity)
    .eq("is_default", true);
  if (clearError) return failed(clearError);

  const { error } = await supabase.from("statuses").update({ is_default: true }).eq("id", statusId);
  if (error) return failed(error);
  return done("Statut par défaut modifié.");
}

// ---------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------

export async function createStage(
  brandId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await canSettings(brandId))) return forbidden();
  const parsed = stageSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("pipeline_stages")
    .select("key, position, category")
    .eq("brand_id", brandId);
  if (readError) return failed(readError);

  // Les nouvelles étapes se placent avant les étapes de clôture (gagnée, perdue).
  const openPositions = existing.filter((s) => s.category === "open").map((s) => s.position);
  const { error } = await supabase.from("pipeline_stages").insert({
    brand_id: brandId,
    key: uniqueKey(parsed.data.label, existing.map((s) => s.key)),
    label: parsed.data.label,
    category: "open",
    probability: parsed.data.probability,
    position: Math.max(0, ...openPositions) + 5,
  });
  if (error) return failed(error);
  return done("Étape ajoutée.");
}

export async function updateStage(
  brandId: string,
  stageId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id.safeParse(stageId).success || !(await canSettings(brandId))) return forbidden();
  const parsed = stageSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .update({ label: parsed.data.label, probability: parsed.data.probability })
    .eq("id", stageId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return done("Étape modifiée.");
}

export async function setStageActive(
  brandId: string,
  stageId: string,
  active: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!id.safeParse(stageId).success || !(await canSettings(brandId))) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .update({ is_active: active })
    .eq("id", stageId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  return done(active ? "Étape réactivée." : "Étape désactivée.");
}

// ---------------------------------------------------------------------
// Ordre d'affichage
// ---------------------------------------------------------------------

export async function reorderConfig(
  brandId: string,
  table: ReorderableTable,
  ids: string[],
): Promise<ActionState> {
  if (!(REORDERABLE_TABLES as readonly string[]).includes(table)) return forbidden();
  if (!z.array(id).max(200).safeParse(ids).success) return forbidden();
  if (!(await canSettings(brandId))) return forbidden();

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_config", {
    p_table: table,
    p_brand_id: brandId,
    p_ids: ids,
  });
  if (error) return failed(error);
  return done("Ordre enregistré.");
}
