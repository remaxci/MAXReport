import { Suspense } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { Forbidden, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { BrandActiveToggle } from "@/features/brands/components/brand-active-toggle";
import { BrandCreateForm } from "@/features/brands/components/brand-create-form";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

export default function BrandsAdminPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BrandsAdmin />
    </Suspense>
  );
}

async function BrandsAdmin() {
  const ctx = await getAuthContext();
  if (!can(ctx.access, "brands.manage")) return <Forbidden />;

  return (
    <Page>
      <PageHeader
        title="Marques"
        description="Créez les marques du groupe, puis activez-les ou désactivez-les."
      />

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle marque</CardTitle>
          <CardDescription>
            Le code court et l&apos;adresse ne pourront plus être modifiés après la création.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandCreateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marques existantes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marque</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Devise</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ctx.brands.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Aucune marque pour l&apos;instant.
                  </TableCell>
                </TableRow>
              )}
              {ctx.brands.map((brand) => (
                <TableRow key={brand.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <BrandMark code={brand.code} color={brand.primaryColor} />
                      <div className="flex flex-col">
                        <span className="font-medium">{brand.name}</span>
                        <span className="text-xs text-muted-foreground">/m/{brand.slug}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{brand.code}</TableCell>
                  <TableCell>{brand.reportingCurrency}</TableCell>
                  <TableCell>
                    <Badge variant={brand.isActive ? "default" : "secondary"}>
                      {brand.isActive ? "Active" : "Désactivée"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/m/${brand.slug}/parametres`} />}
                      >
                        Paramètres
                      </Button>
                      <BrandActiveToggle brandId={brand.id} isActive={brand.isActive} />
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
