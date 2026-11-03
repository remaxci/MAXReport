"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseNumber } from "@/features/custom-fields/parse";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import { isIsoDate } from "@/lib/periods";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { BUDGET_SCOPES, BUDGET_STATUSES, findSimilarExpense } from "./queries";

// Droits revérifiés ici (budgets.manage, module actif) ; la RLS et les
// triggers (campagne de la ligne, budget clôturé, facture unique) restent
// l'arbitre final.

const uuid = z.uuid();
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max, `${max} caractères au maximum.`).optional());
const date = z.string().refine(isIsoDate, "Date invalide.");
const amount = (positive: boolean) =>
  z.preprocess(
    (value) => (blank(value) === undefined ? undefined : (parseNumber(String(value)) ?? Number.NaN)),
    (positive
      ? z.number({ error: "Montant invalide." }).positive("Montant supérieur à 0 attendu.")
      : z.number({ error: "Montant invalide." }).min(0, "Montant positif attendu.")
    )
      .max(1e15)
      .optional(),
  );
const optionalKey = z.preprocess(blank, z.string().regex(/^[a-z][a-z0-9_]{1,40}$/).optional());
const optionalUuid = z.preprocess(blank, z.uuid().optional());

async function budgetsScope(brandId: string) {
  if (!uuid.safeParse(brandId).success) return null;
  const ctx = await getAuthContext();
  const brand = ctx.brands.find((b) => b.id === brandId);
  if (!brand || !brand.enabledModules.includes("budgets") || !can(ctx.access, "budgets.manage", brandId)) return null;
  return { ctx, brand };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------

const budgetSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est obligatoire.").max(200, "200 caractères au maximum."),
    scope: z.enum(Object.keys(BUDGET_SCOPES) as [keyof typeof BUDGET_SCOPES]),
    status: z.enum(Object.keys(BUDGET_STATUSES) as [keyof typeof BUDGET_STATUSES]),
    periodStart: date,
    periodEnd: date,
    amount: amount(false),
    currency: z.enum(CURRENCIES),
    comments: text(5000),
  })
  .refine((d) => d.periodEnd >= d.periodStart, { path: ["periodEnd"], message: "La fin précède le début." });

export async function saveBudget(brandId: string, id: string | null, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const scope = await budgetsScope(brandId);
  if (!scope || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const parsed = budgetSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (d.amount === undefined) return { ok: false, message: "Indiquez le montant du budget.", fieldErrors: { amount: ["Montant requis."] } };
  const values = {
    name: d.name,
    scope: d.scope,
    status: d.status,
    period_start: d.periodStart,
    period_end: d.periodEnd,
    amount: round2(d.amount),
    currency: d.currency,
    comments: d.comments ?? null,
  };

  const supabase = await createClient();
  if (id) {
    // La devise d'un budget fixe celle de ses lignes : elle se change tant qu'il n'a pas de ligne.
    const { data: current } = await supabase.from("budgets").select("currency").eq("id", id).eq("brand_id", brandId).maybeSingle();
    if (!current) return forbidden();
    if (current.currency !== d.currency) {
      const { count } = await supabase.from("budget_lines").select("id", { count: "exact", head: true }).eq("budget_id", id);
      if ((count ?? 0) > 0) return { ok: false, message: "La devise ne change plus une fois des lignes créées.", fieldErrors: { currency: ["Devise figée."] } };
    }
    const { data, error } = await supabase.from("budgets").update(values).eq("id", id).eq("brand_id", brandId).select("id");
    if (error) return failed(error);
    if (data.length === 0) return forbidden();
    refresh();
    return { ok: true, message: "Budget enregistré." };
  }
  const { data, error } = await supabase.from("budgets").insert({ ...values, brand_id: brandId }).select("id").single();
  if (error) return failed(error);
  redirect(`/m/${scope.brand.slug}/budgets/${data.id}`);
}

export async function setBudgetArchived(
  brandId: string,
  id: string,
  archived: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(id).success || !(await budgetsScope(brandId))) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: archived ? "Budget archivé." : "Budget restauré." };
}

// ---------------------------------------------------------------------
// Lignes
// ---------------------------------------------------------------------

const lineSchema = z.object({
  label: z.string().trim().min(1, "Le libellé est obligatoire.").max(200, "200 caractères au maximum."),
  category: optionalKey,
  campaignId: optionalUuid,
  amount: amount(false),
});

export async function saveLine(
  brandId: string,
  budgetId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(budgetId).success || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  if (!(await budgetsScope(brandId))) return forbidden();
  const parsed = lineSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (d.amount === undefined) return { ok: false, message: "Indiquez le montant de la ligne.", fieldErrors: { amount: ["Montant requis."] } };
  const values = { label: d.label, category: d.category ?? null, campaign_id: d.campaignId ?? null, amount: round2(d.amount) };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("budget_lines").update(values).eq("id", id).eq("brand_id", brandId).eq("budget_id", budgetId)
    : await supabase.from("budget_lines").insert({ ...values, brand_id: brandId, budget_id: budgetId });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Cette campagne a déjà une ligne dans ce budget.", fieldErrors: { campaignId: ["Déjà utilisée."] } };
    return failed(error);
  }
  refresh();
  return { ok: true, message: id ? "Ligne enregistrée." : "Ligne ajoutée." };
}

export async function deleteLine(brandId: string, id: string, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  if (!uuid.safeParse(id).success || !(await budgetsScope(brandId))) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase.from("budget_lines").delete().eq("id", id).eq("brand_id", brandId).select("id");
  if (error) {
    if (error.code === "23503") return { ok: false, message: "Cette ligne a des dépenses : elle ne se supprime pas." };
    return failed(error);
  }
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Ligne supprimée." };
}

// ---------------------------------------------------------------------
// Dépenses
// ---------------------------------------------------------------------

const expenseSchema = z.object({
  lineId: z.uuid({ error: "Choisissez la ligne budgétaire." }),
  supplier: text(200),
  description: z.string().trim().min(1, "Décrivez la dépense.").max(500, "500 caractères au maximum."),
  date,
  amount: amount(true),
  currency: z.enum(CURRENCIES),
  status: z.enum(["committed", "paid"]),
  paidOn: z.preprocess(blank, date.optional()),
  externalRef: text(100),
  comments: text(2000),
});

export async function saveExpense(
  brandId: string,
  budgetId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(budgetId).success || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const scope = await budgetsScope(brandId);
  if (!scope) return forbidden();
  const parsed = expenseSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (d.amount === undefined) return { ok: false, message: "Indiquez le montant.", fieldErrors: { amount: ["Montant requis."] } };

  const supabase = await createClient();
  const { data: line } = await supabase.from("budget_lines").select("id").eq("id", d.lineId).eq("budget_id", budgetId).eq("brand_id", brandId).maybeSingle();
  if (!line) return { ok: false, message: "Ligne budgétaire introuvable.", fieldErrors: { lineId: ["Ligne invalide."] } };

  const value = round2(d.amount);
  // Anti-doublon : même ligne, même date, même montant → confirmation explicite.
  if (formData.get("confirmDuplicate") !== "1" && (await findSimilarExpense(brandId, { lineId: d.lineId, date: d.date, amount: value, currency: d.currency }, id))) {
    return {
      ok: false,
      message: "Une dépense identique (même ligne, date et montant) existe déjà. Cochez la case si c'est bien une autre dépense.",
      fieldErrors: { confirmDuplicate: ["À confirmer."] },
    };
  }

  const values = {
    budget_line_id: d.lineId,
    supplier: d.supplier ?? null,
    description: d.description,
    expense_date: d.date,
    amount: value,
    currency: d.currency,
    status: d.status,
    paid_on: d.status === "paid" ? (d.paidOn ?? d.date) : null,
    external_ref: d.externalRef ?? null,
    comments: d.comments ?? null,
  };
  const { error } = id
    ? await supabase.from("expenses").update({ ...values, campaign_id: null }).eq("id", id).eq("brand_id", brandId)
    : await supabase.from("expenses").insert({ ...values, brand_id: brandId });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Cette facture de ce fournisseur est déjà enregistrée.", fieldErrors: { externalRef: ["Déjà enregistrée."] } };
    return failed(error);
  }
  if (id) redirect(`/m/${scope.brand.slug}/budgets/${budgetId}`);
  refresh();
  return { ok: true, message: "Dépense enregistrée." };
}

/** Passe une dépense engagée à payée (ou l'inverse). */
export async function setExpensePaid(
  brandId: string,
  id: string,
  paid: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(id).success || !(await budgetsScope(brandId))) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .update({ status: paid ? "paid" : "committed", paid_on: null })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: paid ? "Dépense payée." : "Dépense repassée en engagée." };
}

export async function setExpenseArchived(
  brandId: string,
  id: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!uuid.safeParse(id).success || !(await budgetsScope(brandId))) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Dépense archivée." };
}

// ---------------------------------------------------------------------
// Seuil d'alerte de la marque (paramètres du module, rôle global)
// ---------------------------------------------------------------------

export async function saveWarningThreshold(brandId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!uuid.safeParse(brandId).success) return forbidden();
  const ctx = await getAuthContext();
  if (!ctx.brands.some((b) => b.id === brandId) || !can(ctx.access, "modules.manage")) return forbidden();
  const value = Number(formData.get("threshold"));
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    return { ok: false, message: "Seuil entre 1 et 100 %.", fieldErrors: { threshold: ["Entre 1 et 100."] } };
  }
  const supabase = await createClient();
  const { data: current } = await supabase.from("brand_modules").select("settings").eq("brand_id", brandId).eq("module_key", "budgets").maybeSingle();
  const settings = { ...((current?.settings as Record<string, unknown> | null) ?? {}), warning_threshold: value };
  const { data, error } = await supabase
    .from("brand_modules")
    .update({ settings: settings as Json })
    .eq("brand_id", brandId)
    .eq("module_key", "budgets")
    .select("brand_id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: `Seuil d'alerte réglé à ${value} %.` };
}
