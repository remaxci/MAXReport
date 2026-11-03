import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { createClient } from "@/lib/supabase/server";
import { findBrand, getAuthContext, type AuthContext, type BrandSummary } from "@/server/authz/context";
import { can, type Permission } from "@/server/authz/permissions";
import { AssistantChat } from "./components/chat";
import { assistantConfig, startOfDay } from "./config";

type Params = Promise<{ brand: string }>;

export function AssistantPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <Assistant slug={brand} />
      ))}
    </Suspense>
  );
}

const OFFERS: Permission[] = ["offers.read_all", "offers.manage_all", "offers.manage_own"];
const OPPORTUNITIES: Permission[] = ["opportunities.read_all", "opportunities.manage_all", "opportunities.manage_own"];

/** Exemples adaptés aux modules activés et aux droits de la personne. */
function examples(ctx: AuthContext, brand: BrandSummary): string[] {
  const modules = brand.enabledModules;
  const any = (permissions: Permission[]) => permissions.some((p) => can(ctx.access, p, brand.id));
  const list = ["Résume les chiffres de ce mois-ci par rapport au mois dernier."];
  if (modules.includes("offers") && any(OFFERS)) {
    list.push("Quelles offres ont été émises ces 30 derniers jours, et pour quel montant ?");
  }
  if (modules.includes("planning") && can(ctx.access, "planning.read", brand.id)) {
    list.push("Quelles tâches sont en retard, et qui en est responsable ?");
  }
  if (modules.includes("crm") && any(OPPORTUNITIES)) {
    list.push("Où en est le pipeline commercial aujourd'hui ?");
  }
  list.push("Quelle est la tendance des 6 derniers mois pour nos principaux indicateurs ?");
  return list;
}

async function Assistant({ slug }: { slug: string }) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();
  if (!can(ctx.access, "brand.read", brand.id)) return <Forbidden />;
  const config = assistantConfig(process.env);

  const header = (
    <PageHeader
      title="Assistant IA"
      description={`Posez vos questions sur les données de ${brand.name} : l'assistant les lit avec vos droits et ne modifie rien.`}
    />
  );

  if (!config.enabled) {
    return (
      <Page>
        {header}
        <Notice title="L'assistant n'est pas encore en service">
          Un administrateur doit d&apos;abord le mettre en service (clé d&apos;API Anthropic dans la configuration du serveur). Aucune réponse
          n&apos;est simulée en attendant.
        </Notice>
      </Page>
    );
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("assistant_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .gte("created_at", startOfDay());

  return (
    <Page>
      {header}
      <AssistantChat
        endpoint={`/m/${brand.slug}/assistant/reponse`}
        storageKey={`maxreport-assistant-${brand.id}`}
        examples={examples(ctx, brand)}
        remaining={Math.max(0, config.dailyLimit - (count ?? 0))}
      />
      <p className="text-xs text-muted-foreground">
        Réponses produites par Claude (Anthropic) à partir des données de MAXreport : vos questions et les données consultées lui sont
        transmises pour y répondre. MAXreport ne conserve ni les questions ni les réponses. Vérifiez les chiffres importants dans les
        tableaux de bord.
      </p>
    </Page>
  );
}
