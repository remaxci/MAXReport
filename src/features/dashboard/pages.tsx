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
import { findBrand, getAuthContext, type BrandSummary } from "@/server/authz/context";
import { can, type Access } from "@/server/authz/permissions";
import { loadPlanningCharts, loadSectionCharts, type ChartInput } from "./charts";
import { loadDashboard, type SectionKey } from "./data";
import { DIRECTION_COLUMNS, loadDirection, loadDirectionCharts } from "./direction";
import type { DirectionRow } from "./export";
import { ChartsGrid, ChartsSkeleton, ExportBar, formatKpi, SectionsView } from "./view";

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
  const sections = await loadDashboard({ brand, access: ctx.access, period });
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
        <PeriodPicker action={base} period={period} maxStart={todayIso()} />
      </div>
      {sections.length === 0 ? (
        <Notice title="Rien à afficher">
          Aucun module de cette marque ne vous est ouvert. Les indicateurs apparaissent selon les modules activés et vos droits.
        </Notice>
      ) : (
        <SectionsView
          sections={sections}
          charts={Object.fromEntries(
            sections.map((section) => [
              section.key,
              <Suspense key={section.key} fallback={<ChartsSkeleton />}>
                <SectionCharts sectionKey={section.key} input={input} />
              </Suspense>,
            ]),
          )}
        />
      )}
      <Suspense fallback={null}>
        <PlanningCharts input={input} base={base} />
      </Suspense>
    </Page>
  );
}

/** Graphiques d'une section, chargés à part : les indicateurs s'affichent sans les attendre. */
async function SectionCharts({ sectionKey, input }: { sectionKey: SectionKey; input: ChartInput }) {
  return <ChartsGrid charts={await loadSectionCharts(sectionKey, input)} />;
}

async function PlanningCharts({ input, base }: { input: ChartInput; base: string }) {
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
      <CardContent>
        {planning.charts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun projet prévu, en cours ou en pause.</p>
        ) : (
          <ChartsGrid charts={planning.charts} />
        )}
      </CardContent>
    </Card>
  );
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
  const { rows, total } = await loadDirection(brands, ctx.access, period);
  const base = `/m/${slug}/direction`;
  const notes = rows.flatMap((r) => r.notes.map((n) => `${r.label} : ${n}`));

  return (
    <Page>
      <PageHeader title="Vue Direction" description={<span className="first-letter:uppercase">Toutes les marques · {periodLabel(period)} · montants en XOF</span>}>
        <ExportBar excelHref={`${base}/export?${periodSearch(period)}`} />
      </PageHeader>
      <div className="print:hidden">
        <PeriodPicker action={base} period={period} maxStart={todayIso()} />
      </div>
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
      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>Comparaison et tendance</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<ChartsSkeleton />}>
            <DirectionCharts brands={brands} access={ctx.access} period={period} rows={rows} />
          </Suspense>
        </CardContent>
      </Card>
    </Page>
  );
}

async function DirectionCharts({ brands, access, period, rows }: { brands: BrandSummary[]; access: Access; period: Period; rows: DirectionRow[] }) {
  return <ChartsGrid charts={await loadDirectionCharts(brands, access, period, rows)} />;
}
