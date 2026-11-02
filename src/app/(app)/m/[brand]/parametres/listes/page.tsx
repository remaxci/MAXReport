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
  addOptionItem,
  createOptionList,
  deleteOptionList,
  renameOptionList,
  setOptionItemActive,
  updateOptionItem,
} from "@/features/settings/actions";
import {
  ActionButton,
  ColorDot,
  ConfigForm,
  EditDetails,
  ReorderButtons,
} from "@/features/settings/components/controls";
import { loadSettingsBrand } from "@/features/settings/load";
import { getOptionLists } from "@/features/settings/queries";

export default function ListsSettingsPage({ params }: PageProps<"/m/[brand]/parametres/listes">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <ListsSettings slug={brand} />
      ))}
    </Suspense>
  );
}

async function ListsSettings({ slug }: { slug: string }) {
  const { brand, canManage } = await loadSettingsBrand(slug);
  if (!canManage) return <Forbidden />;

  const lists = await getOptionLists(brand.id);

  return (
    <Page>
      <PageHeader
        title="Listes déroulantes"
        description="Choix proposés dans les formulaires. Un choix désactivé n'est plus proposé mais reste affiché sur les fiches qui l'utilisent."
      />

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle liste</CardTitle>
          <CardDescription>
            Pour un champ personnalisé à choix, par exemple « Types de bien ».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfigForm
            action={createOptionList.bind(null, brand.id)}
            submitLabel="Créer la liste"
            placeholder="Nom de la liste"
          />
        </CardContent>
      </Card>

      {lists.map((list) => {
        const ids = list.items.map((i) => i.id);
        return (
          <Card key={list.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{list.label}</CardTitle>
                {list.isSystem && <Badge variant="outline">Utilisée par les modules</Badge>}
              </div>
              <CardDescription>
                {list.items.filter((i) => i.isActive).length} choix actif(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col divide-y">
                {list.items.map((item, index) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                    <ReorderButtons brandId={brand.id} table="option_items" ids={ids} index={index} />
                    <ColorDot color={item.color} />
                    <span className={item.isActive ? "text-sm" : "text-sm text-muted-foreground line-through"}>
                      {item.label}
                    </span>
                    {!item.isActive && <Badge variant="secondary">Désactivé</Badge>}
                    <div className="ml-auto flex flex-wrap items-start gap-3">
                      <EditDetails>
                        <ConfigForm
                          action={updateOptionItem.bind(null, brand.id, item.id)}
                          submitLabel="Enregistrer"
                          defaults={{ label: item.label, color: item.color }}
                          withColor
                        />
                      </EditDetails>
                      <ActionButton
                        action={setOptionItemActive.bind(null, brand.id, item.id, !item.isActive)}
                      >
                        {item.isActive ? "Désactiver" : "Réactiver"}
                      </ActionButton>
                    </div>
                  </li>
                ))}
                {list.items.length === 0 && (
                  <li className="py-2 text-sm text-muted-foreground">Aucun choix pour l&apos;instant.</li>
                )}
              </ul>

              <ConfigForm
                action={addOptionItem.bind(null, brand.id, list.id)}
                submitLabel="Ajouter"
                placeholder="Nouveau choix"
                withColor
              />

              <div className="flex flex-wrap items-start justify-between gap-3 border-t pt-3">
                <EditDetails label="Renommer la liste">
                  <ConfigForm
                    action={renameOptionList.bind(null, brand.id, list.id)}
                    submitLabel="Renommer"
                    defaults={{ label: list.label }}
                  />
                </EditDetails>
                {!list.isSystem && (
                  <ActionButton action={deleteOptionList.bind(null, brand.id, list.id)} variant="ghost">
                    Supprimer la liste
                  </ActionButton>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </Page>
  );
}
