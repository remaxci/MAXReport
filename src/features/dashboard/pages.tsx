import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodPicker } from "@/features/activities/view";
import { todayIso } from "@/lib/format";
import { periodFromQuery, periodLabel, periodSearch, type Period } from "@/lib/periods";
import { canCompareSellers } from "@/features/sellers/comparison";
import { findBrand, getAuthContext, type BrandSummary } from "@/server/authz/context";
import { can, type Access } from "@/server/authz/permissions";
import { saveChartPreferences } from "./actions";
import { chartGroups, isGroupHidden, withoutHidden, type ChartGroup } from "./chart-catalog";
import { loadPlanningCharts, loadSectionCharts, type ChartInput } from "./charts";
import { ChartFilter } from "./components/chart-filter";
import { loadDashboard, type SectionKey } from "./data";
import { DIRECTION_COLUMNS, loadDirection, loadDirectionCharts } from "./direction";
import type { DirectionRow } from "./export";
import { getHiddenCharts } from "./queries";
import { ChartsCard, ChartsGrid, ChartsSkeleton, ExportBar, formatKpi, readDashboardView, SectionsView, ViewTabs } from "./view";

type Params = Promise<{ brand: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function readPeriod(query: Query): Period {
  return periodFromQuery(first(query.periode), first(query.du), todayIso());
}

// =====================================================================
// Tableau de bord de la marque
// =====================================================================

export function BrandDashboardPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <BrandDashboard slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function BrandDashboard({ slug, query }: { slug: string; query: Query }) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();
  const period = readPeriod(query);
  const view = readDashboardView(first(query.vue));
  const base = `/m/${brand.slug}`;
  const input: ChartInput = { brand, access: ctx.access, period };

  return (
    <Page>
      <PageHeader
        title="Tableau de bord"
        description={
          <span className="flex flex-wrap items-center gap-2 first-letter:uppercase">
            {brand.name} · {periodLabel(period)}
            {!brand.isActive && <Badge variant="secondary">Marque désactivée</Badge>}
          </span>
        }
      >
        <ExportBar excelHref={`${base}/export?${periodSearch(period)}`} />
      </PageHeader>
      <div className="print:hidden">
        <PeriodPicker action={base} period={period} maxStart={todayIso()} keep={view === "graphiques" ? { vue: view } : undefined} />
      </div>
      <ViewTabs base={base} period={period} view={view} />
      <Suspense fallback={<ChartsSkeleton />}>
        {view === "graphiques" ? <BrandCharts input={input} userId={ctx.userId} /> : <BrandFigures input={input} base={base} />}
      </Suspense>
    </Page>
  );
}

// ---------------------------------------------------------------------
// Onglet « Chiffres »
// ---------------------------------------------------------------------

async function BrandFigures({ input, base }: { input: ChartInput; base: string }) {
  const { brand, access } = input;
  const sections = await loadDashboard({ brand, access, period: input.period });
  if (sections.length === 0) {
    return (
      <Notice title="Rien à afficher">
        Aucun module de cette marque ne vous est ouvert. Les indicateurs apparaissent selon les modules activés et vos droits.
      </Notice>
    );
  }
  const links = canCompareSellers(access, brand.id)
    ? {
        commercial: (
          <CardDescription>
            <Link href={`${base}/commerciaux?${periodSearch(input.period)}`} className="underline underline-offset-4">
              Comparer les commerciaux
            </Link>
          </CardDescription>
        ),
      }
    : undefined;
  return (
    <>
      <SectionsView sections={sections} links={links} />
      <Suspense fallback={null}>
        <PlanningFigures input={input} base={base} />
      </Suspense>
    </>
  );
}

async function PlanningFigures({ input, base }: { input: ChartInput; base: string }) {
  const planning = await loadPlanningCharts(input);
  if (!planning) return null;
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle>Planification</CardTitle>
        <CardDescription>
          État du jour : {planning.overdue} tâche(s) en retard
          {planning.overdue > 0 && (
            <>
              {" · "}
              <Link href={`${base}/taches?echeance=retard`} className="underline underline-offset-4">
                les voir
              </Link>
            </>
          )}
          .
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Onglet « Graphiques » : ceux que la personne a choisi d'afficher
// ---------------------------------------------------------------------

async function BrandCharts({ input, userId }: { input: ChartInput; userId: string }) {
  const { brand, access } = input;
  const groups = chartGroups(brand, access);
  if (groups.length === 0) {
    return (
      <Notice title="Rien à afficher">
        Aucun module de cette marque ne vous est ouvert. Les graphiques apparaissent selon les modules activés et vos droits.
      </Notice>
    );
  }
  const hiddenList = await getHiddenCharts(brand.id, userId);
  const hidden = new Set(hiddenList);
  const shown = groups.filter((group) => !isGroupHidden(group, hidden));
  return (
    <>
      <ChartFilter action={saveChartPreferences.bind(null, brand.slug)} groups={groups} hidden={hiddenList} />
      {shown.length === 0 ? (
        <Notice title="Aucun graphique sélectionné">Cochez au moins un graphique dans la liste ci-dessus, puis enregistrez.</Notice>
      ) : (
        <div className="flex flex-col gap-6">
          {shown.map((group) => (
            <ChartsCard key={group.key} title={group.label}>
              <Suspense fallback={<ChartsSkeleton />}>
                <GroupCharts group={group} input={input} hidden={hidden} />
              </Suspense>
            </ChartsCard>
          ))}
        </div>
      )}
    </>
  );
}

/** Graphiques d'un groupe, chargés à part : chacun s'affiche sans attendre les autres. */
async function GroupCharts({ group, input, hidden }: { group: ChartGroup; input: ChartInput; hidden: ReadonlySet<string> }) {
  const all = group.key === "planning" ? ((await loadPlanningCharts(input))?.charts ?? []) : await loadSectionCharts(group.key as SectionKey, input);
  const charts = withoutHidden(group.key, all, hidden);
  if (charts.length === 0) return <p className="text-sm text-muted-foreground">Aucune donnée à représenter sur cette période.</p>;
  return <ChartsGrid charts={charts} />;
}

// =====================================================================
// Vue Direction consolidée
// =====================================================================

export function DirectionPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Direction slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function Direction({ slug, query }: { slug: string; query: Query }) {
  const ctx = await getAuthContext();
  if (!findBrand(ctx, slug)) notFound();
  if (!can(ctx.access, "direction.read")) return <Forbidden />;
  const period = readPeriod(query);
  const brands = ctx.brands.filter((b) => b.isActive);
  const view = readDashboardView(first(query.vue));
  const { rows, total } = await loadDirection(brands, ctx.access, period);
  const base = `/m/${slug}/direction`;
  const notes = rows.flatMap((r) => r.notes.map((n) => `${r.label} : ${n}`));

  return (
    <Page>
      <PageHeader title="Vue Direction" description={<span className="first-letter:uppercase">Toutes les marques · {periodLabel(period)} · montants en XOF</span>}>
        <ExportBar excelHref={`${base}/export?${periodSearch(period)}`} />
      </PageHeader>
      <div className="print:hidden">
        <PeriodPicker action={base} period={period} maxStart={todayIso()} keep={view === "graphiques" ? { vue: view } : undefined} />
      </div>
      <ViewTabs base={base} period={period} view={view} />
      {view === "graphiques" ? (
        <ChartsCard title="Comparaison et tendance">
          <Suspense fallback={<ChartsSkeleton />}>
            <DirectionCharts brands={brands} access={ctx.access} period={period} rows={rows} />
          </Suspense>
        </ChartsCard>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>Consolidation</CardTitle>
          <CardDescription>
            Montants convertis en XOF (parité fixe pour l&apos;euro, taux saisis pour le dollar). Seuls des flux s&apos;additionnent entre
            marques ; « — » : aucune donnée, jamais 0.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marque</TableHead>
                {DIRECTION_COLUMNS.map((c) => (
                  <TableHead key={c.key} className="text-right whitespace-normal">
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rows, total].map((row) => (
                <TableRow key={row.label} className={row === total ? "font-semibold" : undefined}>
                  <TableCell>{row.label}</TableCell>
                  {DIRECTION_COLUMNS.map((c) => (
                    <TableCell key={c.key} className="text-right tabular-nums">
                      {formatKpi({ value: row.values[c.key] ?? null, format: c.format, currency: "XOF" })}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {notes.length > 0 && (
            <ul className="mt-4 flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted-foreground">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      )}
    </Page>
  );
}

async function DirectionCharts({ brands, access, period, rows }: { brands: BrandSummary[]; access: Access; period: Period; rows: DirectionRow[] }) {
  return <ChartsGrid charts={await loadDirectionCharts(brands, access, period, rows)} />;
}
