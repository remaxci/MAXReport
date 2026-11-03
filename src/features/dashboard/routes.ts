import { getTemplate } from "@/features/reports/queries";
import { todayIso } from "@/lib/format";
import { periodFromQuery, periodLabel } from "@/lib/periods";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { loadDashboard } from "./data";
import { DIRECTION_COLUMNS, loadDirection } from "./direction";
import { directionWorkbook, sectionsWorkbook, workbookResponse } from "./export";

// Exports Excel : mêmes droits et mêmes chiffres que les pages (RLS).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Tableau de bord de la marque, ou rapport d'un modèle (?modele=…). */
export async function exportDashboard(request: Request, slug: string): Promise<Response> {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) return new Response("Page introuvable.", { status: 404 });
  const query = new URL(request.url).searchParams;

  const templateId = query.get("modele");
  let title = `Tableau de bord · ${brand.name}`;
  let sections;
  let kindFallback: Parameters<typeof periodFromQuery>[3] = "month";
  if (templateId) {
    if (!UUID.test(templateId)) return new Response("Page introuvable.", { status: 404 });
    const template = await getTemplate(brand.id, templateId);
    if (!template) return new Response("Page introuvable.", { status: 404 });
    title = `${template.name} · ${brand.name}`;
    sections = template.sections;
    kindFallback = template.periodKind;
  }
  const period = periodFromQuery(query.get("periode") ?? undefined, query.get("du") ?? undefined, todayIso(), kindFallback);
  const data = await loadDashboard({ brand, access: ctx.access, period, sections });
  const workbook = sectionsWorkbook(title, `Période : ${periodLabel(period)}`, data);
  return workbookResponse(workbook, `MAXreport-${brand.code}-${period.start}.xlsx`);
}

export async function exportDirection(request: Request, slug: string): Promise<Response> {
  const ctx = await getAuthContext();
  if (!findBrand(ctx, slug)) return new Response("Page introuvable.", { status: 404 });
  if (!can(ctx.access, "direction.read")) return new Response("Accès refusé.", { status: 403 });
  const query = new URL(request.url).searchParams;
  const period = periodFromQuery(query.get("periode") ?? undefined, query.get("du") ?? undefined, todayIso());
  const { rows, total } = await loadDirection(ctx.brands.filter((b) => b.isActive), ctx.access, period);
  const workbook = directionWorkbook(`Période : ${periodLabel(period)} · montants en XOF`, DIRECTION_COLUMNS, rows, total);
  return workbookResponse(workbook, `MAXreport-Direction-${period.start}.xlsx`);
}
