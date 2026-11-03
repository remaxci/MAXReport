import { createClient } from "@/lib/supabase/server";
import type { AuthContext, BrandSummary } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { DATASETS, type Dataset } from "./catalog";

// Clés de connexion BI : règles de gestion (mêmes que la RLS) et lecture.

export type BiKey = {
  id: string;
  brandId: string | null;
  name: string;
  hint: string;
  datasets: string[];
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  createdByName: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
};

export type KeyStatus = "active" | "expired" | "revoked";

/** Clés d'une marque : « bi.connect » sur la marque. */
export function canManageBrandKeys(ctx: AuthContext, brandId: string): boolean {
  return can(ctx.access, "bi.connect", brandId);
}

/** Clés Direction (toutes marques) : « bi.connect » et « direction.read » au niveau global. */
export function canManageDirectionKeys(ctx: AuthContext): boolean {
  return can(ctx.access, "bi.connect") && can(ctx.access, "direction.read");
}

/**
 * Jeux qu'une clé peut ouvrir : permission de lecture et module activé sur au
 * moins une marque de sa portée. La base revérifie à chaque lecture.
 */
export function availableDatasets(ctx: AuthContext, brands: readonly BrandSummary[]): Dataset[] {
  return DATASETS.filter((dataset) =>
    brands.some(
      (brand) =>
        can(ctx.access, "brand.read", brand.id) &&
        (dataset.permissions.length === 0 || dataset.permissions.some((p) => can(ctx.access, p, brand.id))) &&
        (!dataset.module || brand.enabledModules.includes(dataset.module)),
    ),
  );
}

export function keyStatus(key: Pick<BiKey, "revokedAt" | "expiresAt">, now: Date = new Date()): KeyStatus {
  if (key.revokedAt) return "revoked";
  return new Date(key.expiresAt) <= now ? "expired" : "active";
}

/** Clés de la marque et, si demandé, clés Direction ; les plus récentes d'abord (RLS). */
export async function listKeys(brandId: string, withDirection: boolean): Promise<BiKey[]> {
  const supabase = await createClient();
  let query = supabase
    .from("bi_access_keys")
    .select("id, brand_id, name, token_hint, datasets, expires_at, created_at, created_by, revoked_at, last_used_at, use_count")
    .order("created_at", { ascending: false });
  query = withDirection ? query.or(`brand_id.eq.${brandId},brand_id.is.null`) : query.eq("brand_id", brandId);
  const { data, error } = await query;
  if (error) throw error;

  const authorIds = [...new Set(data.map((k) => k.created_by))];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const profiles = await supabase.from("profiles").select("id, full_name, email").in("id", authorIds);
    for (const p of profiles.data ?? []) names.set(p.id, p.full_name || p.email);
  }

  return data.map((k) => ({
    id: k.id,
    brandId: k.brand_id,
    name: k.name,
    hint: k.token_hint,
    datasets: k.datasets,
    expiresAt: k.expires_at,
    createdAt: k.created_at,
    createdBy: k.created_by,
    createdByName: names.get(k.created_by) ?? null,
    revokedAt: k.revoked_at,
    lastUsedAt: k.last_used_at,
    useCount: k.use_count,
  }));
}
