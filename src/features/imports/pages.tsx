import { Download } from "lucide-react";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricTile } from "@/features/activities/view";
import { BackLink } from "@/features/crm/view";
import { getMemberOptions } from "@/features/registers/queries";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/format";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { canImport, importableTargets } from "./access";
import { getHistoryCutover } from "@/features/dashboard/queries";
import { commitBatch, discardBatch, rollbackBatch, saveHistoryCutover, saveMapping, uploadImport } from "./actions";
import { ConfirmAction, CutoverForm, MappingForm, UploadForm } from "./components/forms";
import { checkBatch, readOptions, type LineResult } from "./normalize";
import { findSameFile, getBatch, getImportContext, listBatches, type Batch, type BatchStatus } from "./queries";
import { IMPORT_ACCEPT } from "./read";
import { TARGETS } from "./targets";
import type { Cell } from "./values";

type Params = Promise<{ brand: string }>;
type ParamsWithId = Promise<{ brand: string; id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function loadBrand(slug: string) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes("imports")) notFound();
  return { ctx, brand };
}

const STATUS: Record<BatchStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  uploaded: { label: "À vérifier", variant: "outline" },
  committed: { label: "Importé", variant: "default" },
  rolled_back: { label: "Annulé", variant: "secondary" },
};

function StatusBadge({ status }: { status: BatchStatus }) {
  return <Badge variant={STATUS[status].variant}>{STATUS[status].label}</Badge>;
}

// =====================================================================
// Historique et envoi
// =====================================================================

export function ImportsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <Imports slug={brand} />
      ))}
    </Suspense>
  );
}

async function Imports({ slug }: { slug: string }) {
  const { ctx, brand } = await loadBrand(slug);
  if (!can(ctx.access, "imports.manage", brand.id)) return <Forbidden />;
  const targets = importableTargets(ctx.access, brand);
  const [batches, members, cutover] = await Promise.all([listBatches(brand.id), getMemberOptions(brand.id), getHistoryCutover(brand.id)]);
  const authors = new Map(members.map((m) => [m.id, m.label]));
  const base = `/m/${brand.slug}/imports`;

  return (
    <Page>
      <PageHeader title="Imports" description={`${brand.name} · fichiers CSV et Excel, vérifiés avant import, annulables d'un bloc`} />
      <Card>
        <CardHeader>
          <CardTitle>Nouvel import</CardTitle>
          <CardDescription>
            Le fichier est lu et vérifié avant tout enregistrement : correspondance des colonnes, erreurs et doublons
            vous sont présentés d&apos;abord.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun import possible : activez les modules concernés (réseaux sociaux, campagnes, sites, prospects) ou demandez
              les droits correspondants.
            </p>
          ) : (
            <>
              <UploadForm
                action={uploadImport.bind(null, brand.id)}
                targets={targets.map((t) => ({ key: t, label: TARGETS[t].label, description: TARGETS[t].description }))}
                accept={IMPORT_ACCEPT}
              />
              <div className="mt-6 border-t pt-4">
                <p className="text-sm font-medium">Modèles à remplir</p>
                <p className="text-xs text-muted-foreground">
                  Fichiers Excel dont les colonnes sont reconnues automatiquement, avec les listes de {brand.name} et une aide
                  par colonne.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {targets.map((t) => (
                    <Button key={t} variant="outline" size="sm" nativeButton={false} render={<a href={`${base}/modele/${t}`} download />}>
                      <Download />
                      {TARGETS[t].label}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {can(ctx.access, "modules.manage") && (
        <Card>
          <CardHeader>
            <CardTitle>Historique agrégé : date de bascule</CardTitle>
            <CardDescription>
              Avant cette date, les tableaux de bord et rapports lisent l&apos;historique importé ; à partir d&apos;elle, les données
              saisies dans MAXreport. Jamais les deux sur un même jour. Sans date, seules les données saisies sont lues.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CutoverForm action={saveHistoryCutover.bind(null, brand.id)} cutover={cutover} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
          <CardDescription>Les 100 derniers lots.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Données</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Lignes</TableHead>
                <TableHead className="text-right">Importées</TableHead>
                <TableHead className="text-right">Écartées</TableHead>
                <TableHead>Envoyé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    Aucun import pour le moment.
                  </TableCell>
                </TableRow>
              )}
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link href={`${base}/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                      {b.fileName}
                    </Link>
                  </TableCell>
                  <TableCell>{TARGETS[b.target].label}</TableCell>
                  <TableCell>
                    <StatusBadge status={b.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(b.rowCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(b.insertedCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.skippedCount === null ? "—" : formatNumber((b.skippedCount ?? 0) + (b.errorCount ?? 0))}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDateTime(b.createdAt)}
                    <p className="text-xs text-muted-foreground">{(b.createdBy && authors.get(b.createdBy)) ?? "—"}</p>
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

// =====================================================================
// Un lot : correspondance, aperçu, import, compte rendu, annulation
// =====================================================================

export function BatchPage({ params }: { params: ParamsWithId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <BatchView slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

function cellDisplay(value: Cell): string {
  if (value === null) return "";
  return typeof value === "number" ? String(value).replace(".", ",") : value;
}

async function BatchView({ slug, id }: { slug: string; id: string }) {
  const { ctx, brand } = await loadBrand(slug);
  if (!can(ctx.access, "imports.manage", brand.id)) return <Forbidden />;
  if (!UUID.test(id)) notFound();
  const batch = await getBatch(brand.id, id);
  if (!batch) notFound();
  if (!canImport(ctx.access, brand, batch.target)) return <Forbidden />;

  const members = await getMemberOptions(brand.id);
  const names = new Map(members.map((m) => [m.id, m.label]));
  const config = TARGETS[batch.target];
  const base = `/m/${brand.slug}/imports`;

  return (
    <Page>
      <BackLink href={base} label="Imports" />
      <PageHeader
        title={batch.fileName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {config.label} · {formatNumber(batch.rowCount)} ligne(s) · {formatBytes(batch.fileSize)}
            <StatusBadge status={batch.status} />
          </span>
        }
      />
      {batch.status === "uploaded" ? (
        <PendingBatch batch={batch} brandId={brand.id} />
      ) : (
        <DoneBatch batch={batch} brandId={brand.id} names={names} />
      )}
    </Page>
  );
}

async function PendingBatch({ batch, brandId }: { batch: Batch; brandId: string }) {
  const config = TARGETS[batch.target];
  const options = readOptions(batch.options);
  const firstLine = Number(batch.options.firstLine) || 2;
  const [context, sameFile] = await Promise.all([
    getImportContext(batch.target, brandId),
    findSameFile(brandId, batch.target, batch.fileSha256, batch.id),
  ]);
  const check = checkBatch(batch.target, batch.rows, batch.mapping, options, context, firstLine);
  const missing = config.fields.filter((f) => f.required && batch.mapping[f.key] === undefined);
  const rejected = check.lines.filter((l) => l.status !== "ok");
  const accepted = check.lines.filter((l) => l.status === "ok");
  const parentField = config.fields.find((f) => f.kind === "parent");

  return (
    <>
      {sameFile && (
        <Notice title="Ce fichier a déjà été importé">
          Un lot identique a été importé le {formatDateTime(sameFile.committed_at)}. Les lignes déjà présentes apparaîtront comme
          doublons.
        </Notice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Correspondance des colonnes</CardTitle>
          <CardDescription>
            Proposée d&apos;après les en-têtes (ou reprise du dernier fichier de même format). Les champs marqués * sont obligatoires.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {batch.headers.map((h, i) => (
                    <TableHead key={i} className="whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.rows.slice(0, 3).map((row, r) => (
                  <TableRow key={r}>
                    {batch.headers.map((_, i) => (
                      <TableCell key={i} className="max-w-48 truncate whitespace-nowrap text-muted-foreground">
                        {cellDisplay(row[i] ?? null)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <MappingForm
            action={saveMapping.bind(null, brandId, batch.id)}
            fields={config.fields.map((f) => ({ key: f.key, label: f.label, required: f.required === true }))}
            headers={batch.headers}
            mapping={batch.mapping}
            options={options}
            parents={parentField ? (context.parents ?? []).map((p) => ({ id: p.id, label: p.label })) : undefined}
            parentLabel={parentField?.label}
            showCurrency={config.fields.some((f) => f.kind === "currency")}
            showPeriod={config.fields.some((f) => f.key === "period_end")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Aperçu et import</CardTitle>
          <CardDescription>Rien n&apos;est enregistré avant votre confirmation. L&apos;import se fait d&apos;un bloc et s&apos;annule d&apos;un bloc.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {missing.length > 0 && (
            <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              À associer avant d&apos;importer : {missing.map((f) => f.label).join(", ")}.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <MetricTile label="À importer" value={formatNumber(check.counts.ok)} />
            <MetricTile label="Doublons écartés" value={formatNumber(check.counts.duplicate)} />
            <MetricTile label="Erreurs" value={formatNumber(check.counts.error)} />
          </div>
          {rejected.length > 0 && <LinesTable title="Lignes écartées" lines={rejected.slice(0, 200)} total={rejected.length} />}
          {accepted.length > 0 && <LinesTable title="Lignes à importer (aperçu)" lines={accepted.slice(0, 20)} total={accepted.length} />}
          <div className="flex flex-wrap items-start gap-3">
            <ConfirmAction
              action={commitBatch.bind(null, brandId, batch.id)}
              label={`Importer ${formatNumber(check.counts.ok)} ligne(s)`}
              title={`Importer ${formatNumber(check.counts.ok)} ligne(s) ?`}
              description={`${check.counts.duplicate} doublon(s) et ${check.counts.error} ligne(s) en erreur seront écartés. Vous pourrez annuler cet import d'un bloc.`}
              confirmLabel="Importer"
              disabled={check.counts.ok === 0 || missing.length > 0}
            />
            <ConfirmAction
              action={discardBatch.bind(null, brandId, batch.id)}
              label="Abandonner"
              title="Abandonner ce fichier ?"
              description="Le lot est supprimé sans rien importer."
              confirmLabel="Abandonner"
              destructive
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function LinesTable({ title, lines, total }: { title: string; lines: LineResult[]; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {title}
        {total > lines.length && <span className="font-normal text-muted-foreground"> · {lines.length} sur {total}</span>}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Ligne</TableHead>
            <TableHead>Contenu</TableHead>
            <TableHead>Motif</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.line}>
              <TableCell className="tabular-nums">{l.line}</TableCell>
              <TableCell className="max-w-72 truncate">{l.summary}</TableCell>
              <TableCell>
                {l.status === "ok" ? (
                  <Badge variant="secondary">Prête</Badge>
                ) : (
                  <span className="flex flex-col gap-1">
                    <Badge variant={l.status === "error" ? "destructive" : "outline"} className="w-fit">
                      {l.status === "error" ? "Erreur" : "Doublon"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{l.message}</span>
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DoneBatch({ batch, brandId, names }: { batch: Batch; brandId: string; names: Map<string, string> }) {
  const who = (id: string | null) => (id && names.get(id)) ?? "—";
  const lines = batch.report?.lines ?? [];
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <MetricTile label="Importées" value={formatNumber(batch.insertedCount)} hint={`le ${formatDateTime(batch.committedAt)} par ${who(batch.committedBy)}`} />
        <MetricTile label="Doublons écartés" value={formatNumber(batch.skippedCount)} />
        <MetricTile label="Erreurs écartées" value={formatNumber(batch.errorCount)} />
      </div>
      {batch.status === "rolled_back" ? (
        <Notice title="Import annulé">
          Les lignes de ce lot ont été supprimées le {formatDateTime(batch.rolledBackAt)} par {who(batch.rolledBackBy)}.
        </Notice>
      ) : (
        <div>
          <ConfirmAction
            action={rollbackBatch.bind(null, brandId, batch.id)}
            label="Annuler cet import"
            title="Annuler cet import ?"
            description={`Les ${batch.insertedCount ?? 0} ligne(s) importée(s) par ce lot seront supprimées. Un prospect déjà utilisé (opportunité, offre…) bloque l'annulation.`}
            confirmLabel="Annuler l'import"
            destructive
          />
        </div>
      )}
      {lines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lignes écartées</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Ligne</TableHead>
                  <TableHead>Motif</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.line}>
                    <TableCell className="tabular-nums">{l.line}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "error" ? "destructive" : "outline"} className="mr-2">
                        {l.status === "error" ? "Erreur" : "Doublon"}
                      </Badge>
                      <span className="text-sm">{l.message}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
