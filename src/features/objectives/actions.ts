"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseNumber } from "@/features/custom-fields/parse";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import { availableMetrics, METRIC_KEYS, METRICS } from "@/lib/metrics/actuals";
import { isIsoDate, PERIOD_KINDS, periodRange } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

// Définition des objectifs : objectives.manage, revérifié ici ; la RLS et le
// trigger (collaborateur membre de la marque) restent l'arbitre final.

const uuid = z.uuid();
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const isoDate = z.string().refine(isIsoDate, "Date invalide.");

const objectiveSchema = z
  .object({
    metric: z.enum(METRIC_KEYS, { error: "Choisissez un indicateur." }),
    scope: z.union([z.literal("team"), z.uuid({ error: "Collaborateur invalide." })]),
    periodKind: z.enum([...PERIOD_KINDS, "custom"]),
    anchor: z.preprocess(blank, isoDate.optional()),
    periodStart: z.preprocess(blank, isoDate.optional()),
    periodEnd: z.preprocess(blank, isoDate.optional()),
    target: z.preprocess(
      (value) => (blank(value) === undefined ? undefined : (parseNumber(String(value)) ?? Number.NaN)),
      z.number({ error: "Valeur cible invalide." }).positive("La cible doit être supérieure à 0.").max(1e15),
    ),
    currency: z.preprocess(blank, z.enum(CURRENCIES).optional()),
    comments: z.preprocess(blank, z.string().trim().max(2000, "2 000 caractères au maximum.").optional()),
  })
  .superRefine((d, ctx) => {
    if (d.periodKind === "custom") {
      if (!d.periodStart) ctx.addIssue({ code: "custom", path: ["periodStart"], message: "Date de début requise." });
      if (!d.periodEnd) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "Date de fin requise." });
      if (d.periodStart && d.periodEnd && d.periodEnd < d.periodStart) {
        ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "La fin précède le début." });
      }
    } else if (!d.anchor) {
      ctx.addIssue({ code: "custom", path: ["anchor"], message: "Choisissez une date dans la période." });
    }
    if (METRICS[d.metric].money && !d.currency) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "Choisissez la devise." });
    }
    if (!METRICS[d.metric].money && !Number.isInteger(d.target)) {
      ctx.addIssue({ code: "custom", path: ["target"], message: "Nombre entier attendu." });
    }
  });

async function manageScope(brandId: string) {
  if (!uuid.safeParse(brandId).success) return null;
  const ctx = await getAuthContext();
  const brand = ctx.brands.find((b) => b.id === brandId);
  if (!brand || !brand.enabledModules.includes("objectives")) return null;
  return can(ctx.access, "objectives.manage", brandId) ? brand : null;
}

export async function saveObjective(
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const brand = await manageScope(brandId);
  if (!brand) return forbidden();
  if (id !== null && !uuid.safeParse(id).success) return forbidden();
  const parsed = objectiveSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!availableMetrics(brand.enabledModules).includes(d.metric)) {
    return { ok: false, message: "Cet indicateur n'est pas mesuré pour cette marque (module désactivé)." };
  }

  const range =
    d.periodKind === "custom"
      ? { start: d.periodStart!, end: d.periodEnd! }
      : periodRange(d.periodKind, d.anchor!);
  const values = {
    metric_key: d.metric,
    user_id: d.scope === "team" ? null : d.scope,
    period_start: range.start,
    period_end: range.end,
    target_value: d.target,
    currency: METRICS[d.metric].money ? d.currency! : null,
    comments: d.comments ?? null,
  };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("objectives").update(values).eq("id", id).eq("brand_id", brandId).select("id");
    if (error) return failed(error);
    if (data.length === 0) return forbidden();
  } else {
    const { error } = await supabase.from("objectives").insert({ ...values, brand_id: brandId });
    if (error) return failed(error);
  }
  redirect(`/m/${brand.slug}/objectifs`);
}

export async function deleteObjective(
  brandId: string,
  id: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const brand = await manageScope(brandId);
  if (!brand || !uuid.safeParse(id).success) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase.from("objectives").delete().eq("id", id).eq("brand_id", brandId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Objectif supprimé." };
}
