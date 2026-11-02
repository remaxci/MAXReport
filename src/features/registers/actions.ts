"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCustomFields, parseNumber } from "@/features/custom-fields/parse";
import { getCustomFields } from "@/features/custom-fields/queries";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { checkAttachment } from "./attachments";
import {
  canAssignOwner,
  canCreateDocument,
  canManageDocument,
  REGISTER_KINDS,
  REGISTERS,
  type RegisterKind,
} from "./config";
import { getMemberOptions } from "./queries";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const uuid = z.uuid();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalDate = z.preprocess(blank, z.string().regex(DATE, "Date invalide.").optional());
const optionalText = (max: number) =>
  z.preprocess(blank, z.string().trim().max(max, `${max} caractères au maximum.`).optional());

const documentSchema = z
  .object({
    companyId: z.preprocess(blank, z.string().optional()),
    newCompanyName: optionalText(200),
    contactName: optionalText(160),
    contactEmail: z.preprocess(blank, z.string().trim().pipe(z.email("E-mail invalide.")).optional()),
    ownerId: z.preprocess(blank, z.uuid().optional()),
    subject: z.string().trim().min(1, "L'objet est obligatoire.").max(200, "200 caractères au maximum."),
    issuedOn: z.string().regex(DATE, "Date invalide."),
    sentOn: optionalDate,
    statusId: z.uuid("Choisissez un statut."),
    followUpOn: optionalDate,
    comments: optionalText(5000),
    amount: z.preprocess(
      (value) => (blank(value) === undefined ? undefined : (parseNumber(String(value)) ?? Number.NaN)),
      z.number({ error: "Montant invalide." }).min(0, "Montant positif attendu.").optional(),
    ),
    currency: z.preprocess(blank, z.enum(CURRENCIES).optional()),
    validUntil: optionalDate,
    recipientResponse: optionalText(5000),
  })
  .refine((d) => (d.companyId && d.companyId !== "__new__") || d.newCompanyName, {
    message: "Choisissez l'entreprise ou saisissez son nom.",
    path: ["companyId"],
  })
  .refine((d) => !d.sentOn || d.sentOn >= d.issuedOn, {
    message: "L'envoi ne peut pas précéder la création.",
    path: ["sentOn"],
  });

function isKind(kind: string): kind is RegisterKind {
  return (REGISTER_KINDS as readonly string[]).includes(kind);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Entreprise choisie, ou retrouvée / créée à partir de son nom. */
async function resolveCompany(
  supabase: Supabase,
  ctx: AuthContext,
  brandId: string,
  companyId: string | undefined,
  newName: string | undefined,
): Promise<{ id: string } | { error: string }> {
  if (companyId && companyId !== "__new__") {
    if (!uuid.safeParse(companyId).success) return { error: "Entreprise invalide." };
    const { data } = await supabase.from("companies").select("id").eq("id", companyId).eq("brand_id", brandId).maybeSingle();
    return data ? { id: data.id } : { error: "Entreprise introuvable." };
  }

  const name = newName!.trim();
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("brand_id", brandId)
    .ilike("name", escapeLike(name))
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id };

  if (!can(ctx.access, "crm.manage", brandId)) {
    return { error: "Vous ne pouvez pas créer de prospect : choisissez une entreprise existante." };
  }
  const { data, error } = await supabase.from("companies").insert({ brand_id: brandId, name }).select("id").single();
  if (error) return { error: "Impossible de créer l'entreprise." };
  return { id: data.id };
}

/** Contact retrouvé par son nom dans l'entreprise, ou créé. */
async function resolveContact(
  supabase: Supabase,
  ctx: AuthContext,
  brandId: string,
  companyId: string,
  name: string | undefined,
  email: string | undefined,
): Promise<{ id: string | null } | { error: string }> {
  if (!name) return { id: null };
  const canManageCrm = can(ctx.access, "crm.manage", brandId);

  const { data: existing } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("brand_id", brandId)
    .eq("company_id", companyId)
    .ilike("full_name", escapeLike(name))
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (email && email !== existing.email && canManageCrm) {
      await supabase.from("contacts").update({ email }).eq("id", existing.id);
    }
    return { id: existing.id };
  }

  if (!canManageCrm) return { error: "Vous ne pouvez pas créer de contact." };
  const { data, error } = await supabase
    .from("contacts")
    .insert({ brand_id: brandId, company_id: companyId, full_name: name, email: email ?? null })
    .select("id")
    .single();
  if (error) return { error: "Impossible de créer le contact." };
  return { id: data.id };
}

/** Création (id = null) ou modification d'une offre ou d'un mémo. */
export async function saveDocument(
  kind: RegisterKind,
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isKind(kind) || !uuid.safeParse(brandId).success) return forbidden();
  if (id !== null && !uuid.safeParse(id).success) return forbidden();

  const ctx = await getAuthContext();
  const brand = ctx.brands.find((b) => b.id === brandId);
  if (!brand) return forbidden();
  const supabase = await createClient();

  // Droit d'écrire : création, ou modification d'un document que l'on gère.
  let existingCustom: Record<string, unknown> = {};
  if (id === null) {
    if (!canCreateDocument(ctx.access, kind, brandId)) return forbidden();
  } else {
    const { data: current } = await supabase
      .from("commercial_documents")
      .select("owner_id, custom")
      .eq("id", id)
      .eq("brand_id", brandId)
      .eq("kind", kind)
      .maybeSingle();
    if (!current || !canManageDocument(ctx.access, kind, brandId, current.owner_id, ctx.userId)) return forbidden();
    existingCustom = current.custom && typeof current.custom === "object" ? (current.custom as Record<string, unknown>) : {};
  }

  const parsed = documentSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  if (kind === "offer" && (d.amount === undefined) !== (d.currency === undefined) && d.amount !== undefined) {
    return { ok: false, message: "Vérifiez les champs signalés.", fieldErrors: { amount: ["Choisissez la devise."] } };
  }

  // Champs personnalisés : mêmes règles que la base, avec des messages par champ.
  const [fields, members] = await Promise.all([getCustomFields(brandId, kind), getMemberOptions(brandId)]);
  const custom = parseCustomFields(fields, formData, new Set(members.map((m) => m.id)), existingCustom);
  if (Object.keys(custom.errors).length > 0) {
    return {
      ok: false,
      message: "Vérifiez les champs signalés.",
      fieldErrors: Object.fromEntries(Object.entries(custom.errors).map(([k, v]) => [k, [v]])),
    };
  }
  const activeKeys = new Set(fields.filter((f) => f.isActive).map((f) => f.key));
  const customValues = {
    ...Object.fromEntries(Object.entries(existingCustom).filter(([key]) => !activeKeys.has(key))),
    ...custom.values,
  };

  const company = await resolveCompany(supabase, ctx, brandId, d.companyId, d.newCompanyName);
  if ("error" in company) return { ok: false, message: company.error, fieldErrors: { companyId: [company.error] } };
  const contact = await resolveContact(supabase, ctx, brandId, company.id, d.contactName, d.contactEmail);
  if ("error" in contact) return { ok: false, message: contact.error, fieldErrors: { contactName: [contact.error] } };

  const values = {
    company_id: company.id,
    contact_id: contact.id,
    subject: d.subject,
    issued_on: d.issuedOn,
    sent_on: d.sentOn ?? null,
    status_id: d.statusId,
    follow_up_on: d.followUpOn ?? null,
    comments: d.comments ?? null,
    custom: customValues as Json,
    amount: kind === "offer" ? (d.amount ?? null) : null,
    currency: kind === "offer" && d.amount !== undefined ? (d.currency ?? null) : null,
    valid_until: kind === "offer" ? (d.validUntil ?? null) : null,
    recipient_response: kind === "memo" ? (d.recipientResponse ?? null) : null,
  };
  const assign = canAssignOwner(ctx.access, kind, brandId);

  if (id === null) {
    const { data, error } = await supabase
      .from("commercial_documents")
      .insert({ ...values, brand_id: brandId, kind, owner_id: assign && d.ownerId ? d.ownerId : ctx.userId })
      .select("id")
      .single();
    if (error) return failed(error);
    redirect(`/m/${brand.slug}/${REGISTERS[kind].path}/${data.id}`);
  }

  const { data, error } = await supabase
    .from("commercial_documents")
    .update(assign && d.ownerId ? { ...values, owner_id: d.ownerId } : values)
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();

  refresh();
  return { ok: true, message: "Modifications enregistrées." };
}

async function authorizeDocument(kind: RegisterKind, brandId: string, documentId: string) {
  if (!isKind(kind) || !uuid.safeParse(brandId).success || !uuid.safeParse(documentId).success) return null;
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("commercial_documents")
    .select("id, owner_id")
    .eq("id", documentId)
    .eq("brand_id", brandId)
    .eq("kind", kind)
    .maybeSingle();
  if (!data || !canManageDocument(ctx.access, kind, brandId, data.owner_id, ctx.userId)) return null;
  return { ctx, supabase };
}

export async function addComment(
  kind: RegisterKind,
  brandId: string,
  documentId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeDocument(kind, brandId, documentId);
  if (!auth) return forbidden();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, message: "Le commentaire est vide." };
  if (text.length > 2000) return { ok: false, message: "2 000 caractères au maximum." };

  const { error } = await auth.supabase
    .from("document_events")
    .insert({ brand_id: brandId, document_id: documentId, type: "comment", payload: { text } });
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Commentaire ajouté." };
}

/** Relance effectuée : trace dans la chronologie, puis prochaine relance éventuelle. */
export async function completeFollowUp(
  kind: RegisterKind,
  brandId: string,
  documentId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeDocument(kind, brandId, documentId);
  if (!auth) return forbidden();
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const next = String(formData.get("nextDate") ?? "").trim();
  if (next && !DATE.test(next)) return { ok: false, message: "Date de prochaine relance invalide." };

  const { error: eventError } = await auth.supabase
    .from("document_events")
    .insert({ brand_id: brandId, document_id: documentId, type: "follow_up_done", payload: note ? { note } : {} });
  if (eventError) return failed(eventError);

  const { error } = await auth.supabase
    .from("commercial_documents")
    .update({ follow_up_on: next || null })
    .eq("id", documentId)
    .eq("brand_id", brandId);
  if (error) return failed(error);
  refresh();
  return { ok: true, message: next ? "Relance enregistrée, prochaine relance planifiée." : "Relance enregistrée." };
}

export async function setDocumentArchived(
  kind: RegisterKind,
  brandId: string,
  documentId: string,
  archived: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const auth = await authorizeDocument(kind, brandId, documentId);
  if (!auth) return forbidden();
  const { error } = await auth.supabase
    .from("commercial_documents")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", documentId)
    .eq("brand_id", brandId);
  if (error) return failed(error);
  refresh();
  return { ok: true, message: archived ? "Document archivé." : "Document restauré." };
}

export async function uploadAttachment(
  kind: RegisterKind,
  brandId: string,
  documentId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeDocument(kind, brandId, documentId);
  if (!auth) return forbidden();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Choisissez un fichier." };
  const check = checkAttachment(file);
  if (!check.ok) return { ok: false, message: check.message };

  const path = `${brandId}/${documentId}/${crypto.randomUUID()}.${check.extension}`;
  const storage = auth.supabase.storage.from("attachments");
  const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error(uploadError);
    return { ok: false, message: "L'envoi du fichier a échoué." };
  }

  const { error } = await auth.supabase.from("document_attachments").insert({
    brand_id: brandId,
    document_id: documentId,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (error) {
    await storage.remove([path]);
    return failed(error);
  }
  refresh();
  return { ok: true, message: `« ${file.name} » ajouté.` };
}

export async function deleteAttachment(
  kind: RegisterKind,
  brandId: string,
  documentId: string,
  attachmentId: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(attachmentId).success) return forbidden();
  const auth = await authorizeDocument(kind, brandId, documentId);
  if (!auth) return forbidden();

  const { data, error } = await auth.supabase
    .from("document_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("document_id", documentId)
    .select("storage_path");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();

  await auth.supabase.storage.from("attachments").remove(data.map((a) => a.storage_path));
  refresh();
  return { ok: true, message: "Pièce jointe supprimée." };
}

/** Lien de téléchargement valable 60 secondes (la RLS vérifie l'accès au document). */
export async function getAttachmentUrl(attachmentId: string): Promise<{ url: string } | { error: string }> {
  if (!uuid.safeParse(attachmentId).success) return { error: "Pièce jointe introuvable." };
  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("document_attachments")
    .select("storage_path, file_name")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!attachment) return { error: "Pièce jointe introuvable." };

  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(attachment.storage_path, 60, { download: attachment.file_name });
  if (error || !data) return { error: "Lien de téléchargement indisponible." };
  return { url: data.signedUrl };
}
