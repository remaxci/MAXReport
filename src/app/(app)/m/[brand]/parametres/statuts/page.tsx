import { Suspense } from "react";
import { Forbidden, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createStatus,
  setDefaultStatus,
  setStatusActive,
  updateStatus,
} from "@/features/settings/actions";
import {
  ActionButton,
  ColorDot,
  ConfigForm,
  EditDetails,
  ReorderButtons,
} from "@/features/settings/components/controls";
import {
  STATUS_CATEGORIES,
  STATUS_CATEGORY_LABELS,
  STATUS_ENTITIES,
  STATUS_ENTITY_LABELS,
  type StatusCategory,
} from "@/features/settings/constants";
import { loadSettingsBrand } from "@/features/settings/load";
import { getStatuses } from "@/features/settings/queries";

const CATEGORY_OPTIONS = STATUS_CATEGORIES.map((value) => ({
  value,
  label: STATUS_CATEGORY_LABELS[value],
}));

export default function StatusesSettingsPage({ params }: PageProps<"/m/[brand]/parametres/statuts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <StatusesSettings slug={brand} />
      ))}
    </Suspense>
  );
}

async function StatusesSettings({ slug }: { slug: string }) {
  const { brand, canManage } = await loadSettingsBrand(slug);
  if (!canManage) return <Forbidden />;

  const statuses = await getStatuses(brand.id);

  return (
    <Page>
      <PageHeader
        title="Statuts"
        description="Libellés et couleurs modifiables. La catégorie est fixée à la création : c'est elle qui sert aux indicateurs (taux de transformation, relances…)."
      />

      {STATUS_ENTITIES.map((entity) => {
        const rows = statuses.filter((s) => s.entity === entity);
        const ids = rows.map((s) => s.id);
        return (
          <Card key={entity}>
            <CardHeader>
              <CardTitle>{STATUS_ENTITY_LABELS[entity]}</CardTitle>
              <CardDescription>
                Le statut par défaut est attribué aux nouvelles fiches.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col divide-y">
                {rows.map((status, index) => (
                  <li key={status.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                    <ReorderButtons brandId={brand.id} table="statuses" ids={ids} index={index} />
                    <ColorDot color={status.color} />
                    <span className={status.isActive ? "text-sm" : "text-sm text-muted-foreground line-through"}>
                      {status.label}
                    </span>
                    <Badge variant="outline">
                      {STATUS_CATEGORY_LABELS[status.category as StatusCategory] ?? status.category}
                    </Badge>
                    {status.isDefault && <Badge>Par défaut</Badge>}
                    {!status.isActive && <Badge variant="secondary">Désactivé</Badge>}
                    <div className="ml-auto flex flex-wrap items-start gap-3">
                      <EditDetails>
                        <ConfigForm
                          action={updateStatus.bind(null, brand.id, status.id)}
                          submitLabel="Enregistrer"
                          defaults={{ label: status.label, color: status.color }}
                          withColor
                        />
                      </EditDetails>
                      {!status.isDefault && status.isActive && (
                        <ActionButton
                          action={setDefaultStatus.bind(null, brand.id, entity, status.id)}
                          variant="ghost"
                        >
                          Par défaut
                        </ActionButton>
                      )}
                      {!status.isDefault && (
                        <ActionButton
                          action={setStatusActive.bind(null, brand.id, status.id, !status.isActive)}
                        >
                          {status.isActive ? "Désactiver" : "Réactiver"}
                        </ActionButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <ConfigForm
                action={createStatus.bind(null, brand.id, entity)}
                submitLabel="Ajouter"
                placeholder="Nouveau statut"
                withColor
                categories={CATEGORY_OPTIONS}
              />
            </CardContent>
          </Card>
        );
      })}
    </Page>
  );
}
