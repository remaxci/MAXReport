import { Suspense } from "react";
import Link from "next/link";
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
  createCustomField,
  previewCustomFields,
  setCustomFieldActive,
  updateCustomField,
} from "@/features/custom-fields/actions";
import {
  FieldCreateForm,
  FieldEditForm,
  FieldPreviewForm,
} from "@/features/custom-fields/components/field-forms";
import { getCustomFields } from "@/features/custom-fields/queries";
import {
  FIELD_ENTITIES,
  FIELD_ENTITY_LABELS,
  FIELD_TYPE_LABELS,
  type FieldEntity,
} from "@/features/custom-fields/types";
import { listBrandMembers } from "@/features/members/queries";
import { listPermissions } from "@/features/roles/queries";
import { ActionButton, EditDetails, ReorderButtons } from "@/features/settings/components/controls";
import { loadSettingsBrand } from "@/features/settings/load";
import { getOptionLists } from "@/features/settings/queries";
import { cn } from "@/lib/utils";
import { can } from "@/server/authz/permissions";

export default function CustomFieldsSettingsPage({
  params,
  searchParams,
}: PageProps<"/m/[brand]/parametres/champs">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <CustomFieldsSettings
          slug={brand}
          entity={typeof query.fiche === "string" ? query.fiche : undefined}
        />
      ))}
    </Suspense>
  );
}

async function CustomFieldsSettings({ slug, entity: rawEntity }: { slug: string; entity?: string }) {
  const { ctx, brand, canManage } = await loadSettingsBrand(slug);
  if (!canManage) return <Forbidden />;

  const entity: FieldEntity = (FIELD_ENTITIES as readonly string[]).includes(rawEntity ?? "")
    ? (rawEntity as FieldEntity)
    : "offer";

  const [fields, lists, permissions, members] = await Promise.all([
    getCustomFields(brand.id, entity),
    getOptionLists(brand.id),
    listPermissions(),
    can(ctx.access, "members.read", brand.id) ? listBrandMembers(brand.id) : Promise.resolve([]),
  ]);
  const ids = fields.map((f) => f.id);
  const permissionOptions = permissions.map((p) => ({ key: p.key, label: p.label }));
  const base = `/m/${brand.slug}/parametres/champs`;

  return (
    <Page>
      <PageHeader
        title="Champs personnalisés"
        description="Ajoutez des champs aux fiches sans modifier l'application. Ils suivent les mêmes droits d'accès que la fiche."
      />

      <nav aria-label="Type de fiche" className="flex flex-wrap gap-2">
        {FIELD_ENTITIES.map((e) => (
          <Link
            key={e}
            href={`${base}?fiche=${e}`}
            aria-current={e === entity ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              e === entity
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {FIELD_ENTITY_LABELS[e]}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Champs de la fiche « {FIELD_ENTITY_LABELS[entity]} »</CardTitle>
          <CardDescription>
            {fields.filter((f) => f.isActive).length} champ(s) actif(s), 50 au maximum. Un champ
            désactivé n&apos;est plus proposé ; ses valeurs restent conservées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {fields.length === 0 && (
              <li className="py-2 text-sm text-muted-foreground">Aucun champ pour l&apos;instant.</li>
            )}
            {fields.map((field, index) => (
              <li key={field.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <ReorderButtons
                    brandId={brand.id}
                    table="custom_field_definitions"
                    ids={ids}
                    index={index}
                  />
                  <span className={field.isActive ? "text-sm font-medium" : "text-sm text-muted-foreground line-through"}>
                    {field.label}
                  </span>
                  <Badge variant="outline">{FIELD_TYPE_LABELS[field.type]}</Badge>
                  {field.listLabel && <Badge variant="outline">{field.listLabel}</Badge>}
                  {field.required && <Badge>Obligatoire</Badge>}
                  {field.writePermission && <Badge variant="secondary">Modification restreinte</Badge>}
                  {!field.isActive && <Badge variant="secondary">Désactivé</Badge>}
                  <div className="ml-auto">
                    <ActionButton
                      action={setCustomFieldActive.bind(null, brand.id, field.id, !field.isActive)}
                    >
                      {field.isActive ? "Désactiver" : "Réactiver"}
                    </ActionButton>
                  </div>
                </div>
                <EditDetails>
                  <FieldEditForm
                    action={updateCustomField.bind(null, brand.id, field.id)}
                    field={field}
                    permissions={permissionOptions}
                  />
                </EditDetails>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau champ</CardTitle>
          <CardDescription>
            Pour un champ à choix, créez d&apos;abord la liste dans l&apos;onglet Listes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldCreateForm
            action={createCustomField.bind(null, brand.id, entity)}
            lists={lists.map((l) => ({ id: l.id, label: l.label }))}
            permissions={permissionOptions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aperçu du formulaire</CardTitle>
          <CardDescription>
            Testez la saisie et la validation telles qu&apos;elles apparaîtront sur la fiche. Rien
            n&apos;est enregistré.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldPreviewForm
            key={fields.map((f) => `${f.id}:${f.isActive}`).join("|")}
            action={previewCustomFields.bind(null, brand.id, entity)}
            fields={fields}
            members={members.map((m) => ({ id: m.userId, label: m.fullName ?? m.email }))}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
