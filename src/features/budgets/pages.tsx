import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricTile } from "@/features/activities/view";
import { getListItems } from "@/features/crm/queries";
import { BackLink } from "@/features/crm/view";
import { getFxRates } from "@/features/fx/queries";
import { listCampaigns } from "@/features/marketing/queries";
import { ActionButton, EditDetails } from "@/features/settings/components/controls";
import { formatDate, formatMoney, formatPercent, todayIso } from "@/lib/format";
import { computeBudget, type BudgetLevel, type BudgetResult } from "@/lib/metrics/budget";
import type { FxRate } from "@/lib/metrics/currency";
import { rangeLabel } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import {
  deleteLine,
  saveBudget,
  saveExpense,
  saveLine,
  saveWarningThreshold,
  setBudgetArchived,
  setExpenseArchived,
  setExpensePaid,
} from "./actions";
import { BudgetForm, ExpenseForm, LineForm, ThresholdForm, type BudgetDefaults, type ExpenseDefaults } from "./components/forms";
import {
  BUDGET_SCOPES,
  BUDGET_STATUSES,
  EXPENSE_STATUSES,
  getBudget,
  getExpense,
  getInvoicedCampaigns,
  getPlatformSpend,
  getWarningThreshold,
  listBudgets,
  listExpenses,
  listLines,
  type Budget,
  type BudgetLine,
  type Expense,
  type PlatformSpend,
} from "./queries";

type Params = Promise<{ brand: string }>;
type ParamsWithId = Promise<{ brand: string; id: string }>;
type ParamsWithExpense = Promise<{ brand: string; id: string; depense: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function loadBrand(slug: string) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes("budgets")) notFound();
  const canRead = can(ctx.access, "budgets.read", brand.id) || can(ctx.access, "budgets.manage", brand.id);
  return { ctx, brand, canRead, canManage: can(ctx.access, "budgets.manage", brand.id) };
}

const options = (labels: Record<string, string>) => Object.entries(labels).map(([id, label]) => ({ id, label }));

/** Calcul d'un budget : relevés de campagne compris dans sa période seulement. */
function evaluate(
  budget: Budget,
  lines: BudgetLine[],
  expenses: Expense[],
  invoiced: Set<string>,
  spend: PlatformSpend[],
  rates: FxRate[],
  threshold: number,
): BudgetResult {
  const ids = new Set(lines.map((l) => l.id));
  return computeBudget({
    currency: budget.currency,
    envelope: budget.amount,
    lines: lines.map((l) => ({ id: l.id, amount: l.amount, campaignId: l.campaignId })),
    expenses: expenses
      .filter((e) => ids.has(e.lineId))
      .map((e) => ({ lineId: e.lineId, amount: e.amount, currency: e.currency, date: e.date, status: e.status })),
    invoicedCampaigns: invoiced,
    platformSpend: spend.filter((s) => s.periodStart >= budget.periodStart && s.periodEnd <= budget.periodEnd),
    rates,
    warningThreshold: threshold,
  });
}

/** Lignes, dépenses et données de calcul d'un ensemble de budgets. */
async function loadBudgetData(brandId: string, budgets: Budget[]) {
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

const LEVEL: Record<BudgetLevel, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  ok: { label: "Dans le budget", variant: "secondary" },
  warning: { label: "Seuil d'alerte atteint", variant: "outline" },
  over: { label: "Dépassement", variant: "destructive" },
};

function LevelBadge({ level }: { level: BudgetLevel }) {
  return <Badge variant={LEVEL[level].variant}>{LEVEL[level].label}</Badge>;
}

function Gauge({ consumption, threshold }: { consumption: number | null; threshold: number }) {
  const width = Math.min(100, Math.max(0, consumption ?? 0));
  const tone = consumption === null ? "bg-muted-foreground/40" : consumption > 100 ? "bg-destructive" : consumption >= threshold ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex min-w-32 flex-col gap-1">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${width}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-foreground/50" style={{ left: `${threshold}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{formatPercent(consumption)} engagé</span>
    </div>
  );
}

function Alerts({ result, currency, threshold }: { result: BudgetResult; currency: string; threshold: number }) {
  const items: string[] = [];
  if (result.level === "over") items.push(`Budget dépassé : ${formatMoney(result.engaged - result.envelope, currency)} au-delà de l'enveloppe.`);
  else if (result.level === "warning") items.push(`Seuil d'alerte atteint : plus de ${threshold} % de l'enveloppe est engagé.`);
  const lines = result.lines.filter((l) => l.level === "over").length;
  if (lines > 0) items.push(`${lines} ligne(s) en dépassement.`);
  if (result.unallocated < 0) items.push(`Les lignes dépassent l'enveloppe de ${formatMoney(-result.unallocated, currency)}.`);
  if (result.unbilled > 0) items.push(`${formatMoney(result.unbilled, currency)} de dépense relevée sur les plateformes n'est pas encore facturée.`);
  if (result.excluded > 0) items.push(`${result.excluded} montant(s) exclus faute de taux de change (Paramètres › Taux de change).`);
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertes</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Liste
// =====================================================================

export function BudgetsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Budgets slug={brand} archived={query.archives === "1"} />
      ))}
    </Suspense>
  );
}

async function Budgets({ slug, archived }: { slug: string; archived: boolean }) {
  const { ctx, brand, canRead, canManage } = await loadBrand(slug);
  if (!canRead) return <Forbidden />;
  const budgets = await listBudgets(brand.id, archived);
  const data = await loadBudgetData(brand.id, budgets);
  const base = `/m/${brand.slug}/budgets`;

  return (
    <Page>
      <PageHeader title="Budgets" description={`${brand.name} · engagé = dépenses engagées et payées ; réalisé = dépenses payées`}>
        {canManage && (
          <Button nativeButton={false} render={<Link href={`${base}/nouveau`} />}>
            <Plus />
            Nouveau budget
          </Button>
        )}
      </PageHeader>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={archived ? base : `${base}?archives=1`} className="text-muted-foreground underline-offset-4 hover:underline">
          {archived ? "Voir les budgets en cours" : "Voir les archives"}
        </Link>
        {can(ctx.access, "modules.manage") && (
          <ThresholdForm action={saveWarningThreshold.bind(null, brand.id)} threshold={data.threshold} />
        )}
      </div>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Budget</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Enveloppe</TableHead>
                <TableHead className="text-right">Engagé</TableHead>
                <TableHead className="text-right">Payé</TableHead>
                <TableHead>Consommation</TableHead>
                <TableHead>Alerte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    Aucun budget.
                  </TableCell>
                </TableRow>
              )}
              {budgets.map((b) => {
                const result = evaluate(
                  b,
                  data.lines.filter((l) => l.budgetId === b.id),
                  data.expenses,
                  data.invoiced,
                  data.spend,
                  data.rates,
                  data.threshold,
                );
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`${base}/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                        {b.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {BUDGET_SCOPES[b.scope]} · {rangeLabel(b.periodStart, b.periodEnd)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.status === "approved" ? "default" : "outline"}>{BUDGET_STATUSES[b.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(b.amount, b.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(result.engaged, b.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(result.paid, b.currency)}</TableCell>
                    <TableCell>
                      <Gauge consumption={result.consumption} threshold={data.threshold} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <LevelBadge level={result.level} />
                        {result.excluded > 0 && <span className="text-xs text-muted-foreground">{result.excluded} montant(s) sans taux</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Page>
  );
}

// =====================================================================
// Création
// =====================================================================

export function NewBudgetPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <NewBudget slug={brand} />
      ))}
    </Suspense>
  );
}

async function NewBudget({ slug }: { slug: string }) {
  const { brand, canManage } = await loadBrand(slug);
  if (!canManage) return <Forbidden />;
  const year = todayIso().slice(0, 4);
  const defaults: BudgetDefaults = {
    name: "",
    scope: "marketing",
    status: "draft",
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    amount: "",
    currency: brand.reportingCurrency || "XOF",
    comments: "",
  };
  return (
    <Page>
      <BackLink href={`/m/${brand.slug}/budgets`} label="Budgets" />
      <PageHeader title="Nouveau budget" description={brand.name} />
      <Card>
        <CardContent>
          <BudgetForm
            action={saveBudget.bind(null, brand.id, null)}
            defaults={defaults}
            scopes={options(BUDGET_SCOPES)}
            statuses={options(BUDGET_STATUSES)}
            currencyLocked={false}
            submitLabel="Créer le budget"
          />
        </CardContent>
      </Card>
    </Page>
  );
}

// =====================================================================
// Détail : lignes, dépenses, budget / réalisé
// =====================================================================

export function BudgetDetailPage({ params }: { params: ParamsWithId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <BudgetDetail slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

function expenseDefaults(expense: Expense | null, lineId: string, currency: string): ExpenseDefaults {
  return {
    lineId: expense?.lineId ?? lineId,
    supplier: expense?.supplier ?? "",
    description: expense?.description ?? "",
    date: expense?.date ?? todayIso(),
    amount: expense ? String(expense.amount).replace(".", ",") : "",
    currency: expense?.currency ?? currency,
    status: expense?.status ?? "committed",
    paidOn: expense?.paidOn ?? "",
    externalRef: expense?.externalRef ?? "",
    comments: expense?.comments ?? "",
  };
}

async function BudgetDetail({ slug, id }: { slug: string; id: string }) {
  const { brand, canRead, canManage } = await loadBrand(slug);
  if (!canRead) return <Forbidden />;
  if (!UUID.test(id)) notFound();
  const budget = await getBudget(brand.id, id);
  if (!budget) notFound();

  const [data, categories, campaigns] = await Promise.all([
    loadBudgetData(brand.id, [budget]),
    getListItems(brand.id, "expense_categories"),
    brand.enabledModules.includes("campaigns") ? listCampaigns(brand.id, false) : Promise.resolve([]),
  ]);
  const result = evaluate(budget, data.lines, data.expenses, data.invoiced, data.spend, data.rates, data.threshold);
  const byLine = new Map(result.lines.map((l) => [l.id, l]));
  const lineLabels = new Map(data.lines.map((l) => [l.id, l.label]));
  const categoryLabels = new Map(categories.map((c) => [c.id, c.label]));
  const campaignLabels = new Map(campaigns.map((c) => [c.id, c.name]));
  const base = `/m/${brand.slug}/budgets/${budget.id}`;
  const cur = budget.currency;
  const editable = canManage && !budget.archivedAt;

  return (
    <Page>
      <BackLink href={`/m/${brand.slug}/budgets`} label="Budgets" />
      <PageHeader
        title={budget.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {BUDGET_SCOPES[budget.scope]} · {rangeLabel(budget.periodStart, budget.periodEnd)}
            <Badge variant={budget.status === "approved" ? "default" : "outline"}>{BUDGET_STATUSES[budget.status]}</Badge>
            {budget.archivedAt && <Badge variant="secondary">Archivé</Badge>}
          </span>
        }
      >
        {canManage && (
          <ActionButton action={setBudgetArchived.bind(null, brand.id, budget.id, !budget.archivedAt)} variant="ghost">
            {budget.archivedAt ? "Restaurer" : "Archiver"}
          </ActionButton>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricTile label="Enveloppe" value={formatMoney(result.envelope, cur)} />
        <MetricTile
          label="Réparti sur les lignes"
          value={formatMoney(result.allocated, cur)}
          hint={result.unallocated >= 0 ? `${formatMoney(result.unallocated, cur)} non réparti` : `Lignes au-delà de l'enveloppe`}
        />
        <MetricTile label="Engagé" value={formatMoney(result.engaged, cur)} hint={`${formatPercent(result.consumption)} de l'enveloppe`} />
        <MetricTile label="Payé (réalisé)" value={formatMoney(result.paid, cur)} />
        <MetricTile label="Reste à engager" value={formatMoney(result.remaining, cur)} />
      </div>
      <Gauge consumption={result.consumption} threshold={data.threshold} />
      <Alerts result={result} currency={cur} threshold={data.threshold} />

      {editable && (
        <EditDetails label="Modifier le budget">
          <BudgetForm
            action={saveBudget.bind(null, brand.id, budget.id)}
            defaults={{
              name: budget.name,
              scope: budget.scope,
              status: budget.status,
              periodStart: budget.periodStart,
              periodEnd: budget.periodEnd,
              amount: String(budget.amount).replace(".", ","),
              currency: budget.currency,
              comments: budget.comments ?? "",
            }}
            scopes={options(BUDGET_SCOPES)}
            statuses={options(BUDGET_STATUSES)}
            currencyLocked={data.lines.length > 0}
            submitLabel="Enregistrer"
          />
        </EditDetails>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lignes budgétaires</CardTitle>
          <CardDescription>
            Une ligne liée à une campagne compte ses factures ; sans facture, la dépense relevée sur la plateforme (non facturée).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ligne</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Engagé</TableHead>
                <TableHead className="text-right">Payé</TableHead>
                <TableHead>Consommation</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Répartissez l&apos;enveloppe en lignes (média, impression, événementiel…).
                  </TableCell>
                </TableRow>
              )}
              {data.lines.map((line) => {
                const r = byLine.get(line.id)!;
                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      <span className="font-medium">{line.label}</span>
                      <p className="text-xs text-muted-foreground">
                        {[line.category && categoryLabels.get(line.category), line.campaignId && `Campagne : ${campaignLabels.get(line.campaignId) ?? "archivée"}`]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {r.unbilled !== null && (
                        <Badge variant="outline" className="mt-1">
                          Non facturé : {formatMoney(r.unbilled, cur)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.budgeted, cur)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.engaged, cur)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.paid, cur)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Gauge consumption={r.consumption} threshold={data.threshold} />
                        {r.level !== "ok" && <LevelBadge level={r.level} />}
                      </div>
                    </TableCell>
                    {editable && (
                      <TableCell className="align-top">
                        <div className="flex flex-col items-end gap-2">
                          <EditDetails>
                            <LineForm
                              action={saveLine.bind(null, brand.id, budget.id, line.id)}
                              defaults={{
                                label: line.label,
                                category: line.category ?? "",
                                campaignId: line.campaignId ?? "",
                                amount: String(line.amount).replace(".", ","),
                              }}
                              categories={categories}
                              campaigns={campaigns.map((c) => ({ id: c.id, label: c.name }))}
                              currency={cur}
                              submitLabel="Enregistrer"
                            />
                          </EditDetails>
                          <ActionButton action={deleteLine.bind(null, brand.id, line.id)} variant="ghost">
                            Supprimer
                          </ActionButton>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {editable && (
            <section className="flex flex-col gap-3 border-t pt-4">
              <h3 className="text-sm font-medium">Nouvelle ligne</h3>
              <LineForm
                action={saveLine.bind(null, brand.id, budget.id, null)}
                defaults={{ label: "", category: "", campaignId: "", amount: "" }}
                categories={categories}
                campaigns={campaigns.map((c) => ({ id: c.id, label: c.name }))}
                currency={cur}
                submitLabel="Ajouter la ligne"
              />
            </section>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dépenses</CardTitle>
          <CardDescription>Montant et devise d&apos;origine conservés ; conversion au taux de la date de dépense.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {editable && data.lines.length > 0 && budget.status !== "closed" && (
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Nouvelle dépense</h3>
              <ExpenseForm
                action={saveExpense.bind(null, brand.id, budget.id, null)}
                defaults={expenseDefaults(null, data.lines[0].id, cur)}
                lines={data.lines.map((l) => ({ id: l.id, label: l.label }))}
                submitLabel="Enregistrer la dépense"
              />
            </section>
          )}
          {budget.status === "closed" && <Notice title="Budget clôturé">Il ne reçoit plus de nouvelles dépenses.</Notice>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Dépense</TableHead>
                <TableHead>Ligne</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>État</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Aucune dépense saisie.
                  </TableCell>
                </TableRow>
              )}
              {data.expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                  <TableCell>
                    <span className="font-medium">{e.description}</span>
                    <p className="text-xs text-muted-foreground">
                      {[e.supplier, e.externalRef && `Réf. ${e.externalRef}`, e.source === "import" && "Importée"].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </TableCell>
                  <TableCell>{lineLabels.get(e.lineId) ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(e.amount, e.currency)}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "paid" ? "default" : "outline"}>{EXPENSE_STATUSES[e.status]}</Badge>
                    {e.paidOn && <p className="text-xs text-muted-foreground">le {formatDate(e.paidOn)}</p>}
                  </TableCell>
                  {editable && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton action={setExpensePaid.bind(null, brand.id, e.id, e.status !== "paid")} variant="ghost">
                          {e.status === "paid" ? "Repasser engagée" : "Marquer payée"}
                        </ActionButton>
                        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`${base}/depenses/${e.id}`} />}>
                          Modifier
                        </Button>
                        <ActionButton action={setExpenseArchived.bind(null, brand.id, e.id)} variant="ghost">
                          Archiver
                        </ActionButton>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Page>
  );
}

// =====================================================================
// Modification d'une dépense
// =====================================================================

export function ExpenseEditPage({ params }: { params: ParamsWithExpense }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id, depense }) => (
        <ExpenseEdit slug={brand} budgetId={id} expenseId={depense} />
      ))}
    </Suspense>
  );
}

async function ExpenseEdit({ slug, budgetId, expenseId }: { slug: string; budgetId: string; expenseId: string }) {
  const { brand, canManage } = await loadBrand(slug);
  if (!canManage) return <Forbidden />;
  if (!UUID.test(budgetId) || !UUID.test(expenseId)) notFound();
  const [budget, expense] = await Promise.all([getBudget(brand.id, budgetId), getExpense(brand.id, expenseId)]);
  if (!budget || !expense) notFound();
  const lines = await listLines(brand.id, [budget.id]);
  if (!lines.some((l) => l.id === expense.lineId)) notFound();
  const back = `/m/${brand.slug}/budgets/${budget.id}`;
  return (
    <Page>
      <BackLink href={back} label={budget.name} />
      <PageHeader title="Modifier la dépense" description={`${expense.description} · ${formatDate(expense.date)}`} />
      <Card>
        <CardContent>
          <ExpenseForm
            action={saveExpense.bind(null, brand.id, budget.id, expense.id)}
            defaults={expenseDefaults(expense, expense.lineId, budget.currency)}
            lines={lines.map((l) => ({ id: l.id, label: l.label }))}
            submitLabel="Enregistrer"
          />
        </CardContent>
      </Card>
    </Page>
  );
}
