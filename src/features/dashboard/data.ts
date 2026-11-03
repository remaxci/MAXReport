import { getActuals } from "@/features/activities/queries";
import { evaluateBudget, loadBudgetData } from "@/features/budgets/evaluate";
import { listBudgets } from "@/features/budgets/queries";
import { sumInCurrency } from "@/features/crm/money";
import { getFxRates } from "@/features/fx/queries";
import { aggregationFields, KINDS, type MarketingKind } from "@/features/marketing/config";
import { listCampaigns, listSnapshots } from "@/features/marketing/queries";
import { evaluateObjectives } from "@/features/objectives/evaluate";
import { listObjectives } from "@/features/objectives/queries";
import { OBJECTIVE_STATUS_LABELS, type ObjectiveStatus } from "@/features/objectives/status";
import { formatDate, todayIso } from "@/lib/format";
import { availableMetrics, formatMetric, knownActual, METRICS, type MetricKey } from "@/lib/metrics/actuals";
import { convert, type Currency, type FxRate } from "@/lib/metrics/currency";
import { conversionRate, cpl, ctr, ratio } from "@/lib/metrics/formulas";
import { combineParts, historicalTeamTotal, splitAtCutover, type HistoricalRow } from "@/lib/metrics/history";
import { aggregateSnapshots } from "@/lib/metrics/snapshots";
import { rangeLabel, shiftPeriod, type Period } from "@/lib/periods";
import type { BrandSummary } from "@/server/authz/context";
import { can, type Access, type Permission } from "@/server/authz/permissions";
import { getDocumentOutcomes, getHistoryCutover, getOpenPipeline, listHistoricalRows } from "./queries";

// Indicateurs des tableaux de bord et des rapports, par section. Tout est lu
// sous la RLS de l'utilisateur : un tableau de bord ne montre jamais plus que
// ce que son lecteur peut déjà consulter.

export const SECTION_KEYS = ["commercial", "objectives", "social", "campaigns", "websites", "budgets"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  commercial: "Commercial",
  objectives: "Objectifs en cours",
  social: "Réseaux sociaux",
  campaigns: "Campagnes",
  websites: "Sites web",
  budgets: "Budgets",
};

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

export type KpiFormat = "count" | "money" | "percent";
export type Kpi = {
  key: string;
  label: string;
  value: number | null;
  /** Même indicateur sur la période précédente (null : sans objet ou inconnu). */
  previous: number | null;
  format: KpiFormat;
  currency?: string;
  hint?: string;
};
export type Section = { key: SectionKey; title: string; kpis: Kpi[]; notes: string[] };

const any = (access: Access, brandId: string, permissions: Permission[]) => permissions.some((p) => can(access, p, brandId));
const MARKETING: Permission[] = ["marketing.read", "marketing.manage"];

/** Sections visibles pour une marque et un utilisateur (modules actifs, droits). */
export function availableSections(brand: BrandSummary, access: Access): SectionKey[] {
  const modules = brand.enabledModules;
  return SECTION_KEYS.filter((key) => {
    switch (key) {
      case "commercial":
        return can(access, "brand.read", brand.id) && availableMetrics(modules).length > 0;
      case "objectives":
        return modules.includes("objectives") && can(access, "brand.read", brand.id);
      case "social":
        return modules.includes("social") && any(access, brand.id, MARKETING);
      case "campaigns":
        return modules.includes("campaigns") && any(access, brand.id, MARKETING);
      case "websites":
        return modules.includes("websites") && any(access, brand.id, MARKETING);
      case "budgets":
        return modules.includes("budgets") && any(access, brand.id, ["budgets.read", "budgets.manage"]);
    }
  });
}

type Ctx = {
  brand: BrandSummary;
  access: Access;
  period: Period;
  previous: Period;
  currency: Currency;
  rates: readonly FxRate[];
  today: string;
};

export async function loadDashboard(input: {
  brand: BrandSummary;
  access: Access;
  period: Period;
  /** Devise d'affichage des montants (la devise de la marque par défaut ; XOF pour la Direction). */
  currency?: Currency;
  sections?: readonly SectionKey[];
  rates?: readonly FxRate[];
}): Promise<Section[]> {
  const available = availableSections(input.brand, input.access);
  const wanted = (input.sections ?? SECTION_KEYS).filter((s) => available.includes(s));
  const ctx: Ctx = {
    brand: input.brand,
    access: input.access,
    period: input.period,
    previous: shiftPeriod(input.period, -1),
    currency: input.currency ?? ((input.brand.reportingCurrency || "XOF") as Currency),
    rates: input.rates ?? (await getFxRates()),
    today: todayIso(),
  };
  return Promise.all(
    wanted.map((key) => {
      switch (key) {
        case "commercial":
          return commercial(ctx);
        case "objectives":
          return objectives(ctx);
        case "social":
        case "websites":
          return marketing(ctx, key === "social" ? "social" : "website");
        case "campaigns":
          return campaigns(ctx);
        case "budgets":
          return budgets(ctx);
      }
    }),
  );
}

const excludedNote = (currencies: Iterable<string>) => {
  const list = [...new Set(currencies)].sort();
  return list.length > 0 ? [`Montants en ${list.join(", ")} exclus faute de taux de change.`] : [];
};

// ---------------------------------------------------------------------
// Commercial : réalisés de l'équipe, historique avant la date de bascule
// ---------------------------------------------------------------------

/**
 * Réalisés de l'équipe sur une période : l'historique importé avant la date
 * de bascule, les données saisies ensuite (jamais les deux sur un même jour).
 * Les devises exclues faute de taux s'ajoutent à `excluded`.
 */
export function commercialReader(
  input: { brand: BrandSummary; cutover: string | null; history: readonly HistoricalRow[]; currency: Currency; rates: readonly FxRate[] },
  excluded: string[],
) {
  const { brand, cutover, history, currency, rates } = input;
  return async (p: Period) => {
    const split = splitAtCutover(p, cutover);
    const rows = split.detailed ? await getActuals(brand.id, split.detailed.start, split.detailed.end) : [];
    return (metric: MetricKey): number | null => {
      const detail = split.detailed ? knownActual(rows, metric, null, brand.enabledModules, { currency, rates, date: p.end }) : null;
      const hist = split.historical ? historicalTeamTotal(history, metric, split.historical, { currency, rates }) : null;
      excluded.push(...(detail?.excludedCurrencies ?? []), ...(hist?.excludedCurrencies ?? []));
      return combineParts(hist?.value ?? null, detail?.value ?? null);
    };
  };
}

async function commercial(c: Ctx): Promise<Section> {
  const { brand, access, currency, rates } = c;
  const cutover = await getHistoryCutover(brand.id);
  const history: HistoricalRow[] = cutover ? await listHistoricalRows(brand.id) : [];
  const excluded: string[] = [];

  const reader = commercialReader({ brand, cutover, history, currency, rates }, excluded);
  const [now, before] = await Promise.all([reader(c.period), reader(c.previous)]);

  const kpis: Kpi[] = availableMetrics(brand.enabledModules).map((metric) => ({
    key: metric,
    label: METRICS[metric].label,
    value: now(metric),
    previous: before(metric),
    format: METRICS[metric].money ? "money" : "count",
    currency,
  }));
  const notes: string[] = [];

  const documents = [
    { kind: "offer" as const, module: "offers", label: "Taux de transformation des offres", noun: "offre(s) envoyée(s)", perms: ["offers.read_all", "offers.manage_all", "offers.manage_own"] as Permission[], all: ["offers.read_all", "offers.manage_all"] as Permission[] },
    { kind: "memo" as const, module: "memos", label: "Taux de réponse aux mémos", noun: "mémo(s) envoyé(s)", perms: ["memos.read_all", "memos.manage_all", "memos.manage_own"] as Permission[], all: ["memos.read_all", "memos.manage_all"] as Permission[] },
  ];
  for (const doc of documents) {
    if (!brand.enabledModules.includes(doc.module) || !any(access, brand.id, doc.perms)) continue;
    const [current, previous] = await Promise.all([
      getDocumentOutcomes(brand.id, doc.kind, c.period.start, c.period.end),
      getDocumentOutcomes(brand.id, doc.kind, c.previous.start, c.previous.end),
    ]);
    kpis.push({
      key: `${doc.kind}_success_rate`,
      label: doc.label,
      value: ratio(current.success, current.sent, 100),
      previous: ratio(previous.success, previous.sent, 100),
      format: "percent",
      hint: `${current.success} abouti(s) sur ${current.sent} ${doc.noun}`,
    });
    if (!any(access, brand.id, doc.all)) notes.push(`${doc.label} : calculé sur vos propres documents.`);
  }

  if (brand.enabledModules.includes("crm") && any(access, brand.id, ["opportunities.read_all", "opportunities.manage_all", "opportunities.manage_own"])) {
    const pipeline = await getOpenPipeline(brand.id);
    const weighted = sumInCurrency(
      pipeline.map((o) => ({ amount: o.amount === null ? null : (o.amount * o.probability) / 100, currency: o.currency })),
      currency,
      c.today,
      rates,
    );
    kpis.push({
      key: "weighted_pipeline",
      label: "Pipeline pondéré (en cours)",
      value: weighted.total,
      previous: null,
      format: "money",
      currency,
      hint: `${pipeline.length} opportunité(s) en cours`,
    });
    if (weighted.excluded > 0) notes.push(`Pipeline : ${weighted.excluded} montant(s) exclus faute de taux de change.`);
    if (!any(access, brand.id, ["opportunities.read_all", "opportunities.manage_all"])) notes.push("Pipeline : vos opportunités seulement.");
  }

  const split = splitAtCutover(c.period, cutover);
  if (split.historical) notes.unshift(`Jusqu'au ${formatDate(split.historical.end)} : historique importé (date de bascule ${formatDate(cutover)}).`);
  return { key: "commercial", title: SECTION_LABELS.commercial, kpis, notes: [...notes, ...excludedNote(excluded)] };
}

// ---------------------------------------------------------------------
// Objectifs en cours (objectifs d'équipe)
// ---------------------------------------------------------------------

async function objectives(c: Ctx): Promise<Section> {
  const list = await listObjectives(c.brand.id, "current", c.today);
  const evaluated = await evaluateObjectives(c.brand, list, c.rates, c.today);
  const kpis: Kpi[] = evaluated
    .filter((e) => e.objective.userId === null)
    .map(({ objective: o, actual, reading }) => {
      const cur = o.currency ?? c.brand.reportingCurrency;
      return {
        key: o.id,
        label: `${METRICS[o.metric].label} · ${rangeLabel(o.periodStart, o.periodEnd)}`,
        value: reading.rate,
        previous: null,
        format: "percent",
        hint: `${OBJECTIVE_STATUS_LABELS[reading.status]} · ${formatMetric(o.metric, actual.value, cur)} sur ${formatMetric(o.metric, o.target, cur)}`,
      };
    });
  const counts = new Map<ObjectiveStatus, number>();
  evaluated.forEach((e) => counts.set(e.reading.status, (counts.get(e.reading.status) ?? 0) + 1));
  const summary = [...counts].map(([status, n]) => `${n} ${OBJECTIVE_STATUS_LABELS[status].toLowerCase()}`).join(", ");
  const notes = evaluated.length === 0 ? ["Aucun objectif en cours."] : [`${evaluated.length} objectif(s) en cours visibles : ${summary}.`];
  return { key: "objectives", title: SECTION_LABELS.objectives, kpis, notes };
}

// ---------------------------------------------------------------------
// Marketing : totaux de la marque (comptes et sites)
// ---------------------------------------------------------------------

/** Totaux de la marque sur une période : chaque compte agrégé selon ses règles, puis additionné. */
export function snapshotTotals(snapshots: Awaited<ReturnType<typeof listSnapshots>>, kind: MarketingKind, p: Period) {
  const fields = aggregationFields(kind);
  const byParent = new Map<string, typeof snapshots>();
  snapshots.forEach((s) => byParent.set(s.parentId, [...(byParent.get(s.parentId) ?? []), s]));
  const aggregated = [...byParent.entries()].map(([parentId, rows]) => ({ parentId, ...aggregateSnapshots(rows, p, fields) }));
  const sum = (key: string) => {
    const known = aggregated.map((a) => a.values[key]).filter((v): v is number => v !== null);
    return known.length === 0 ? null : known.reduce((x, y) => x + y, 0);
  };
  return { aggregated, sum, straddling: aggregated.reduce((n, a) => n + a.straddling, 0) };
}

async function marketing(c: Ctx, kind: "social" | "website"): Promise<Section> {
  const snapshots = await listSnapshots(kind, c.brand.id, { from: c.previous.start, to: c.period.end });
  const now = snapshotTotals(snapshots, kind, c.period);
  const before = snapshotTotals(snapshots, kind, c.previous);
  const count = (key: string, label: string): Kpi => ({ key, label, value: now.sum(key), previous: before.sum(key), format: "count" });
  const kpis: Kpi[] =
    kind === "social"
      ? [
          count("followers_total", "Abonnés (tous comptes)"),
          count("followers_new", "Nouveaux abonnés"),
          count("impressions", "Impressions"),
          count("interactions", "Interactions"),
          {
            key: "engagement",
            label: "Taux d'engagement (sur impressions)",
            value: ratio(now.sum("interactions"), now.sum("impressions"), 100),
            previous: ratio(before.sum("interactions"), before.sum("impressions"), 100),
            format: "percent",
          },
        ]
      : [
          count("sessions", "Sessions"),
          count("page_views", "Pages vues"),
          count("conversions", "Conversions"),
          {
            key: "conversion_rate",
            label: "Taux de conversion",
            value: conversionRate(now.sum("conversions"), now.sum("sessions")),
            previous: conversionRate(before.sum("conversions"), before.sum("sessions")),
            format: "percent",
          },
        ];
  const notes: string[] = [];
  if (now.straddling > 0) notes.push(`${now.straddling} relevé(s) à cheval sur la période ne sont pas comptés.`);
  if (now.aggregated.every((a) => a.counted === 0)) notes.push(`Aucun relevé ${kind === "social" ? "social" : "de site"} sur la période.`);
  return { key: kind === "social" ? "social" : "websites", title: KINDS[kind].title, kpis, notes };
}

async function campaigns(c: Ctx): Promise<Section> {
  const [snapshots, active, archived] = await Promise.all([
    listSnapshots("campaign", c.brand.id, { from: c.previous.start, to: c.period.end }),
    listCampaigns(c.brand.id, false),
    listCampaigns(c.brand.id, true),
  ]);
  const currencies = new Map([...active, ...archived].map((x) => [x.id, x.currency]));
  const now = snapshotTotals(snapshots, "campaign", c.period);
  const before = snapshotTotals(snapshots, "campaign", c.previous);
  const spendOf = (t: typeof now, p: Period) =>
    sumInCurrency(
      t.aggregated.map((a) => ({ amount: a.values.spend, currency: currencies.get(a.parentId) ?? null })),
      c.currency,
      p.end,
      c.rates,
    );
  const spend = spendOf(now, c.period);
  const spendBefore = spendOf(before, c.previous);
  const hasSpend = now.sum("spend") !== null;
  const leads = now.sum("leads");
  const kpis: Kpi[] = [
    {
      key: "spend",
      label: "Dépense relevée",
      value: hasSpend ? spend.total : null,
      previous: before.sum("spend") !== null ? spendBefore.total : null,
      format: "money",
      currency: c.currency,
    },
    { key: "impressions", label: "Impressions", value: now.sum("impressions"), previous: before.sum("impressions"), format: "count" },
    { key: "clicks", label: "Clics", value: now.sum("clicks"), previous: before.sum("clicks"), format: "count" },
    { key: "leads", label: "Leads", value: leads, previous: before.sum("leads"), format: "count" },
    {
      key: "ctr",
      label: "Taux de clics",
      value: ctr(now.sum("clicks"), now.sum("impressions")),
      previous: ctr(before.sum("clicks"), before.sum("impressions")),
      format: "percent",
    },
    {
      key: "cpl",
      label: "Coût par lead",
      value: hasSpend && spend.excluded === 0 ? cpl(spend.total, leads) : null,
      previous: null,
      format: "money",
      currency: c.currency,
    },
  ];
  const notes: string[] = [];
  if (spend.excluded > 0) notes.push(`${spend.excluded} dépense(s) exclues faute de taux de change ; coût par lead non calculé.`);
  if (now.straddling > 0) notes.push(`${now.straddling} relevé(s) à cheval sur la période ne sont pas comptés.`);
  return { key: "campaigns", title: SECTION_LABELS.campaigns, kpis, notes };
}

// ---------------------------------------------------------------------
// Budgets dont la période recoupe celle du tableau de bord
// ---------------------------------------------------------------------

async function budgets(c: Ctx): Promise<Section> {
  const all = await listBudgets(c.brand.id, false);
  const active = all.filter((b) => b.periodStart <= c.period.end && b.periodEnd >= c.period.start);
  const data = await loadBudgetData(c.brand.id, active);
  let envelope = 0;
  let engaged = 0;
  let paid = 0;
  let unconverted = 0;
  let over = 0;
  let warning = 0;
  let excluded = 0;
  for (const budget of active) {
    const r = evaluateBudget(budget, data);
    const toTarget = (v: number) => convert(v, budget.currency, c.currency, c.period.end, c.rates);
    const [e, g, p] = [toTarget(r.envelope), toTarget(r.engaged), toTarget(r.paid)];
    if (e === null || g === null || p === null) {
      unconverted += 1;
    } else {
      envelope += e;
      engaged += g;
      paid += p;
    }
    if (r.level === "over") over += 1;
    if (r.level === "warning") warning += 1;
    excluded += r.excluded;
  }
  const kpis: Kpi[] = [
    { key: "envelope", label: `Enveloppes (${active.length} budget(s))`, value: active.length ? envelope : null, previous: null, format: "money", currency: c.currency },
    { key: "engaged", label: "Engagé", value: active.length ? engaged : null, previous: null, format: "money", currency: c.currency },
    { key: "paid", label: "Payé", value: active.length ? paid : null, previous: null, format: "money", currency: c.currency },
    { key: "consumption", label: "Consommation", value: ratio(engaged, active.length ? envelope : null, 100), previous: null, format: "percent" },
  ];
  const notes: string[] = [];
  if (active.length === 0) notes.push("Aucun budget sur la période.");
  if (over > 0) notes.push(`${over} budget(s) en dépassement.`);
  if (warning > 0) notes.push(`${warning} budget(s) au seuil d'alerte.`);
  if (unconverted > 0) notes.push(`${unconverted} budget(s) non convertis faute de taux de change.`);
  if (excluded > 0) notes.push(`${excluded} montant(s) de dépense exclus faute de taux de change.`);
  return { key: "budgets", title: SECTION_LABELS.budgets, kpis, notes };
}
