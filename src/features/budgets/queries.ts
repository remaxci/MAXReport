import { readWarningThreshold } from "@/lib/metrics/budget";
import type { Currency } from "@/lib/metrics/currency";
import { createClient } from "@/lib/supabase/server";

// Lectures sous RLS (budgets.read ou budgets.manage).

export const BUDGET_SCOPES = { marketing: "Marketing", commercial: "Commercial", other: "Autre" } as const;
export type BudgetScope = keyof typeof BUDGET_SCOPES;
export const BUDGET_STATUSES = { draft: "Brouillon", approved: "Validé", closed: "Clôturé" } as const;
export type BudgetStatus = keyof typeof BUDGET_STATUSES;
export const EXPENSE_STATUSES = { committed: "Engagée", paid: "Payée" } as const;
export type ExpenseStatus = keyof typeof EXPENSE_STATUSES;

export type Budget = {
  id: string;
  name: string;
  scope: BudgetScope;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: Currency;
  status: BudgetStatus;
  comments: string | null;
  archivedAt: string | null;
};

export type BudgetLine = {
  id: string;
  budgetId: string;
  label: string;
  category: string | null;
  campaignId: string | null;
  amount: number;
  position: number;
};

export type Expense = {
  id: string;
  lineId: string;
  campaignId: string | null;
  supplier: string | null;
  description: string;
  date: string;
  amount: number;
  currency: Currency;
  status: ExpenseStatus;
  paidOn: string | null;
  externalRef: string | null;
  comments: string | null;
  source: string;
  archivedAt: string | null;
};

const BUDGET_COLUMNS = "id, name, scope, period_start, period_end, amount, currency, status, comments, archived_at";

type RawBudget = {
  id: string;
  name: string;
  scope: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  status: string;
  comments: string | null;
  archived_at: string | null;
};

function toBudget(r: RawBudget): Budget {
  return {
    id: r.id,
    name: r.name,
    scope: r.scope as BudgetScope,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    amount: Number(r.amount),
    currency: r.currency as Currency,
    status: r.status as BudgetStatus,
    comments: r.comments,
    archivedAt: r.archived_at,
  };
}

export async function listBudgets(brandId: string, archived: boolean): Promise<Budget[]> {
  const supabase = await createClient();
  let query = supabase.from("budgets").select(BUDGET_COLUMNS).eq("brand_id", brandId);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query.order("period_start", { ascending: false }).limit(200);
  if (error) throw error;
  return data.map(toBudget);
}

export async function getBudget(brandId: string, id: string): Promise<Budget | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("budgets").select(BUDGET_COLUMNS).eq("brand_id", brandId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toBudget(data) : null;
}

export async function listLines(brandId: string, budgetIds: string[]): Promise<BudgetLine[]> {
  if (budgetIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_lines")
    .select("id, budget_id, label, category, campaign_id, amount, position")
    .eq("brand_id", brandId)
    .in("budget_id", budgetIds)
    .order("position")
    .order("label");
  if (error) throw error;
  return data.map((l) => ({
    id: l.id,
    budgetId: l.budget_id,
    label: l.label,
    category: l.category,
    campaignId: l.campaign_id,
    amount: Number(l.amount),
    position: l.position,
  }));
}

const EXPENSE_COLUMNS =
  "id, budget_line_id, campaign_id, supplier, description, expense_date, amount, currency, status, paid_on, external_ref, comments, source, archived_at";

type RawExpense = {
  id: string;
  budget_line_id: string;
  campaign_id: string | null;
  supplier: string | null;
  description: string;
  expense_date: string;
  amount: number;
  currency: string;
  status: string;
  paid_on: string | null;
  external_ref: string | null;
  comments: string | null;
  source: string;
  archived_at: string | null;
};

function toExpense(r: RawExpense): Expense {
  return {
    id: r.id,
    lineId: r.budget_line_id,
    campaignId: r.campaign_id,
    supplier: r.supplier,
    description: r.description,
    date: r.expense_date,
    amount: Number(r.amount),
    currency: r.currency as Currency,
    status: r.status as ExpenseStatus,
    paidOn: r.paid_on,
    externalRef: r.external_ref,
    comments: r.comments,
    source: r.source,
    archivedAt: r.archived_at,
  };
}

/** Dépenses non archivées des lignes données. */
export async function listExpenses(brandId: string, lineIds: string[]): Promise<Expense[]> {
  if (lineIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("brand_id", brandId)
    .in("budget_line_id", lineIds)
    .is("archived_at", null)
    .order("expense_date", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data.map(toExpense);
}

export async function getExpense(brandId: string, id: string): Promise<Expense | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").select(EXPENSE_COLUMNS).eq("brand_id", brandId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toExpense(data) : null;
}

/** Campagnes qui ont au moins une facture saisie (toutes lignes et budgets confondus). */
export async function getInvoicedCampaigns(brandId: string, campaignIds: string[]): Promise<Set<string>> {
  if (campaignIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("campaign_id")
    .eq("brand_id", brandId)
    .in("campaign_id", campaignIds)
    .is("archived_at", null)
    .limit(10000);
  if (error) throw error;
  return new Set(data.map((e) => e.campaign_id).filter((id): id is string => id !== null));
}

export type PlatformSpend = { campaignId: string; amount: number; currency: string; date: string; periodStart: string; periodEnd: string };

/** Dépense relevée sur les plateformes, par relevé, dans la devise de chaque campagne. */
export async function getPlatformSpend(brandId: string, campaignIds: string[]): Promise<PlatformSpend[]> {
  if (campaignIds.length === 0) return [];
  const supabase = await createClient();
  const [snapshots, campaigns] = await Promise.all([
    supabase
      .from("campaign_snapshots")
      .select("campaign_id, period_start, period_end, spend")
      .eq("brand_id", brandId)
      .in("campaign_id", campaignIds)
      .not("spend", "is", null)
      .limit(10000),
    supabase.from("campaigns").select("id, currency").eq("brand_id", brandId).in("id", campaignIds),
  ]);
  if (snapshots.error) throw snapshots.error;
  if (campaigns.error) throw campaigns.error;
  const currencies = new Map(campaigns.data.map((c) => [c.id, c.currency]));
  return snapshots.data.map((s) => ({
    campaignId: s.campaign_id,
    amount: Number(s.spend),
    currency: currencies.get(s.campaign_id) ?? "XOF",
    date: s.period_end,
    periodStart: s.period_start,
    periodEnd: s.period_end,
  }));
}

/** Seuil d'alerte de la marque (paramètres du module Budgets). */
export async function getWarningThreshold(brandId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_modules")
    .select("settings")
    .eq("brand_id", brandId)
    .eq("module_key", "budgets")
    .maybeSingle();
  if (error) throw error;
  return readWarningThreshold(data?.settings);
}

/** Dépense déjà saisie sur la même ligne, à la même date, pour le même montant et la même devise. */
export async function findSimilarExpense(
  brandId: string,
  e: { lineId: string; date: string; amount: number; currency: string },
  exceptId: string | null,
): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select("id")
    .eq("brand_id", brandId)
    .eq("budget_line_id", e.lineId)
    .eq("expense_date", e.date)
    .eq("amount", e.amount)
    .eq("currency", e.currency)
    .is("archived_at", null)
    .limit(1);
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error } = await query;
  if (error) throw error;
  return data.length > 0;
}
