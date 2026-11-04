import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodPicker } from "@/features/activities/view";
import { ChartsGrid, ChartsSkeleton, ExportBar, formatKpi, readDashboardView, ViewTabs } from "@/features/dashboard/view";
import { todayIso } from "@/lib/format";
import { periodFromQuery, periodLabel, periodSearch, type Period } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { findBrand, getAuthContext, type BrandSummary } from "@/server/authz/context";
import { canCompareSellers, readSellerSort, sellerCharts, sortSellers } from "./comparison";
import { loadSellerComparison, loadSellerTrend, type LoadedComparison } from "./data";

type Params = Promise<{ brand: string }>;
type Query = Record<string, string | string[] | undefined>;
type Search = Promise<Query>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function SellersPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Sellers slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function Sellers({ slug, query }: { slug: string; query: Query }) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();
  if (!canCompareSellers(ctx.access, brand.id)) return <Forbidden />;

  const period = periodFromQuery(first(query.periode), first(query.du), todayIso(), "month", first(query.au));
  const view = readDashboardView(first(query.vue));
  const comparison = await loadSellerComparison({ brand, access: ctx.access, period });
  const sort = readSellerSort(first(query.tri), comparison.columns);
  const base = `/m/${brand.slug}/commerciaux`;
  const keep = { ...(view === "graphiques" ? { vue: view } : {}), ...(first(query.tri) ? { tri: sort } : {}) };

  return (
    <Page>
      <PageHeader title="Comparaison des commerciaux" description={<span className="first-letter:uppercase">{brand.name} · {periodLabel(period)}</span>}>
        <ExportBar excelHref={`${base}/export?${periodSearch(period)}&tri=${sort}`} />
      </PageHeader>
      <div className="print:hidden">
        <PeriodPicker action={base} period={period} maxStart={todayIso()} keep={keep} />
      </div>
      <ViewTabs base={base} period={period} view={view} keep={first(query.tri) ? { tri: sort } : undefined} />
      {comparison.rows.length === 0 ? (
        <Notice title="Aucun commercial à comparer">
          Aucun collaborateur de cette marque ne remplit de fiche hebdomadaire, et personne n&apos;a de réalisé sur cette période.
        </Notice>
      ) : view === "graphiques" ? (
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>Par commercial</CardTitle>
            {comparison.notes.length > 0 && <CardDescription>{comparison.notes.join(" ")}</CardDescription>}
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartsSkeleton />}>
              <SellerChartsView brand={brand} period={period} comparison={comparison} />
            </Suspense>
          </CardContent>
        </Card>
      ) : (
        <SellersTable comparison={comparison} sort={sort} base={base} period={period} />
      )}
    </Page>
  );
}

async function SellerChartsView({ brand, period, comparison }: { brand: BrandSummary; period: Period; comparison: LoadedComparison }) {
  const trend = await loadSellerTrend({ brand, period, people: comparison.people, currency: comparison.currency, rates: comparison.rates });
  const charts = sellerCharts(comparison, comparison.currency);
  return <ChartsGrid charts={trend ? [...charts, trend] : charts} />;
}

function SellersTable({ comparison, sort, base, period }: { comparison: LoadedComparison; sort: string; base: string; period: Period }) {
  const rows = sortSellers(comparison.rows, sort);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Par commercial</CardTitle>
        <CardDescription>
          Cliquez sur un titre de colonne pour classer les commerciaux. « — » : aucune donnée, jamais 0 ; une fiche hebdomadaire non soumise laisse la valeur
          inconnue.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-card">Commercial</TableHead>
              {comparison.columns.map((column) => (
                <TableHead key={column.key} className="text-right whitespace-normal" aria-sort={column.key === sort ? "descending" : undefined}>
                  <Link
                    href={`${base}?${periodSearch(period)}&tri=${column.key}`}
                    className={cn("underline-offset-4 hover:underline", column.key === sort && "font-semibold text-foreground underline")}
                  >
                    {column.label}
                  </Link>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...rows, comparison.total].map((row) => (
              <TableRow key={row.id} className={row === comparison.total ? "font-semibold" : undefined}>
                <TableCell className={cn("sticky left-0 z-10 bg-card", row !== comparison.total && "font-medium")}>{row.label}</TableCell>
                {comparison.columns.map((column) => (
                  <TableCell key={column.key} className="text-right tabular-nums">
                    {formatKpi({ value: row.values[column.key] ?? null, format: column.format, currency: comparison.currency })}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {comparison.notes.length > 0 && (
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted-foreground">
            {comparison.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
