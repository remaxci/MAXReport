import { getListItems } from "@/features/crm/queries";
import { getMemberOptions } from "@/features/registers/queries";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { canImport } from "./access";
import { getParents } from "./queries";
import { isImportTarget, TARGETS, type ImportTarget } from "./targets";
import { buildTemplate, type TemplateLists } from "./template";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const FILE_NAMES: Record<ImportTarget, string> = {
  social_snapshots: "releves-reseaux-sociaux",
  campaign_snapshots: "releves-campagnes",
  website_snapshots: "releves-sites-web",
  companies: "prospects",
  historical_metrics: "historique-agrege",
  expenses: "depenses",
};

async function templateLists(target: ImportTarget, brandId: string): Promise<TemplateLists> {
  if (target === "companies") {
    const [industries, sources] = await Promise.all([getListItems(brandId, "industries"), getListItems(brandId, "lead_sources")]);
    return { options: { industries: industries.map((i) => i.label), lead_sources: sources.map((i) => i.label) } };
  }
  if (target === "historical_metrics") {
    const members = await getMemberOptions(brandId);
    return { members: members.filter((m) => !m.isGlobal).map((m) => m.label) };
  }
  return { parents: (await getParents(target, brandId)).map((p) => p.label) };
}

/** Modèle Excel d'un import, avec les listes de la marque (mêmes droits que l'import). */
export async function downloadTemplate(slug: string, rawTarget: string): Promise<Response> {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes("imports") || !isImportTarget(rawTarget)) {
    return new Response("Page introuvable.", { status: 404 });
  }
  const target = rawTarget;
  if (!canImport(ctx.access, brand, target)) {
    return new Response("Accès refusé.", { status: 403 });
  }

  const workbook = buildTemplate(target, await templateLists(target, brand.id));
  workbook.title = `${TARGETS[target].label} · ${brand.name}`;
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="modele-${FILE_NAMES[target]}-${brand.code}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
