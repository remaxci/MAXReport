import { FileSpreadsheet } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { ChartView } from "@/features/dashboard/components/chart-view";
import { todayIso } from "@/lib/format";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { addWidget } from "./actions";
import { AddToDashboard } from "./components/add-to-dashboard";
import { acceptsWidget, canManageDashboard, listDashboards } from "./dashboards";
import { loadExploration } from "./data";
import { explorerBrands, explorerIndicators } from "./scope";
import {
  CHART_LABELS,
  CHART_SLUGS,
  CHART_TYPES,
  COMPARISON_LABELS,
  COMPARISON_SLUGS,
  COMPARISONS,
  GRANULARITIES,
  GRANULARITY_LABELS,
  GRANULARITY_SLUGS,
  MAX_BRANDS,
  parseSettings,
  POINT_CHOICES,
  settingsSearch,
  type ExplorerSettings,
} from "./settings";

type Params = Promise<{ brand: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Query = Record<string, string | string[] | undefined>;

export function ExplorerPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Explorer slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

const select = (id: string, label: string, value: string, options: { value: string; label: string }[]) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    <NativeSelect id={id} name={id} defaultValue={value} className="w-full">
      {options.map((o) => (
        <NativeSelectOption key={o.value} value={o.value}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  </div>
);

async function Explorer({ slug, query }: { slug: string; query: Query }) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();
  if (!can(ctx.access, "brand.read", brand.id)) return <Forbidden />;
  const brands = explorerBrands(ctx, brand);
  const { indicators, fallback } = explorerIndicators(ctx, brands, brand);
  const base = `/m/${brand.slug}`;

  if (!fallback) {
    return (
      <Page>
        <PageHeader title="Explorateur" />
        <Notice title="Aucun indicateur disponible">Aucun module mesuré ne vous est ouvert sur vos marques.</Notice>
      </Page>
    );
  }

  const parsed = parseSettings(query, { brands, defaultBrandId: brand.id, defaultIndicator: fallback });
  const { end: chosenEnd, ...settings } = parsed;
  const today = todayIso();
  const end = chosenEnd ?? today;
  const [exploration, dashboards] = await Promise.all([
    loadExploration(settings, { brands, access: ctx.access, end }),
    listDashboards(brand.id, can(ctx.access, "direction.read")),
  ]);
  const slugs = new Map(brands.map((b) => [b.id, b.slug]));
  const search = settingsSearch(settings, slugs, chosenEnd);
  const groups = [...new Set(indicators.map((i) => i.group))];
  const targets = exploration
    ? dashboards
        .filter((d) => canManageDashboard(ctx, d) && acceptsWidget(d, exploration.applied))
        .map((d) => ({ id: d.id, label: `${d.brandId ? brand.name : "Direction"} · ${d.name}` }))
    : [];
  // Réglages enregistrés : ceux réellement appliqués, limités aux marques mesurées.
  const saved: ExplorerSettings | null =
    exploration && exploration.measured.length > 0 ? { ...exploration.applied, brandIds: exploration.measured.map((b) => b.id) } : null;

  return (
    <Page>
      <PageHeader title="Explorateur" description="Un indicateur, une ou plusieurs marques, sur la durée : graphique, tableau et Excel." />

      <Card className="print:hidden">
        <CardContent>
          <Form action={`${base}/explorateur`} className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="indicateur">Indicateur</Label>
                <NativeSelect id="indicateur" name="indicateur" defaultValue={settings.indicator} className="w-full">
                  {groups.map((group) => (
                    <NativeSelectOptGroup key={group} label={group}>
                      {indicators
                        .filter((i) => i.group === group)
                        .map((i) => (
                          <NativeSelectOption key={i.key} value={i.key}>
                            {i.label}
                          </NativeSelectOption>
                        ))}
                    </NativeSelectOptGroup>
                  ))}
                </NativeSelect>
              </div>
              {select(
                "decoupage",
                "Découpage",
                GRANULARITY_SLUGS[settings.granularity],
                GRANULARITIES.map((g) => ({ value: GRANULARITY_SLUGS[g], label: GRANULARITY_LABELS[g] })),
              )}
              {select(
                "points",
                "Nombre de points",
                String(settings.points),
                POINT_CHOICES.map((n) => ({ value: String(n), label: `${n} périodes` })),
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="jusquau">Jusqu&apos;au</Label>
                <Input id="jusquau" name="jusquau" type="date" defaultValue={end} max={today} />
              </div>
              {select(
                "comparaison",
                "Comparaison (une marque)",
                COMPARISON_SLUGS[settings.comparison],
                COMPARISONS.map((c) => ({ value: COMPARISON_SLUGS[c], label: COMPARISON_LABELS[c] })),
              )}
              {select(
                "graphique",
                "Graphique",
                CHART_SLUGS[settings.chart],
                CHART_TYPES.map((c) => ({ value: CHART_SLUGS[c], label: CHART_LABELS[c] })),
              )}
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Marques ({MAX_BRANDS} au maximum)</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {brands.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="marques" value={b.slug} defaultChecked={settings.brandIds.includes(b.id)} className="size-4 accent-primary" />
                    {b.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">Afficher</Button>
              <Button variant="ghost" nativeButton={false} render={<Link href={`${base}/explorateur`} />}>
                Réinitialiser
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      {exploration && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Résultat</CardTitle>
              <CardDescription>Mêmes règles que les tableaux de bord : une valeur inconnue reste un trou, jamais un 0.</CardDescription>
            </div>
            <Button variant="outline" nativeButton={false} render={<Link href={`${base}/explorateur/export?${search}`} prefetch={false} />}>
              <FileSpreadsheet />
              Excel
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {exploration.measured.length === 0 ? (
              <Notice title="Rien à calculer">Cet indicateur n&apos;est suivi pour aucune des marques choisies.</Notice>
            ) : (
              <ChartView chart={exploration.chart} />
            )}
            {saved && (
              <section className="flex flex-col gap-2 border-t pt-4 print:hidden">
                <h2 className="text-sm font-medium">Ajouter à un tableau de bord</h2>
                {targets.length > 0 ? (
                  <AddToDashboard action={addWidget.bind(null, saved)} dashboards={targets} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucun tableau ne peut recevoir ce graphique
                    {saved.brandIds.length > 1 || saved.brandIds[0] !== brand.id ? " (plusieurs marques : un tableau Direction est nécessaire)" : ""}.{" "}
                    <Link href={`${base}/tableaux`} className="underline underline-offset-4">
                      Gérer les tableaux personnalisés
                    </Link>
                  </p>
                )}
              </section>
            )}
          </CardContent>
        </Card>
      )}
    </Page>
  );
}
