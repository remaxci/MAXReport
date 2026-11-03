import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmAction } from "@/features/imports/components/forms";
import { formatDate, formatDateTime } from "@/lib/format";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { createKey, revokeKey } from "./actions";
import { DATASET_GROUPS, DATASETS, findDataset } from "./catalog";
import { KeyForm } from "./components/key-form";
import { availableDatasets, canManageBrandKeys, canManageDirectionKeys, keyStatus, listKeys, type BiKey } from "./keys";

type Params = Promise<{ brand: string }>;

export function BiConnectionPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <BiConnection slug={brand} />
      ))}
    </Suspense>
  );
}

const STATUS = {
  active: { label: "Active", variant: "secondary" },
  expired: { label: "Expirée", variant: "outline" },
  revoked: { label: "Révoquée", variant: "destructive" },
} as const;

/** Adresse publique de l'application (Preview ou production), pour les liens à copier. */
async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function KeyRow({ bi, brandName }: { bi: BiKey; brandName: string }) {
  const status = keyStatus(bi);
  const labels = bi.datasets.map((key) => findDataset(key)?.label ?? key);
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{bi.name}</span>
          <Badge variant={STATUS[status].variant}>{STATUS[status].label}</Badge>
          <Badge variant="outline">{bi.brandId ? brandName : "Direction"}</Badge>
          <span className="font-mono text-xs text-muted-foreground">…{bi.hint}</span>
        </div>
        <span className="text-sm text-muted-foreground">{labels.join(", ")}</span>
        <span className="text-xs text-muted-foreground">
          Créée le {formatDate(bi.createdAt)}
          {bi.createdByName ? ` par ${bi.createdByName}` : ""} ·{" "}
          {status === "revoked" ? `révoquée le ${formatDate(bi.revokedAt)}` : `expire le ${formatDate(bi.expiresAt)}`} ·{" "}
          {bi.lastUsedAt ? `dernière lecture ${formatDateTime(bi.lastUsedAt)} (${bi.useCount})` : "jamais utilisée"}
        </span>
      </div>
      {status === "active" && (
        <ConfirmAction
          action={revokeKey.bind(null, bi.id)}
          label="Révoquer"
          title="Révoquer cette clé ?"
          description={`« ${bi.name} » cessera immédiatement de fonctionner dans les outils qui l'utilisent. Une clé révoquée ne peut pas être réactivée.`}
          confirmLabel="Révoquer"
          destructive
        />
      )}
    </li>
  );
}

async function BiConnection({ slug }: { slug: string }) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();
  const allowBrand = canManageBrandKeys(ctx, brand.id);
  const allowDirection = canManageDirectionKeys(ctx);

  const header = (
    <PageHeader
      title="Connexion BI"
      description="Clés d'accès en lecture seule pour Power BI, Excel ou tout outil qui lit un flux JSON ou CSV."
    />
  );
  if (!allowBrand && !allowDirection) {
    return (
      <Page>
        {header}
        <Notice title="Accès réservé">
          La connexion BI est réservée aux personnes à qui le super-administrateur a accordé la permission « Créer et révoquer les clés de
          connexion BI » (Paramètres › Rôles et permissions).
        </Notice>
      </Page>
    );
  }

  const [keys, base] = await Promise.all([listKeys(brand.id, allowDirection), baseUrl()]);
  const toOption = (d: (typeof DATASETS)[number]) => ({ key: d.key, label: d.label, group: d.group });
  const brandDatasets = allowBrand ? availableDatasets(ctx, [brand]).map(toOption) : [];
  const directionDatasets = allowDirection ? availableDatasets(ctx, ctx.brands).map(toOption) : [];
  const endpoint = `${base}/api/bi/v1`;

  return (
    <Page>
      {header}

      <Card>
        <CardHeader>
          <CardTitle>Se connecter</CardTitle>
          <CardDescription>
            Chaque clé ne lit que ce que son auteur peut lire aujourd&apos;hui : si ses droits changent ou si son compte est désactivé, la clé
            cesse de fonctionner. Elle s&apos;envoie dans l&apos;en-tête de la requête, jamais dans l&apos;adresse.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <p className="font-medium">Power BI Desktop ou Excel (Power Query)</p>
            <ol className="ml-5 list-decimal text-muted-foreground">
              <li>Obtenir les données › Web › Avancé.</li>
              <li>
                Adresse : <code className="break-all">{endpoint}/offres?format=csv</code> (remplacez « offres » par le jeu voulu).
              </li>
              <li>
                En-tête de requête HTTP : <code>Authorization</code> = <code>Bearer</code> suivi d&apos;une espace et de la clé.
              </li>
              <li>Power BI Service : actualisation planifiée possible, identification « Anonyme » (la clé est dans l&apos;en-tête).</li>
            </ol>
          </div>
          <p className="text-muted-foreground">
            Liste des jeux ouverts par une clé : <code className="break-all">{endpoint}</code>. Une valeur vide signifie « aucune donnée »,
            jamais 0. Montants dans la devise de chaque ligne : le jeu « Taux de change » permet de convertir.
          </p>
          <details>
            <summary className="cursor-pointer font-medium">Jeux de données et colonnes</summary>
            <div className="mt-2 flex flex-col gap-3">
              {DATASET_GROUPS.map((group) => (
                <div key={group} className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase">{group}</span>
                  {DATASETS.filter((d) => d.group === group).map((d) => (
                    <div key={d.key}>
                      <p>
                        <span className="font-medium">{d.label}</span> · <code>{d.key}</code>
                      </p>
                      <p className="text-muted-foreground">{d.description}</p>
                      <p className="font-mono text-xs break-words text-muted-foreground">{d.columns.join(", ")}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle clé</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyForm
            action={createKey.bind(null, brand.slug)}
            brandName={brand.name}
            allowBrand={allowBrand}
            allowDirection={allowDirection}
            brandDatasets={brandDatasets}
            directionDatasets={directionDatasets}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clés</CardTitle>
          <CardDescription>
            {allowDirection ? `Clés de ${brand.name} et clés Direction.` : `Clés de ${brand.name}.`} Créations et révocations sont inscrites au
            journal d&apos;audit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune clé pour le moment.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {keys.map((bi) => (
                <KeyRow key={bi.id} bi={bi} brandName={brand.name} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
