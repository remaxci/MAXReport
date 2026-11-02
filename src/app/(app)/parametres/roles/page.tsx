import { Suspense } from "react";
import { Check } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPermissions, listRoles } from "@/features/roles/queries";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

export default function RolesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RolesMatrix />
    </Suspense>
  );
}

async function RolesMatrix() {
  const ctx = await getAuthContext();
  if (!can(ctx.access, "users.manage") && !can(ctx.access, "roles.manage")) return <Forbidden />;

  const [roles, permissions] = await Promise.all([listRoles(), listPermissions()]);

  return (
    <Page>
      <PageHeader
        title="Rôles et permissions"
        description="Ce que chaque rôle autorise. Un rôle global vaut pour toutes les marques."
      />

      <Card>
        <CardHeader>
          <CardTitle>Matrice des droits</CardTitle>
          <CardDescription>
            Les permissions des modules (offres, campagnes, budgets…) s&apos;ajouteront ici au fil
            des sprints.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Permission</TableHead>
                {roles.map((role) => (
                  <TableHead key={role.id} className="text-center whitespace-normal">
                    <div className="flex flex-col items-center gap-1 py-1">
                      <span>{role.label}</span>
                      <Badge variant={role.scope === "global" ? "default" : "outline"}>
                        {role.scope === "global" ? "Global" : "Marque"}
                      </Badge>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissions.map((permission) => (
                <TableRow key={permission.key}>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-col">
                      <span>{permission.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{permission.key}</span>
                    </div>
                  </TableCell>
                  {roles.map((role) => (
                    <TableCell key={role.id} className="text-center">
                      {role.permissions.includes(permission.key) ? (
                        <Check className="mx-auto size-4" aria-label="Autorisé" />
                      ) : (
                        <span className="text-muted-foreground" aria-label="Non autorisé">
                          —
                        </span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Page>
  );
}
