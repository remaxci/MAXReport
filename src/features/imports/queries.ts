import { getListItems } from "@/features/crm/queries";
import { listCampaigns, listSnapshots, listSocialAccounts, listWebsites } from "@/features/marketing/queries";
import { listBrandMembers } from "@/features/members/queries";
import { getMemberOptions } from "@/features/registers/queries";
import { createClient } from "@/lib/supabase/server";
import type { ImportContext } from "./normalize";
import { isImportTarget, TARGETS, type ImportTarget, type Mapping } from "./targets";
import { normalizeKey, type Cell } from "./values";

// Lectures sous RLS : les lots exigent imports.manage ; le contexte de
// vérification ne contient que ce que l'utilisateur peut lire.

export type BatchStatus = "uploaded" | "committed" | "rolled_back";

export type BatchSummary = {
  id: string;
  target: ImportTarget;
  fileName: string;
  rowCount: number;
  status: BatchStatus;
  insertedCount: number | null;
  skippedCount: number | null;
  errorCount: number | null;
  createdAt: string;
  createdBy: string | null;
  committedAt: string | null;
  rolledBackAt: string | null;
};

export type ReportLine = { line: number; status: "duplicate" | "error"; message: string };

export type Batch = BatchSummary & {
  fileSize: number;
  fileSha256: string;
  headers: string[];
  rows: Cell[][];
  mapping: Mapping;
  options: Record<string, unknown>;
  report: { lines?: ReportLine[] } | null;
  committedBy: string | null;
  rolledBackBy: string | null;
};

const SUMMARY_COLUMNS =
  "id, target, file_name, row_count, status, inserted_count, skipped_count, error_count, created_at, created_by, committed_at, rolled_back_at";

type RawSummary = {
  id: string;
  target: string;
  file_name: string;
  row_count: number;
  status: string;
  inserted_count: number | null;
  skipped_count: number | null;
  error_count: number | null;
  created_at: string;
  created_by: string | null;
  committed_at: string | null;
  rolled_back_at: string | null;
};

function toSummary(row: RawSummary): BatchSummary | null {
  if (!isImportTarget(row.target)) return null;
  return {
    id: row.id,
    target: row.target,
    fileName: row.file_name,
    rowCount: row.row_count,
    status: row.status as BatchStatus,
    insertedCount: row.inserted_count,
    skippedCount: row.skipped_count,
    errorCount: row.error_count,
    createdAt: row.created_at,
    createdBy: row.created_by,
    committedAt: row.committed_at,
    rolledBackAt: row.rolled_back_at,
  };
}

function asMapping(value: unknown): Mapping {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((e): e is [string, number] => Number.isInteger(e[1])),
  );
}

export async function listBatches(brandId: string): Promise<BatchSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(SUMMARY_COLUMNS)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as RawSummary[]).map(toSummary).filter((b): b is BatchSummary => b !== null);
}

export async function getBatch(brandId: string, id: string): Promise<Batch | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(`${SUMMARY_COLUMNS}, file_size, file_sha256, headers, rows, mapping, options, report, committed_by, rolled_back_by`)
    .eq("brand_id", brandId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const summary = toSummary(data as unknown as RawSummary);
  if (!summary) return null;
  return {
    ...summary,
    fileSize: data.file_size,
    fileSha256: data.file_sha256,
    headers: Array.isArray(data.headers) ? data.headers.map(String) : [],
    rows: Array.isArray(data.rows) ? (data.rows as Cell[][]) : [],
    mapping: asMapping(data.mapping),
    options: data.options && typeof data.options === "object" ? (data.options as Record<string, unknown>) : {},
    report: data.report && typeof data.report === "object" ? (data.report as Batch["report"]) : null,
    committedBy: data.committed_by,
    rolledBackBy: data.rolled_back_by,
  };
}

/** Correspondance du dernier lot de même type aux mêmes en-têtes (modèle réutilisé). */
export async function findPreviousMapping(
  brandId: string,
  target: ImportTarget,
  headers: readonly string[],
): Promise<{ mapping: Mapping; options: Record<string, unknown> } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("headers, mapping, options")
    .eq("brand_id", brandId)
    .eq("target", target)
    .neq("status", "uploaded")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const same = data.find((b) => JSON.stringify(b.headers) === JSON.stringify(headers));
  return same ? { mapping: asMapping(same.mapping), options: (same.options as Record<string, unknown>) ?? {} } : null;
}

/** Lot déjà importé à partir du même fichier (même empreinte). */
export async function findSameFile(brandId: string, target: ImportTarget, sha256: string, exceptId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, committed_at")
    .eq("brand_id", brandId)
    .eq("target", target)
    .eq("file_sha256", sha256)
    .eq("status", "committed")
    .neq("id", exceptId)
    .order("committed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const keys = (...values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v).map(normalizeKey).filter(Boolean))];

/** Lignes des budgets ouverts (non archivés, non clôturés), désignées par leur libellé. */
async function getBudgetLineParents(brandId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_lines")
    .select("id, label, budgets!inner(name, status, archived_at)")
    .eq("brand_id", brandId)
    .neq("budgets.status", "closed")
    .is("budgets.archived_at", null)
    .order("label");
  if (error) throw error;
  return data.map((l) => ({
    id: l.id,
    label: `${l.budgets.name} › ${l.label}`,
    keys: keys(l.label, `${l.budgets.name} ${l.label}`),
  }));
}

/** Objets auxquels se rattachent les lignes d'un import (comptes, campagnes, sites, lignes budgétaires). */
export async function getParents(target: ImportTarget, brandId: string) {
  if (target === "expenses") return getBudgetLineParents(brandId);
  switch (TARGETS[target].marketing) {
    case "social":
      return (await listSocialAccounts(brandId, false)).map((a) => ({
        id: a.id,
        label: a.name,
        keys: keys(a.name, a.handle, a.handle?.replace(/^@/, ""), a.url),
      }));
    case "campaign":
      return (await listCampaigns(brandId, false)).map((c) => ({ id: c.id, label: c.name, keys: keys(c.name, c.externalId) }));
    case "website":
      return (await listWebsites(brandId, false)).map((w) => ({
        id: w.id,
        label: w.name,
        keys: keys(w.name, w.url, w.url?.replace(/^https?:\/\//, "").replace(/\/$/, "")),
      }));
    default:
      return [];
  }
}

/** Données de la marque nécessaires à la vérification d'un lot. */
export async function getImportContext(target: ImportTarget, brandId: string): Promise<ImportContext> {
  const marketing = TARGETS[target].marketing;
  if (marketing) {
    const [parents, snapshots] = await Promise.all([getParents(target, brandId), listSnapshots(marketing, brandId)]);
    return {
      parents,
      existingPeriods: snapshots.map((s) => ({ parentId: s.parentId, start: s.periodStart, end: s.periodEnd })),
    };
  }

  const supabase = await createClient();
  if (target === "expenses") {
    const [parents, expenses] = await Promise.all([
      getBudgetLineParents(brandId),
      supabase
        .from("expenses")
        .select("budget_line_id, expense_date, amount, currency, supplier, external_ref")
        .eq("brand_id", brandId)
        .is("archived_at", null)
        .limit(20000),
    ]);
    if (expenses.error) throw expenses.error;
    return {
      parents,
      existingExpenses: expenses.data.map((e) => ({
        lineId: e.budget_line_id,
        date: e.expense_date,
        amount: Number(e.amount),
        currency: e.currency,
        supplier: normalizeKey(e.supplier ?? ""),
        ref: e.external_ref,
      })),
    };
  }
  if (target === "companies") {
    const [companies, industries, sources] = await Promise.all([
      supabase.from("companies").select("name").eq("brand_id", brandId).limit(20000),
      getListItems(brandId, "industries"),
      getListItems(brandId, "lead_sources"),
    ]);
    if (companies.error) throw companies.error;
    return {
      existingNames: new Set(companies.data.map((c) => normalizeKey(c.name))),
      options: {
        industries: industries.map((i) => ({ value: i.id, label: i.label })),
        lead_sources: sources.map((i) => ({ value: i.id, label: i.label })),
      },
    };
  }

  const [options, members, history] = await Promise.all([
    getMemberOptions(brandId),
    listBrandMembers(brandId),
    supabase.from("historical_metrics").select("metric_key, user_id, currency, period_start, period_end").eq("brand_id", brandId).limit(20000),
  ]);
  if (history.error) throw history.error;
  const emails = new Map(members.map((m) => [m.userId, m.email]));
  return {
    members: options
      .filter((m) => !m.isGlobal)
      .map((m) => ({ id: m.id, label: m.label, keys: keys(m.label, emails.get(m.id)) })),
    existingHistorical: history.data.map((h) => ({
      metric: h.metric_key,
      userId: h.user_id,
      currency: h.currency,
      start: h.period_start,
      end: h.period_end,
    })),
  };
}
