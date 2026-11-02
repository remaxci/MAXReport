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
import { setModuleEnabled } from "@/features/settings/actions";
import { ActionButton } from "@/features/settings/components/controls";
import { loadSettingsBrand } from "@/features/settings/load";
import { getBrandModules } from "@/features/settings/queries";
import { can } from "@/server/authz/permissions";

export default function ModulesSettingsPage({ params }: PageProps<"/m/[brand]/parametres/modules">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <ModulesSettings slug={brand} />
      ))}
    </Suspense>
  );
}

async function ModulesSettings({ slug }: { slug: string }) {
  const { ctx, brand, canManage } = await loadSettingsBrand(slug);
  const canToggle = can(ctx.access, "modules.manage");
  if (!canManage && !canToggle) return <Forbidden />;

  const modules = await getBrandModules(brand.id);
  const groups = [...new Set(modules.map((m) => m.group))];

  return (
    <Page>
      <PageHeader
        title="Modules"
        description={`Modules visibles pour ${brand.name}. Un module désactivé disparaît du menu de la marque ; ses données sont conservées.`}
      />
      {!canToggle && (
        <p className="text-sm text-muted-foreground">
          Seul un super-administrateur peut activer ou désactiver un module.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((group) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{group}</CardTitle>
              <CardDescription>
                {modules.filter((m) => m.group === group && m.enabled).length} actif(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {modules
                  .filter((m) => m.group === group)
                  .map((module) => (
                    <li key={module.key} className="flex items-center justify-between gap-3 py-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium">{module.label}</span>
                        <Badge variant={module.enabled ? "default" : "secondary"} className="mt-1">
                          {module.enabled ? "Actif" : "Désactivé"}
                        </Badge>
                      </div>
                      {canToggle && (
                        <ActionButton
                          action={setModuleEnabled.bind(null, brand.id, module.key, !module.enabled)}
                        >
                          {module.enabled ? "Désactiver" : "Activer"}
                        </ActionButton>
                      )}
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </Page>
  );
}
