"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCustomFields, parseNumber } from "@/features/custom-fields/parse";
import { getCustomFields } from "@/features/custom-fields/queries";
import { getMemberOptions } from "@/features/registers/queries";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import { isIsoDate } from "@/lib/periods";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_STATUSES, KINDS, MARKETING_KINDS, WEBSITE_CHANNELS, type MarketingKind } from "./config";
import { channelsExceedTotal, parseSnapshotForm } from "./parse";
import { SNAPSHOT_SOURCES } from "./queries";

// Droits revérifiés côté serveur (marketing.manage, module actif) ; la RLS,
// les contraintes et les triggers de la base restent l'arbitre final.

const uuid = z.uuid();
const kindSchema = z.enum(MARKETING_KINDS);
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max, `${max} caractères au maximum.`).optional());
const name = z.string().trim().min(1, "Le nom est obligatoire.").max(200, "200 caractères au maximum.");
const platform = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, "Choisissez une plateforme.");
const webUrl = z.preprocess(
  blank,
  z.string().trim().max(500).regex(/^https?:\/\/\S+$/, "L'adresse doit commencer par http:// ou https://.").optional(),
);
const optionalDate = z.preprocess(blank, z.string().refine(isIsoDate, "Date invalide.").optional());

/** Marque et droits de gestion pour un type d'objet marketing. */
async function manageScope(kind: MarketingKind, brandId: string) {
  if (!uuid.safeParse(brandId).success) return null;
  const ctx = await getAuthContext();
  const brand = ctx.brands.find((b) => b.id === brandId);
  if (!brand || !brand.enabledModules.includes(KINDS[kind].module)) return null;
  return can(ctx.access, "marketing.manage", brandId) ? brand : null;
}

function detailPath(slug: string, kind: MarketingKind, id: string) {
  return `/m/${slug}${KINDS[kind].path}/${id}`;
}

// ---------------------------------------------------------------------
// Comptes sociaux, campagnes, sites
// ---------------------------------------------------------------------

const accountSchema = z.object({ platform, name, handle: text(200), url: webUrl });

export async function saveSocialAccount(
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const brand = await manageScope("social", brandId);
  if (!brand || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const parsed = accountSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const values = { platform: d.platform, name: d.name, handle: d.handle ?? null, url: d.url ?? null };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("social_accounts").update(values).eq("id", id).eq("brand_id", brandId).select("id");
    if (error) return failed(error);
    if (data.length === 0) return forbidden();
    refresh();
    return { ok: true, message: "Compte enregistré." };
  }
  const { data, error } = await supabase.from("social_accounts").insert({ ...values, brand_id: brandId }).select("id").single();
  if (error) return failed(error);
  redirect(detailPath(brand.slug, "social", data.id));
}

const websiteSchema = z.object({ name, url: webUrl });

export async function saveWebsite(
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const brand = await manageScope("website", brandId);
  if (!brand || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const parsed = websiteSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const values = { name: parsed.data.name, url: parsed.data.url ?? null };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("websites").update(values).eq("id", id).eq("brand_id", brandId).select("id");
    if (error) return failed(error);
    if (data.length === 0) return forbidden();
    refresh();
    return { ok: true, message: "Site enregistré." };
  }
  const { data, error } = await supabase.from("websites").insert({ ...values, brand_id: brandId }).select("id").single();
  if (error) return failed(error);
  redirect(detailPath(brand.slug, "website", data.id));
}

const campaignSchema = z
  .object({
    platform,
    name,
    objective: z.enum(Object.keys(CAMPAIGN_OBJECTIVES) as [keyof typeof CAMPAIGN_OBJECTIVES]),
    status: z.enum(Object.keys(CAMPAIGN_STATUSES) as [keyof typeof CAMPAIGN_STATUSES]),
    startOn: optionalDate,
    endOn: optionalDate,
    plannedBudget: z.preprocess(
      (value) => (blank(value) === undefined ? undefined : (parseNumber(String(value)) ?? Number.NaN)),
      z.number({ error: "Montant invalide." }).min(0, "Montant positif attendu.").max(1e15).optional(),
    ),
    currency: z.enum(CURRENCIES),
    externalId: text(200),
    comments: text(5000),
  })
  .refine((d) => !d.startOn || !d.endOn || d.endOn >= d.startOn, { path: ["endOn"], message: "La fin précède le début." });

export async function saveCampaign(
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const brand = await manageScope("campaign", brandId);
  if (!brand || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const parsed = campaignSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  const supabase = await createClient();
  let existing: Record<string, unknown> = {};
  if (id) {
    const { data } = await supabase.from("campaigns").select("custom").eq("id", id).eq("brand_id", brandId).maybeSingle();
    if (!data) return forbidden();
    existing = data.custom && typeof data.custom === "object" ? (data.custom as Record<string, unknown>) : {};
  }
  const [fields, members] = await Promise.all([getCustomFields(brandId, "campaign"), getMemberOptions(brandId)]);
  const custom = parseCustomFields(fields, formData, new Set(members.map((m) => m.id)), existing);
  if (Object.keys(custom.errors).length > 0) {
    return {
      ok: false,
      message: "Vérifiez les champs signalés.",
      fieldErrors: Object.fromEntries(Object.entries(custom.errors).map(([k, v]) => [k, [v]])),
    };
  }
  const active = new Set(fields.filter((f) => f.isActive).map((f) => f.key));
  const values = {
    platform: d.platform,
    name: d.name,
    objective: d.objective,
    status: d.status,
    start_on: d.startOn ?? null,
    end_on: d.endOn ?? null,
    planned_budget: d.plannedBudget ?? null,
    currency: d.currency,
    external_id: d.externalId ?? null,
    comments: d.comments ?? null,
    custom: {
      ...Object.fromEntries(Object.entries(existing).filter(([key]) => !active.has(key))),
      ...custom.values,
    } as Json,
  };

  if (id) {
    const { data, error } = await supabase.from("campaigns").update(values).eq("id", id).eq("brand_id", brandId).select("id");
    if (error) return failed(error);
    if (data.length === 0) return forbidden();
    refresh();
    return { ok: true, message: "Campagne enregistrée." };
  }
  const { data, error } = await supabase.from("campaigns").insert({ ...values, brand_id: brandId }).select("id").single();
  if (error) return failed(error);
  redirect(detailPath(brand.slug, "campaign", data.id));
}

const PARENT_TABLES = { social: "social_accounts", campaign: "campaigns", website: "websites" } as const;

/** Archive ou restaure un compte, une campagne ou un site (on n'efface pas). */
export async function setMarketingArchived(
  kind: MarketingKind,
  brandId: string,
  id: string,
  archived: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!kindSchema.safeParse(kind).success || !uuid.safeParse(id).success) return forbidden();
  const brand = await manageScope(kind, brandId);
  if (!brand) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(PARENT_TABLES[kind] as "websites")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: archived ? "Archivé." : "Restauré." };
}

// ---------------------------------------------------------------------
// Relevés
// ---------------------------------------------------------------------

// Les trois tables de relevés partagent la même forme : écriture commune,
// typée sur l'une d'elles (les colonnes viennent de la configuration).
type SnapshotTable = "social_snapshots";

export async function saveSnapshot(
  kind: MarketingKind,
  brandId: string,
  parentId: string,
  snapshotId: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!kindSchema.safeParse(kind).success || !uuid.safeParse(parentId).success) return forbidden();
  if (snapshotId !== null && !uuid.safeParse(snapshotId).success) return forbidden();
  const brand = await manageScope(kind, brandId);
  if (!brand) return forbidden();

  const form = formValues(formData);
  const { measures, extraMeasures } = KINDS[kind];
  const parsed = parseSnapshotForm([...measures, ...extraMeasures], form);
  if (!parsed.ok) {
    return {
      ok: false,
      message: "Vérifiez les champs signalés.",
      fieldErrors: Object.fromEntries(Object.entries(parsed.errors).map(([k, v]) => [k, [v]])),
    };
  }
  if (kind === "website" && channelsExceedTotal(parsed.values, WEBSITE_CHANNELS.map((c) => c.key))) {
    return { ok: false, message: "La ventilation par canal dépasse le total des sessions.", fieldErrors: { sessions: ["Total inférieur à la ventilation."] } };
  }
  const comments = (form.comments ?? "").trim();
  if (comments.length > 2000) return { ok: false, message: "Commentaire trop long.", fieldErrors: { comments: ["2 000 caractères au maximum."] } };

  const supabase = await createClient();
  const { data: parent } = await supabase
    .from(PARENT_TABLES[kind] as "websites")
    .select("id")
    .eq("id", parentId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!parent) return forbidden();

  const { table, parent: parentColumn } = SNAPSHOT_SOURCES[kind];
  const values = {
    period_start: parsed.periodStart,
    period_end: parsed.periodEnd,
    comments: comments || null,
    ...parsed.values,
  };

  if (snapshotId) {
    const { data, error } = await supabase
      .from(table as SnapshotTable)
      .update(values)
      .eq("id", snapshotId)
      .eq("brand_id", brandId)
      .eq(parentColumn as "account_id", parentId)
      .select("id");
    if (error) return failed(error);
    if (data.length === 0) return forbidden();
    redirect(detailPath(brand.slug, kind, parentId));
  }
  const { error } = await supabase
    .from(table as SnapshotTable)
    .insert({ ...values, brand_id: brandId, [parentColumn]: parentId } as unknown as TablesInsert<SnapshotTable>);
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Relevé enregistré." };
}

export async function deleteSnapshot(
  kind: MarketingKind,
  brandId: string,
  snapshotId: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!kindSchema.safeParse(kind).success || !uuid.safeParse(snapshotId).success) return forbidden();
  const brand = await manageScope(kind, brandId);
  if (!brand) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(SNAPSHOT_SOURCES[kind].table as SnapshotTable)
    .delete()
    .eq("id", snapshotId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Relevé supprimé." };
}
