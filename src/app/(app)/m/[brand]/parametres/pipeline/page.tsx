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
import { createStage, setStageActive, updateStage } from "@/features/settings/actions";
import {
  ActionButton,
  ConfigForm,
  EditDetails,
  ReorderButtons,
} from "@/features/settings/components/controls";
import { STAGE_CATEGORY_LABELS } from "@/features/settings/constants";
import { loadSettingsBrand } from "@/features/settings/load";
import { getPipelineStages } from "@/features/settings/queries";

export default function PipelineSettingsPage({ params }: PageProps<"/m/[brand]/parametres/pipeline">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <PipelineSettings slug={brand} />
      ))}
    </Suspense>
  );
}

async function PipelineSettings({ slug }: { slug: string }) {
  const { brand, canManage } = await loadSettingsBrand(slug);
  if (!canManage) return <Forbidden />;

  const stages = await getPipelineStages(brand.id);
  const ids = stages.map((s) => s.id);

  return (
    <Page>
      <PageHeader
        title="Pipeline commercial"
        description="Étapes des opportunités. La probabilité sert au calcul du pipeline pondéré (montant × probabilité)."
      />

      <Card>
        <CardHeader>
          <CardTitle>Étapes</CardTitle>
          <CardDescription>
            Les étapes « Gagnée » et « Perdue » d&apos;origine restent actives : elles servent au
            calcul des signatures et des pertes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col divide-y">
            {stages.map((stage, index) => (
              <li key={stage.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                <ReorderButtons brandId={brand.id} table="pipeline_stages" ids={ids} index={index} />
                <span className={stage.isActive ? "text-sm" : "text-sm text-muted-foreground line-through"}>
                  {stage.label}
                </span>
                <Badge variant="outline">{STAGE_CATEGORY_LABELS[stage.category] ?? stage.category}</Badge>
                <span className="text-sm text-muted-foreground tabular-nums">{stage.probability} %</span>
                {!stage.isActive && <Badge variant="secondary">Désactivée</Badge>}
                <div className="ml-auto flex flex-wrap items-start gap-3">
                  <EditDetails>
                    <ConfigForm
                      action={updateStage.bind(null, brand.id, stage.id)}
                      submitLabel="Enregistrer"
                      defaults={{ label: stage.label, probability: stage.probability }}
                      withProbability
                    />
                  </EditDetails>
                  {!stage.isSystem && (
                    <ActionButton action={setStageActive.bind(null, brand.id, stage.id, !stage.isActive)}>
                      {stage.isActive ? "Désactiver" : "Réactiver"}
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <ConfigForm
            action={createStage.bind(null, brand.id)}
            submitLabel="Ajouter une étape"
            placeholder="Nouvelle étape"
            withProbability
          />
        </CardContent>
      </Card>
    </Page>
  );
}
