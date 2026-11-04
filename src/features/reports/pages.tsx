import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodPicker } from "@/features/activities/view";
import { BackLink } from "@/features/crm/view";
import { availableSections, loadDashboard, SECTION_LABELS } from "@/features/dashboard/data";
import { ExportBar, SectionsView } from "@/features/dashboard/view";
import { ActionButton, EditDetails } from "@/features/settings/components/controls";
import { todayIso } from "@/lib/format";
import { PERIOD_KINDS, PERIOD_LABELS, periodFromQuery, periodLabel, periodSearch } from "@/lib/periods";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { deleteTemplate, saveTemplate } from "./actions";
import { TemplateForm } from "./components/template-form";
import { getTemplate, listTemplates } from "./queries";

type Params = Promise<{ brand: string }>;
type ParamsWithId = Promise<{ brand: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const PERIOD_OPTIONS = PERIOD_KINDS.map((k) => ({ key: k, label: PERIOD_LABELS[k] }));

async function loadBrand(slug: string) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes("reports")) notFound();
  return { ctx, brand, canManage: can(ctx.access, "reports.manage", brand.id) };
}

// =====================================================================
// Modèles
// =====================================================================

export function ReportsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <Reports slug={brand} />
      ))}
    </Suspense>
  );
}

async function Reports({ slug }: { slug: string }) {
  const { ctx, brand, canManage } = await loadBrand(slug);
  if (!can(ctx.access, "brand.read", brand.id)) return <Forbidden />;
  const templates = await listTemplates(brand.id);
  const sections = availableSections(brand, ctx.access).map((k) => ({ key: k, label: SECTION_LABELS[k] }));
  const base = `/m/${brand.slug}/rapports`;

  return (
    <Page>
      <PageHeader
        title="Rapports"
        description={`${brand.name} · modèles réutilisables, exportables en Excel et en PDF. Chacun n'y voit que ce que ses droits lui ouvrent.`}
      />
      {templates.length === 0 && <Notice title="Aucun modèle">{canManage ? "Créez un premier modèle ci-dessous." : "Aucun modèle de rapport pour cette marque."}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle>
                <Link href={`${base}/${t.id}`} className="underline-offset-4 hover:underline">
                  {t.name}
                </Link>
              </CardTitle>
              <CardDescription>{t.description ?? `Période par défaut : ${PERIOD_LABELS[t.periodKind].toLowerCase()}`}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1">
              {t.sections.map((s) => (
                <Badge key={s} variant="outline">
                  {SECTION_LABELS[s]}
                </Badge>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau modèle</CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateForm
              action={saveTemplate.bind(null, brand.id, null)}
              defaults={{ name: "", description: "", periodKind: "month", sections: sections.map((s) => s.key) }}
              sections={sections}
              periodKinds={PERIOD_OPTIONS}
              submitLabel="Créer le modèle"
            />
          </CardContent>
        </Card>
      )}
    </Page>
  );
}

// =====================================================================
// Un rapport
// =====================================================================

export function ReportPage({ params, searchParams }: { params: ParamsWithId; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand, id }, query]) => (
        <Report slug={brand} id={id} query={query} />
      ))}
    </Suspense>
  );
}

async function Report({ slug, id, query }: { slug: string; id: string; query: Record<string, string | string[] | undefined> }) {
  const { ctx, brand, canManage } = await loadBrand(slug);
  if (!can(ctx.access, "brand.read", brand.id)) return <Forbidden />;
  if (!UUID.test(id)) notFound();
  const template = await getTemplate(brand.id, id);
  if (!template) notFound();

  const period = periodFromQuery(first(query.periode), first(query.du), todayIso(), template.periodKind, first(query.au));
  const sections = await loadDashboard({ brand, access: ctx.access, period, sections: template.sections });
  const base = `/m/${brand.slug}/rapports/${template.id}`;
  const hidden = template.sections.filter((s) => !sections.some((x) => x.key === s));
  const choices = availableSections(brand, ctx.access).map((k) => ({ key: k, label: SECTION_LABELS[k] }));

  return (
    <Page>
      <div className="print:hidden">
        <BackLink href={`/m/${brand.slug}/rapports`} label="Rapports" />
      </div>
      <PageHeader title={template.name} description={<span className="first-letter:uppercase">{brand.name} · {periodLabel(period)}</span>}>
        <ExportBar excelHref={`/m/${brand.slug}/export?modele=${template.id}&${periodSearch(period)}`} />
      </PageHeader>
      {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
      <div className="print:hidden">
        <PeriodPicker action={base} period={period} maxStart={todayIso()} />
      </div>
      {hidden.length > 0 && (
        <p className="text-sm text-muted-foreground print:hidden">
          Non affiché pour vous (module désactivé ou droits) : {hidden.map((s) => SECTION_LABELS[s]).join(", ")}.
        </p>
      )}
      <SectionsView sections={sections} />
      {canManage && (
        <div className="flex flex-col gap-3 print:hidden">
          <EditDetails label="Modifier le modèle">
            <TemplateForm
              action={saveTemplate.bind(null, brand.id, template.id)}
              defaults={{ name: template.name, description: template.description ?? "", periodKind: template.periodKind, sections: template.sections }}
              sections={choices}
              periodKinds={PERIOD_OPTIONS}
              submitLabel="Enregistrer"
            />
          </EditDetails>
          <div>
            <ActionButton action={deleteTemplate.bind(null, brand.id, template.id)} variant="ghost">
              Supprimer le modèle
            </ActionButton>
          </div>
        </div>
      )}
    </Page>
  );
}
