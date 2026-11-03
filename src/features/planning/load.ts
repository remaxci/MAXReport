import { notFound } from "next/navigation";
import { getMemberOptions } from "@/features/registers/queries";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

/** Marque de l'URL, module de planification activé, et droits de l'utilisateur. */
export async function loadPlanningBrand(slug: string) {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, slug);
  if (!brand || !brand.enabledModules.includes("planning")) notFound();
  return { ctx, brand, canRead: can(ctx.access, "planning.read", brand.id), canManage: can(ctx.access, "planning.manage", brand.id) };
}

export async function memberOptions(brandId: string) {
  return (await getMemberOptions(brandId)).map((m) => ({ id: m.id, label: m.label }));
}
