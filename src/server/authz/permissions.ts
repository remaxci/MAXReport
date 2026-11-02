// Permissions : miroir du catalogue `public.permissions` (migrations Supabase).
// Ces contrôles servent l'interface et les Server Actions ; la RLS reste le
// dernier verrou et applique exactement la même règle : une permission tenue
// par un rôle global vaut pour toutes les marques.

export const PERMISSIONS = [
  "brands.manage",
  "brand.read",
  "brand.settings",
  "members.read",
  "members.manage",
  "users.manage",
  "roles.manage",
  "audit.read",
  "settings.manage",
  "modules.manage",
  "offers.read_all",
  "offers.manage_all",
  "offers.manage_own",
  "memos.read_all",
  "memos.manage_all",
  "memos.manage_own",
  "crm.read",
  "crm.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Une affectation : une marque (ou null = toutes) et les permissions de son rôle. */
export type MembershipGrant = {
  brandId: string | null;
  permissions: readonly string[];
};

export type Access = {
  global: ReadonlySet<string>;
  byBrand: ReadonlyMap<string, ReadonlySet<string>>;
};

export function buildAccess(grants: readonly MembershipGrant[]): Access {
  const global = new Set<string>();
  const byBrand = new Map<string, Set<string>>();

  for (const grant of grants) {
    if (grant.brandId === null) {
      grant.permissions.forEach((p) => global.add(p));
      continue;
    }
    const set = byBrand.get(grant.brandId) ?? new Set<string>();
    grant.permissions.forEach((p) => set.add(p));
    byBrand.set(grant.brandId, set);
  }

  return { global, byBrand };
}

/** Permission sur une marque donnée, ou au niveau global si `brandId` est absent. */
export function can(
  access: Access,
  permission: Permission,
  brandId?: string | null,
): boolean {
  if (access.global.has(permission)) return true;
  if (!brandId) return false;
  return access.byBrand.get(brandId)?.has(permission) ?? false;
}

/** Permission détenue sur au moins une marque, ou globalement. */
export function canSomewhere(access: Access, permission: Permission): boolean {
  if (access.global.has(permission)) return true;
  for (const set of access.byBrand.values()) {
    if (set.has(permission)) return true;
  }
  return false;
}

/** Un rôle n'est attribuable que si l'on détient déjà toutes ses permissions sur la marque. */
export function canAssignRole(
  access: Access,
  rolePermissions: readonly string[],
  brandId: string,
): boolean {
  if (access.global.has("users.manage")) return true;
  const own = access.byBrand.get(brandId);
  return rolePermissions.every((p) => access.global.has(p) || own?.has(p));
}
