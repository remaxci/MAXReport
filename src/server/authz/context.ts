import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./current-user";
import { buildAccess, can, type Access, type Permission } from "./permissions";

export type BrandSummary = {
  id: string;
  code: string;
  slug: string;
  name: string;
  primaryColor: string | null;
  reportingCurrency: string;
  isActive: boolean;
};

export type AuthContext = {
  userId: string;
  email: string;
  fullName: string | null;
  defaultBrandId: string | null;
  access: Access;
  /** Marques lisibles par l'utilisateur (filtrées par la RLS), hors archivées. */
  brands: BrandSummary[];
};

// Contexte d'autorisation de la requête en cours, calculé une fois par rendu.
// Lit la session : à appeler derrière un <Suspense> (Cache Components).
export const getAuthContext = cache(async (): Promise<AuthContext> => {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [profile, memberships, brands] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, default_brand_id, is_active")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("brand_id, roles(role_permissions(permission))")
      .eq("user_id", user.id),
    supabase
      .from("brands")
      .select("id, code, slug, name, primary_color, reporting_currency, is_active")
      .is("archived_at", null)
      .order("name"),
  ]);

  if (profile.error) throw profile.error;
  if (memberships.error) throw memberships.error;
  if (brands.error) throw brands.error;

  // Un compte désactivé perd tous ses droits (la RLS fait de même).
  const isActive = profile.data?.is_active ?? false;
  const grants = isActive
    ? memberships.data.map((m) => ({
        brandId: m.brand_id,
        permissions: m.roles.role_permissions.map((rp) => rp.permission),
      }))
    : [];

  return {
    userId: user.id,
    email: user.email,
    fullName: profile.data?.full_name ?? null,
    defaultBrandId: profile.data?.default_brand_id ?? null,
    access: buildAccess(grants),
    brands: brands.data.map((b) => ({
      id: b.id,
      code: b.code,
      slug: b.slug,
      name: b.name,
      primaryColor: b.primary_color,
      reportingCurrency: b.reporting_currency,
      isActive: b.is_active,
    })),
  };
});

export function findBrand(ctx: AuthContext, slug: string): BrandSummary | null {
  return ctx.brands.find((b) => b.slug === slug) ?? null;
}

/** Pour les Server Actions : renvoie le contexte si la permission est détenue, sinon null. */
export async function authorize(
  permission: Permission,
  brandId?: string | null,
): Promise<AuthContext | null> {
  const ctx = await getAuthContext();
  return can(ctx.access, permission, brandId) ? ctx : null;
}
