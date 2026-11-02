import { Suspense } from "react";
import { notFound } from "next/navigation";
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
import { updateBrand } from "@/features/brands/actions";
import { BrandSettingsForm } from "@/features/brands/components/brand-settings-form";
import { addMember, removeMember, updateMemberRole } from "@/features/members/actions";
import {
  MemberAddForm,
  MemberRemoveButton,
  MemberRoleForm,
} from "@/features/members/components/member-forms";
import { listBrandMembers } from "@/features/members/queries";
import { listRoles } from "@/features/roles/queries";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can, canAssignRole } from "@/server/authz/permissions";

export default function BrandSettingsPage({ params }: PageProps<"/m/[brand]/parametres">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <BrandSettings slug={brand} />
      ))}
    </Suspense>
  );
}

async function BrandSettings({ slug }: { slug: string }) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();

  const canEdit = can(ctx.access, "brand.settings", brand.id);
  const canReadMembers = can(ctx.access, "members.read", brand.id);
  const canManageMembers = can(ctx.access, "members.manage", brand.id);
  if (!canEdit && !canReadMembers) return <Forbidden />;

  const [members, roles] = await Promise.all([
    canReadMembers ? listBrandMembers(brand.id) : Promise.resolve([]),
    canManageMembers ? listRoles() : Promise.resolve([]),
  ]);

  // Rôles que l'utilisateur peut attribuer : rôles de marque inclus dans ses propres droits.
  const assignable = roles
    .filter((r) => r.scope === "brand" && canAssignRole(ctx.access, r.permissions, brand.id))
    .map((r) => ({ id: r.id, label: r.label }));

  return (
    <Page>
      <PageHeader title="Paramètres de la marque" description={brand.name} />

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent>
            <BrandSettingsForm action={updateBrand.bind(null, brand.id)} brand={brand} />
          </CardContent>
        </Card>
      )}

      {canReadMembers && (
        <Card>
          <CardHeader>
            <CardTitle>Collaborateurs</CardTitle>
            <CardDescription>
              {members.length} collaborateur{members.length > 1 ? "s" : ""} sur cette marque.
              Les rôles Direction et super-administrateur s&apos;appliquent à toutes les marques et
              se gèrent dans Administration › Utilisateurs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {canManageMembers && (
              <MemberAddForm action={addMember.bind(null, brand.id)} roles={assignable} />
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collaborateur</TableHead>
                  <TableHead>Rôle</TableHead>
                  {canManageMembers && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Aucun collaborateur pour l&apos;instant.
                    </TableCell>
                  </TableRow>
                )}
                {members.map((member) => {
                  const label = member.fullName ?? member.email;
                  const roleEditable =
                    canManageMembers && assignable.some((r) => r.id === member.roleId);
                  return (
                    <TableRow key={member.membershipId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{label}</span>
                          {member.fullName && (
                            <span className="text-xs text-muted-foreground">{member.email}</span>
                          )}
                          {!member.isActive && (
                            <Badge variant="secondary" className="mt-1">
                              Compte désactivé
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {roleEditable ? (
                          <MemberRoleForm
                            action={updateMemberRole.bind(null, brand.id, member.membershipId)}
                            roles={assignable}
                            currentRoleId={member.roleId}
                          />
                        ) : (
                          member.roleLabel
                        )}
                      </TableCell>
                      {canManageMembers && (
                        <TableCell className="text-right">
                          {roleEditable && (
                            <MemberRemoveButton
                              action={removeMember.bind(null, brand.id, member.membershipId)}
                              name={label}
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {canManageMembers && (
              <p className="text-xs text-muted-foreground">
                Le collaborateur doit d&apos;abord avoir un compte. Les comptes se créent pour
                l&apos;instant dans Supabase (Authentication › Users) ; l&apos;invitation par
                e-mail depuis MAXreport viendra avec la configuration d&apos;un service d&apos;envoi
                d&apos;e-mails.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </Page>
  );
}
