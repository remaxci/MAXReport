import type { AuthContext } from "@/server/authz/context";

// Données sérialisables passées du serveur aux composants client du menu.
// Elles ne servent qu'à l'affichage : chaque page revérifie les droits.

export type SidebarBrand = {
  slug: string;
  name: string;
  code: string;
  primaryColor: string | null;
  isActive: boolean;
  permissions: string[];
  modules: string[];
};

export type SidebarData = {
  brands: SidebarBrand[];
  globalPermissions: string[];
};

export function toSidebarData(ctx: AuthContext): SidebarData {
  return {
    brands: ctx.brands.map((b) => ({
      slug: b.slug,
      name: b.name,
      code: b.code,
      primaryColor: b.primaryColor,
      isActive: b.isActive,
      permissions: [...(ctx.access.byBrand.get(b.id) ?? [])],
      modules: b.enabledModules,
    })),
    globalPermissions: [...ctx.access.global],
  };
}
