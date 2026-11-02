import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { findBrand, getAuthContext } from "@/server/authz/context";

export default function BrandDashboardPage({ params }: PageProps<"/m/[brand]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <BrandDashboard slug={brand} />
      ))}
    </Suspense>
  );
}

async function BrandDashboard({ slug }: { slug: string }) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();

  return (
    <Page>
      <PageHeader title="Tableau de bord" description={brand.name}>
        {!brand.isActive && <Badge variant="secondary">Marque désactivée</Badge>}
      </PageHeader>
      <Notice title="Aucune donnée pour l'instant">
        Les indicateurs de {brand.name} s&apos;afficheront ici dès que les modules marketing,
        commercial et budgets seront en place.
      </Notice>
    </Page>
  );
}
