import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackLink, customRows, Details } from "@/features/crm/view";
import { getCustomFields } from "@/features/custom-fields/queries";
import { getMemberOptions } from "@/features/registers/queries";
import { ActionButton } from "@/features/settings/components/controls";
import { formatDateTime, formatNumber, todayIso } from "@/lib/format";
import {
  actualValue,
  availableMetrics,
  comesFromReports,
  knownActual,
  METRICS,
  type ActualRow,
  type MetricKey,
} from "@/lib/metrics/actuals";
import type { Currency, FxRate } from "@/lib/metrics/currency";
import { getFxRates } from "@/features/fx/queries";
import {
  isIsoDate,
  isoWeekStart,
  mondaysBetween,
  parsePeriodKind,
  periodLabel,
  periodRange,
  PERIOD_SLUGS,
  shiftPeriod,
  type Period,
} from "@/lib/periods";
import { findBrand, getAuthContext, type AuthContext, type BrandSummary } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { returnWeeklyReport, saveWeeklyReport, validateWeeklyReport } from "./actions";
import { ReportForm } from "./components/report-form";
import {
  getActivityMembers,
  getActuals,
  getReport,
  getWeekReport,
  listRecentReports,
  listReports,
  type WeeklyReport,
} from "./queries";
import { ActivityTabs, formatMetric, MetricTile, PeriodPicker, ReportStatusBadge } from "./view";

type Params = Promise<{ brand: string }>;
type ParamsWithId = Promise<{ brand: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Query = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function loadBrand(slug: string) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes("activities")) notFound();
  return { ctx, brand };
}

const counted = (r: WeeklyReport) => r.status === "submitted" || r.status === "validated";
const currencyOf = (brand: BrandSummary) => (brand.reportingCurrency || "XOF") as Currency;

function metricValue(
  metric: MetricKey,
  rows: readonly ActualRow[],
  userId: string | null,
  brand: BrandSummary,
  conversion: { rates: readonly FxRate[]; date: string },
) {
  return knownActual(rows, metric, userId, brand.enabledModules, { currency: currencyOf(brand), ...conversion });
}

function excludedHint(currencies: string[]): string | undefined {
  return currencies.length > 0 ? `Hors montants en ${currencies.join(", ")} (taux de change à saisir)` : undefined;
}

// =====================================================================
// Ma fiche de la semaine
// =====================================================================

export function ActivitiesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <MyWeek slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function MyWeek({ slug, query }: { slug: string; query: Query }) {
  const { ctx, brand } = await loadBrand(slug);
  const own = can(ctx.access, "activities.manage_own", brand.id);
  const team = can(ctx.access, "activities.read_all", brand.id);
  // Sans fiche à remplir (direction, lecture), la page ouvre la vue d'équipe.
  if (!own) return team ? <Team ctx={ctx} brand={brand} query={query} /> : <Forbidden />;

  const currentWeek = isoWeekStart(todayIso());
  const requested = first(query.semaine);
  const asked = isIsoDate(requested) ? isoWeekStart(requested) : currentWeek;
  const week = asked > currentWeek ? currentWeek : asked;
  const period = periodRange("week", week);
  const base = `/m/${brand.slug}/activites`;

  const [report, actuals, fields, members, recent, rates] = await Promise.all([
    getWeekReport(brand.id, ctx.userId, week),
    getActuals(brand.id, period.start, period.end),
    getCustomFields(brand.id, "weekly_report"),
    getMemberOptions(brand.id),
    listRecentReports(brand.id, ctx.userId),
    getFxRates(),
  ]);
  const declareOpportunities = !brand.enabledModules.includes("crm");
  const declareMemos = !brand.enabledModules.includes("memos");
  const observed = availableMetrics(brand.enabledModules).filter((m) => !comesFromReports(m, brand.enabledModules));
  const labels = new Map(members.map((m) => [m.id, m.label]));
  const weekLink = (start: string) => `${base}?semaine=${start}`;
  const previous = shiftPeriod(period, -1).start;
  const next = shiftPeriod(period, 1).start;

  return (
    <Page>
      <PageHeader title="Activités hebdomadaires" description={brand.name} />
      <ActivityTabs base={base} active="own" own={own} team={team} />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" nativeButton={false} render={<Link href={weekLink(previous)} aria-label="Semaine précédente" />}>
          <ChevronLeft />
        </Button>
        <p className="text-sm font-medium">{periodLabel(period)}</p>
        {next <= currentWeek ? (
          <Button variant="outline" size="icon" nativeButton={false} render={<Link href={weekLink(next)} aria-label="Semaine suivante" />}>
            <ChevronRight />
          </Button>
        ) : (
          <Button variant="outline" size="icon" disabled aria-label="Semaine suivante">
            <ChevronRight />
          </Button>
        )}
        {week !== currentWeek && (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={base} />}>
            Semaine en cours
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Ma fiche
              <ReportStatusBadge status={report?.status ?? (week < currentWeek ? "missing" : "todo")} />
            </CardTitle>
            <CardDescription>
              {report?.status === "validated"
                ? `Validée le ${formatDateTime(report.validatedAt)}${report.validatedBy ? ` par ${labels.get(report.validatedBy) ?? "un responsable"}` : ""}.`
                : report?.status === "submitted"
                  ? `Soumise le ${formatDateTime(report.submittedAt)}. Vous pouvez encore la corriger tant qu'elle n'est pas validée.`
                  : "Seules les fiches soumises comptent dans les réalisés et les objectifs."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {report?.status === "validated" ? (
              <ReportDetails report={report} brand={brand} fields={fields} labels={labels} />
            ) : (
              <ReportForm
                key={`${week}-${report?.status ?? "new"}`}
                action={saveWeeklyReport.bind(null, brand.id, week)}
                defaults={{
                  callsProspecting: report?.callsProspecting ?? 0,
                  callsFollowUp: report?.callsFollowUp ?? 0,
                  emailsSent: report?.emailsSent ?? 0,
                  qualifiedMeetings: report?.qualifiedMeetings ?? 0,
                  opportunitiesDeclared: report?.opportunitiesDeclared ?? 0,
                  memosDeclared: report?.memosDeclared ?? 0,
                  comments: report?.comments ?? "",
                }}
                declareOpportunities={declareOpportunities}
                declareMemos={declareMemos}
                submitted={report?.status === "submitted"}
                fields={fields}
                members={members.map((m) => ({ id: m.id, label: m.label }))}
                customValues={report?.custom ?? {}}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Relevé automatique</CardTitle>
            <CardDescription>Compté depuis le CRM et les registres sur la semaine : rien à ressaisir.</CardDescription>
          </CardHeader>
          <CardContent>
            {observed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun registre n&apos;est activé pour cette marque.</p>
            ) : (
              <dl className="flex flex-col gap-3">
                {observed.map((metric) => {
                  const result = actualValue(actuals, metric, ctx.userId, { currency: currencyOf(brand), rates, date: period.end });
                  const hint = excludedHint(result.excludedCurrencies);
                  return (
                    <div key={metric} className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">{METRICS[metric].label}</dt>
                      <dd className="text-lg font-semibold tabular-nums">{formatMetric(metric, result.value, currencyOf(brand))}</dd>
                      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
                    </div>
                  );
                })}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mes dernières fiches</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semaine</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Appels</TableHead>
                <TableHead className="text-right">E-mails</TableHead>
                <TableHead className="text-right">Rendez-vous</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Aucune fiche pour le moment.
                  </TableCell>
                </TableRow>
              )}
              {recent.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={weekLink(r.weekStart)} className="underline-offset-4 hover:underline">
                      {periodLabel(periodRange("week", r.weekStart))}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ReportStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.callsProspecting + r.callsFollowUp)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.emailsSent)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.qualifiedMeetings)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Page>
  );
}

function ReportDetails({
  report,
  brand,
  fields,
  labels,
}: {
  report: WeeklyReport;
  brand: BrandSummary;
  fields: Awaited<ReturnType<typeof getCustomFields>>;
  labels: Map<string, string>;
}) {
  const rows: [string, string][] = [
    ["Appels de prospection", formatNumber(report.callsProspecting)],
    ["Appels de relance", formatNumber(report.callsFollowUp)],
    ["E-mails envoyés", formatNumber(report.emailsSent)],
    ["Rendez-vous qualifiés", formatNumber(report.qualifiedMeetings)],
  ];
  if (!brand.enabledModules.includes("crm")) rows.push(["Opportunités créées", formatNumber(report.opportunitiesDeclared)]);
  if (!brand.enabledModules.includes("memos")) rows.push(["Mémos envoyés", formatNumber(report.memosDeclared)]);
  return (
    <div className="flex flex-col gap-4">
      <Details rows={[...rows, ...customRows(fields, report.custom, labels)]} />
      {report.comments && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Commentaires</span>
          <p className="text-sm whitespace-pre-wrap">{report.comments}</p>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Vue d'équipe
// =====================================================================

export function TeamActivitiesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <TeamPage slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function TeamPage({ slug, query }: { slug: string; query: Query }) {
  const { ctx, brand } = await loadBrand(slug);
  if (!can(ctx.access, "activities.read_all", brand.id)) return <Forbidden />;
  return <Team ctx={ctx} brand={brand} query={query} />;
}

async function Team({ ctx, brand, query }: { ctx: AuthContext; brand: BrandSummary; query: Query }) {
  const today = todayIso();
  const kind = parsePeriodKind(first(query.periode), "week");
  const anchor = first(query.du);
  const period: Period = periodRange(kind, isIsoDate(anchor) ? anchor : today);
  const base = `/m/${brand.slug}/activites`;
  const own = can(ctx.access, "activities.manage_own", brand.id);
  const canValidate = can(ctx.access, "activities.validate", brand.id);

  const [reports, actuals, activityMembers, members, rates] = await Promise.all([
    listReports(brand.id, period.start, period.end),
    getActuals(brand.id, period.start, period.end),
    getActivityMembers(brand.id),
    getMemberOptions(brand.id),
    getFxRates(),
  ]);
  const conversion = { rates, date: period.end };
  const labels = new Map(members.map((m) => [m.id, m.label]));
  activityMembers.forEach((m) => labels.set(m.id, m.label));

  // Collaborateurs suivis, plus toute personne ayant une fiche ou un réalisé sur la période.
  const people = new Set(activityMembers.map((m) => m.id));
  reports.forEach((r) => people.add(r.userId));
  actuals.forEach((a) => a.userId && people.add(a.userId));
  const rows = [...people]
    .map((id) => ({ id, label: labels.get(id) ?? "Ancien collaborateur" }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  const tracked = new Set(activityMembers.map((m) => m.id));
  const expectedWeeks = mondaysBetween(period.start, period.end).filter((monday) => monday <= today);
  const metrics = availableMetrics(brand.enabledModules);
  const currency = currencyOf(brand);

  return (
    <Page>
      <PageHeader title="Activités hebdomadaires" description={`${brand.name} · vue d'équipe`} />
      <ActivityTabs base={base} active="team" own={own} team />
      <PeriodPicker action={`${base}/equipe`} period={period} maxStart={today} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((metric) => {
          const result = metricValue(metric, actuals, null, brand, conversion);
          return (
            <MetricTile
              key={metric}
              label={METRICS[metric].label}
              value={formatMetric(metric, result.value, currency)}
              hint={excludedHint(result.excludedCurrencies)}
            />
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Par collaborateur</CardTitle>
          <CardDescription>
            Seules les fiches soumises ou validées sont comptées. « — » : aucune fiche soumise, la valeur est inconnue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Collaborateur</TableHead>
                <TableHead>{kind === "week" ? "Fiche" : "Fiches"}</TableHead>
                {metrics.map((metric) => (
                  <TableHead key={metric} className="text-right">
                    {METRICS[metric].label}
                  </TableHead>
                ))}
                {kind === "week" && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={metrics.length + 3} className="text-muted-foreground">
                    Aucun collaborateur ne remplit de fiche dans cette marque.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((person) => {
                const mine = reports.filter((r) => r.userId === person.id);
                return (
                  <TableRow key={person.id}>
                    <TableCell className="font-medium">{person.label}</TableCell>
                    <TableCell>
                      <ReportsCell
                        kind={period.kind}
                        reports={mine}
                        expected={tracked.has(person.id) ? expectedWeeks.length : 0}
                      />
                    </TableCell>
                    {metrics.map((metric) => {
                      const result = metricValue(metric, actuals, person.id, brand, conversion);
                      return (
                        <TableCell key={metric} className="text-right tabular-nums">
                          {formatMetric(metric, result.value, currency)}
                        </TableCell>
                      );
                    })}
                    {kind === "week" && (
                      <TableCell>
                        {mine[0] && (
                          <div className="flex items-center justify-end gap-2">
                            {canValidate && mine[0].status === "submitted" && (
                              <ActionButton action={validateWeeklyReport.bind(null, brand.id, mine[0].id)}>Valider</ActionButton>
                            )}
                            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`${base}/fiches/${mine[0].id}`} />}>
                              Voir
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
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

function ReportsCell({ kind, reports, expected }: { kind: Period["kind"]; reports: WeeklyReport[]; expected: number }) {
  if (kind === "week") {
    if (reports[0]) return <ReportStatusBadge status={reports[0].status} />;
    return expected > 0 ? <ReportStatusBadge status="missing" /> : <span className="text-muted-foreground">—</span>;
  }
  const submitted = reports.filter(counted).length;
  const drafts = reports.length - submitted;
  const missing = Math.max(0, expected - reports.length);
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span className="tabular-nums">
        {submitted} soumise(s){expected > 0 ? ` sur ${expected}` : ""}
      </span>
      {(drafts > 0 || missing > 0) && (
        <span className="text-xs text-muted-foreground">
          {[drafts > 0 && `${drafts} brouillon(s)`, missing > 0 && `${missing} manquante(s)`].filter(Boolean).join(" · ")}
        </span>
      )}
    </div>
  );
}

// =====================================================================
// Détail d'une fiche (responsable)
// =====================================================================

export function ReportPage({ params }: { params: ParamsWithId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <ReportView slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

async function ReportView({ slug, id }: { slug: string; id: string }) {
  const { ctx, brand } = await loadBrand(slug);
  if (!UUID.test(id)) notFound();
  const report = await getReport(brand.id, id);
  if (!report) notFound();
  const readAll = can(ctx.access, "activities.read_all", brand.id);
  if (!readAll && report.userId !== ctx.userId) return <Forbidden />;

  const [fields, members] = await Promise.all([getCustomFields(brand.id, "weekly_report"), getMemberOptions(brand.id)]);
  const labels = new Map(members.map((m) => [m.id, m.label]));
  const canValidate = can(ctx.access, "activities.validate", brand.id);
  const base = `/m/${brand.slug}/activites`;
  const period = periodRange("week", report.weekStart);
  const author = labels.get(report.userId) ?? "Ancien collaborateur";

  return (
    <Page>
      <BackLink
        href={readAll ? `${base}/equipe?periode=${PERIOD_SLUGS.week}&du=${report.weekStart}` : `${base}?semaine=${report.weekStart}`}
        label={readAll ? "Vue d'équipe" : "Ma fiche"}
      />
      <PageHeader title={`Fiche de ${author}`} description={periodLabel(period)}>
        <div className="flex flex-wrap items-start gap-2">
          {canValidate && report.status === "submitted" && (
            <ActionButton action={validateWeeklyReport.bind(null, brand.id, report.id)} variant="secondary">
              Valider
            </ActionButton>
          )}
          {canValidate && report.status !== "draft" && (
            <ActionButton action={returnWeeklyReport.bind(null, brand.id, report.id)}>Renvoyer pour correction</ActionButton>
          )}
        </div>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Statut
            <ReportStatusBadge status={report.status} />
          </CardTitle>
          <CardDescription>
            {report.status === "validated"
              ? `Validée le ${formatDateTime(report.validatedAt)}${report.validatedBy ? ` par ${labels.get(report.validatedBy) ?? "un responsable"}` : ""}.`
              : report.status === "submitted"
                ? `Soumise le ${formatDateTime(report.submittedAt)}.`
                : "Brouillon : la fiche n'est pas encore soumise et n'est pas comptée."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportDetails report={report} brand={brand} fields={fields} labels={labels} />
        </CardContent>
      </Card>
      {report.status === "draft" && report.userId === ctx.userId && (
        <Notice title="Fiche à compléter">
          <Link href={`${base}?semaine=${report.weekStart}`} className="underline underline-offset-4">
            Ouvrir ma fiche pour la compléter et la soumettre
          </Link>
        </Notice>
      )}
    </Page>
  );
}
