import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/format";
import type { RegisterKind } from "./config";
import type { RegisterFilters } from "./filters";

// Lectures sous RLS : chacun ne reçoit que les documents qu'il a le droit de voir.

const DOCUMENT_COLUMNS =
  "id, kind, reference, subject, issued_on, sent_on, follow_up_on, amount, currency, valid_until, " +
  "recipient_response, comments, custom, archived_at, updated_at, owner_id, company_id, contact_id, status_id, " +
  "companies(id, name), contacts(id, full_name, email), statuses(id, label, color, category)";

export type DocumentRow = {
  id: string;
  kind: RegisterKind;
  reference: string;
  subject: string;
  issuedOn: string;
  sentOn: string | null;
  followUpOn: string | null;
  amount: number | null;
  currency: string | null;
  validUntil: string | null;
  recipientResponse: string | null;
  comments: string | null;
  custom: Record<string, unknown>;
  archivedAt: string | null;
  updatedAt: string;
  ownerId: string;
  company: { id: string; name: string };
  contact: { id: string; fullName: string; email: string | null } | null;
  status: { id: string; label: string; color: string | null; category: string };
};

type RawDocument = {
  id: string;
  kind: string;
  reference: string;
  subject: string;
  issued_on: string;
  sent_on: string | null;
  follow_up_on: string | null;
  amount: number | null;
  currency: string | null;
  valid_until: string | null;
  recipient_response: string | null;
  comments: string | null;
  custom: unknown;
  archived_at: string | null;
  updated_at: string;
  owner_id: string;
  company_id: string;
  status_id: string;
  companies: { id: string; name: string } | null;
  contacts: { id: string; full_name: string; email: string | null } | null;
  statuses: { id: string; label: string; color: string | null; category: string } | null;
};

function toDocument(row: RawDocument): DocumentRow {
  return {
    id: row.id,
    kind: row.kind as RegisterKind,
    reference: row.reference,
    subject: row.subject,
    issuedOn: row.issued_on,
    sentOn: row.sent_on,
    followUpOn: row.follow_up_on,
    amount: row.amount,
    currency: row.currency,
    validUntil: row.valid_until,
    recipientResponse: row.recipient_response,
    comments: row.comments,
    custom: row.custom && typeof row.custom === "object" ? (row.custom as Record<string, unknown>) : {},
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
    ownerId: row.owner_id,
    company: row.companies ?? { id: row.company_id, name: "—" },
    contact: row.contacts
      ? { id: row.contacts.id, fullName: row.contacts.full_name, email: row.contacts.email }
      : null,
    status: row.statuses ?? { id: row.status_id, label: "—", color: null, category: "active" },
  };
}

export const LIST_LIMIT = 300;

export async function listDocuments(
  kind: RegisterKind,
  brandId: string,
  filters: RegisterFilters,
): Promise<DocumentRow[]> {
  const supabase = await createClient();

  let companyIds: string[] = [];
  if (filters.q) {
    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .eq("brand_id", brandId)
      .ilike("name", `%${filters.q}%`)
      .limit(200);
    if (error) throw error;
    companyIds = data.map((c) => c.id);
  }

  let query = supabase
    .from("commercial_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("brand_id", brandId)
    .eq("kind", kind);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.status) query = query.eq("status_id", filters.status);
  if (filters.owner) query = query.eq("owner_id", filters.owner);
  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.from) query = query.gte("issued_on", filters.from);
  if (filters.to) query = query.lte("issued_on", filters.to);
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    const clauses = [`reference.ilike.${pattern}`, `subject.ilike.${pattern}`];
    if (companyIds.length > 0) clauses.push(`company_id.in.(${companyIds.join(",")})`);
    query = query.or(clauses.join(","));
  }

  const today = todayIso();
  if (filters.followUp === "overdue") query = query.lt("follow_up_on", today);
  if (filters.followUp === "week") {
    const end = new Date(`${today}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 7);
    query = query.gte("follow_up_on", today).lte("follow_up_on", end.toISOString().slice(0, 10));
  }

  const { data, error } = await query
    .order("issued_on", { ascending: false })
    .order("reference", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;

  const rows = (data as unknown as RawDocument[]).map(toDocument);
  // Les relances ne concernent que les documents encore en cours.
  return filters.followUp
    ? rows.filter((r) => r.status.category === "draft" || r.status.category === "active")
    : rows;
}

export async function getDocument(
  kind: RegisterKind,
  brandId: string,
  id: string,
): Promise<DocumentRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("brand_id", brandId)
    .eq("kind", kind)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toDocument(data as unknown as RawDocument) : null;
}

export type DocumentEvent = {
  id: string;
  type: string;
  occurredAt: string;
  actorId: string | null;
  payload: Record<string, unknown>;
};

export async function getDocumentEvents(documentId: string): Promise<DocumentEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_events")
    .select("id, type, occurred_at, actor_id, payload")
    .eq("document_id", documentId)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data.map((e) => ({
    id: e.id,
    type: e.type,
    occurredAt: e.occurred_at,
    actorId: e.actor_id,
    payload: e.payload && typeof e.payload === "object" ? (e.payload as Record<string, unknown>) : {},
  }));
}

export type DocumentAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export async function getDocumentAttachments(documentId: string): Promise<DocumentAttachment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_attachments")
    .select("id, file_name, mime_type, size_bytes, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((a) => ({
    id: a.id,
    fileName: a.file_name,
    mimeType: a.mime_type,
    sizeBytes: a.size_bytes,
    createdAt: a.created_at,
  }));
}

export type MemberOption = { id: string; label: string; isGlobal: boolean };

/** Collaborateurs de la marque (et comptes globaux), pour les listes de choix. */
export async function getMemberOptions(brandId: string): Promise<MemberOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_member_options", { p_brand_id: brandId });
  if (error) throw error;
  return data.map((m) => ({ id: m.user_id, label: m.label, isGlobal: m.is_global }));
}

export type CompanyOption = { id: string; name: string };

export async function getCompanyOptions(brandId: string): Promise<CompanyOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("brand_id", brandId)
    .is("archived_at", null)
    .order("name")
    .limit(2000);
  if (error) throw error;
  return data;
}

export type StatusOption = { id: string; label: string; color: string | null; category: string; isDefault: boolean };

export async function getStatusOptions(brandId: string, kind: RegisterKind): Promise<StatusOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statuses")
    .select("id, label, color, category, is_default")
    .eq("brand_id", brandId)
    .eq("entity", kind)
    .eq("is_active", true)
    .order("position");
  if (error) throw error;
  return data.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    category: s.category,
    isDefault: s.is_default,
  }));
}
