import { getActivityMembers, getActuals } from "@/features/activities/queries";
import { timeRows, type Chart } from "@/features/dashboard/chart-data";
import { getHistoryCutover, getOfferOutcomesByOwner } from "@/features/dashboard/queries";
import { getFxRates } from "@/features/fx/queries";
import { getMemberOptions } from "@/features/registers/queries";
import { formatDate } from "@/lib/format";
import { actualValue, availableMetrics, type ActualRow } from "@/lib/metrics/actuals";
import type { Currency, FxRate } from "@/lib/metrics/currency";
import { seriesPeriods, sumKnown } from "@/lib/metrics/series";
import type { Period } from "@/lib/periods";
import type { BrandSummary } from "@/server/authz/context";
import { can, type Access } from "@/server/authz/permissions";
import { buildSellerComparison, comparedPeople, excludedNote, sellerSlots, type Person, type SellerComparison } from "./comparison";

// Lectures de la comparaison, sous la RLS de l'utilisateur : la base ne renvoie
// les chiffres de chacun qu'aux personnes qui ont le droit de les voir.

export type LoadedComparison = SellerComparison & { people: Person[]; currency: Currency; rates: readonly FxRate[]; notes: string[] };

export async function loadSellerComparison(input: { brand: BrandSummary; access: Access; period: Period }): Promise<LoadedComparison> {
  const { brand, access, period } = input;
  const currency = (brand.reportingCurrency || "XOF") as Currency;
  const seesAllOffers =
    brand.enabledModules.includes("offers") && (can(access, "offers.read_all", brand.id) || can(access, "offers.manage_all", brand.id));
  const [actuals, tracked, members, rates, outcomes, cutover] = await Promise.all([
    getActuals(brand.id, period.start, period.end),
    getActivityMembers(brand.id),
    getMemberOptions(brand.id),
    getFxRates(),
    seesAllOffers ? getOfferOutcomesByOwner(brand.id, period.start, period.end) : Promise.resolve(undefined),
    getHistoryCutover(brand.id),
  ]);
  const people = comparedPeople(tracked, actuals, new Map(members.map((m) => [m.id, m.label])));
  const comparison = buildSellerComparison({
    actuals,
    people,
    enabledModules: brand.enabledModules,
    currency,
    rates,
    date: period.end,
    outcomes,
  });
  const notes = [
    ...(cutover && period.start < cutover ? [`Les chiffres importés d'avant le ${formatDate(cutover)} ne sont pas répartis par commercial : ils ne figurent pas ici.`] : []),
    ...excludedNote(comparison.excludedCurrencies),
  ];
  return { ...comparison, people, currency, rates, notes };
}

/** Évolution du CA signé, une courbe par commercial ayant signé sur la série. */
export async function loadSellerTrend(input: { brand: BrandSummary; period: Period; people: readonly Person[]; currency: Currency; rates: readonly FxRate[] }): Promise<Chart | null> {
  const { brand, period, people, currency, rates } = input;
  if (!availableMetrics(brand.enabledModules).includes("revenue_signed") || people.length === 0) return null;
  const periods = seriesPeriods(period);
  const perPeriod: ActualRow[][] = await Promise.all(periods.map((p) => getActuals(brand.id, p.start, p.end)));
  const excluded = new Set<string>();
  const read = (personId: string, index: number) => {
    const result = actualValue(perPeriod[index], "revenue_signed", personId, { currency, rates, date: periods[index].end });
    result.excludedCurrencies.forEach((c) => excluded.add(c));
    return result.value;
  };

  const slots = sellerSlots(people);
  const signed = people.filter((person) => periods.some((_, i) => read(person.id, i) > 0));
  if (signed.length === 0) return null;
  const series = [...new Map(signed.map((person) => [slots.get(person.id)!.key, slots.get(person.id)!])).values()].sort((a, b) => a.color - b.color);

  return {
    key: "sellers_trend",
    title: "Évolution du CA signé par commercial",
    description: "Une courbe par commercial ayant signé sur ces périodes.",
    kind: "line",
    format: "money",
    currency,
    series,
    rows: timeRows(periods, (_, i) => {
      const values: Record<string, number | null> = Object.fromEntries(series.map((s) => [s.key, null]));
      for (const person of signed) {
        const key = slots.get(person.id)!.key;
        values[key] = sumKnown([values[key], read(person.id, i)]);
      }
      return values;
    }),
    notes: excludedNote([...excluded].sort()),
  };
}
