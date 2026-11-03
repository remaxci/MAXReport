import { createClient } from "@/lib/supabase/server";
import { KINDS, type CampaignObjective, type CampaignStatus, type MarketingKind } from "./config";

// Lectures marketing sous RLS (marketing.read ou marketing.manage).

export type Platform = { key: string; label: string; kind: string; isActive: boolean };

export async function getPlatforms(): Promise<Platform[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("platforms").select("key, label, kind, is_active").order("position");
  if (error) throw error;
  return data.map((p) => ({ key: p.key, label: p.label, kind: p.kind, isActive: p.is_active }));
}

// ---------------------------------------------------------------------
// Objets suivis
// ---------------------------------------------------------------------

export type SocialAccount = {
  id: string;
  platform: string;
  name: string;
  handle: string | null;
  url: string | null;
  archivedAt: string | null;
};

export type Campaign = {
  id: string;
  platform: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  startOn: string | null;
  endOn: string | null;
  plannedBudget: number | null;
  currency: string;
  externalId: string | null;
  comments: string | null;
  custom: Record<string, unknown>;
  archivedAt: string | null;
};

export type Website = { id: string; name: string; url: string | null; archivedAt: string | null };

export async function listSocialAccounts(brandId: string, archived: boolean): Promise<SocialAccount[]> {
  const supabase = await createClient();
  let query = supabase.from("social_accounts").select("id, platform, name, handle, url, archived_at").eq("brand_id", brandId);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query.order("name").limit(500);
  if (error) throw error;
  return data.map((a) => ({ id: a.id, platform: a.platform, name: a.name, handle: a.handle, url: a.url, archivedAt: a.archived_at }));
}

export async function getSocialAccount(brandId: string, id: string): Promise<SocialAccount | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_accounts")
    .select("id, platform, name, handle, url, archived_at")
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data && { id: data.id, platform: data.platform, name: data.name, handle: data.handle, url: data.url, archivedAt: data.archived_at };
}

const CAMPAIGN_COLUMNS =
  "id, platform, name, objective, status, start_on, end_on, planned_budget, currency, external_id, comments, custom, archived_at";

type RawCampaign = {
  id: string;
  platform: string;
  name: string;
  objective: string;
  status: string;
  start_on: string | null;
  end_on: string | null;
  planned_budget: number | null;
  currency: string;
  external_id: string | null;
  comments: string | null;
  custom: unknown;
  archived_at: string | null;
};

function toCampaign(row: RawCampaign): Campaign {
  return {
    id: row.id,
    platform: row.platform,
    name: row.name,
    objective: row.objective as CampaignObjective,
    status: row.status as CampaignStatus,
    startOn: row.start_on,
    endOn: row.end_on,
    plannedBudget: row.planned_budget === null ? null : Number(row.planned_budget),
    currency: row.currency,
    externalId: row.external_id,
    comments: row.comments,
    custom: row.custom && typeof row.custom === "object" ? (row.custom as Record<string, unknown>) : {},
    archivedAt: row.archived_at,
  };
}

export async function listCampaigns(brandId: string, archived: boolean): Promise<Campaign[]> {
  const supabase = await createClient();
  let query = supabase.from("campaigns").select(CAMPAIGN_COLUMNS).eq("brand_id", brandId);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query.order("start_on", { ascending: false, nullsFirst: true }).order("name").limit(500);
  if (error) throw error;
  return (data as unknown as RawCampaign[]).map(toCampaign);
}

export async function getCampaign(brandId: string, id: string): Promise<Campaign | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").select(CAMPAIGN_COLUMNS).eq("brand_id", brandId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toCampaign(data as unknown as RawCampaign) : null;
}

export async function listWebsites(brandId: string, archived: boolean): Promise<Website[]> {
  const supabase = await createClient();
  let query = supabase.from("websites").select("id, name, url, archived_at").eq("brand_id", brandId);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query.order("name").limit(500);
  if (error) throw error;
  return data.map((w) => ({ id: w.id, name: w.name, url: w.url, archivedAt: w.archived_at }));
}

export async function getWebsite(brandId: string, id: string): Promise<Website | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("websites").select("id, name, url, archived_at").eq("brand_id", brandId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data && { id: data.id, name: data.name, url: data.url, archivedAt: data.archived_at };
}

// ---------------------------------------------------------------------
// Relevés
// ---------------------------------------------------------------------

/** Table des relevés et colonne de l'objet suivi, par type. */
export const SNAPSHOT_SOURCES = {
  social: { table: "social_snapshots", parent: "account_id" },
  campaign: { table: "campaign_snapshots", parent: "campaign_id" },
  website: { table: "website_snapshots", parent: "website_id" },
} as const satisfies Record<MarketingKind, { table: string; parent: string }>;

export type Snapshot = {
  id: string;
  parentId: string;
  periodStart: string;
  periodEnd: string;
  source: string;
  comments: string | null;
  values: Record<string, number | null>;
};

function toSnapshot(kind: MarketingKind, row: Record<string, unknown>): Snapshot {
  const { measures, extraMeasures } = KINDS[kind];
  const values: Record<string, number | null> = {};
  for (const m of [...measures, ...extraMeasures]) {
    const raw = row[m.key];
    values[m.key] = raw === null || raw === undefined ? null : Number(raw);
  }
  return {
    id: String(row.id),
    parentId: String(row[SNAPSHOT_SOURCES[kind].parent]),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    source: String(row.source),
    comments: (row.comments as string | null) ?? null,
    values,
  };
}

// Les trois tables de relevés partagent la même forme (période, source,
// mesures) : une seule requête les lit, typée sur l'une d'elles.
type SnapshotTable = "social_snapshots";

/**
 * Relevés qui recoupent [from, to] (tous si absent), pour un objet ou pour
 * tous les objets de la marque.
 */
export async function listSnapshots(
  kind: MarketingKind,
  brandId: string,
  options: { parentId?: string; from?: string; to?: string } = {},
): Promise<Snapshot[]> {
  const supabase = await createClient();
  const { table, parent } = SNAPSHOT_SOURCES[kind];
  let query = supabase
    .from(table as SnapshotTable)
    .select("*")
    .eq("brand_id", brandId);
  if (options.parentId) query = query.eq(parent as "account_id", options.parentId);
  if (options.to) query = query.lte("period_start", options.to);
  if (options.from) query = query.gte("period_end", options.from);
  const { data, error } = await query.order("period_start", { ascending: false }).limit(5000);
  if (error) throw error;
  return (data as unknown as Record<string, unknown>[]).map((row) => toSnapshot(kind, row));
}

export async function getSnapshot(kind: MarketingKind, brandId: string, id: string): Promise<Snapshot | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(SNAPSHOT_SOURCES[kind].table as SnapshotTable)
    .select("*")
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toSnapshot(kind, data as unknown as Record<string, unknown>) : null;
}
