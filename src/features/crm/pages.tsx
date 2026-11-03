import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Forbidden, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ModuleKey } from "@/config/modules";
import { getCustomFields } from "@/features/custom-fields/queries";
import { FollowUpBadge, StatusBadge } from "@/features/registers/components/status-badge";
import { followUpState } from "@/features/registers/filters";
import { getCompanyOptions, getMemberOptions, listDocuments } from "@/features/registers/queries";
import { ActionButton, EditDetails } from "@/features/settings/components/controls";
import { getStatuses } from "@/features/settings/queries";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import type { Currency } from "@/lib/metrics/currency";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { CONTRACT_PERMISSIONS, OPPORTUNITY_PERMISSIONS, ownedAccess } from "@/server/authz/ownership";
import { can } from "@/server/authz/permissions";
import {
  addInteraction,
  archiveContact,
  deleteInteraction,
  moveOpportunity,
  saveCompany,
  saveContact,
  saveContract,
  saveOpportunity,
  setCompanyArchived,
  setContractArchived,
  setOpportunityArchived,
} from "./actions";
import {
  CompanyForm,
  ContactForm,
  ContractForm,
  InteractionForm,
  MoveStageForm,
  OpportunityForm,
  type CompanyDefaults,
  type ContractDefaults,
  type OpportunityDefaults,
} from "./components/forms";
import { getFxRates } from "@/features/fx/queries";
import { sumInCurrency } from "./money";
import {
  getCompany,
  getContract,
  getListItems,
  getOfferOptions,
  getOpportunity,
  getStages,
  listCompanies,
  listContacts,
  listContracts,
  listInteractions,
  listOpportunities,
  parseCrmFilters,
  type CompanyRow,
  type ContractRow,
  type OpportunityRow,
} from "./queries";
import { BackLink, CrmFiltersBar, customRows, Details, InteractionList } from "./view";

type Params = Promise<{ brand: string }>;
type ParamsWithId = Promise<{ brand: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function loadBrand(slug: string, module: ModuleKey) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes(module)) notFound();
  return { ctx, brand };
}

function nowLocal(): string {
  return new Date().toISOString().slice(0, 16);
}

const toOptions = (items: { id: string; label: string }[]) => items.map((i) => ({ id: i.id, label: i.label }));

// =====================================================================
// Prospects
// =====================================================================

export function CompaniesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Companies slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function Companies({ slug, query }: { slug: string; query: Record<string, string | string[] | undefined> }) {
  const { ctx, brand } = await loadBrand(slug, "crm");
  if (!can(ctx.access, "crm.read", brand.id)) return <Forbidden />;
  const filters = parseCrmFilters(query);
  const [companies, statuses, members, sectors] = await Promise.all([
    listCompanies(brand.id, filters),
    getStatuses(brand.id),
    getMemberOptions(brand.id),
    getListItems(brand.id, "industries"),
  ]);
  const owners = new Map(members.map((m) => [m.id, m.label]));
  const sectorLabels = new Map(sectors.map((s) => [s.id, s.label]));
  const base = `/m/${brand.slug}/prospects`;
  const today = todayIso();

  return (
    <Page>
      <PageHeader title="Prospects" description={`${brand.name} · ${companies.length} entreprise(s)`}>
        {can(ctx.access, "crm.manage", brand.id) && (
          <Button nativeButton={false} render={<Link href={`${base}/nouveau`} />}>
            <Plus />
            Nouveau prospect
          </Button>
        )}
      </PageHeader>
      <CrmFiltersBar
        action={base}
        filters={filters}
        statuses={statuses.filter((s) => s.entity === "company").map((s) => ({ id: s.id, label: s.label }))}
        owners={toOptions(members)}
        searchPlaceholder="Nom, ville, e-mail ou téléphone"
      />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entreprise</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Secteur</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Prochaine relance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Aucun prospect ne correspond.
                  </TableCell>
                </TableRow>
              )}
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`${base}/${c.id}`} className="underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.status && <StatusBadge label={c.status.label} color={c.status.color} />}</TableCell>
                  <TableCell>{(c.sector && sectorLabels.get(c.sector)) ?? "—"}</TableCell>
                  <TableCell>{c.city ?? "—"}</TableCell>
                  <TableCell>{(c.ownerId && owners.get(c.ownerId)) ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {formatDate(c.nextFollowUpOn)}
                      <FollowUpBadge state={followUpState(c.nextFollowUpOn, c.status?.category ?? "active", today)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Page>
  );
}

async function companyFormData(brandId: string) {
  const [statuses, members, sectors, sources, fields] = await Promise.all([
    getStatuses(brandId),
    getMemberOptions(brandId),
    getListItems(brandId, "industries"),
    getListItems(brandId, "lead_sources"),
    getCustomFields(brandId, "company"),
  ]);
  return {
    statuses: statuses.filter((s) => s.entity === "company" && s.isActive).map((s) => ({ id: s.id, label: s.label })),
    members: toOptions(members),
    sectors,
    sources,
    fields,
  };
}

function companyDefaults(company: CompanyRow | null, userId: string): CompanyDefaults {
  return {
    name: company?.name ?? "",
    sector: company?.sector ?? "",
    source: company?.source ?? "",
    city: company?.city ?? "",
    country: company?.country ?? "Côte d'Ivoire",
    phone: company?.phone ?? "",
    email: company?.email ?? "",
    website: company?.website ?? "",
    statusId: company?.status?.id ?? "",
    ownerId: company?.ownerId ?? userId,
    nextFollowUpOn: company?.nextFollowUpOn ?? "",
  };
}

export function NewCompanyPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <NewCompany slug={brand} />
      ))}
    </Suspense>
  );
}

async function NewCompany({ slug }: { slug: string }) {
  const { ctx, brand } = await loadBrand(slug, "crm");
  if (!can(ctx.access, "crm.manage", brand.id)) return <Forbidden />;
  const data = await companyFormData(brand.id);
  return (
    <Page>
      <BackLink href={`/m/${brand.slug}/prospects`} label="Prospects" />
      <PageHeader title="Nouveau prospect" description={brand.name} />
      <Card>
        <CardContent>
          <CompanyForm
            action={saveCompany.bind(null, brand.id, null)}
            defaults={companyDefaults(null, ctx.userId)}
            sectors={data.sectors}
            sources={data.sources}
            statuses={data.statuses}
            owners={data.members}
            canAssign={can(ctx.access, "opportunities.manage_all", brand.id)}
            fields={data.fields}
            members={data.members}
            submitLabel="Créer"
          />
        </CardContent>
      </Card>
    </Page>
  );
}

export function CompanyDetailPage({ params }: { params: ParamsWithId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <CompanyDetail slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

async function CompanyDetail({ slug, id }: { slug: string; id: string }) {
  const { ctx, brand } = await loadBrand(slug, "crm");
  if (!UUID.test(id) || !can(ctx.access, "crm.read", brand.id)) notFound();
  const company = await getCompany(brand.id, id);
  if (!company) notFound();

  const canManage = can(ctx.access, "crm.manage", brand.id);
  const opps = ownedAccess(ctx.access, OPPORTUNITY_PERMISSIONS, brand.id);
  const contractsAccess = ownedAccess(ctx.access, CONTRACT_PERMISSIONS, brand.id);
  const enabled = (m: ModuleKey) => brand.enabledModules.includes(m);
  const noFilters = { archived: false } as const;

  const [data, contacts, interactions, opportunities, offers, memos, contracts] = await Promise.all([
    companyFormData(brand.id),
    listContacts(brand.id, company.id),
    listInteractions(brand.id, { companyId: company.id }),
    opps.canRead ? listOpportunities(brand.id, { ...noFilters, companyId: company.id }) : Promise.resolve([]),
    enabled("offers") ? listDocuments("offer", brand.id, { companyId: company.id }) : Promise.resolve([]),
    enabled("memos") ? listDocuments("memo", brand.id, { companyId: company.id }) : Promise.resolve([]),
    enabled("contracts") && contractsAccess.canRead
      ? listContracts(brand.id, { ...noFilters, companyId: company.id })
      : Promise.resolve([]),
  ]);
  const labels = new Map(data.members.map((m) => [m.id, m.label]));
  const sectorLabel = data.sectors.find((s) => s.id === company.sector)?.label;
  const sourceLabel = data.sources.find((s) => s.id === company.source)?.label;
  const documents = [...offers, ...memos];
  const base = `/m/${brand.slug}`;

  return (
    <Page>
      <BackLink href={`${base}/prospects`} label="Prospects" />
      <PageHeader title={company.name} description={[company.city, company.country].filter(Boolean).join(", ") || brand.name}>
        <div className="flex flex-wrap items-center gap-2">
          {company.status && <StatusBadge label={company.status.label} color={company.status.color} />}
          {company.archivedAt && <Badge variant="secondary">Archivé</Badge>}
          {canManage && (
            <ActionButton action={setCompanyArchived.bind(null, brand.id, company.id, !company.archivedAt)} variant="ghost">
              {company.archivedAt ? "Restaurer" : "Archiver"}
            </ActionButton>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Fiche</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Details
                rows={[
                  ["Responsable", (company.ownerId && labels.get(company.ownerId)) ?? "—"],
                  ["Secteur", sectorLabel ?? "—"],
                  ["Source", sourceLabel ?? "—"],
                  ["Téléphone", company.phone ?? "—"],
                  ["E-mail", company.email ?? "—"],
                  ["Site web", company.website ?? "—"],
                  ["Prochaine relance", formatDate(company.nextFollowUpOn)],
                  ...customRows(data.fields, company.custom, labels),
                ]}
              />
              {canManage && (
                <EditDetails label="Modifier la fiche">
                  <CompanyForm
                    action={saveCompany.bind(null, brand.id, company.id)}
                    defaults={companyDefaults(company, ctx.userId)}
                    sectors={data.sectors}
                    sources={data.sources}
                    statuses={data.statuses}
                    owners={data.members}
                    canAssign={can(ctx.access, "opportunities.manage_all", brand.id)}
                    fields={data.fields}
                    members={data.members}
                    customValues={company.custom}
                    submitLabel="Enregistrer"
                  />
                </EditDetails>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Échanges</CardTitle>
              <CardDescription>Historique des appels, e-mails, rendez-vous et notes.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {canManage && (
                <InteractionForm
                  action={addInteraction.bind(null, brand.id, company.id, null)}
                  contacts={contacts.map((c) => ({ id: c.id, label: c.fullName }))}
                  now={nowLocal()}
                />
              )}
              <InteractionList
                interactions={interactions}
                labels={labels}
                userId={ctx.userId}
                deleteAction={(interactionId) => deleteInteraction.bind(null, brand.id, interactionId)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contacts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col divide-y">
                {contacts.length === 0 && <li className="py-2 text-sm text-muted-foreground">Aucun contact.</li>}
                {contacts.map((c) => (
                  <li key={c.id} className="flex flex-col gap-1 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{c.fullName}</span>
                        <span className="text-xs text-muted-foreground">
                          {[c.jobTitle, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                      {canManage && (
                        <ActionButton action={archiveContact.bind(null, brand.id, c.id)} variant="ghost">
                          Retirer
                        </ActionButton>
                      )}
                    </div>
                    {canManage && (
                      <EditDetails>
                        <ContactForm
                          action={saveContact.bind(null, brand.id, company.id, c.id)}
                          defaults={{ fullName: c.fullName, jobTitle: c.jobTitle ?? "", email: c.email ?? "", phone: c.phone ?? "" }}
                          submitLabel="Enregistrer"
                        />
                      </EditDetails>
                    )}
                  </li>
                ))}
              </ul>
              {canManage && <ContactForm action={saveContact.bind(null, brand.id, company.id, null)} submitLabel="Ajouter le contact" />}
            </CardContent>
          </Card>

          {opps.canRead && (
            <LinkedCard
              title="Opportunités"
              empty="Aucune opportunité."
              action={opps.canCreate ? { href: `${base}/opportunites/nouvelle?entreprise=${company.id}`, label: "Nouvelle" } : undefined}
              items={opportunities.map((o) => ({
                href: `${base}/opportunites/${o.id}`,
                title: o.title,
                detail: formatMoney(o.amount, o.currency),
              }))}
            />
          )}
          {documents.length > 0 && (
            <LinkedCard
              title="Offres et mémos"
              empty=""
              items={documents.map((d) => ({
                href: `${base}/${d.kind === "offer" ? "offres" : "memos"}/${d.id}`,
                title: `${d.reference} · ${d.subject}`,
                detail: d.status.label,
              }))}
            />
          )}
          {enabled("contracts") && contractsAccess.canRead && (
            <LinkedCard
              title="Contrats"
              empty="Aucun contrat."
              items={contracts.map((c) => ({
                href: `${base}/contrats/${c.id}`,
                title: c.title,
                detail: `${formatMoney(c.amount, c.currency)} · ${formatDate(c.signedOn)}`,
              }))}
            />
          )}
        </div>
      </div>
    </Page>
  );
}

function LinkedCard({
  title,
  items,
  empty,
  action,
}: {
  title: string;
  items: { href: string; title: string; detail: string }[];
  empty: string;
  action?: { href: string; label: string };
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {action && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={action.href} />}>
              <Plus />
              {action.label}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {items.length === 0 && <li className="py-2 text-sm text-muted-foreground">{empty}</li>}
          {items.map((item) => (
            <li key={item.href} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <Link href={item.href} className="text-sm underline-offset-4 hover:underline">
                {item.title}
              </Link>
              <span className="text-xs text-muted-foreground">{item.detail}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Opportunités
// =====================================================================

export function OpportunitiesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Opportunities slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function Opportunities({ slug, query }: { slug: string; query: Record<string, string | string[] | undefined> }) {
  const { ctx, brand } = await loadBrand(slug, "crm");
  const access = ownedAccess(ctx.access, OPPORTUNITY_PERMISSIONS, brand.id);
  if (!access.canRead) return <Forbidden />;
  const filters = parseCrmFilters(query);
  const [opportunities, stages, members] = await Promise.all([
    listOpportunities(brand.id, filters),
    getStages(brand.id),
    getMemberOptions(brand.id),
  ]);
  const owners = new Map(members.map((m) => [m.id, m.label]));
  const base = `/m/${brand.slug}/opportunites`;
  const today = todayIso();
  const rates = await getFxRates();
  const target = brand.reportingCurrency as Currency;
  const columns = stages.filter((s) => s.isActive || opportunities.some((o) => o.stageId === s.id));
  const moveOptions = stages.filter((s) => s.isActive).map((s) => ({ id: s.id, label: s.label }));

  // Pipeline pondéré : Σ montant × probabilité de l'étape, sur les étapes en cours.
  const openStages = new Map(stages.filter((s) => s.category === "open").map((s) => [s.id, s.probability]));
  const weighted = sumInCurrency(
    opportunities
      .filter((o) => openStages.has(o.stageId))
      .map((o) => ({ amount: o.amount === null ? null : (o.amount * (openStages.get(o.stageId) ?? 0)) / 100, currency: o.currency })),
    target,
    today,
    rates,
  );

  return (
    <Page>
      <PageHeader
        title="Opportunités"
        description={`${brand.name} · pipeline pondéré : ${formatMoney(weighted.total, target)}${weighted.excluded ? ` (hors ${weighted.excluded} montant(s) sans taux de change)` : ""}${access.readAll ? "" : " · vos opportunités"}`}
      >
        {access.canCreate && (
          <Button nativeButton={false} render={<Link href={`${base}/nouvelle`} />}>
            <Plus />
            Nouvelle opportunité
          </Button>
        )}
      </PageHeader>
      <CrmFiltersBar
        action={base}
        filters={filters}
        owners={access.readAll ? toOptions(members) : null}
        searchPlaceholder="Intitulé de l'opportunité"
      />
      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((stage) => {
          const items = opportunities.filter((o) => o.stageId === stage.id);
          const total = sumInCurrency(items, target, today, rates);
          return (
            <section key={stage.id} aria-label={stage.label} className="flex w-72 shrink-0 flex-col gap-3 rounded-xl bg-muted/50 p-3">
              <header className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{stage.label}</h2>
                  <Badge variant="outline">{items.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(total.total, target)} · {stage.probability} %
                </p>
              </header>
              {items.map((o) => (
                <article key={o.id} className="flex flex-col gap-2 rounded-lg border bg-background p-3">
                  <Link href={`${base}/${o.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                    {o.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {o.companyName} · {owners.get(o.ownerId) ?? "—"}
                  </p>
                  <p className="text-xs">
                    {formatMoney(o.amount, o.currency)}
                    {o.expectedCloseOn && ` · ${formatDate(o.expectedCloseOn)}`}
                  </p>
                  {access.canManage(o.ownerId, ctx.userId) && !o.archivedAt && (
                    <MoveStageForm action={moveOpportunity.bind(null, brand.id, o.id)} stages={moveOptions} current={o.stageId} />
                  )}
                </article>
              ))}
              {items.length === 0 && <p className="text-xs text-muted-foreground">Aucune opportunité.</p>}
            </section>
          );
        })}
      </div>
    </Page>
  );
}

async function opportunityFormData(brandId: string) {
  const [companies, contacts, stages, sources, members, fields] = await Promise.all([
    getCompanyOptions(brandId),
    listContacts(brandId),
    getStages(brandId),
    getListItems(brandId, "lead_sources"),
    getMemberOptions(brandId),
    getCustomFields(brandId, "opportunity"),
  ]);
  return {
    companies: companies.map((c) => ({ id: c.id, label: c.name })),
    contacts: contacts.map((c) => ({ id: c.id, label: c.fullName, companyId: c.companyId })),
    stages,
    sources,
    members: toOptions(members),
    fields,
  };
}

function opportunityDefaults(o: OpportunityRow | null, userId: string, firstStage: string, companyId = ""): OpportunityDefaults {
  return {
    companyId: o?.companyId ?? companyId,
    contactId: o?.contactId ?? "",
    title: o?.title ?? "",
    stageId: o?.stageId ?? firstStage,
    amount: o?.amount !== null && o?.amount !== undefined ? String(o.amount) : "",
    currency: o?.currency ?? "XOF",
    expectedCloseOn: o?.expectedCloseOn ?? "",
    source: o?.source ?? "",
    lostReason: o?.lostReason ?? "",
    ownerId: o?.ownerId ?? userId,
  };
}

export function NewOpportunityPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <NewOpportunity slug={brand} companyId={typeof query.entreprise === "string" ? query.entreprise : ""} />
      ))}
    </Suspense>
  );
}

async function NewOpportunity({ slug, companyId }: { slug: string; companyId: string }) {
  const { ctx, brand } = await loadBrand(slug, "crm");
  const access = ownedAccess(ctx.access, OPPORTUNITY_PERMISSIONS, brand.id);
  if (!access.canCreate) return <Forbidden />;
  const data = await opportunityFormData(brand.id);
  const activeStages = data.stages.filter((s) => s.isActive);
  const firstOpen = activeStages.find((s) => s.category === "open")?.id ?? "";
  const prefill = data.companies.some((c) => c.id === companyId) ? companyId : "";

  return (
    <Page>
      <BackLink href={`/m/${brand.slug}/opportunites`} label="Opportunités" />
      <PageHeader title="Nouvelle opportunité" description={brand.name} />
      <Card>
        <CardContent>
          <OpportunityForm
            action={saveOpportunity.bind(null, brand.id, null)}
            defaults={opportunityDefaults(null, ctx.userId, firstOpen, prefill)}
            companies={data.companies}
            contacts={data.contacts}
            stages={activeStages.map((s) => ({ id: s.id, label: s.label }))}
            sources={data.sources}
            owners={data.members}
            canAssign={access.canAssign}
            fields={data.fields}
            members={data.members}
            submitLabel="Créer"
          />
        </CardContent>
      </Card>
    </Page>
  );
}

export function OpportunityDetailPage({ params }: { params: ParamsWithId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <OpportunityDetail slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

async function OpportunityDetail({ slug, id }: { slug: string; id: string }) {
  const { ctx, brand } = await loadBrand(slug, "crm");
  if (!UUID.test(id)) notFound();
  const opportunity = await getOpportunity(brand.id, id);
  if (!opportunity) notFound();
  const access = ownedAccess(ctx.access, OPPORTUNITY_PERMISSIONS, brand.id);
  const canManage = access.canManage(opportunity.ownerId, ctx.userId);
  const canLog = can(ctx.access, "crm.manage", brand.id);
  const base = `/m/${brand.slug}`;

  const [data, interactions, contracts] = await Promise.all([
    opportunityFormData(brand.id),
    listInteractions(brand.id, { opportunityId: opportunity.id }),
    brand.enabledModules.includes("contracts") && ownedAccess(ctx.access, CONTRACT_PERMISSIONS, brand.id).canRead
      ? listContracts(brand.id, { archived: false, companyId: opportunity.companyId })
      : Promise.resolve([] as ContractRow[]),
  ]);
  const labels = new Map(data.members.map((m) => [m.id, m.label]));
  const stage = data.stages.find((s) => s.id === opportunity.stageId);
  const stageChoices = data.stages
    .filter((s) => s.isActive || s.id === opportunity.stageId)
    .map((s) => ({ id: s.id, label: s.isActive ? s.label : `${s.label} (désactivée)` }));
  const linkedContracts = contracts.filter((c) => c.opportunityId === opportunity.id);

  return (
    <Page>
      <BackLink href={`${base}/opportunites`} label="Opportunités" />
      <PageHeader title={opportunity.title} description={opportunity.companyName}>
        <div className="flex flex-wrap items-center gap-2">
          {stage && <Badge variant="outline">{stage.label}</Badge>}
          {opportunity.archivedAt && <Badge variant="secondary">Archivée</Badge>}
          {canManage && (
            <ActionButton
              action={setOpportunityArchived.bind(null, brand.id, opportunity.id, !opportunity.archivedAt)}
              variant="ghost"
            >
              {opportunity.archivedAt ? "Restaurer" : "Archiver"}
            </ActionButton>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Fiche</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Details
                rows={[
                  ["Entreprise", <Link key="c" href={`${base}/prospects/${opportunity.companyId}`} className="underline-offset-4 hover:underline">{opportunity.companyName}</Link>],
                  ["Contact", data.contacts.find((c) => c.id === opportunity.contactId)?.label ?? "—"],
                  ["Commercial responsable", labels.get(opportunity.ownerId) ?? "—"],
                  ["Montant estimé", formatMoney(opportunity.amount, opportunity.currency)],
                  ["Probabilité", stage ? `${stage.probability} %` : "—"],
                  ["Signature espérée le", formatDate(opportunity.expectedCloseOn)],
                  ["Clôturée le", formatDate(opportunity.closedOn)],
                  ["Source", data.sources.find((s) => s.id === opportunity.source)?.label ?? "—"],
                  ...(opportunity.lostReason ? ([["Motif de perte", opportunity.lostReason]] as [string, string][]) : []),
                  ...customRows(data.fields, opportunity.custom, labels),
                ]}
              />
              {canManage && (
                <EditDetails label="Modifier l'opportunité">
                  <OpportunityForm
                    action={saveOpportunity.bind(null, brand.id, opportunity.id)}
                    defaults={opportunityDefaults(opportunity, ctx.userId, opportunity.stageId)}
                    companies={data.companies}
                    contacts={data.contacts}
                    stages={stageChoices}
                    sources={data.sources}
                    owners={data.members}
                    canAssign={access.canAssign}
                    fields={data.fields}
                    members={data.members}
                    customValues={opportunity.custom}
                    submitLabel="Enregistrer"
                  />
                </EditDetails>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Échanges</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {canLog && (
                <InteractionForm
                  action={addInteraction.bind(null, brand.id, opportunity.companyId, opportunity.id)}
                  contacts={data.contacts.filter((c) => c.companyId === opportunity.companyId)}
                  now={nowLocal()}
                />
              )}
              <InteractionList
                interactions={interactions}
                labels={labels}
                userId={ctx.userId}
                deleteAction={(interactionId) => deleteInteraction.bind(null, brand.id, interactionId)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {brand.enabledModules.includes("contracts") && (
            <LinkedCard
              title="Contrats"
              empty="Aucun contrat lié."
              action={
                ownedAccess(ctx.access, CONTRACT_PERMISSIONS, brand.id).canCreate
                  ? { href: `${base}/contrats/nouveau?opportunite=${opportunity.id}`, label: "Enregistrer" }
                  : undefined
              }
              items={linkedContracts.map((c) => ({
                href: `${base}/contrats/${c.id}`,
                title: c.title,
                detail: `${formatMoney(c.amount, c.currency)} · ${formatDate(c.signedOn)}`,
              }))}
            />
          )}
        </div>
      </div>
    </Page>
  );
}

// =====================================================================
// Contrats
// =====================================================================

export function ContractsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Contracts slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function Contracts({ slug, query }: { slug: string; query: Record<string, string | string[] | undefined> }) {
  const { ctx, brand } = await loadBrand(slug, "contracts");
  const access = ownedAccess(ctx.access, CONTRACT_PERMISSIONS, brand.id);
  if (!access.canRead) return <Forbidden />;
  const filters = parseCrmFilters(query);
  const [contracts, members, rates] = await Promise.all([listContracts(brand.id, filters), getMemberOptions(brand.id), getFxRates()]);
  const owners = new Map(members.map((m) => [m.id, m.label]));
  const base = `/m/${brand.slug}/contrats`;
  const target = brand.reportingCurrency as Currency;
  const total = sumInCurrency(
    contracts.map((c) => ({ amount: c.amount, currency: c.currency, date: c.signedOn })),
    target,
    todayIso(),
    rates,
  );

  return (
    <Page>
      <PageHeader
        title="Contrats signés"
        description={`${brand.name} · ${contracts.length} contrat(s) · ${formatMoney(total.total, target)}${total.excluded ? ` (hors ${total.excluded} montant(s) sans taux de change)` : ""}${access.readAll ? "" : " · vos contrats"}`}
      >
        {access.canCreate && (
          <Button nativeButton={false} render={<Link href={`${base}/nouveau`} />}>
            <Plus />
            Enregistrer un contrat
          </Button>
        )}
      </PageHeader>
      <CrmFiltersBar action={base} filters={filters} owners={access.readAll ? toOptions(members) : null} searchPlaceholder="Intitulé du contrat" />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrat</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead>Commercial</TableHead>
                <TableHead>Signé le</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Offre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Aucun contrat ne correspond.
                  </TableCell>
                </TableRow>
              )}
              {contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`${base}/${c.id}`} className="underline-offset-4 hover:underline">
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell>{c.companyName}</TableCell>
                  <TableCell>{owners.get(c.ownerId) ?? "—"}</TableCell>
                  <TableCell>{formatDate(c.signedOn)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(c.amount, c.currency)}</TableCell>
                  <TableCell>{c.offerReference ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Page>
  );
}

async function contractFormData(brandId: string) {
  const [companies, opportunities, offers, members, fields] = await Promise.all([
    getCompanyOptions(brandId),
    listOpportunities(brandId, { archived: false }),
    getOfferOptions(brandId),
    getMemberOptions(brandId),
    getCustomFields(brandId, "contract"),
  ]);
  return {
    companies: companies.map((c) => ({ id: c.id, label: c.name })),
    opportunities: opportunities.map((o) => ({ id: o.id, label: o.title, companyId: o.companyId })),
    offers,
    members: toOptions(members),
    fields,
  };
}

function contractDefaults(c: ContractRow | null, userId: string, currency: string, prefill?: OpportunityRow | null): ContractDefaults {
  return {
    companyId: c?.companyId ?? prefill?.companyId ?? "",
    opportunityId: c?.opportunityId ?? prefill?.id ?? "",
    offerId: c?.offerId ?? "",
    title: c?.title ?? prefill?.title ?? "",
    signedOn: c?.signedOn ?? todayIso(),
    amount: c ? String(c.amount) : prefill?.amount != null ? String(prefill.amount) : "",
    currency: c?.currency ?? prefill?.currency ?? currency,
    startOn: c?.startOn ?? "",
    endOn: c?.endOn ?? "",
    comments: c?.comments ?? "",
    ownerId: c?.ownerId ?? prefill?.ownerId ?? userId,
  };
}

export function NewContractPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <NewContract slug={brand} opportunityId={typeof query.opportunite === "string" ? query.opportunite : ""} />
      ))}
    </Suspense>
  );
}

async function NewContract({ slug, opportunityId }: { slug: string; opportunityId: string }) {
  const { ctx, brand } = await loadBrand(slug, "contracts");
  const access = ownedAccess(ctx.access, CONTRACT_PERMISSIONS, brand.id);
  if (!access.canCreate) return <Forbidden />;
  const [data, prefill] = await Promise.all([
    contractFormData(brand.id),
    UUID.test(opportunityId) ? getOpportunity(brand.id, opportunityId) : Promise.resolve(null),
  ]);

  return (
    <Page>
      <BackLink href={`/m/${brand.slug}/contrats`} label="Contrats signés" />
      <PageHeader title="Enregistrer un contrat signé" description={brand.name} />
      <Card>
        <CardContent>
          <ContractForm
            action={saveContract.bind(null, brand.id, null)}
            defaults={contractDefaults(null, ctx.userId, brand.reportingCurrency, prefill)}
            companies={data.companies}
            opportunities={data.opportunities}
            offers={data.offers}
            owners={data.members}
            canAssign={access.canAssign}
            fields={data.fields}
            members={data.members}
            submitLabel="Enregistrer"
          />
        </CardContent>
      </Card>
    </Page>
  );
}

export function ContractDetailPage({ params }: { params: ParamsWithId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <ContractDetail slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

async function ContractDetail({ slug, id }: { slug: string; id: string }) {
  const { ctx, brand } = await loadBrand(slug, "contracts");
  if (!UUID.test(id)) notFound();
  const contract = await getContract(brand.id, id);
  if (!contract) notFound();
  const access = ownedAccess(ctx.access, CONTRACT_PERMISSIONS, brand.id);
  const canManage = access.canManage(contract.ownerId, ctx.userId);
  const data = await contractFormData(brand.id);
  const labels = new Map(data.members.map((m) => [m.id, m.label]));
  const base = `/m/${brand.slug}`;

  return (
    <Page>
      <BackLink href={`${base}/contrats`} label="Contrats signés" />
      <PageHeader title={contract.title} description={`${contract.companyName} · signé le ${formatDate(contract.signedOn)}`}>
        <div className="flex flex-wrap items-center gap-2">
          {contract.archivedAt && <Badge variant="secondary">Archivé</Badge>}
          {canManage && (
            <ActionButton action={setContractArchived.bind(null, brand.id, contract.id, !contract.archivedAt)} variant="ghost">
              {contract.archivedAt ? "Restaurer" : "Archiver"}
            </ActionButton>
          )}
        </div>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Fiche</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Details
            rows={[
              ["Entreprise", <Link key="c" href={`${base}/prospects/${contract.companyId}`} className="underline-offset-4 hover:underline">{contract.companyName}</Link>],
              ["Commercial responsable", labels.get(contract.ownerId) ?? "—"],
              ["Montant", formatMoney(contract.amount, contract.currency)],
              ["Date de signature", formatDate(contract.signedOn)],
              ["Début", formatDate(contract.startOn)],
              ["Fin", formatDate(contract.endOn)],
              ["Opportunité", data.opportunities.find((o) => o.id === contract.opportunityId)?.label ?? "—"],
              ["Offre", contract.offerReference ?? "—"],
              ...customRows(data.fields, contract.custom, labels),
            ]}
          />
          {contract.comments && <p className="text-sm whitespace-pre-line">{contract.comments}</p>}
          {canManage && (
            <EditDetails label="Modifier le contrat">
              <ContractForm
                action={saveContract.bind(null, brand.id, contract.id)}
                defaults={contractDefaults(contract, ctx.userId, brand.reportingCurrency)}
                companies={data.companies}
                opportunities={data.opportunities}
                offers={data.offers}
                owners={data.members}
                canAssign={access.canAssign}
                fields={data.fields}
                members={data.members}
                customValues={contract.custom}
                submitLabel="Enregistrer"
              />
            </EditDetails>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
