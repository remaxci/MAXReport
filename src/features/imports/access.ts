import type { BrandSummary } from "@/server/authz/context";
import { can, type Access } from "@/server/authz/permissions";
import { IMPORT_TARGETS, TARGETS, type ImportTarget } from "./targets";

/** Une marque peut-elle recevoir ce type d'import de la part de cet utilisateur ? */
export function canImport(access: Access, brand: BrandSummary, target: ImportTarget): boolean {
  const config = TARGETS[target];
  return (
    brand.enabledModules.includes("imports") &&
    brand.enabledModules.includes(config.module) &&
    can(access, "imports.manage", brand.id) &&
    can(access, config.permission, brand.id)
  );
}

export function importableTargets(access: Access, brand: BrandSummary): ImportTarget[] {
  return IMPORT_TARGETS.filter((target) => canImport(access, brand, target));
}
