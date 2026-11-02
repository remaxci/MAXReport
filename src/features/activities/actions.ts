"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseCustomFields } from "@/features/custom-fields/parse";
import { getCustomFields } from "@/features/custom-fields/queries";
import { getMemberOptions } from "@/features/registers/queries";
import { todayIso } from "@/lib/format";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { isIsoDate, isoWeekStart } from "@/lib/periods";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

// Droits revérifiés côté serveur ; la RLS et le trigger de la base
// (verrouillage après validation, validation réservée) restent l'arbitre final.

const uuid = z.uuid();
const count = (label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? 0 : Number(value)),
    z
      .number({ error: `${label} : nombre attendu.` })
      .int(`${label} : nombre entier attendu.`)
      .min(0, `${label} : valeur positive attendue.`)
      .max(10000, `${label} : 10 000 au maximum.`),
  );

const reportSchema = z.object({
  callsProspecting: count("Appels de prospection"),
  callsFollowUp: count("Appels de relance"),
  emailsSent: count("E-mails"),
  qualifiedMeetings: count("Rendez-vous"),
  opportunitiesDeclared: count("Opportunités"),
  memosDeclared: count("Mémos"),
  comments: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(5000, "5 000 caractères au maximum.").optional(),
  ),
});

async function activitiesBrand(brandId: string) {
  if (!uuid.safeParse(brandId).success) return null;
  const ctx = await getAuthContext();
  const brand = ctx.brands.find((b) => b.id === brandId);
  if (!brand || !brand.enabledModules.includes("activities")) return null;
  return { ctx, brand };
}

/** Enregistre (brouillon) ou soumet la fiche de l'utilisateur pour une semaine. */
export async function saveWeeklyReport(
  brandId: string,
  weekStart: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await activitiesBrand(brandId);
  if (!scope || !can(scope.ctx.access, "activities.manage_own", brandId)) return forbidden();
  const { ctx, brand } = scope;
  if (!isIsoDate(weekStart) || isoWeekStart(weekStart) !== weekStart) {
    return { ok: false, message: "Semaine invalide." };
  }
  if (weekStart > isoWeekStart(todayIso())) {
    return { ok: false, message: "Une fiche ne se remplit pas pour une semaine à venir." };
  }

  const parsed = reportSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const submit = formData.get("intent") === "submit";

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("weekly_reports")
    .select("id, status, custom")
    .eq("brand_id", brandId)
    .eq("user_id", ctx.userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (readError) return failed(readError);
  if (existing?.status === "validated") {
    return { ok: false, message: "Cette fiche est validée : elle n'est plus modifiable." };
  }

  const previousCustom =
    existing?.custom && typeof existing.custom === "object" ? (existing.custom as Record<string, unknown>) : {};
  const [fields, members] = await Promise.all([
    getCustomFields(brandId, "weekly_report"),
    getMemberOptions(brandId),
  ]);
  const custom = parseCustomFields(fields, formData, new Set(members.map((m) => m.id)), previousCustom);
  if (Object.keys(custom.errors).length > 0) {
    return {
      ok: false,
      message: "Vérifiez les champs signalés.",
      fieldErrors: Object.fromEntries(Object.entries(custom.errors).map(([k, v]) => [k, [v]])),
    };
  }
  const active = new Set(fields.filter((f) => f.isActive).map((f) => f.key));

  // Opportunités et mémos ne se déclarent que si le registre correspondant est désactivé.
  const values = {
    calls_prospecting: d.callsProspecting,
    calls_follow_up: d.callsFollowUp,
    emails_sent: d.emailsSent,
    qualified_meetings: d.qualifiedMeetings,
    opportunities_declared: brand.enabledModules.includes("crm") ? null : d.opportunitiesDeclared,
    memos_declared: brand.enabledModules.includes("memos") ? null : d.memosDeclared,
    comments: d.comments ?? null,
    status: submit ? "submitted" : "draft",
    custom: {
      ...Object.fromEntries(Object.entries(previousCustom).filter(([key]) => !active.has(key))),
      ...custom.values,
    } as Json,
  };

  const { error } = existing
    ? await supabase.from("weekly_reports").update(values).eq("id", existing.id).eq("brand_id", brandId)
    : await supabase.from("weekly_reports").insert({ ...values, brand_id: brandId, week_start: weekStart });
  if (error) return failed(error);

  refresh();
  return {
    ok: true,
    message: submit ? "Fiche soumise à votre responsable." : "Brouillon enregistré.",
  };
}

async function setReportStatus(
  brandId: string,
  id: string,
  from: string[],
  to: "validated" | "draft",
): Promise<ActionState> {
  const scope = await activitiesBrand(brandId);
  if (!scope || !can(scope.ctx.access, "activities.validate", brandId)) return forbidden();
  if (!uuid.safeParse(id).success) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_reports")
    .update({ status: to })
    .eq("id", id)
    .eq("brand_id", brandId)
    .in("status", from)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return { ok: false, message: "Cette fiche a changé entre-temps : actualisez la page." };

  refresh();
  return { ok: true, message: to === "validated" ? "Fiche validée." : "Fiche renvoyée pour correction." };
}

/** Valide une fiche soumise (responsable). */
export async function validateWeeklyReport(
  brandId: string,
  id: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  return setReportStatus(brandId, id, ["submitted"], "validated");
}

/** Renvoie une fiche soumise ou validée à son auteur, qui peut la corriger. */
export async function returnWeeklyReport(
  brandId: string,
  id: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  return setReportStatus(brandId, id, ["submitted", "validated"], "draft");
}
