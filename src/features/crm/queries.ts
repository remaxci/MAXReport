import { createClient } from "@/lib/supabase/server";

// Lectures CRM sous RLS : chacun ne reçoit que ce qu'il a le droit de voir.

type Search = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || undefined;
}

export type CrmFilters = { q?: string; status?: string; owner?: string; archived: boolean };

/** Filtres communs des listes CRM (recherche, statut ou étape, responsable). */
export function parseCrmFilters(params: Search): CrmFilters {
  const q = first(params.q)?.replace(/[,()%*\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  const status = first(params.statut);
  const owner = first(params.responsable);
  return {
    q: q || undefined,
    status: status && UUID.test(status) ? status : undefined,
    owner: owner && UUID.test(owner) ? owner : undefined,
    archived: first(params.archives) === "1",
  };
}

// ---------------------------------------------------------------------
// Prospects et contacts
// ---------------------------------------------------------------------

export type CompanyRow = {
  id: string;
  name: string;
  sector: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  ownerId: string | null;
  source: string | null;
  status: { id: string; label: string; color: string | null; category: string } | null;
  nextFollowUpOn: string | null;
  custom: Record<string, unknown>;
  archivedAt: string | null;
};

const COMPANY_COLUMNS =
  "id, name, sector, city, country, phone, email, website, owner_id, source, next_follow_up_on, custom, archived_at, " +
  "statuses(id, label, color, category)";

type RawCompany = {
  id: string;
  name: string;
  sector: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  owner_id: string | null;
  source: string | null;
  next_follow_up_on: string | null;
  custom: unknown;
  archived_at: string | null;
  statuses: { id: string; label: string; color: string | null; category: string } | null;
};

function toCompany(row: RawCompany): CompanyRow {
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    city: row.city,
    country: row.country,
    phone: row.phone,
    email: row.email,
    website: row.website,
    ownerId: row.owner_id,
    source: row.source,
    status: row.statuses,
    nextFollowUpOn: row.next_follow_up_on,
    custom: row.custom && typeof row.custom === "object" ? (row.custom as Record<string, unknown>) : {},
    archivedAt: row.archived_at,
  };
}

export async function listCompanies(brandId: string, filters: CrmFilters): Promise<CompanyRow[]> {
  const supabase = await createClient();
  let query = supabase.from("companies").select(COMPANY_COLUMNS).eq("brand_id", brandId);
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.status) query = query.eq("status_id", filters.status);
  if (filters.owner) query = query.eq("owner_id", filters.owner);
  if (filters.q) {
    const p = `%${filters.q}%`;
    query = query.or(`name.ilike.${p},city.ilike.${p},email.ilike.${p},phone.ilike.${p}`);
  }
  const { data, error } = await query.order("name").limit(500);
  if (error) throw error;
  return (data as unknown as RawCompany[]).map(toCompany);
}

export async function getCompany(brandId: string, id: string): Promise<CompanyRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toCompany(data as unknown as RawCompany) : null;
}

export type ContactRow = {
  id: string;
  companyId: string;
  fullName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
};

/** Contacts actifs d'une entreprise, ou de toute la marque (listes de choix). */
export async function listContacts(brandId: string, companyId?: string): Promise<ContactRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("contacts")
    .select("id, company_id, full_name, job_title, email, phone")
    .eq("brand_id", brandId)
    .is("archived_at", null);
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query.order("full_name").limit(5000);
  if (error) throw error;
  return data.map((c) => ({
    id: c.id,
    companyId: c.company_id,
    fullName: c.full_name,
    jobTitle: c.job_title,
    email: c.email,
    phone: c.phone,
  }));
}

export type InteractionRow = {
  id: string;
  type: string;
  occurredAt: string;
  summary: string;
  userId: string;
  contactName: string | null;
  opportunityId: string | null;
};

export async function listInteractions(
  brandId: string,
  scope: { companyId: string } | { opportunityId: string },
): Promise<InteractionRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("interactions")
    .select("id, type, occurred_at, summary, user_id, opportunity_id, contacts(full_name)")
    .eq("brand_id", brandId);
  query = "companyId" in scope ? query.eq("company_id", scope.companyId) : query.eq("opportunity_id", scope.opportunityId);
  const { data, error } = await query.order("occurred_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data.map((i) => ({
    id: i.id,
    type: i.type,
    occurredAt: i.occurred_at,
    summary: i.summary,
    userId: i.user_id,
    contactName: i.contacts?.full_name ?? null,
    opportunityId: i.opportunity_id,
  }));
}

// ---------------------------------------------------------------------
// Opportunités
// ---------------------------------------------------------------------

export type OpportunityRow = {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  contactId: string | null;
  ownerId: string;
  stageId: string;
  amount: number | null;
  currency: string | null;
  expectedCloseOn: string | null;
  closedOn: string | null;
  source: string | null;
  lostReason: string | null;
  custom: Record<string, unknown>;
  archivedAt: string | null;
};

type RawOpportunity = {
  id: string;
  title: string;
  company_id: string;
  contact_id: string | null;
  owner_id: string;
  stage_id: string;
  amount: number | null;
  currency: string | null;
  expected_close_on: string | null;
  closed_on: string | null;
  source: string | null;
  lost_reason: string | null;
  custom: unknown;
  archived_at: string | null;
  companies: { name: string } | null;
};

const OPPORTUNITY_COLUMNS =
  "id, title, company_id, contact_id, owner_id, stage_id, amount, currency, expected_close_on, closed_on, " +
  "source, lost_reason, custom, archived_at, companies(name)";

function toOpportunity(row: RawOpportunity): OpportunityRow {
  return {
    id: row.id,
    title: row.title,
    companyId: row.company_id,
    companyName: row.companies?.name ?? "—",
    contactId: row.contact_id,
    ownerId: row.owner_id,
    stageId: row.stage_id,
    amount: row.amount,
    currency: row.currency,
    expectedCloseOn: row.expected_close_on,
    closedOn: row.closed_on,
    source: row.source,
    lostReason: row.lost_reason,
    custom: row.custom && typeof row.custom === "object" ? (row.custom as Record<string, unknown>) : {},
    archivedAt: row.archived_at,
  };
}

export async function listOpportunities(
  brandId: string,
  filters: CrmFilters & { companyId?: string },
): Promise<OpportunityRow[]> {
  const supabase = await createClient();
  let query = supabase.from("opportunities").select(OPPORTUNITY_COLUMNS).eq("brand_id", brandId);
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.owner) query = query.eq("owner_id", filters.owner);
  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data as unknown as RawOpportunity[]).map(toOpportunity);
}

export async function getOpportunity(brandId: string, id: string): Promise<OpportunityRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_COLUMNS)
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toOpportunity(data as unknown as RawOpportunity) : null;
}

export type StageOption = {
  id: string;
  label: string;
  category: string;
  probability: number;
  isActive: boolean;
};

export async function getStages(brandId: string): Promise<StageOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, label, category, probability, is_active")
    .eq("brand_id", brandId)
    .order("position");
  if (error) throw error;
  return data.map((s) => ({
    id: s.id,
    label: s.label,
    category: s.category,
    probability: s.probability,
    isActive: s.is_active,
  }));
}

// ---------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------

export type ContractRow = {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  opportunityId: string | null;
  offerId: string | null;
  offerReference: string | null;
  ownerId: string;
  signedOn: string;
  amount: number;
  currency: string;
  startOn: string | null;
  endOn: string | null;
  comments: string | null;
  custom: Record<string, unknown>;
  archivedAt: string | null;
};

type RawContract = {
  id: string;
  title: string;
  company_id: string;
  opportunity_id: string | null;
  offer_id: string | null;
  owner_id: string;
  signed_on: string;
  amount: number;
  currency: string;
  start_on: string | null;
  end_on: string | null;
  comments: string | null;
  custom: unknown;
  archived_at: string | null;
  companies: { name: string } | null;
  commercial_documents: { reference: string } | null;
};

const CONTRACT_COLUMNS =
  "id, title, company_id, opportunity_id, offer_id, owner_id, signed_on, amount, currency, start_on, end_on, " +
  "comments, custom, archived_at, companies(name), commercial_documents(reference)";

function toContract(row: RawContract): ContractRow {
  return {
    id: row.id,
    title: row.title,
    companyId: row.company_id,
    companyName: row.companies?.name ?? "—",
    opportunityId: row.opportunity_id,
    offerId: row.offer_id,
    offerReference: row.commercial_documents?.reference ?? null,
    ownerId: row.owner_id,
    signedOn: row.signed_on,
    amount: row.amount,
    currency: row.currency,
    startOn: row.start_on,
    endOn: row.end_on,
    comments: row.comments,
    custom: row.custom && typeof row.custom === "object" ? (row.custom as Record<string, unknown>) : {},
    archivedAt: row.archived_at,
  };
}

export async function listContracts(
  brandId: string,
  filters: CrmFilters & { companyId?: string },
): Promise<ContractRow[]> {
  const supabase = await createClient();
  let query = supabase.from("contracts").select(CONTRACT_COLUMNS).eq("brand_id", brandId);
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.owner) query = query.eq("owner_id", filters.owner);
  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);
  const { data, error } = await query.order("signed_on", { ascending: false }).limit(500);
  if (error) throw error;
  return (data as unknown as RawContract[]).map(toContract);
}

export async function getContract(brandId: string, id: string): Promise<ContractRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(CONTRACT_COLUMNS)
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toContract(data as unknown as RawContract) : null;
}

/** Offres d'une marque, pour lier un contrat (référence et entreprise). */
export async function getOfferOptions(brandId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_documents")
    .select("id, reference, subject, company_id")
    .eq("brand_id", brandId)
    .eq("kind", "offer")
    .is("archived_at", null)
    .order("issued_on", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return data.map((d) => ({ id: d.id, label: `${d.reference} · ${d.subject}`, companyId: d.company_id }));
}

/** Choix actifs d'une liste déroulante (sources, secteurs…). */
export async function getListItems(brandId: string, listKey: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("option_lists")
    .select("option_items(value, label, position, is_active)")
    .eq("brand_id", brandId)
    .eq("key", listKey)
    .maybeSingle();
  if (error) throw error;
  return (data?.option_items ?? [])
    .filter((i) => i.is_active)
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ id: i.value, label: i.label }));
}
