import { ArrowDown, ArrowUp, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartView } from "@/features/dashboard/components/chart-view";
import { ChartsSkeleton } from "@/features/dashboard/view";
import { ConfirmAction } from "@/features/imports/components/forms";
import { ActionButton, EditDetails } from "@/features/settings/components/controls";
import { formatDate, todayIso } from "@/lib/format";
import { isIsoDate } from "@/lib/periods";
import { findBrand, getAuthContext, type AuthContext, type BrandSummary } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { createDashboard, deleteDashboard, moveWidget, removeWidget, updateDashboard } from "./actions";
import { DashboardForm } from "./components/dashboard-form";
import { canCreateDashboard, canManageDashboard, getDashboard, listDashboards, type CustomDashboard } from "./dashboards";
import { loadExploration } from "./data";
import { explorerBrands } from "./scope";
import { settingsSearch, widgetSchema, type Widget } from "./settings";

type Params = Promise<{ brand: string }>;
type ParamsWithId = Promise<{ brand: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// =====================================================================
// Liste et création
// =====================================================================

export function DashboardsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <Dashboards slug={brand} />
      ))}
    </Suspense>
  );
}

function DashboardList({ title, dashboards, base, empty }: { title: string; dashboards: CustomDashboard[]; base: string; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {dashboards.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {dashboards.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 flex-col">
                  <Link href={`${base}/tableaux/${d.id}`} className="font-medium underline-offset-4 hover:underline">
                    {d.name}
                  </Link>
                  {d.description && <span className="text-sm text-muted-foreground">{d.description}</span>}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {!d.isShared && <Badge variant="secondary">Personnel</Badge>}
                  {d.widgets.length} graphique(s)
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function Dashboards({ slug }: { slug: string }) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();
  if (!can(ctx.access, "brand.read", brand.id)) return <Forbidden />;
  const direction = can(ctx.access, "direction.read");
  const dashboards = await listDashboards(brand.id, direction);
  const base = `/m/${brand.slug}`;
  const scopes = [
    ...(canCreateDashboard(ctx, brand.id) ? [{ value: "marque" as const, label: `${brand.name} (cette marque)` }] : []),
    ...(canCreateDashboard(ctx, null) ? [{ value: "direction" as const, label: "Direction (toutes marques)" }] : []),
  ];

  return (
    <Page>
      <PageHeader title="Tableaux personnalisés" description="Des graphiques de l'explorateur, regroupés et recalculés à chaque ouverture.">
        <Button variant="outline" nativeButton={false} render={<Link href={`${base}/explorateur`} />}>
          <Search />
          Explorateur
        </Button>
      </PageHeader>
      <Notice title="Comment faire">
        Créez un tableau ici, puis, dans l&apos;Explorateur, réglez un graphique et choisissez « Ajouter au tableau ». Un tableau
        n&apos;enregistre que des réglages : chaque lecteur voit les chiffres de ses propres droits.
      </Notice>
      <DashboardList title={brand.name} dashboards={dashboards.filter((d) => d.brandId === brand.id)} base={base} empty="Aucun tableau pour cette marque." />
      {direction && (
        <DashboardList
          title="Direction (toutes marques)"
          dashboards={dashboards.filter((d) => d.brandId === null)}
          base={base}
          empty="Aucun tableau Direction."
        />
      )}
      {scopes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau tableau</CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardForm action={createDashboard.bind(null, brand.slug)} scopes={scopes} submitLabel="Créer le tableau" />
          </CardContent>
        </Card>
      )}
    </Page>
  );
}

// =====================================================================
// Un tableau : ses graphiques, recalculés à l'ouverture
// =====================================================================

export function DashboardPage({ params, searchParams }: { params: ParamsWithId; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand, id }, query]) => (
        <DashboardView slug={brand} id={id} query={query} />
      ))}
    </Suspense>
  );
}

async function DashboardView({ slug, id, query }: { slug: string; id: string; query: Record<string, string | string[] | undefined> }) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();
  if (!can(ctx.access, "brand.read", brand.id)) return <Forbidden />;
  if (!UUID.test(id)) notFound();
  const dashboard = await getDashboard(id);
  // Un tableau de marque s'ouvre depuis sa marque ; un tableau Direction depuis n'importe laquelle.
  if (!dashboard || (dashboard.brandId !== null && dashboard.brandId !== brand.id)) notFound();
  const manage = canManageDashboard(ctx, dashboard);
  const today = todayIso();
  const asked = typeof query.jusquau === "string" ? query.jusquau : undefined;
  const end = isIsoDate(asked) && asked <= today ? asked : today;
  const base = `/m/${brand.slug}`;
  const entries = dashboard.raw.map((item, index) => ({ index, parsed: widgetSchema.safeParse(item) }));

  return (
    <Page>
      <Link href={`${base}/tableaux`} className="text-sm text-muted-foreground underline-offset-4 hover:underline print:hidden">
        ← Tableaux personnalisés
      </Link>
      <PageHeader
        title={dashboard.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {dashboard.brandId ? brand.name : "Direction (toutes marques)"} · données jusqu&apos;au {formatDate(end)}
            {!dashboard.isShared && <Badge variant="secondary">Personnel</Badge>}
          </span>
        }
      >
        <Form action={`${base}/tableaux/${dashboard.id}`} className="flex items-end gap-2 print:hidden">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jusquau">Jusqu&apos;au</Label>
            <Input id="jusquau" name="jusquau" type="date" defaultValue={end} max={today} />
          </div>
          <Button type="submit" variant="outline">
            Afficher
          </Button>
        </Form>
      </PageHeader>
      {dashboard.description && <p className="text-sm text-muted-foreground">{dashboard.description}</p>}

      {manage && (
        <div className="flex flex-wrap items-start gap-4 print:hidden">
          <EditDetails label="Modifier le tableau">
            <DashboardForm
              action={updateDashboard.bind(null, dashboard.id)}
              defaults={{ name: dashboard.name, description: dashboard.description ?? "", shared: dashboard.isShared }}
              submitLabel="Enregistrer"
            />
          </EditDetails>
          <ConfirmAction
            action={deleteDashboard.bind(null, dashboard.id, brand.slug)}
            label="Supprimer le tableau"
            title="Supprimer ce tableau ?"
            description="Le tableau et ses réglages disparaissent pour tous ses lecteurs. Les données elles-mêmes ne sont pas touchées."
            confirmLabel="Supprimer"
            destructive
          />
        </div>
      )}

      {entries.length === 0 ? (
        <Notice title="Tableau vide">
          Ajoutez des graphiques depuis l&apos;
          <Link href={`${base}/explorateur`} className="underline underline-offset-4">
            Explorateur
          </Link>{" "}
          (« Ajouter au tableau »).
        </Notice>
      ) : (
        <div className={`grid gap-6 ${entries.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {entries.map(({ index, parsed }) => (
            <Card key={index} className="break-inside-avoid">
              <CardContent className="flex flex-col gap-3">
                {parsed.success ? (
                  <Suspense fallback={<ChartsSkeleton />}>
                    <WidgetChart widget={parsed.data} ctx={ctx} brand={brand} end={end} />
                  </Suspense>
                ) : (
                  <CardDescription>Graphique enregistré dans un format qui n&apos;est plus lisible.</CardDescription>
                )}
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  {parsed.success && (
                    <Button
                      variant="ghost"
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link
                          href={`${base}/explorateur?${settingsSearch(parsed.data, new Map(ctx.brands.map((b) => [b.id, b.slug])), asked && isIsoDate(asked) ? end : null)}`}
                        />
                      }
                    >
                      <Search />
                      Ouvrir dans l&apos;explorateur
                    </Button>
                  )}
                  {manage && (
                    <>
                      {index > 0 && (
                        <ActionButton action={moveWidget.bind(null, dashboard.id, index, -1)} variant="ghost">
                          <ArrowUp />
                          <span className="sr-only">Monter</span>
                        </ActionButton>
                      )}
                      {index < entries.length - 1 && (
                        <ActionButton action={moveWidget.bind(null, dashboard.id, index, 1)} variant="ghost">
                          <ArrowDown />
                          <span className="sr-only">Descendre</span>
                        </ActionButton>
                      )}
                      <ActionButton action={removeWidget.bind(null, dashboard.id, index)} variant="ghost">
                        Retirer
                      </ActionButton>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

async function WidgetChart({ widget, ctx, brand, end }: { widget: Widget; ctx: AuthContext; brand: BrandSummary; end: string }) {
  const exploration = await loadExploration(widget, { brands: explorerBrands(ctx, brand), access: ctx.access, end, title: widget.title });
  if (!exploration || exploration.measured.length === 0) {
    return <CardDescription>Aucune des marques de ce graphique ne vous est ouverte pour cet indicateur.</CardDescription>;
  }
  return <ChartView chart={exploration.chart} />;
}
