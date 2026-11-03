"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SECTION_KEYS } from "@/features/dashboard/data";
import { failed, forbidden, invalid, type ActionState } from "@/lib/form";
import { PERIOD_KINDS } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

// Modèles de rapports : reports.manage, revérifié ici et par la RLS.

const uuid = z.uuid();

const templateSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(120, "120 caractères au maximum."),
  description: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(500, "500 caractères au maximum.").optional(),
  ),
  periodKind: z.enum(PERIOD_KINDS),
  sections: z.array(z.enum(SECTION_KEYS)).min(1, "Choisissez au moins une section.").max(6),
});

async function reportsScope(brandId: string) {
  if (!uuid.safeParse(brandId).success) return null;
  const ctx = await getAuthContext();
  const brand = ctx.brands.find((b) => b.id === brandId);
  if (!brand || !brand.enabledModules.includes("reports") || !can(ctx.access, "reports.manage", brandId)) return null;
  return brand;
}

export async function saveTemplate(brandId: string, id: string | null, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const brand = await reportsScope(brandId);
  if (!brand || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    periodKind: formData.get("periodKind"),
    sections: formData.getAll("sections"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  // Ordre d'affichage fixe, quel que soit l'ordre des cases cochées.
  const values = {
    name: d.name,
    description: d.description ?? null,
    period_kind: d.periodKind,
    sections: SECTION_KEYS.filter((s) => d.sections.includes(s)),
  };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("report_templates").update(values).eq("id", id).eq("brand_id", brandId).select("id");
    if (error) return error.code === "23505" ? { ok: false, message: "Un modèle porte déjà ce nom." } : failed(error);
    if (data.length === 0) return forbidden();
    refresh();
    return { ok: true, message: "Modèle enregistré." };
  }
  const { data, error } = await supabase.from("report_templates").insert({ ...values, brand_id: brandId }).select("id").single();
  if (error) return error.code === "23505" ? { ok: false, message: "Un modèle porte déjà ce nom." } : failed(error);
  redirect(`/m/${brand.slug}/rapports/${data.id}`);
}

export async function deleteTemplate(brandId: string, id: string, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  const brand = await reportsScope(brandId);
  if (!brand || !uuid.safeParse(id).success) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase.from("report_templates").delete().eq("id", id).eq("brand_id", brandId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  redirect(`/m/${brand.slug}/rapports`);
}
