import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Plus } from "lucide-react";
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
import { getCustomFields } from "@/features/custom-fields/queries";
import type { FieldDefinition } from "@/features/custom-fields/types";
import { ActionButton, EditDetails } from "@/features/settings/components/controls";
import { addDays, formatDate, formatMoney, todayIso } from "@/lib/format";
import { findBrand, getAuthContext, type BrandSummary } from "@/server/authz/context";
import {
  addComment,
  completeFollowUp,
  deleteAttachment,
  saveDocument,
  setDocumentArchived,
  uploadAttachment,
} from "./actions";
import {
  canAssignOwner,
  canCreateDocument,
  canManageDocument,
  canReadAll,
  canReadRegister,
  REGISTERS,
  type RegisterKind,
} from "./config";
import { DocumentForm, type DocumentFormDefaults } from "./components/document-form";
import { AttachmentsPanel, CommentForm, FollowUpForm } from "./components/document-panels";
import { FiltersBar } from "./components/filters-bar";
import { FollowUpBadge, StatusBadge } from "./components/status-badge";
import { Timeline } from "./components/timeline";
import { filtersToQuery, followUpState, isExpired, parseFilters } from "./filters";
import {
  getCompanyOptions,
  getDocument,
  getDocumentAttachments,
  getDocumentEvents,
  getMemberOptions,
  getStatusOptions,
  LIST_LIMIT,
  listDocuments,
  type DocumentRow,
} from "./queries";

type SearchParams = Record<string, string | string[] | undefined>;

/** Marque et module : la page n'existe que si la marque est accessible et le module activé. */
async function loadRegister(kind: RegisterKind, slug: string) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes(REGISTERS[kind].module)) notFound();
  return { ctx, brand };
}

function basePath(brand: BrandSummary, kind: RegisterKind) {
  return `/m/${brand.slug}/${REGISTERS[kind].path}`;
}

// ---------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------

export function RegisterListPage({
  kind,
  params,
  searchParams,
}: {
  kind: RegisterKind;
  params: Promise<{ brand: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <RegisterList kind={kind} slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function RegisterList({ kind, slug, query }: { kind: RegisterKind; slug: string; query: SearchParams }) {
  const { ctx, brand } = await loadRegister(kind, slug);
  if (!canReadRegister(ctx.access, kind, brand.id)) return <Forbidden />;

  const config = REGISTERS[kind];
  const filters = parseFilters(query);
  const readAll = canReadAll(ctx.access, kind, brand.id);
  const [rows, statuses, members] = await Promise.all([
    listDocuments(kind, brand.id, filters),
    getStatusOptions(brand.id, kind),
    getMemberOptions(brand.id),
  ]);
  const owners = new Map(members.map((m) => [m.id, m.label]));
  const base = basePath(brand, kind);
  const today = todayIso();

  return (
    <Page>
      <PageHeader
        title={config.plural}
        description={`${brand.name} · ${rows.length} document${rows.length > 1 ? "s" : ""}${readAll ? "" : " · vos documents uniquement"}`}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`${base}/export${filtersToQuery(filters)}`} />}
          >
            <Download />
            Exporter (Excel)
          </Button>
          {canCreateDocument(ctx.access, kind, brand.id) && (
            <Button nativeButton={false} render={<Link href={`${base}/${config.newPath}`} />}>
              <Plus />
              {config.newLabel}
            </Button>
          )}
        </div>
      </PageHeader>

      <FiltersBar
        action={base}
        filters={filters}
        statuses={statuses.map((s) => ({ id: s.id, label: s.label }))}
        owners={readAll ? members.map((m) => ({ id: m.id, label: m.label })) : null}
      />

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead>Objet</TableHead>
                <TableHead>Commercial</TableHead>
                {kind === "offer" && <TableHead className="text-right">Montant</TableHead>}
                <TableHead>Statut</TableHead>
                <TableHead>Envoi</TableHead>
                <TableHead>{config.followUpLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    Aucun document ne correspond.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const followUp = followUpState(row.followUpOn, row.status.category, today);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <Link href={`${base}/${row.id}`} className="underline-offset-4 hover:underline">
                        {row.reference}
                      </Link>
                    </TableCell>
                    <TableCell>{row.company.name}</TableCell>
                    <TableCell className="max-w-64 truncate" title={row.subject}>
                      {row.subject}
                    </TableCell>
                    <TableCell>{owners.get(row.ownerId) ?? "—"}</TableCell>
                    {kind === "offer" && (
                      <TableCell className="text-right tabular-nums">{formatMoney(row.amount, row.currency)}</TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge label={row.status.label} color={row.status.color} />
                        {kind === "offer" && isExpired(row.validUntil, row.status.category, today) && (
                          <Badge variant="secondary">Expirée</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(row.sentOn)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {formatDate(row.followUpOn)}
                        <FollowUpBadge state={followUp} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rows.length === LIST_LIMIT && (
            <p className="mt-3 text-xs text-muted-foreground">
              Affichage limité aux {LIST_LIMIT} documents les plus récents : affinez les filtres.
            </p>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------------
// Formulaire (création et modification)
// ---------------------------------------------------------------------

async function loadFormData(kind: RegisterKind, brandId: string) {
  const [companies, statuses, members, fields] = await Promise.all([
    getCompanyOptions(brandId),
    getStatusOptions(brandId, kind),
    getMemberOptions(brandId),
    getCustomFields(brandId, kind),
  ]);
  return { companies, statuses, members, fields };
}

export function RegisterNewPage({ kind, params }: { kind: RegisterKind; params: Promise<{ brand: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <RegisterNew kind={kind} slug={brand} />
      ))}
    </Suspense>
  );
}

async function RegisterNew({ kind, slug }: { kind: RegisterKind; slug: string }) {
  const { ctx, brand } = await loadRegister(kind, slug);
  if (!canCreateDocument(ctx.access, kind, brand.id)) return <Forbidden />;

  const config = REGISTERS[kind];
  const data = await loadFormData(kind, brand.id);
  const defaults: DocumentFormDefaults = {
    companyId: "",
    contactName: "",
    contactEmail: "",
    ownerId: ctx.userId,
    subject: "",
    issuedOn: todayIso(),
    sentOn: "",
    statusId: data.statuses.find((s) => s.isDefault)?.id ?? data.statuses[0]?.id ?? "",
    followUpOn: "",
    comments: "",
    amount: "",
    currency: brand.reportingCurrency,
    validUntil: "",
    recipientResponse: "",
  };

  return (
    <Page>
      <BackLink href={basePath(brand, kind)} label={config.plural} />
      <PageHeader title={config.newLabel} description={`${brand.name} · la référence est attribuée à l'enregistrement.`} />
      <Card>
        <CardContent>
          <DocumentForm
            kind={kind}
            action={saveDocument.bind(null, kind, brand.id, null)}
            defaults={defaults}
            companies={data.companies.map((c) => ({ id: c.id, label: c.name }))}
            statuses={data.statuses.map((s) => ({ id: s.id, label: s.label }))}
            owners={data.members.map((m) => ({ id: m.id, label: m.label }))}
            canAssign={canAssignOwner(ctx.access, kind, brand.id)}
            fields={data.fields}
            members={data.members.map((m) => ({ id: m.id, label: m.label }))}
            labels={{ issued: config.issuedLabel, followUp: config.followUpLabel }}
            submitLabel="Créer"
          />
        </CardContent>
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------------
// Fiche détaillée
// ---------------------------------------------------------------------

export function RegisterDetailPage({
  kind,
  params,
}: {
  kind: RegisterKind;
  params: Promise<{ brand: string; id: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <RegisterDetail kind={kind} slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function RegisterDetail({ kind, slug, id }: { kind: RegisterKind; slug: string; id: string }) {
  const { ctx, brand } = await loadRegister(kind, slug);
  if (!UUID.test(id)) notFound();
  const document = await getDocument(kind, brand.id, id);
  if (!document) notFound();

  const config = REGISTERS[kind];
  const canManage = canManageDocument(ctx.access, kind, brand.id, document.ownerId, ctx.userId);
  const [events, attachments, data] = await Promise.all([
    getDocumentEvents(document.id),
    getDocumentAttachments(document.id),
    loadFormData(kind, brand.id),
  ]);
  const labels = new Map(data.members.map((m) => [m.id, m.label]));
  const today = todayIso();
  const followUp = followUpState(document.followUpOn, document.status.category, today);

  return (
    <Page>
      <BackLink href={basePath(brand, kind)} label={config.plural} />
      <PageHeader title={document.reference} description={document.subject}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={document.status.label} color={document.status.color} />
          <FollowUpBadge state={followUp} />
          {kind === "offer" && isExpired(document.validUntil, document.status.category, today) && (
            <Badge variant="secondary">Expirée</Badge>
          )}
          {document.archivedAt && <Badge variant="secondary">Archivé</Badge>}
          {canManage && (
            <ActionButton
              action={setDocumentArchived.bind(null, kind, brand.id, document.id, !document.archivedAt)}
              variant="ghost"
            >
              {document.archivedAt ? "Restaurer" : "Archiver"}
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
            <CardContent>
              <DocumentDetails document={document} kind={kind} owner={labels.get(document.ownerId)} fields={data.fields} labels={labels} />
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardContent>
                <EditDetails label="Modifier la fiche">
                  <DocumentForm
                    kind={kind}
                    action={saveDocument.bind(null, kind, brand.id, document.id)}
                    defaults={toDefaults(document)}
                    companies={data.companies.map((c) => ({ id: c.id, label: c.name }))}
                    statuses={statusChoices(data.statuses, document)}
                    owners={data.members.map((m) => ({ id: m.id, label: m.label }))}
                    canAssign={canAssignOwner(ctx.access, kind, brand.id)}
                    fields={data.fields}
                    members={data.members.map((m) => ({ id: m.id, label: m.label }))}
                    labels={{ issued: config.issuedLabel, followUp: config.followUpLabel }}
                    submitLabel="Enregistrer"
                    customValues={document.custom}
                  />
                </EditDetails>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Historique</CardTitle>
              <CardDescription>Envois, relances, changements de statut et commentaires.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {canManage && <CommentForm action={addComment.bind(null, kind, brand.id, document.id)} />}
              <Timeline events={events} actorLabels={labels} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {canManage && !document.archivedAt && (
            <Card>
              <CardHeader>
                <CardTitle>Relance</CardTitle>
                <CardDescription>
                  {document.followUpOn
                    ? `Prévue le ${formatDate(document.followUpOn)}.`
                    : "Aucune relance prévue."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FollowUpForm
                  action={completeFollowUp.bind(null, kind, brand.id, document.id)}
                  suggestedDate={addDays(today, 7)}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Pièces jointes</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentsPanel
                attachments={attachments}
                canManage={canManage}
                uploadAction={uploadAttachment.bind(null, kind, brand.id, document.id)}
                deleteActions={Object.fromEntries(
                  attachments.map((a) => [a.id, deleteAttachment.bind(null, kind, brand.id, document.id, a.id)]),
                )}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}

/** Le statut actuel reste proposé même s'il a été désactivé depuis. */
function statusChoices(statuses: { id: string; label: string }[], document: DocumentRow) {
  const choices = statuses.map((s) => ({ id: s.id, label: s.label }));
  if (!choices.some((s) => s.id === document.status.id)) {
    choices.unshift({ id: document.status.id, label: `${document.status.label} (désactivé)` });
  }
  return choices;
}

function toDefaults(document: DocumentRow): DocumentFormDefaults {
  return {
    companyId: document.company.id,
    contactName: document.contact?.fullName ?? "",
    contactEmail: document.contact?.email ?? "",
    ownerId: document.ownerId,
    subject: document.subject,
    issuedOn: document.issuedOn,
    sentOn: document.sentOn ?? "",
    statusId: document.status.id,
    followUpOn: document.followUpOn ?? "",
    comments: document.comments ?? "",
    amount: document.amount !== null ? String(document.amount) : "",
    currency: document.currency ?? "XOF",
    validUntil: document.validUntil ?? "",
    recipientResponse: document.recipientResponse ?? "",
  };
}

function DocumentDetails({
  document,
  kind,
  owner,
  fields,
  labels,
}: {
  document: DocumentRow;
  kind: RegisterKind;
  owner?: string;
  fields: FieldDefinition[];
  labels: Map<string, string>;
}) {
  const config = REGISTERS[kind];
  const rows: [string, string][] = [
    ["Entreprise", document.company.name],
    ["Contact", document.contact ? [document.contact.fullName, document.contact.email].filter(Boolean).join(" · ") : "—"],
    ["Commercial responsable", owner ?? "—"],
    [config.issuedLabel, formatDate(document.issuedOn)],
    ["Date d'envoi", formatDate(document.sentOn)],
    [config.followUpLabel, formatDate(document.followUpOn)],
  ];
  if (kind === "offer") {
    rows.push(["Montant", formatMoney(document.amount, document.currency)]);
    rows.push(["Valable jusqu'au", formatDate(document.validUntil)]);
  }
  for (const field of fields) {
    const value = document.custom[field.key];
    if (value === undefined || value === null || value === "") continue;
    rows.push([field.label, formatCustomValue(field, value, labels)]);
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {kind === "memo" && document.recipientResponse && (
        <div>
          <p className="text-xs text-muted-foreground">Réponse du destinataire</p>
          <p className="text-sm whitespace-pre-line">{document.recipientResponse}</p>
        </div>
      )}
      {document.comments && (
        <div>
          <p className="text-xs text-muted-foreground">Commentaires</p>
          <p className="text-sm whitespace-pre-line">{document.comments}</p>
        </div>
      )}
    </div>
  );
}

function formatCustomValue(field: FieldDefinition, value: unknown, labels: Map<string, string>): string {
  const option = (v: unknown) => field.options.find((o) => o.value === v)?.label ?? String(v);
  switch (field.type) {
    case "boolean":
      return value === true ? "Oui" : "Non";
    case "money": {
      const m = value as { amount?: number; currency?: string };
      return formatMoney(m.amount ?? null, m.currency ?? null);
    }
    case "date":
      return formatDate(String(value));
    case "select":
      return option(value);
    case "multiselect":
      return Array.isArray(value) ? value.map(option).join(", ") : "—";
    case "user":
      return labels.get(String(value)) ?? "—";
    case "number":
      return typeof value === "number" ? value.toLocaleString("fr-FR") : String(value);
    default:
      return String(value);
  }
}
