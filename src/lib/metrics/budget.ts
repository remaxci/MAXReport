// Budget / réalisé : docs/architecture.md, section 6.
// - engagé = dépenses engagées + payées ; réalisé = dépenses payées ;
// - consommation = engagé ÷ budget × 100 ; alerte au seuil (80 % par défaut),
//   dépassement au-delà de 100 % ;
// - une campagne compte ses factures si elle en a, sinon sa dépense relevée
//   sur la plateforme, marquée « non facturée » : jamais les deux ;
// - un montant sans taux de change connu est exclu et signalé, jamais compté pour 0.

import { convert, type Currency, type FxRate } from "./currency";
import { ratio } from "./formulas";

export const DEFAULT_WARNING_THRESHOLD = 80;

export type BudgetLevel = "ok" | "warning" | "over";

export type LineInput = { id: string; amount: number; campaignId: string | null };
export type ExpenseInput = {
  lineId: string;
  amount: number;
  currency: string;
  date: string;
  status: "committed" | "paid";
};
/** Dépense relevée sur la plateforme (relevés de campagne compris dans la période du budget). */
export type PlatformSpendInput = { campaignId: string; amount: number; currency: string; date: string };

export type LineResult = {
  id: string;
  budgeted: number;
  engaged: number;
  paid: number;
  consumption: number | null;
  level: BudgetLevel;
  /** Dépense plateforme comptée faute de facture (null si la ligne n'en compte pas). */
  unbilled: number | null;
  /** Montants laissés de côté faute de taux de change. */
  excluded: number;
};

export type BudgetResult = {
  lines: LineResult[];
  envelope: number;
  allocated: number;
  /** Enveloppe non répartie sur les lignes (négatif : lignes au-delà de l'enveloppe). */
  unallocated: number;
  engaged: number;
  paid: number;
  remaining: number;
  consumption: number | null;
  level: BudgetLevel;
  excluded: number;
  unbilled: number;
};

export function budgetLevel(consumption: number | null, engaged: number, threshold: number): BudgetLevel {
  if (consumption === null) return engaged > 0 ? "over" : "ok";
  if (consumption > 100) return "over";
  if (consumption >= threshold) return "warning";
  return "ok";
}

export function computeBudget(input: {
  currency: Currency;
  envelope: number;
  lines: readonly LineInput[];
  expenses: readonly ExpenseInput[];
  /** Campagnes qui ont au moins une facture saisie, toutes lignes confondues. */
  invoicedCampaigns: ReadonlySet<string>;
  platformSpend: readonly PlatformSpendInput[];
  rates: readonly FxRate[];
  warningThreshold?: number;
}): BudgetResult {
  const threshold = input.warningThreshold ?? DEFAULT_WARNING_THRESHOLD;
  const toBudget = (amount: number, currency: string, date: string) =>
    convert(amount, currency as Currency, input.currency, date, input.rates);

  const lines = input.lines.map((line): LineResult => {
    let engaged = 0;
    let paid = 0;
    let excluded = 0;
    for (const expense of input.expenses) {
      if (expense.lineId !== line.id) continue;
      const value = toBudget(expense.amount, expense.currency, expense.date);
      if (value === null) {
        excluded += 1;
        continue;
      }
      engaged += value;
      if (expense.status === "paid") paid += value;
    }

    let unbilled: number | null = null;
    if (line.campaignId && !input.invoicedCampaigns.has(line.campaignId)) {
      for (const spend of input.platformSpend) {
        if (spend.campaignId !== line.campaignId) continue;
        const value = toBudget(spend.amount, spend.currency, spend.date);
        if (value === null) {
          excluded += 1;
          continue;
        }
        unbilled = (unbilled ?? 0) + value;
      }
      if (unbilled !== null) {
        engaged += unbilled;
        paid += unbilled;
      }
    }

    const consumption = ratio(engaged, line.amount, 100);
    return {
      id: line.id,
      budgeted: line.amount,
      engaged,
      paid,
      consumption,
      level: budgetLevel(consumption, engaged, threshold),
      unbilled,
      excluded,
    };
  });

  const sum = (pick: (l: LineResult) => number) => lines.reduce((total, l) => total + pick(l), 0);
  const allocated = sum((l) => l.budgeted);
  const engaged = sum((l) => l.engaged);
  const consumption = ratio(engaged, input.envelope, 100);
  return {
    lines,
    envelope: input.envelope,
    allocated,
    unallocated: input.envelope - allocated,
    engaged,
    paid: sum((l) => l.paid),
    remaining: input.envelope - engaged,
    consumption,
    level: budgetLevel(consumption, engaged, threshold),
    excluded: sum((l) => l.excluded),
    unbilled: sum((l) => l.unbilled ?? 0),
  };
}

/** Seuil d'alerte réglé pour la marque (paramètres du module Budgets), borné à 1–100. */
export function readWarningThreshold(settings: unknown): number {
  const raw = settings && typeof settings === "object" ? (settings as Record<string, unknown>).warning_threshold : undefined;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 100 ? raw : DEFAULT_WARNING_THRESHOLD;
}
