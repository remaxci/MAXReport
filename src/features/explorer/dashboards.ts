import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { readWidgets, type Widget } from "./settings";

// Tableaux de bord personnalisés : des listes de réglages de l'explorateur.
// Lus sous la RLS ; les contrôles ci-dessous reprennent ceux de la base pour
// n'afficher que les actions permises.

export type CustomDashboard = {
  id: string;
  /** null : tableau Direction (toutes marques). */
  brandId: string | null;
  name: string;
  description: string | null;
  isShared: boolean;
  createdBy: string | null;
  widgets: Widget[];
  /** Entrées enregistrées mais illisibles (format périmé) : ignorées à l'affichage. */
  invalid: number;
  /** Liste brute, telle qu'enregistrée (pour la modifier sans rien perdre). */
  raw: unknown[];
};

const COLUMNS = "id, brand_id, name, description, is_shared, created_by, widgets";

type Raw = { id: string; brand_id: string | null; name: string; description: string | null; is_shared: boolean; created_by: string | null; widgets: unknown };

function toDashboard(row: Raw): CustomDashboard {
  const { widgets, invalid } = readWidgets(row.widgets);
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    description: row.description,
    isShared: row.is_shared,
    createdBy: row.created_by,
    widgets,
    invalid,
    raw: Array.isArray(row.widgets) ? row.widgets : [],
  };
}

/** Tableaux de la marque et, pour qui a la vue Direction, ceux de la Direction. */
export async function listDashboards(brandId: string, withDirection: boolean): Promise<CustomDashboard[]> {
  const supabase = await createClient();
  let query = supabase.from("custom_dashboards").select(COLUMNS);
  query = withDirection ? query.or(`brand_id.eq.${brandId},brand_id.is.null`) : query.eq("brand_id", brandId);
  const { data, error } = await query.order("name").limit(200);
  if (error) throw error;
  return (data as Raw[]).map(toDashboard);
}

export async function getDashboard(id: string): Promise<CustomDashboard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("custom_dashboards").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toDashboard(data as Raw) : null;
}

/** Créer un tableau : reports.manage sur la marque, ou la vue Direction pour un tableau Direction. */
export function canCreateDashboard(ctx: Pick<AuthContext, "access">, brandId: string | null): boolean {
  return brandId ? can(ctx.access, "reports.manage", brandId) : can(ctx.access, "direction.read");
}

/** Modifier un tableau : le droit de créer dans sa portée, et, s'il est personnel, en être l'auteur. */
export function canManageDashboard(ctx: Pick<AuthContext, "access" | "userId">, dashboard: Pick<CustomDashboard, "brandId" | "isShared" | "createdBy">): boolean {
  return canCreateDashboard(ctx, dashboard.brandId) && (dashboard.isShared || dashboard.createdBy === ctx.userId);
}

/**
 * Un graphique va dans un tableau de marque s'il ne porte que sur cette marque ;
 * un tableau Direction accepte toutes les marques.
 */
export function acceptsWidget(dashboard: Pick<CustomDashboard, "brandId">, widget: Pick<Widget, "brandIds">): boolean {
  return dashboard.brandId === null || (widget.brandIds.length === 1 && widget.brandIds[0] === dashboard.brandId);
}

/** Déplace un élément d'une liste (bornes respectées) ; renvoie une copie. */
export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}
