import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFxRates } from "@/features/fx/queries";
import { formatMetric } from "@/features/activities/view";
import { BackLink } from "@/features/crm/view";
import { getMemberOptions } from "@/features/registers/queries";
import { ActionButton } from "@/features/settings/components/controls";
import { formatPercent, todayIso } from "@/lib/format";
import { availableMetrics, METRICS, type MetricKey } from "@/lib/metrics/actuals";
import { PERIOD_KINDS, periodRange, rangeLabel } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { deleteObjective, saveObjective } from "./actions";
import { ObjectiveForm, type ObjectiveDefaults } from "./components/objective-form";
import { evaluateObjectives } from "./evaluate";
import { getObjective, listObjectives, type Objective } from "./queries";
import {
  OBJECTIVE_STATES,
  OBJECTIVE_STATUS_LABELS,
  parseObjectiveState,
  type ObjectiveReading,
  type ObjectiveState,
} from "./status";

type Params = Promise<{ brand: string }>;
type ParamsWithId = Promise<{ brand: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function loadBrand(slug: string) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes("objectives")) notFound();
  return { ctx, brand };
}

const STATUS_VARIANT: Record<ObjectiveReading["status"], "default" | "secondary" | "destructive" | "outline"> = {
  achieved: "default",
  on_track: "secondary",
  behind: "destructive",
  missed: "destructive",
  upcoming: "outline",
  unknown: "outline",
};

function Progress({ rate, elapsed }: { rate: number | null; elapsed: number }) {
  const width = Math.min(100, Math.max(0, rate ?? 0));
  return (
    <div className="flex min-w-36 flex-col gap-1">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", rate !== null && rate >= 100 ? "bg-primary" : "bg-primary/70")} style={{ width: `${width}%` }} />
        {/* Repère : avancement de la période */}
        <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${Math.min(100, elapsed)}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatPercent(rate)} · période écoulée {formatPercent(elapsed)}
      </span>
    </div>
  );
}

// =====================================================================
// Liste et comparaison
// =====================================================================

export function ObjectivesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Objectives slug={brand} state={parseObjectiveState(Array.isArray(query.etat) ? query.etat[0] : query.etat)} />
      ))}
    </Suspense>
  );
}

type Group = { key: string; metric: MetricKey; start: string; end: string; items: Objective[] };

async function Objectives({ slug, state }: { slug: string; state: ObjectiveState }) {
  const { ctx, brand } = await loadBrand(slug);
  if (!can(ctx.access, "brand.read", brand.id)) return <Forbidden />;
  const today = todayIso();
  const base = `/m/${brand.slug}/objectifs`;
  const canManage = can(ctx.access, "objectives.manage", brand.id);
  const readAll = can(ctx.access, "objectives.read_all", brand.id);

  const [objectives, members, rates] = await Promise.all([
    listObjectives(brand.id, state, today),
    getMemberOptions(brand.id),
    getFxRates(),
  ]);
  const labels = new Map(members.map((m) => [m.id, m.label]));

  const evaluated = new Map((await evaluateObjectives(brand, objectives, rates, today)).map((e) => [e.objective.id, e]));

  // Regroupement par indicateur et période : l'objectif d'équipe, puis les
  // collaborateurs classés par taux d'atteinte (comparaison des commerciaux).
  const groups = new Map<string, Group>();
  for (const o of objectives) {
    const key = `${o.metric}|${o.periodStart}|${o.periodEnd}`;
    const group = groups.get(key) ?? { key, metric: o.metric, start: o.periodStart, end: o.periodEnd, items: [] };
    group.items.push(o);
    groups.set(key, group);
  }

  const read = (o: Objective) => evaluated.get(o.id)!;

  return (
    <Page>
      <PageHeader title="Objectifs" description={`${brand.name} · ${objectives.length} objectif(s)`}>
        {canManage && (
          <Button nativeButton={false} render={<Link href={`${base}/nouveau`} />}>
            <Plus />
            Nouvel objectif
          </Button>
        )}
      </PageHeader>

      <nav aria-label="État des objectifs" className="inline-flex w-fit gap-1 rounded-lg bg-muted p-1">
        {(Object.keys(OBJECTIVE_STATES) as ObjectiveState[]).map((s) => (
          <Link
            key={s}
            href={s === "current" ? base : `${base}?etat=${OBJECTIVE_STATES[s].slug}`}
            aria-current={s === state ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              s === state ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {OBJECTIVE_STATES[s].label}
          </Link>
        ))}
      </nav>

      {!readAll && (
        <p className="text-sm text-muted-foreground">
          Vous voyez vos objectifs personnels et ceux de l&apos;équipe ; le détail des collègues est réservé aux responsables.
        </p>
      )}

      {groups.size === 0 && (
        <Notice title="Aucun objectif">
          {canManage ? "Définissez un premier objectif avec « Nouvel objectif »." : "Aucun objectif ne vous concerne pour cette période."}
        </Notice>
      )}

      {[...groups.values()].map((group) => {
        const items = group.items
          .map((o) => ({ o, ...read(o) }))
          .sort((a, b) => {
            if ((a.o.userId === null) !== (b.o.userId === null)) return a.o.userId === null ? -1 : 1;
            return (b.reading.rate ?? -1) - (a.reading.rate ?? -1);
          });
        return (
          <Card key={group.key}>
            <CardHeader>
              <CardTitle>
                {METRICS[group.metric].label} · {rangeLabel(group.start, group.end)}
              </CardTitle>
              <CardDescription>Source : {METRICS[group.metric].source}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concerne</TableHead>
                    <TableHead className="text-right">Objectif</TableHead>
                    <TableHead className="text-right">Réalisé</TableHead>
                    <TableHead>Atteinte</TableHead>
                    <TableHead>État</TableHead>
                    {canManage && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(({ o, actual, reading }) => {
                    const currency = o.currency ?? brand.reportingCurrency;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">
                          {o.userId === null ? "Équipe" : (labels.get(o.userId) ?? "Ancien collaborateur")}
                          {o.comments && <p className="max-w-64 truncate text-xs font-normal text-muted-foreground">{o.comments}</p>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(o.metric, o.target, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMetric(o.metric, actual.value, currency)}
                          {actual.excludedCurrencies.length > 0 && (
                            <p className="text-xs text-muted-foreground">Hors {actual.excludedCurrencies.join(", ")}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Progress rate={reading.rate} elapsed={reading.elapsed} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[reading.status]}>{OBJECTIVE_STATUS_LABELS[reading.status]}</Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`${base}/${o.id}`} />}>
                                Modifier
                              </Button>
                              <ActionButton action={deleteObjective.bind(null, brand.id, o.id)} variant="ghost">
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
            </CardContent>
          </Card>
        );
      })}
    </Page>
  );
}

// =====================================================================
// Création et modification
// =====================================================================

function defaultsFor(objective: Objective | null, today: string): ObjectiveDefaults {
  if (!objective) {
    return {
      metric: "",
      scope: "team",
      periodKind: "month",
      anchor: today,
      periodStart: "",
      periodEnd: "",
      target: "",
      currency: "",
      comments: "",
    };
  }
  // Une période standard (mois, trimestre…) se reconnaît à ses bornes.
  const kind = PERIOD_KINDS.find((k) => {
    const range = periodRange(k, objective.periodStart);
    return range.start === objective.periodStart && range.end === objective.periodEnd;
  });
  return {
    metric: objective.metric,
    scope: objective.userId ?? "team",
    periodKind: kind ?? "custom",
    anchor: objective.periodStart,
    periodStart: objective.periodStart,
    periodEnd: objective.periodEnd,
    target: String(objective.target).replace(".", ","),
    currency: objective.currency ?? "",
    comments: objective.comments ?? "",
  };
}

export function NewObjectivePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <ObjectiveEditor slug={brand} id={null} />
      ))}
    </Suspense>
  );
}

export function EditObjectivePage({ params }: { params: ParamsWithId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <ObjectiveEditor slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

async function ObjectiveEditor({ slug, id }: { slug: string; id: string | null }) {
  const { ctx, brand } = await loadBrand(slug);
  if (!can(ctx.access, "objectives.manage", brand.id)) return <Forbidden />;
  if (id !== null && !UUID.test(id)) notFound();
  const [objective, members] = await Promise.all([id ? getObjective(brand.id, id) : null, getMemberOptions(brand.id)]);
  if (id && !objective) notFound();
  const base = `/m/${brand.slug}/objectifs`;

  return (
    <Page>
      <BackLink href={base} label="Objectifs" />
      <PageHeader title={objective ? "Modifier l'objectif" : "Nouvel objectif"} description={brand.name} />
      <Card>
        <CardContent>
          <ObjectiveForm
            action={saveObjective.bind(null, brand.id, objective?.id ?? null)}
            defaults={defaultsFor(objective, todayIso())}
            metrics={availableMetrics(brand.enabledModules)}
            members={members.filter((m) => !m.isGlobal).map((m) => ({ id: m.id, label: m.label }))}
            submitLabel={objective ? "Enregistrer" : "Créer l'objectif"}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
