import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricTile, PeriodPicker } from "@/features/activities/view";
import { BackLink, customRows, Details } from "@/features/crm/view";
import { sumInCurrency } from "@/features/crm/money";
import { getCustomFields } from "@/features/custom-fields/queries";
import { getMemberOptions } from "@/features/registers/queries";
import { ActionButton, EditDetails } from "@/features/settings/components/controls";
import { formatDate, formatEvolution, formatMoney, formatNumber, formatPercent, todayIso } from "@/lib/format";
import type { Currency } from "@/lib/metrics/currency";
import { cpl, ctr, conversionRate, engagementRate, ratio } from "@/lib/metrics/formulas";
import { aggregateSnapshots, evolution, type Aggregated } from "@/lib/metrics/snapshots";
import {
  isIsoDate,
  parsePeriodKind,
  PERIOD_KINDS,
  periodRange,
  rangeLabel,
  sameLastYear,
  shiftPeriod,
  type Period,
} from "@/lib/periods";
import { findBrand, getAuthContext, type BrandSummary } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import {
  deleteSnapshot,
  saveCampaign,
  saveSnapshot,
  saveSocialAccount,
  saveWebsite,
  setMarketingArchived,
} from "./actions";
import {
  AccountForm,
  CampaignForm,
  SnapshotForm,
  WebsiteForm,
  type CampaignDefaults,
  type SnapshotDefaults,
} from "./components/forms";
import {
  aggregationFields,
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUSES,
  derivedIndicators,
  KINDS,
  WEBSITE_CHANNELS,
  type MarketingKind,
  type Measure,
} from "./config";
import {
  getCampaign,
  getPlatforms,
  getSnapshot,
  getSocialAccount,
  getWebsite,
  listCampaigns,
  listSnapshots,
  listSocialAccounts,
  listWebsites,
  type Campaign,
  type Platform,
  type Snapshot,
} from "./queries";

type Params = Promise<{ brand: string }>;
type ParamsWithId = Promise<{ brand: string; id: string }>;
type ParamsWithSnapshot = Promise<{ brand: string; id: string; releve: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Query = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function loadBrand(slug: string, kind: MarketingKind) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes(KINDS[kind].module)) notFound();
  const canRead = can(ctx.access, "marketing.read", brand.id) || can(ctx.access, "marketing.manage", brand.id);
  return { ctx, brand, canRead, canManage: can(ctx.access, "marketing.manage", brand.id) };
}

function readPeriod(query: Query, today: string): Period {
  const anchor = first(query.du);
  return periodRange(parsePeriodKind(first(query.periode), "month"), isIsoDate(anchor) ? anchor : today);
}

/** Objet suivi, ramené à ce qu'affichent les listes et en-têtes. */
type Item = { id: string; name: string; subtitle: string; archivedAt: string | null; currency?: string; campaign?: Campaign };

async function listItems(kind: MarketingKind, brandId: string, archived: boolean, platforms: Map<string, string>): Promise<Item[]> {
  switch (kind) {
    case "social":
      return (await listSocialAccounts(brandId, archived)).map((a) => ({
        id: a.id,
        name: a.name,
        subtitle: [platforms.get(a.platform) ?? a.platform, a.handle].filter(Boolean).join(" · "),
        archivedAt: a.archivedAt,
      }));
    case "campaign":
      return (await listCampaigns(brandId, archived)).map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: [platforms.get(c.platform) ?? c.platform, CAMPAIGN_OBJECTIVES[c.objective]].join(" · "),
        archivedAt: c.archivedAt,
        currency: c.currency,
        campaign: c,
      }));
    case "website":
      return (await listWebsites(brandId, archived)).map((w) => ({
        id: w.id,
        name: w.name,
        subtitle: w.url ?? "",
        archivedAt: w.archivedAt,
      }));
  }
}

async function getItem(kind: MarketingKind, brandId: string, id: string, platforms: Map<string, string>): Promise<Item | null> {
  switch (kind) {
    case "social": {
      const a = await getSocialAccount(brandId, id);
      return a && { id: a.id, name: a.name, subtitle: [platforms.get(a.platform) ?? a.platform, a.handle].filter(Boolean).join(" · "), archivedAt: a.archivedAt };
    }
    case "campaign": {
      const c = await getCampaign(brandId, id);
      return (
        c && {
          id: c.id,
          name: c.name,
          subtitle: [platforms.get(c.platform) ?? c.platform, CAMPAIGN_OBJECTIVES[c.objective]].join(" · "),
          archivedAt: c.archivedAt,
          currency: c.currency,
          campaign: c,
        }
      );
    }
    case "website": {
      const w = await getWebsite(brandId, id);
      return w && { id: w.id, name: w.name, subtitle: w.url ?? "", archivedAt: w.archivedAt };
    }
  }
}

function platformOptions(kind: MarketingKind, platforms: Platform[], current?: string) {
  const usable = platforms.filter((p) => p.isActive || p.key === current);
  if (kind === "social") return usable.filter((p) => p.kind === "social").map((p) => ({ key: p.key, label: p.label }));
  return usable
    .filter((p) => p.kind === "ads" || p.kind === "offline")
    .map((p) => ({ key: p.key, label: p.label, group: p.kind === "ads" ? "Numérique" : "Hors ligne" }));
}

/** Somme des valeurs connues ; null si aucune ne l'est. */
function total(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

function evolutionHint(current: number | null, previous: number | null, lastYear?: number | null): string {
  const parts = [`vs période préc. ${formatEvolution(evolution(current, previous))}`];
  if (lastYear !== undefined) parts.push(`vs N-1 ${formatEvolution(evolution(current, lastYear))}`);
  return parts.join(" · ");
}

function StraddleNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      {count} relevé(s) à cheval sur la période ne sont pas comptés : choisissez une période qui les contient entièrement.
    </p>
  );
}

// =====================================================================
// Liste et comparaison
// =====================================================================

export function MarketingListPage({ kind, params, searchParams }: { kind: MarketingKind; params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <MarketingList kind={kind} slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

type Row = { item: Item; current: Aggregated<string>; previous: Aggregated<string> };

async function MarketingList({ kind, slug, query }: { kind: MarketingKind; slug: string; query: Query }) {
  const { brand, canRead, canManage } = await loadBrand(slug, kind);
  if (!canRead) return <Forbidden />;
  const config = KINDS[kind];
  const today = todayIso();
  const period = readPeriod(query, today);
  const previous = shiftPeriod(period, -1);
  const archived = first(query.archives) === "1";
  const base = `/m/${brand.slug}${config.path}`;

  const platforms = await getPlatforms();
  const labels = new Map(platforms.map((p) => [p.key, p.label]));
  const [items, snapshots] = await Promise.all([
    listItems(kind, brand.id, archived, labels),
    listSnapshots(kind, brand.id, { from: previous.start, to: period.end }),
  ]);
  const fields = aggregationFields(kind);
  const rows: Row[] = items.map((item) => {
    const own = snapshots.filter((s) => s.parentId === item.id);
    return { item, current: aggregateSnapshots(own, period, fields), previous: aggregateSnapshots(own, previous, fields) };
  });
  const straddling = rows.reduce((n, r) => n + r.current.straddling, 0);

  return (
    <Page>
      <PageHeader title={config.title} description={`${brand.name} · ${items.length} ${archived ? "archivé(s)" : "suivi(s)"}`}>
        {canManage && (
          <Button nativeButton={false} render={<Link href={`${base}/${kind === "campaign" ? "nouvelle" : "nouveau"}`} />}>
            <Plus />
            {config.newLabel}
          </Button>
        )}
      </PageHeader>
      <PeriodPicker action={base} period={period} maxStart={today} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={archived ? base : `${base}?archives=1`} className="text-muted-foreground underline-offset-4 hover:underline">
          {archived ? "Voir les éléments suivis" : "Voir les archives"}
        </Link>
        <span className="text-muted-foreground">Données saisies (aucune connexion aux plateformes) ; évolutions comparées à la période précédente.</span>
      </div>
      <StraddleNotice count={straddling} />
      {kind === "social" && <SocialComparison rows={rows} base={base} />}
      {kind === "campaign" && <CampaignComparison rows={rows} base={base} brand={brand} period={period} />}
      {kind === "website" && <WebsiteComparison rows={rows} base={base} />}
    </Page>
  );
}

function NameCell({ item, base }: { item: Item; base: string }) {
  return (
    <TableCell>
      <Link href={`${base}/${item.id}`} className="font-medium underline-offset-4 hover:underline">
        {item.name}
      </Link>
      {item.subtitle && <p className="max-w-64 truncate text-xs text-muted-foreground">{item.subtitle}</p>}
    </TableCell>
  );
}

function NumberCell({ value, hint }: { value: string; hint?: string }) {
  return (
    <TableCell className="text-right tabular-nums">
      {value}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </TableCell>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

const n = formatNumber;

function SocialComparison({ rows, base }: { rows: Row[]; base: string }) {
  const sum = (key: string, from: "current" | "previous") => total(rows.map((r) => r[from].values[key]));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["followers_total", "Abonnés (tous comptes)"],
          ["followers_new", "Nouveaux abonnés"],
          ["impressions", "Impressions"],
          ["interactions", "Interactions"],
        ].map(([key, label]) => (
          <MetricTile key={key} label={label} value={n(sum(key, "current"))} hint={evolutionHint(sum(key, "current"), sum(key, "previous"))} />
        ))}
      </div>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Compte</TableHead>
                <TableHead className="text-right">Abonnés</TableHead>
                <TableHead className="text-right">Nouveaux</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Interactions</TableHead>
                <TableHead className="text-right">Engagement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <EmptyRow colSpan={6}>Aucun compte. Ajoutez les comptes suivis de la marque.</EmptyRow>}
              {rows.map(({ item, current, previous }) => {
                const v = current.values;
                const engagement = engagementRate(v.interactions, v.reach, v.impressions);
                return (
                  <TableRow key={item.id}>
                    <NameCell item={item} base={base} />
                    <NumberCell value={n(v.followers_total)} hint={formatEvolution(evolution(v.followers_total, previous.values.followers_total))} />
                    <NumberCell value={n(v.followers_new)} />
                    <NumberCell value={n(v.impressions)} hint={formatEvolution(evolution(v.impressions, previous.values.impressions))} />
                    <NumberCell value={n(v.interactions)} />
                    <NumberCell
                      value={formatPercent(engagement.value, 1)}
                      hint={engagement.basis === "impressions" ? "sur impressions" : undefined}
                    />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function CampaignComparison({ rows, base, brand, period }: { rows: Row[]; base: string; brand: BrandSummary; period: Period }) {
  const target = (brand.reportingCurrency || "XOF") as Currency;
  const spendOf = (from: "current" | "previous") =>
    sumInCurrency(
      rows.map((r) => ({ amount: r[from].values.spend, currency: r.item.currency ?? null })),
      target,
      period.end,
    );
  const spend = spendOf("current");
  const spendBefore = spendOf("previous");
  const anySpend = rows.some((r) => r.current.values.spend !== null);
  const totalOf = (key: string) => total(rows.map((r) => r.current.values[key]));
  const leads = totalOf("leads");
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile
          label={`Dépense totale (${target})`}
          value={anySpend ? formatMoney(spend.total, target) : "—"}
          hint={
            spend.excluded > 0
              ? `Hors ${spend.excluded} montant(s) en USD (taux de change à saisir)`
              : anySpend
                ? evolutionHint(spend.total, spendBefore.total)
                : undefined
          }
        />
        <MetricTile label="Impressions" value={n(totalOf("impressions"))} />
        <MetricTile label="Clics" value={n(totalOf("clicks"))} />
        <MetricTile
          label="Leads"
          value={n(leads)}
          hint={anySpend && spend.excluded === 0 ? `CPL global ${cpl(spend.total, leads) === null ? "n/d" : formatMoney(cpl(spend.total, leads), target)}` : undefined}
        />
      </div>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campagne</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Dépense</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clics</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <EmptyRow colSpan={8}>Aucune campagne sur cette vue.</EmptyRow>}
              {rows.map(({ item, current, previous }) => {
                const v = current.values;
                const currency = item.currency ?? target;
                const cost = cpl(v.spend, v.leads);
                return (
                  <TableRow key={item.id}>
                    <NameCell item={item} base={base} />
                    <TableCell>
                      {item.campaign && <Badge variant={item.campaign.status === "active" ? "default" : "outline"}>{CAMPAIGN_STATUSES[item.campaign.status]}</Badge>}
                      {item.campaign && (item.campaign.startOn || item.campaign.endOn) && (
                        <p className="text-xs text-muted-foreground">{rangeLabel(item.campaign.startOn ?? item.campaign.endOn!, item.campaign.endOn ?? item.campaign.startOn!)}</p>
                      )}
                    </TableCell>
                    <NumberCell
                      value={v.spend === null ? "—" : formatMoney(v.spend, currency)}
                      hint={v.spend === null ? undefined : formatEvolution(evolution(v.spend, previous.values.spend))}
                    />
                    <NumberCell value={n(v.impressions)} />
                    <NumberCell value={n(v.clicks)} />
                    <NumberCell value={formatPercent(ctr(v.clicks, v.impressions), 2)} />
                    <NumberCell value={n(v.leads)} />
                    <NumberCell value={cost === null ? "n/d" : formatMoney(cost, currency)} />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function WebsiteComparison({ rows, base }: { rows: Row[]; base: string }) {
  const sum = (key: string, from: "current" | "previous") => total(rows.map((r) => r[from].values[key]));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile label="Sessions" value={n(sum("sessions", "current"))} hint={evolutionHint(sum("sessions", "current"), sum("sessions", "previous"))} />
        <MetricTile label="Pages vues" value={n(sum("page_views", "current"))} />
        <MetricTile label="Conversions" value={n(sum("conversions", "current"))} hint={evolutionHint(sum("conversions", "current"), sum("conversions", "previous"))} />
        <MetricTile
          label="Taux de conversion"
          value={formatPercent(conversionRate(sum("conversions", "current"), sum("sessions", "current")), 1)}
        />
      </div>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Utilisateurs</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Pages vues</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">Taux de conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <EmptyRow colSpan={6}>Aucun site. Ajoutez les sites suivis de la marque.</EmptyRow>}
              {rows.map(({ item, current, previous }) => {
                const v = current.values;
                return (
                  <TableRow key={item.id}>
                    <NameCell item={item} base={base} />
                    <NumberCell value={n(v.users)} />
                    <NumberCell value={n(v.sessions)} hint={formatEvolution(evolution(v.sessions, previous.values.sessions))} />
                    <NumberCell value={n(v.page_views)} />
                    <NumberCell value={n(v.conversions)} />
                    <NumberCell value={formatPercent(conversionRate(v.conversions, v.sessions), 1)} />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

// =====================================================================
// Création
// =====================================================================

export function MarketingNewPage({ kind, params }: { kind: MarketingKind; params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <MarketingNew kind={kind} slug={brand} />
      ))}
    </Suspense>
  );
}

const EMPTY_CAMPAIGN: CampaignDefaults = {
  platform: "",
  name: "",
  objective: "awareness",
  status: "planned",
  startOn: "",
  endOn: "",
  plannedBudget: "",
  currency: "XOF",
  externalId: "",
  comments: "",
};

async function MarketingNew({ kind, slug }: { kind: MarketingKind; slug: string }) {
  const { brand, canManage } = await loadBrand(slug, kind);
  if (!canManage) return <Forbidden />;
  const config = KINDS[kind];
  const base = `/m/${brand.slug}${config.path}`;
  const platforms = await getPlatforms();

  let form: ReactNode;
  if (kind === "social") {
    form = (
      <AccountForm
        action={saveSocialAccount.bind(null, brand.id, null)}
        defaults={{ platform: "", name: "", handle: "", url: "" }}
        platforms={platformOptions(kind, platforms)}
        submitLabel="Ajouter le compte"
      />
    );
  } else if (kind === "website") {
    form = <WebsiteForm action={saveWebsite.bind(null, brand.id, null)} defaults={{ name: "", url: "" }} submitLabel="Ajouter le site" />;
  } else {
    const [fields, members] = await Promise.all([getCustomFields(brand.id, "campaign"), getMemberOptions(brand.id)]);
    form = (
      <CampaignForm
        action={saveCampaign.bind(null, brand.id, null)}
        defaults={{ ...EMPTY_CAMPAIGN, currency: brand.reportingCurrency || "XOF" }}
        platforms={platformOptions(kind, platforms)}
        currencyLocked={false}
        fields={fields}
        members={members.map((m) => ({ id: m.id, label: m.label }))}
        submitLabel="Créer la campagne"
      />
    );
  }

  return (
    <Page>
      <BackLink href={base} label={config.title} />
      <PageHeader title={config.newLabel} description={brand.name} />
      <Card>
        <CardContent>{form}</CardContent>
      </Card>
    </Page>
  );
}

// =====================================================================
// Détail : indicateurs de la période, évolutions, relevés
// =====================================================================

export function MarketingDetailPage({ kind, params, searchParams }: { kind: MarketingKind; params: ParamsWithId; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand, id }, query]) => (
        <MarketingDetail kind={kind} slug={brand} id={id} query={query} />
      ))}
    </Suspense>
  );
}

function formatMeasure(m: Measure, value: number | null, currency: string): string {
  return m.money ? (value === null ? "—" : formatMoney(value, currency)) : formatNumber(value);
}

async function MarketingDetail({ kind, slug, id, query }: { kind: MarketingKind; slug: string; id: string; query: Query }) {
  const { brand, canRead, canManage } = await loadBrand(slug, kind);
  if (!canRead) return <Forbidden />;
  if (!UUID.test(id)) notFound();
  const platforms = await getPlatforms();
  const labels = new Map(platforms.map((p) => [p.key, p.label]));
  const item = await getItem(kind, brand.id, id, labels);
  if (!item) notFound();

  const config = KINDS[kind];
  const today = todayIso();
  const period = readPeriod(query, today);
  const base = `/m/${brand.slug}${config.path}`;
  const currency = item.currency ?? brand.reportingCurrency ?? "XOF";
  const snapshots = await listSnapshots(kind, brand.id, { parentId: item.id });
  const fields = aggregationFields(kind);
  const current = aggregateSnapshots(snapshots, period, fields);
  const previous = aggregateSnapshots(snapshots, shiftPeriod(period, -1), fields);
  const lastYear = aggregateSnapshots(snapshots, sameLastYear(period), fields);

  return (
    <Page>
      <BackLink href={base} label={config.title} />
      <PageHeader
        title={item.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {item.subtitle}
            {item.archivedAt && <Badge variant="secondary">Archivé</Badge>}
          </span>
        }
      >
        {canManage && (
          <ActionButton action={setMarketingArchived.bind(null, kind, brand.id, item.id, !item.archivedAt)} variant="ghost">
            {item.archivedAt ? "Restaurer" : "Archiver"}
          </ActionButton>
        )}
      </PageHeader>

      <ItemDetails kind={kind} item={item} brand={brand} platforms={platforms} canManage={canManage} hasSnapshots={snapshots.length > 0} />

      <PeriodPicker action={`${base}/${item.id}`} period={period} maxStart={today} />
      <StraddleNotice count={current.straddling} />
      {current.counted === 0 && current.straddling === 0 && (
        <Notice title="Aucun relevé sur cette période">
          {canManage ? "Saisissez un relevé ci-dessous, ou choisissez une autre période." : "Choisissez une autre période."}
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {config.measures.map((m) => (
          <MetricTile
            key={m.key}
            label={m.label}
            value={formatMeasure(m, current.values[m.key], currency)}
            hint={
              m.aggregation === "exact" && current.values[m.key] === null && current.counted > 0
                ? "Relevée seulement pour une période exacte"
                : evolutionHint(current.values[m.key], previous.values[m.key], lastYear.values[m.key])
            }
          />
        ))}
        {derivedIndicators(kind, current.values, currency).map((d) => (
          <MetricTile key={d.key} label={d.label} value={d.value} hint={d.note} />
        ))}
      </div>

      {kind === "campaign" && item.campaign && <CampaignBudget campaign={item.campaign} snapshots={snapshots} />}
      {kind === "website" && <ChannelBreakdown values={current.values} />}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau relevé</CardTitle>
            <CardDescription>Chiffres relevés sur la plateforme pour une période (par défaut, celle affichée).</CardDescription>
          </CardHeader>
          <CardContent>
            <SnapshotForm
              key={`${period.kind}-${period.start}`}
              action={saveSnapshot.bind(null, kind, brand.id, item.id, null)}
              measures={config.measures}
              extraMeasures={config.extraMeasures}
              extraTitle={kind === "website" ? "Sessions par canal d'acquisition" : undefined}
              currency={kind === "campaign" ? currency : undefined}
              defaults={{ periodKind: period.kind, anchor: period.start, periodStart: period.start, periodEnd: period.end, values: {}, comments: "" }}
              submitLabel="Enregistrer le relevé"
            />
          </CardContent>
        </Card>
      )}

      <SnapshotHistory kind={kind} brandId={brand.id} base={`${base}/${item.id}`} snapshots={snapshots} currency={currency} canManage={canManage} />
    </Page>
  );
}

async function ItemDetails({
  kind,
  item,
  brand,
  platforms,
  canManage,
  hasSnapshots,
}: {
  kind: MarketingKind;
  item: Item;
  brand: BrandSummary;
  platforms: Platform[];
  canManage: boolean;
  hasSnapshots: boolean;
}) {
  if (kind === "campaign" && item.campaign) {
    const c = item.campaign;
    const [fields, members] = await Promise.all([getCustomFields(brand.id, "campaign"), getMemberOptions(brand.id)]);
    const memberLabels = new Map(members.map((m) => [m.id, m.label]));
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Details
            rows={[
              ["Statut", CAMPAIGN_STATUSES[c.status]],
              ["Objectif", CAMPAIGN_OBJECTIVES[c.objective]],
              ["Début", formatDate(c.startOn)],
              ["Fin", formatDate(c.endOn)],
              ["Budget prévu", c.plannedBudget === null ? "—" : formatMoney(c.plannedBudget, c.currency)],
              ["Référence sur la plateforme", c.externalId ?? "—"],
              ...customRows(fields, c.custom, memberLabels),
            ]}
          />
          {c.comments && <p className="text-sm whitespace-pre-wrap">{c.comments}</p>}
          {canManage && (
            <EditDetails label="Modifier la campagne">
              <CampaignForm
                action={saveCampaign.bind(null, brand.id, c.id)}
                defaults={{
                  platform: c.platform,
                  name: c.name,
                  objective: c.objective,
                  status: c.status,
                  startOn: c.startOn ?? "",
                  endOn: c.endOn ?? "",
                  plannedBudget: c.plannedBudget === null ? "" : String(c.plannedBudget).replace(".", ","),
                  currency: c.currency,
                  externalId: c.externalId ?? "",
                  comments: c.comments ?? "",
                }}
                platforms={platformOptions(kind, platforms, c.platform)}
                currencyLocked={hasSnapshots}
                fields={fields}
                members={members.map((m) => ({ id: m.id, label: m.label }))}
                customValues={c.custom}
                submitLabel="Enregistrer"
              />
            </EditDetails>
          )}
        </CardContent>
      </Card>
    );
  }
  if (!canManage) return null;
  if (kind === "social") {
    const account = await getSocialAccount(brand.id, item.id);
    if (!account) return null;
    return (
      <EditDetails label="Modifier le compte">
        <AccountForm
          action={saveSocialAccount.bind(null, brand.id, account.id)}
          defaults={{ platform: account.platform, name: account.name, handle: account.handle ?? "", url: account.url ?? "" }}
          platforms={platformOptions(kind, platforms, account.platform)}
          submitLabel="Enregistrer"
        />
      </EditDetails>
    );
  }
  const site = await getWebsite(brand.id, item.id);
  if (!site) return null;
  return (
    <EditDetails label="Modifier le site">
      <WebsiteForm action={saveWebsite.bind(null, brand.id, site.id)} defaults={{ name: site.name, url: site.url ?? "" }} submitLabel="Enregistrer" />
    </EditDetails>
  );
}

function CampaignBudget({ campaign, snapshots }: { campaign: Campaign; snapshots: Snapshot[] }) {
  const spent = total(snapshots.map((s) => s.values.spend));
  const consumption = ratio(spent, campaign.plannedBudget, 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget de la campagne</CardTitle>
        <CardDescription>Dépense relevée sur tous les relevés, comparée au budget prévu (suivi budgétaire détaillé au Sprint 7).</CardDescription>
      </CardHeader>
      <CardContent>
        <Details
          rows={[
            ["Budget prévu", campaign.plannedBudget === null ? "—" : formatMoney(campaign.plannedBudget, campaign.currency)],
            ["Dépense relevée", spent === null ? "—" : formatMoney(spent, campaign.currency)],
            ["Consommation", formatPercent(consumption)],
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ChannelBreakdown({ values }: { values: Record<string, number | null> }) {
  const sessions = values.sessions;
  const allocated = total(WEBSITE_CHANNELS.map((c) => values[c.key]));
  if (allocated === null) return null;
  const rest = sessions === null ? null : sessions - allocated;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions par canal d&apos;acquisition</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canal</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Part</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {WEBSITE_CHANNELS.map((c) => (
              <TableRow key={c.key}>
                <TableCell>{c.label}</TableCell>
                <TableCell className="text-right tabular-nums">{n(values[c.key])}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPercent(ratio(values[c.key], sessions, 100), 1)}</TableCell>
              </TableRow>
            ))}
            {rest !== null && rest > 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground">Non ventilé</TableCell>
                <TableCell className="text-right tabular-nums">{n(rest)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPercent(ratio(rest, sessions, 100), 1)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SnapshotHistory({
  kind,
  brandId,
  base,
  snapshots,
  currency,
  canManage,
}: {
  kind: MarketingKind;
  brandId: string;
  base: string;
  snapshots: Snapshot[];
  currency: string;
  canManage: boolean;
}) {
  const shown = KINDS[kind].measures.slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Relevés</CardTitle>
        <CardDescription>{snapshots.length} relevé(s), du plus récent au plus ancien.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Période</TableHead>
              {shown.map((m) => (
                <TableHead key={m.key} className="text-right">
                  {m.label}
                </TableHead>
              ))}
              <TableHead>Source</TableHead>
              {canManage && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.length === 0 && <EmptyRow colSpan={shown.length + 3}>Aucun relevé pour le moment.</EmptyRow>}
            {snapshots.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  {rangeLabel(s.periodStart, s.periodEnd)}
                  {s.comments && <p className="max-w-64 truncate text-xs text-muted-foreground">{s.comments}</p>}
                </TableCell>
                {shown.map((m) => (
                  <TableCell key={m.key} className="text-right tabular-nums">
                    {formatMeasure(m, s.values[m.key], currency)}
                  </TableCell>
                ))}
                <TableCell>{s.source === "import" ? "Import" : "Saisie"}</TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`${base}/releves/${s.id}`} />}>
                        Modifier
                      </Button>
                      <ActionButton action={deleteSnapshot.bind(null, kind, brandId, s.id)} variant="ghost">
                        Supprimer
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
  );
}

// =====================================================================
// Modification d'un relevé
// =====================================================================

export function SnapshotEditPage({ kind, params }: { kind: MarketingKind; params: ParamsWithSnapshot }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id, releve }) => (
        <SnapshotEdit kind={kind} slug={brand} id={id} snapshotId={releve} />
      ))}
    </Suspense>
  );
}

function snapshotDefaults(s: Snapshot): SnapshotDefaults {
  // Une période type (semaine, mois…) se reconnaît à ses bornes.
  const kind = PERIOD_KINDS.find((k) => {
    const range = periodRange(k, s.periodStart);
    return range.start === s.periodStart && range.end === s.periodEnd;
  });
  return {
    periodKind: kind ?? "custom",
    anchor: s.periodStart,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    values: s.values,
    comments: s.comments ?? "",
  };
}

async function SnapshotEdit({ kind, slug, id, snapshotId }: { kind: MarketingKind; slug: string; id: string; snapshotId: string }) {
  const { brand, canManage } = await loadBrand(slug, kind);
  if (!canManage) return <Forbidden />;
  if (!UUID.test(id) || !UUID.test(snapshotId)) notFound();
  const platforms = await getPlatforms();
  const [item, snapshot] = await Promise.all([
    getItem(kind, brand.id, id, new Map(platforms.map((p) => [p.key, p.label]))),
    getSnapshot(kind, brand.id, snapshotId),
  ]);
  if (!item || !snapshot || snapshot.parentId !== item.id) notFound();
  const config = KINDS[kind];
  const back = `/m/${brand.slug}${config.path}/${item.id}`;

  return (
    <Page>
      <BackLink href={back} label={item.name} />
      <PageHeader title="Modifier le relevé" description={`${item.name} · ${rangeLabel(snapshot.periodStart, snapshot.periodEnd)}`} />
      <Card>
        <CardContent>
          <SnapshotForm
            action={saveSnapshot.bind(null, kind, brand.id, item.id, snapshot.id)}
            measures={config.measures}
            extraMeasures={config.extraMeasures}
            extraTitle={kind === "website" ? "Sessions par canal d'acquisition" : undefined}
            currency={kind === "campaign" ? item.currency : undefined}
            defaults={snapshotDefaults(snapshot)}
            submitLabel="Enregistrer"
          />
        </CardContent>
      </Card>
    </Page>
  );
}
