import { getFxRates } from "@/features/fx/queries";
import { computeBudget, type BudgetResult } from "@/lib/metrics/budget";
import type { FxRate } from "@/lib/metrics/currency";
import {
  getInvoicedCampaigns,
  getPlatformSpend,
  getWarningThreshold,
  listExpenses,
  listLines,
  type Budget,
  type BudgetLine,
  type Expense,
  type PlatformSpend,
} from "./queries";

// Budget / réalisé d'un ensemble de budgets (pages Budgets, tableaux de bord).

export type BudgetData = {
  lines: BudgetLine[];
  expenses: Expense[];
  invoiced: Set<string>;
  spend: PlatformSpend[];
  rates: FxRate[];
  threshold: number;
};

/** Lignes, dépenses et données de calcul d'un ensemble de budgets. */
export async function loadBudgetData(brandId: string, budgets: Budget[]): Promise<BudgetData> {
  const lines = await listLines(brandId, budgets.map((b) => b.id));
  const campaignIds = [...new Set(lines.map((l) => l.campaignId).filter((id): id is string => id !== null))];
  const [expenses, invoiced, spend, rates, threshold] = await Promise.all([
    listExpenses(brandId, lines.map((l) => l.id)),
    getInvoicedCampaigns(brandId, campaignIds),
    getPlatformSpend(brandId, campaignIds),
    getFxRates(),
    getWarningThreshold(brandId),
  ]);
  return { lines, expenses, invoiced, spend, rates, threshold };
}

/** Calcul d'un budget : relevés de campagne compris dans sa période seulement. */
export function evaluateBudget(budget: Budget, data: BudgetData): BudgetResult {
  const lines = data.lines.filter((l) => l.budgetId === budget.id);
  const ids = new Set(lines.map((l) => l.id));
  return computeBudget({
    currency: budget.currency,
    envelope: budget.amount,
    lines: lines.map((l) => ({ id: l.id, amount: l.amount, campaignId: l.campaignId })),
    expenses: data.expenses
      .filter((e) => ids.has(e.lineId))
      .map((e) => ({ lineId: e.lineId, amount: e.amount, currency: e.currency, date: e.date, status: e.status })),
    invoicedCampaigns: data.invoiced,
    platformSpend: data.spend.filter((s) => s.periodStart >= budget.periodStart && s.periodEnd <= budget.periodEnd),
    rates: data.rates,
    warningThreshold: data.threshold,
  });
}
