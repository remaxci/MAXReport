import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Notice, Page, PageSkeleton } from "@/components/page";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

// Accueil : envoie l'utilisateur vers sa marque par défaut, ou la première accessible.
export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeRedirect />
    </Suspense>
  );
}

async function HomeRedirect() {
  const ctx = await getAuthContext();
  const active = ctx.brands.filter((b) => b.isActive);
  const target = active.find((b) => b.id === ctx.defaultBrandId) ?? active[0];

  if (target) redirect(`/m/${target.slug}`);
  if (can(ctx.access, "brands.manage")) redirect("/parametres/marques");

  return (
    <Page>
      <Notice title="Aucune marque">
        Aucune marque ne vous est encore attribuée. Contactez un administrateur de MAXreport.
      </Notice>
    </Page>
  );
}
