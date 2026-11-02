"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCustomFields, parseNumber } from "@/features/custom-fields/parse";
import { getCustomFields } from "@/features/custom-fields/queries";
import type { FieldEntity } from "@/features/custom-fields/types";
import { getMemberOptions } from "@/features/registers/queries";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/server/authz/context";
import { CONTRACT_PERMISSIONS, OPPORTUNITY_PERMISSIONS, ownedAccess } from "@/server/authz/ownership";
import { can } from "@/server/authz/permissions";

// Chaque action : identifiants vérifiés, droits revérifiés côté serveur,
// écriture sous RLS ; les triggers de la base restent l'arbitre final.

const uuid = z.uuid();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max, `${max} caractères au maximum.`).optional());
const optionalDate = z.preprocess(blank, z.string().regex(DATE, "Date invalide.").optional());
const optionalUuid = z.preprocess(blank, z.uuid().optional());
const optionalKey = z.preprocess(blank, z.string().regex(/^[a-z][a-z0-9_]{1,40}$/).optional());
const amount = z.preprocess(
  (value) => (blank(value) === undefined ? undefined : (parseNumber(String(value)) ?? Number.NaN)),
  z.number({ error: "Montant invalide." }).min(0, "Montant positif attendu.").optional(),
);
const currency = z.preprocess(blank, z.enum(CURRENCIES).optional());

async function brandContext(brandId: string) {
  if (!uuid.safeParse(brandId).success) return null;
  const ctx = await getAuthContext();
  const brand = ctx.brands.find((b) => b.id === brandId);
  return brand ? { ctx, brand } : null;
}

/** Champs personnalisés d'une fiche : validation et fusion avec les valeurs existantes. */
async function readCustom(
  brandId: string,
  entity: FieldEntity,
  formData: FormData,
  existing: Record<string, unknown>,
): Promise<{ values: Json } | { state: ActionState }> {
  const [fields, members] = await Promise.all([getCustomFields(brandId, entity), getMemberOptions(brandId)]);
  const parsed = parseCustomFields(fields, formData, new Set(members.map((m) => m.id)), existing);
  if (Object.keys(parsed.errors).length > 0) {
    return {
      state: {
        ok: false,
        message: "Vérifiez les champs signalés.",
        fieldErrors: Object.fromEntries(Object.entries(parsed.errors).map(([k, v]) => [k, [v]])),
      },
    };
  }
  const active = new Set(fields.filter((f) => f.isActive).map((f) => f.key));
  return {
    values: {
      ...Object.fromEntries(Object.entries(existing).filter(([key]) => !active.has(key))),
      ...parsed.values,
    } as Json,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Entreprise choisie, ou retrouvée / créée par son nom. */
async function resolveCompany(
  ctx: AuthContext,
  brandId: string,
  companyId: string | undefined,
  newName: string | undefined,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  if (companyId && companyId !== "__new__") {
    if (!uuid.safeParse(companyId).success) return { error: "Entreprise invalide." };
    const { data } = await supabase.from("companies").select("id").eq("id", companyId).eq("brand_id", brandId).maybeSingle();
    return data ? { id: data.id } : { error: "Entreprise introuvable." };
  }
  if (!newName) return { error: "Choisissez l'entreprise ou saisissez son nom." };
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("brand_id", brandId)
    .ilike("name", escapeLike(newName))
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id };
  if (!can(ctx.access, "crm.manage", brandId)) return { error: "Vous ne pouvez pas créer de prospect." };
  const { data, error } = await supabase.from("companies").insert({ brand_id: brandId, name: newName }).select("id").single();
  return error ? { error: "Impossible de créer l'entreprise." } : { id: data.id };
}

// ---------------------------------------------------------------------
// Prospects
// ---------------------------------------------------------------------

const companySchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(200, "200 caractères au maximum."),
  sector: optionalKey,
  source: optionalKey,
  city: text(120),
  country: text(120),
  phone: text(40),
  email: z.preprocess(blank, z.string().trim().pipe(z.email("E-mail invalide.")).optional()),
  website: z.preprocess(blank, z.string().trim().regex(/^https?:\/\/\S+$/, "L'adresse doit commencer par http:// ou https://.").optional()),
  statusId: optionalUuid,
  ownerId: optionalUuid,
  nextFollowUpOn: optionalDate,
});

export async function saveCompany(
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || !can(scope.ctx.access, "crm.manage", brandId)) return forbidden();
  if (id !== null && !uuid.safeParse(id).success) return forbidden();
  const parsed = companySchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  const supabase = await createClient();
  let existing: Record<string, unknown> = {};
  if (id) {
    const { data } = await supabase.from("companies").select("custom").eq("id", id).eq("brand_id", brandId).maybeSingle();
    if (!data) return forbidden();
    existing = asRecord(data.custom);
  }
  const custom = await readCustom(brandId, "company", formData, existing);
  if ("state" in custom) return custom.state;

  // Le responsable se choisit avec les droits de gestion de toutes les opportunités.
  const assign = can(scope.ctx.access, "opportunities.manage_all", brandId);
  const values = {
    name: d.name,
    sector: d.sector ?? null,
    source: d.source ?? null,
    city: d.city ?? null,
    country: d.country ?? null,
    phone: d.phone ?? null,
    email: d.email ?? null,
    website: d.website ?? null,
    next_follow_up_on: d.nextFollowUpOn ?? null,
    custom: custom.values,
    ...(d.statusId ? { status_id: d.statusId } : {}),
    ...(assign && d.ownerId ? { owner_id: d.ownerId } : {}),
  };

  if (id === null) {
    const { data, error } = await supabase
      .from("companies")
      .insert({ ...values, brand_id: brandId, owner_id: assign && d.ownerId ? d.ownerId : scope.ctx.userId })
      .select("id")
      .single();
    if (error) return failed(error);
    redirect(`/m/${scope.brand.slug}/prospects/${data.id}`);
  }

  const { data, error } = await supabase.from("companies").update(values).eq("id", id).eq("brand_id", brandId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Prospect enregistré." };
}

export async function setCompanyArchived(
  brandId: string,
  id: string,
  archived: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || !uuid.safeParse(id).success || !can(scope.ctx.access, "crm.manage", brandId)) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: archived ? "Prospect archivé." : "Prospect restauré." };
}

// ---------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------

const contactSchema = z.object({
  fullName: z.string().trim().min(1, "Le nom est obligatoire.").max(160),
  jobTitle: text(120),
  email: z.preprocess(blank, z.string().trim().pipe(z.email("E-mail invalide.")).optional()),
  phone: text(40),
});

export async function saveContact(
  brandId: string,
  companyId: string,
  contactId: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || !uuid.safeParse(companyId).success || !can(scope.ctx.access, "crm.manage", brandId)) return forbidden();
  if (contactId !== null && !uuid.safeParse(contactId).success) return forbidden();
  const parsed = contactSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const values = {
    full_name: parsed.data.fullName,
    job_title: parsed.data.jobTitle ?? null,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
  };

  const supabase = await createClient();
  const { error } = contactId
    ? await supabase.from("contacts").update(values).eq("id", contactId).eq("company_id", companyId).eq("brand_id", brandId)
    : await supabase.from("contacts").insert({ ...values, brand_id: brandId, company_id: companyId });
  if (error) return failed(error);
  refresh();
  return { ok: true, message: contactId ? "Contact modifié." : "Contact ajouté." };
}

export async function archiveContact(
  brandId: string,
  contactId: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || !uuid.safeParse(contactId).success || !can(scope.ctx.access, "crm.manage", brandId)) return forbidden();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("brand_id", brandId);
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Contact retiré." };
}

// ---------------------------------------------------------------------
// Échanges
// ---------------------------------------------------------------------

const INTERACTION_TYPES = ["call", "email", "meeting", "note", "other"] as const;
const interactionSchema = z.object({
  type: z.enum(INTERACTION_TYPES, { error: "Type invalide." }),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Date et heure invalides."),
  contactId: optionalUuid,
  summary: z.string().trim().min(1, "Le compte rendu est obligatoire.").max(5000),
});

export async function addInteraction(
  brandId: string,
  companyId: string,
  opportunityId: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || !uuid.safeParse(companyId).success || !can(scope.ctx.access, "crm.manage", brandId)) return forbidden();
  if (opportunityId !== null && !uuid.safeParse(opportunityId).success) return forbidden();
  const parsed = interactionSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("interactions").insert({
    brand_id: brandId,
    company_id: companyId,
    opportunity_id: opportunityId,
    contact_id: parsed.data.contactId ?? null,
    type: parsed.data.type,
    // Saisie à l'heure d'Abidjan (UTC+0).
    occurred_at: `${parsed.data.occurredAt}:00Z`,
    summary: parsed.data.summary,
  });
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Échange enregistré." };
}

export async function deleteInteraction(
  brandId: string,
  interactionId: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || !uuid.safeParse(interactionId).success) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interactions")
    .delete()
    .eq("id", interactionId)
    .eq("brand_id", brandId)
    .eq("user_id", scope.ctx.userId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Échange supprimé." };
}

// ---------------------------------------------------------------------
// Opportunités
// ---------------------------------------------------------------------

const opportunitySchema = z.object({
  companyId: z.preprocess(blank, z.string().optional()),
  newCompanyName: text(200),
  contactId: optionalUuid,
  title: z.string().trim().min(1, "L'intitulé est obligatoire.").max(200),
  stageId: z.uuid("Choisissez une étape."),
  amount,
  currency,
  expectedCloseOn: optionalDate,
  source: optionalKey,
  lostReason: text(2000),
  ownerId: optionalUuid,
});

export async function saveOpportunity(
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const access = ownedAccess(scope.ctx.access, OPPORTUNITY_PERMISSIONS, brandId);
  const supabase = await createClient();

  let existing: Record<string, unknown> = {};
  if (id === null) {
    if (!access.canCreate) return forbidden();
  } else {
    const { data } = await supabase.from("opportunities").select("owner_id, custom").eq("id", id).eq("brand_id", brandId).maybeSingle();
    if (!data || !access.canManage(data.owner_id, scope.ctx.userId)) return forbidden();
    existing = asRecord(data.custom);
  }

  const parsed = opportunitySchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const custom = await readCustom(brandId, "opportunity", formData, existing);
  if ("state" in custom) return custom.state;
  const company = await resolveCompany(scope.ctx, brandId, d.companyId, d.newCompanyName);
  if ("error" in company) return { ok: false, message: company.error, fieldErrors: { companyId: [company.error] } };

  const values = {
    company_id: company.id,
    contact_id: d.contactId ?? null,
    title: d.title,
    stage_id: d.stageId,
    amount: d.amount ?? null,
    currency: d.amount !== undefined ? (d.currency ?? "XOF") : null,
    expected_close_on: d.expectedCloseOn ?? null,
    source: d.source ?? null,
    lost_reason: d.lostReason ?? null,
    custom: custom.values,
    ...(access.canAssign && d.ownerId ? { owner_id: d.ownerId } : {}),
  };

  if (id === null) {
    const { data, error } = await supabase
      .from("opportunities")
      .insert({ ...values, brand_id: brandId, owner_id: access.canAssign && d.ownerId ? d.ownerId : scope.ctx.userId })
      .select("id")
      .single();
    if (error) return failed(error);
    redirect(`/m/${scope.brand.slug}/opportunites/${data.id}`);
  }

  const { data, error } = await supabase.from("opportunities").update(values).eq("id", id).eq("brand_id", brandId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Opportunité enregistrée." };
}

/** Changement d'étape depuis le kanban. */
export async function moveOpportunity(
  brandId: string,
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  const stageId = String(formData.get("stageId") ?? "");
  if (!scope || !uuid.safeParse(id).success || !uuid.safeParse(stageId).success) return forbidden();
  const access = ownedAccess(scope.ctx.access, OPPORTUNITY_PERMISSIONS, brandId);
  const supabase = await createClient();
  const { data: current } = await supabase.from("opportunities").select("owner_id").eq("id", id).eq("brand_id", brandId).maybeSingle();
  if (!current || !access.canManage(current.owner_id, scope.ctx.userId)) return forbidden();

  const { error } = await supabase.from("opportunities").update({ stage_id: stageId }).eq("id", id).eq("brand_id", brandId);
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Étape modifiée." };
}

export async function setOpportunityArchived(
  brandId: string,
  id: string,
  archived: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || !uuid.safeParse(id).success) return forbidden();
  const access = ownedAccess(scope.ctx.access, OPPORTUNITY_PERMISSIONS, brandId);
  const supabase = await createClient();
  const { data: current } = await supabase.from("opportunities").select("owner_id").eq("id", id).eq("brand_id", brandId).maybeSingle();
  if (!current || !access.canManage(current.owner_id, scope.ctx.userId)) return forbidden();
  const { error } = await supabase
    .from("opportunities")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) return failed(error);
  refresh();
  return { ok: true, message: archived ? "Opportunité archivée." : "Opportunité restaurée." };
}

// ---------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------

const contractSchema = z
  .object({
    companyId: z.preprocess(blank, z.string().optional()),
    newCompanyName: text(200),
    opportunityId: optionalUuid,
    offerId: optionalUuid,
    title: z.string().trim().min(1, "L'intitulé est obligatoire.").max(200),
    signedOn: z.string().regex(DATE, "Date invalide."),
    amount: z.preprocess(
      (value) => (blank(value) === undefined ? Number.NaN : (parseNumber(String(value)) ?? Number.NaN)),
      z.number({ error: "Montant obligatoire." }).min(0, "Montant positif attendu."),
    ),
    currency: z.enum(CURRENCIES, { error: "Devise invalide." }),
    startOn: optionalDate,
    endOn: optionalDate,
    comments: text(5000),
    ownerId: optionalUuid,
  })
  .refine((d) => !d.startOn || !d.endOn || d.endOn >= d.startOn, {
    message: "La fin précède le début.",
    path: ["endOn"],
  });

export async function saveContract(
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const access = ownedAccess(scope.ctx.access, CONTRACT_PERMISSIONS, brandId);
  const supabase = await createClient();

  let existing: Record<string, unknown> = {};
  if (id === null) {
    if (!access.canCreate) return forbidden();
  } else {
    const { data } = await supabase.from("contracts").select("owner_id, custom").eq("id", id).eq("brand_id", brandId).maybeSingle();
    if (!data || !access.canManage(data.owner_id, scope.ctx.userId)) return forbidden();
    existing = asRecord(data.custom);
  }

  const parsed = contractSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const custom = await readCustom(brandId, "contract", formData, existing);
  if ("state" in custom) return custom.state;
  const company = await resolveCompany(scope.ctx, brandId, d.companyId, d.newCompanyName);
  if ("error" in company) return { ok: false, message: company.error, fieldErrors: { companyId: [company.error] } };

  const values = {
    company_id: company.id,
    opportunity_id: d.opportunityId ?? null,
    offer_id: d.offerId ?? null,
    title: d.title,
    signed_on: d.signedOn,
    amount: d.amount,
    currency: d.currency,
    start_on: d.startOn ?? null,
    end_on: d.endOn ?? null,
    comments: d.comments ?? null,
    custom: custom.values,
    ...(access.canAssign && d.ownerId ? { owner_id: d.ownerId } : {}),
  };

  if (id === null) {
    const { data, error } = await supabase
      .from("contracts")
      .insert({ ...values, brand_id: brandId, owner_id: access.canAssign && d.ownerId ? d.ownerId : scope.ctx.userId })
      .select("id")
      .single();
    if (error) return failed(error);
    redirect(`/m/${scope.brand.slug}/contrats/${data.id}`);
  }

  const { data, error } = await supabase.from("contracts").update(values).eq("id", id).eq("brand_id", brandId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Contrat enregistré." };
}

export async function setContractArchived(
  brandId: string,
  id: string,
  archived: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const scope = await brandContext(brandId);
  if (!scope || !uuid.safeParse(id).success) return forbidden();
  const access = ownedAccess(scope.ctx.access, CONTRACT_PERMISSIONS, brandId);
  const supabase = await createClient();
  const { data: current } = await supabase.from("contracts").select("owner_id").eq("id", id).eq("brand_id", brandId).maybeSingle();
  if (!current || !access.canManage(current.owner_id, scope.ctx.userId)) return forbidden();
  const { error } = await supabase
    .from("contracts")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) return failed(error);
  refresh();
  return { ok: true, message: archived ? "Contrat archivé." : "Contrat restauré." };
}
