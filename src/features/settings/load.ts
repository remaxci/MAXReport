import { notFound } from "next/navigation";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

/** Marque d'une page de paramètres, avec le droit de la paramétrer. */
export async function loadSettingsBrand(slug: string) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand) notFound();
  return { ctx, brand, canManage: can(ctx.access, "settings.manage", brand.id) };
}
