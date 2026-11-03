import { evaluateBudget, loadBudgetData } from "@/features/budgets/evaluate";
import { listBudgets } from "@/features/budgets/queries";
import { sumInCurrency } from "@/features/crm/money";
import { getFxRates } from "@/features/fx/queries";
import { WEBSITE_CHANNELS, type MarketingKind } from "@/features/marketing/config";
import { listCampaigns, listSnapshots } from "@/features/marketing/queries";
import { evaluateObjectives } from "@/features/objectives/evaluate";
import { listObjectives } from "@/features/objectives/queries";
import { PROJECT_STATUS_LABELS } from "@/features/planning/config";
import { getTaskStatuses, listProjects, listTasks } from "@/features/planning/queries";
import { isOverdue, projectProgress } from "@/features/planning/rules";
import { formatDate, todayIso } from "@/lib/format";
import { availableMetrics, METRICS, type MetricKey } from "@/lib/metrics/actuals";
import { convert, type Currency, type FxRate } from "@/lib/metrics/currency";
import { seriesPeriods } from "@/lib/metrics/series";
import { rangeLabel, type Period } from "@/lib/periods";
import type { BrandSummary } from "@/server/authz/context";
import { can, type Access, type Permission } from "@/server/authz/permissions";
import { knownKeys, stageFunnel, timeRows, type Chart } from "./chart-data";
import { availableSections, commercialReader, snapshotTotals, type SectionKey } from "./data";
import { getHistoryCutover, getOpenStages, getOpportunityStages, listHistoricalRows } from "./queries";

// Graphiques des tableaux de bord. Mêmes sources, mêmes règles et mêmes droits
// que les indicateurs (tout est lu sous la RLS) ; une série couvre plusieurs
// périodes consécutives qui se terminent par la période affichée.

type Ctx = { brand: BrandSummary; access: Access; period: Period; periods: Period[]; currency: Currency; rates: readonly FxRate[]; today: string };

export type ChartInput = { brand: BrandSummary; access: Access; period: Period; currency?: Currency; rates?: readonly FxRate[] };

async function context(input: ChartInput): Promise<Ctx> {
  return {
    brand: input.brand,
    access: input.access,
    period: input.period,
    periods: seriesPeriods(input.period),
    currency: input.currency ?? ((input.brand.reportingCurrency || "XOF") as Currency),
    rates: input.rates ?? (await getFxRates()),
    today: todayIso(),
  };
}

const any = (access: Access, brandId: string, permissions: Permission[]) => permissions.some((p) => can(access, p, brandId));

const excludedNote = (currencies: Iterable<string>) => {
  const list = [...new Set(currencies)].sort();
  return list.length > 0 ? [`Montants en ${list.join(", ")} exclus faute de taux de change.`] : [];
};

/** Graphiques d'une section du tableau de bord ; rien si la section n'est pas ouverte à l'utilisateur. */
export async function loadSectionCharts(key: SectionKey, input: ChartInput): Promise<Chart[]> {
  if (!availableSections(input.brand, input.access).includes(key)) return [];
  const c = await context(input);
  switch (key) {
    case "commercial":
      return commercialCharts(c);
    case "objectives":
      return objectiveCharts(c);
    case "social":
      return socialCharts(c);
    case "campaigns":
      return campaignCharts(c);
    case "websites":
      return websiteCharts(c);
    case "budgets":
      return budgetCharts(c);
  }
}

// ---------------------------------------------------------------------
// Commercial
// ---------------------------------------------------------------------

/** Réalisés d'équipe d'un indicateur sur chaque période de la série. */
export async function commercialSeries(
  input: { brand: BrandSummary; periods: readonly Period[]; currency: Currency; rates: readonly FxRate[] },
  metrics: readonly MetricKey[],
): Promise<{ values: Record<string, number | null>[]; excluded: string[]; cutover: string | null }> {
  const cutover = await getHistoryCutover(input.brand.id);
  const history = cutover ? await listHistoricalRows(input.brand.id) : [];
  const excluded: string[] = [];
  const read = commercialReader({ brand: input.brand, cutover, history, currency: input.currency, rates: input.rates }, excluded);
  const readers = await Promise.all(input.periods.map(read));
  const values = readers.map((value) => Object.fromEntries(metrics.map((m) => [m, value(m)])));
  return { values, excluded, cutover };
}

const ACTIVITY: { metric: MetricKey; color: number }[] = [
  { metric: "opportunities_created", color: 1 },
  { metric: "offers_sent", color: 2 },
  { metric: "contracts_signed", color: 3 },
];

async function commercialCharts(c: Ctx): Promise<Chart[]> {
  const metrics = availableMetrics(c.brand.enabledModules);
  const activity = ACTIVITY.filter((a) => metrics.includes(a.metric));
  const wanted = [...(metrics.includes("revenue_signed") ? (["revenue_signed"] as const) : []), ...activity.map((a) => a.metric)];
  const charts: Chart[] = [];

  if (wanted.length > 0) {
    const { values, excluded, cutover } = await commercialSeries(c, wanted);
    const notes = [
      ...(cutover && c.periods[0].start < cutover ? [`Avant le ${formatDate(cutover)} : historique importé.`] : []),
      ...excludedNote(excluded),
    ];
    if (metrics.includes("revenue_signed")) {
      charts.push({
        key: "revenue",
        title: "Chiffre d'affaires signé",
        kind: "bar",
        format: "money",
        currency: c.currency,
        series: [{ key: "revenue_signed", label: "CA signé", color: 1 }],
        rows: timeRows(c.periods, (_, i) => ({ revenue_signed: values[i].revenue_signed })),
        notes,
      });
    }
    if (activity.length > 0) {
      charts.push({
        key: "activity",
        title: "Opportunités, offres et contrats",
        description: "Une période sans fiche hebdomadaire reste un trou quand l'indicateur en dépend.",
        kind: "line",
        format: "count",
        series: activity.map((a) => ({ key: a.metric, label: METRICS[a.metric].label, color: a.color })),
        rows: timeRows(c.periods, (_, i) => Object.fromEntries(activity.map((a) => [a.metric, values[i][a.metric]]))),
        notes: charts.length === 0 ? notes : [],
      });
    }
  }

  const opportunityPerms: Permission[] = ["opportunities.read_all", "opportunities.manage_all", "opportunities.manage_own"];
  if (c.brand.enabledModules.includes("crm") && any(c.access, c.brand.id, opportunityPerms)) {
    const [stages, opportunities] = await Promise.all([getOpenStages(c.brand.id), getOpportunityStages(c.brand.id)]);
    const funnel = stageFunnel(stages, opportunities, c.currency, c.today, c.rates);
    const notes: string[] = [];
    if (funnel.excluded > 0) notes.push(`${funnel.excluded} montant(s) exclus faute de taux de change.`);
    if (!any(c.access, c.brand.id, ["opportunities.read_all", "opportunities.manage_all"])) notes.push("Vos opportunités seulement.");
    if (funnel.rows.length > 0) {
      charts.push({
        key: "pipeline",
        title: "Pipeline par étape (aujourd'hui)",
        description: "Opportunités en cours à chaque étape ; le montant figure dans le tableau.",
        kind: "hbar",
        format: "count",
        series: [{ key: "count", label: "Opportunités", color: 1 }],
        rows: funnel.rows,
        extras: [{ key: "amount", label: `Montant (${c.currency})`, format: "money", currency: c.currency }],
        notes,
      });
    }
  }
  return charts;
}

// ---------------------------------------------------------------------
// Objectifs en cours (objectifs d'équipe)
// ---------------------------------------------------------------------

async function objectiveCharts(c: Ctx): Promise<Chart[]> {
  const list = await listObjectives(c.brand.id, "current", c.today);
  const team = (await evaluateObjectives(c.brand, list, c.rates, c.today)).filter((e) => e.objective.userId === null);
  if (team.length === 0) return [];
  return [
    {
      key: "objectives",
      title: "Taux d'atteinte des objectifs d'équipe",
      description: "Réalisé rapporté à la cible ; 100 % : objectif atteint.",
      kind: "hbar",
      format: "percent",
      series: [{ key: "rate", label: "Atteinte", color: 1 }],
      rows: team.map(({ objective: o, reading }) => ({
        key: o.id,
        label: `${METRICS[o.metric].label} · ${rangeLabel(o.periodStart, o.periodEnd)}`,
        values: { rate: reading.rate },
      })),
      notes: [],
    },
  ];
}

// ---------------------------------------------------------------------
// Marketing
// ---------------------------------------------------------------------

const STRADDLING_NOTE = "Des relevés couvrent plusieurs points du graphique : ils ne sont pas comptés (choisissez un découpage plus large).";

/**
 * Une mesure des relevés (comptes, campagnes ou sites) sur chaque période : total
 * de la marque, montants convertis dans la devise cible à la fin de chaque
 * période (sans taux : exclus et comptés).
 */
export async function snapshotSeries(
  input: { brand: BrandSummary; periods: readonly Period[]; currency: Currency; rates: readonly FxRate[] },
  kind: MarketingKind,
  field: string,
  money: boolean,
): Promise<{ values: (number | null)[]; excluded: number; straddling: boolean; notes: string[] }> {
  const { brand, periods } = input;
  const [snapshots, campaigns] = await Promise.all([
    listSnapshots(kind, brand.id, { from: periods[0].start, to: periods[periods.length - 1].end }),
    money && kind === "campaign" ? Promise.all([listCampaigns(brand.id, false), listCampaigns(brand.id, true)]) : Promise.resolve(null),
  ]);
  const currencies = new Map((campaigns?.flat() ?? []).map((x) => [x.id, x.currency]));
  const totals = periods.map((p) => snapshotTotals(snapshots, kind, p));
  let excluded = 0;
  const values = totals.map((t, i) => {
    if (!money || t.sum(field) === null) return t.sum(field);
    const sum = sumInCurrency(
      t.aggregated.map((a) => ({ amount: a.values[field], currency: currencies.get(a.parentId) ?? null })),
      input.currency,
      periods[i].end,
      input.rates,
    );
    excluded += sum.excluded;
    return sum.total;
  });
  const straddling = totals.some((t) => t.straddling > 0);
  const notes = [...(straddling ? [STRADDLING_NOTE] : []), ...(excluded > 0 ? [`${excluded} montant(s) exclus faute de taux de change.`] : [])];
  return { values, excluded, straddling, notes };
}

async function socialCharts(c: Ctx): Promise<Chart[]> {
  const snapshots = await listSnapshots("social", c.brand.id, { from: c.periods[0].start, to: c.period.end });
  const totals = c.periods.map((p) => snapshotTotals(snapshots, "social", p));
  const notes = totals.some((t) => t.straddling > 0) ? [STRADDLING_NOTE] : [];
  return [
    {
      key: "followers",
      title: "Abonnés (tous comptes)",
      description: "Dernière valeur relevée de chaque période, additionnée entre comptes.",
      kind: "line",
      format: "count",
      series: [{ key: "followers_total", label: "Abonnés", color: 1 }],
      rows: timeRows(c.periods, (_, i) => ({ followers_total: totals[i].sum("followers_total") })),
      notes,
    },
    {
      key: "audience",
      title: "Impressions et interactions",
      kind: "line",
      format: "count",
      series: [
        { key: "impressions", label: "Impressions", color: 1 },
        { key: "interactions", label: "Interactions", color: 2 },
      ],
      rows: timeRows(c.periods, (_, i) => ({ impressions: totals[i].sum("impressions"), interactions: totals[i].sum("interactions") })),
      notes: [],
    },
  ];
}

async function campaignCharts(c: Ctx): Promise<Chart[]> {
  const [snapshots, active, archived] = await Promise.all([
    listSnapshots("campaign", c.brand.id, { from: c.periods[0].start, to: c.period.end }),
    listCampaigns(c.brand.id, false),
    listCampaigns(c.brand.id, true),
  ]);
  const currencies = new Map([...active, ...archived].map((x) => [x.id, x.currency]));
  const totals = c.periods.map((p) => snapshotTotals(snapshots, "campaign", p));
  let excluded = 0;
  const spend = totals.map((t, i) => {
    if (t.sum("spend") === null) return null;
    const sum = sumInCurrency(
      t.aggregated.map((a) => ({ amount: a.values.spend, currency: currencies.get(a.parentId) ?? null })),
      c.currency,
      c.periods[i].end,
      c.rates,
    );
    excluded += sum.excluded;
    return sum.total;
  });
  const straddling = totals.some((t) => t.straddling > 0) ? [STRADDLING_NOTE] : [];
  return [
    {
      key: "leads",
      title: "Leads des campagnes",
      kind: "bar",
      format: "count",
      series: [{ key: "leads", label: "Leads", color: 1 }],
      rows: timeRows(c.periods, (_, i) => ({ leads: totals[i].sum("leads") })),
      notes: straddling,
    },
    {
      key: "spend",
      title: "Dépense relevée des campagnes",
      kind: "bar",
      format: "money",
      currency: c.currency,
      series: [{ key: "spend", label: "Dépense", color: 1 }],
      rows: timeRows(c.periods, (_, i) => ({ spend: spend[i] })),
      notes: excluded > 0 ? [`${excluded} dépense(s) exclues faute de taux de change.`] : [],
    },
  ];
}

async function websiteCharts(c: Ctx): Promise<Chart[]> {
  const snapshots = await listSnapshots("website", c.brand.id, { from: c.periods[0].start, to: c.period.end });
  const totals = c.periods.map((p) => snapshotTotals(snapshots, "website", p));
  const notes = totals.some((t) => t.straddling > 0) ? [STRADDLING_NOTE] : [];
  const channels = WEBSITE_CHANNELS.map((m, i) => ({ key: m.key, label: m.label, color: i + 1 }));
  const rows = timeRows(c.periods, (_, i) => Object.fromEntries(channels.map((ch) => [ch.key, totals[i].sum(ch.key)])));
  const recorded = knownKeys(rows, channels.map((ch) => ch.key));
  if (recorded.length > 0) {
    return [
      {
        key: "channels",
        title: "Sessions par canal",
        description: "Ventilation saisie dans les relevés des sites.",
        kind: "stacked",
        format: "count",
        series: channels.filter((ch) => recorded.includes(ch.key)),
        rows,
        notes,
      },
    ];
  }
  return [
    {
      key: "sessions",
      title: "Sessions",
      description: "Aucune ventilation par canal dans les relevés : total des sessions.",
      kind: "bar",
      format: "count",
      series: [{ key: "sessions", label: "Sessions", color: 1 }],
      rows: timeRows(c.periods, (_, i) => ({ sessions: totals[i].sum("sessions") })),
      notes,
    },
  ];
}

// ---------------------------------------------------------------------
// Budgets dont la période recoupe celle du tableau de bord
// ---------------------------------------------------------------------

async function budgetCharts(c: Ctx): Promise<Chart[]> {
  const all = await listBudgets(c.brand.id, false);
  const active = all.filter((b) => b.periodStart <= c.period.end && b.periodEnd >= c.period.start);
  if (active.length === 0) return [];
  const data = await loadBudgetData(c.brand.id, active);
  let unconverted = 0;
  const rows = active.flatMap((budget) => {
    const r = evaluateBudget(budget, data);
    const to = (v: number) => convert(v, budget.currency, c.currency, c.period.end, c.rates);
    const [envelope, engaged, paid] = [to(r.envelope), to(r.engaged), to(r.paid)];
    if (envelope === null || engaged === null || paid === null) {
      unconverted += 1;
      return [];
    }
    return [{ key: budget.id, label: budget.name, values: { envelope, engaged, paid } }];
  });
  return [
    {
      key: "budgets",
      title: "Budgets : prévu, engagé, payé",
      kind: "bar",
      format: "money",
      currency: c.currency,
      series: [
        { key: "envelope", label: "Prévu", color: 1 },
        { key: "engaged", label: "Engagé", color: 2 },
        { key: "paid", label: "Payé", color: 3 },
      ],
      rows,
      notes: unconverted > 0 ? [`${unconverted} budget(s) non convertis faute de taux de change.`] : [],
    },
  ];
}

// ---------------------------------------------------------------------
// Planification : avancement des projets, tâches en retard
// ---------------------------------------------------------------------

/** Avancement des projets en cours et nombre de tâches en retard ; null si la planification n'est pas ouverte. */
export async function loadPlanningCharts(input: ChartInput): Promise<{ charts: Chart[]; overdue: number } | null> {
  const { brand, access } = input;
  if (!brand.enabledModules.includes("planning") || !can(access, "planning.read", brand.id)) return null;
  const today = todayIso();
  const [projects, tasks, statuses] = await Promise.all([
    listProjects(brand.id, false),
    listTasks(brand.id, { archived: false }),
    getTaskStatuses(brand.id),
  ]);
  const categories = new Map(statuses.map((s) => [s.id, s.category]));
  const category = (statusId: string) => categories.get(statusId) ?? "draft";
  const overdue = tasks.filter((t) => isOverdue({ dueOn: t.dueOn, category: category(t.statusId) }, today)).length;
  const rows = projects
    .filter((p) => p.status === "planned" || p.status === "active" || p.status === "on_hold")
    .map((p) => ({
      key: p.id,
      label: p.name,
      title: `${p.name} · ${PROJECT_STATUS_LABELS[p.status]}`,
      values: {
        progress: projectProgress(
          tasks
            .filter((t) => t.projectId === p.id && !t.parentId)
            .map((t) => ({ category: category(t.statusId), progress: t.progress, estimateHours: t.estimateHours })),
        ),
      },
    }));
  const charts: Chart[] =
    rows.length === 0
      ? []
      : [
          {
            key: "projects",
            title: "Avancement des projets",
            description: "Projets prévus, en cours ou en pause ; avancement pondéré par les heures estimées s'il y en a.",
            kind: "hbar",
            format: "percent",
            series: [{ key: "progress", label: "Avancement", color: 1 }],
            rows,
            notes: [],
          },
        ];
  return { charts, overdue };
}
