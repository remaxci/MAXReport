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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GlobalRoleForm, UserActiveToggle } from "@/features/users/components/user-forms";
import { listUsers } from "@/features/users/queries";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

export default function UsersAdminPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UsersAdmin />
    </Suspense>
  );
}

async function UsersAdmin() {
  const ctx = await getAuthContext();
  if (!can(ctx.access, "users.manage")) return <Forbidden />;

  const users = await listUsers();

  return (
    <Page>
      <PageHeader
        title="Utilisateurs"
        description="Comptes, rôles globaux et accès par marque."
      />

      <Card>
        <CardHeader>
          <CardTitle>Comptes</CardTitle>
          <CardDescription>
            Un rôle global (Direction, super-administrateur) vaut pour toutes les marques. Les
            rôles par marque se gèrent dans les paramètres de chaque marque. Pour créer un compte :
            Supabase › Authentication › Users › Add user ; il apparaît ici automatiquement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Compte</TableHead>
                <TableHead>Rôle global</TableHead>
                <TableHead>Marques</TableHead>
                <TableHead className="text-right">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.fullName ?? user.email}</span>
                      {user.fullName && (
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      )}
                      {user.id === ctx.userId && (
                        <span className="text-xs text-muted-foreground">(vous)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <GlobalRoleForm userId={user.id} current={user.globalRoleKey} />
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-80 flex-wrap gap-1">
                      {user.brandRoles.length === 0 && (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                      {user.brandRoles.map((role) => (
                        <Badge key={role.brandCode} variant="outline" title={role.brandName}>
                          {role.brandCode} · {role.roleLabel}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start justify-end gap-2">
                      {!user.isActive && <Badge variant="secondary">Désactivé</Badge>}
                      <UserActiveToggle userId={user.id} isActive={user.isActive} />
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
