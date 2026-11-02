"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  adminNavigation,
  brandNavigation,
  currentBrandSlug,
  type NavItem,
} from "@/config/navigation";
import type { SidebarData } from "./sidebar-data";

export function NavMain({ data }: { data: SidebarData }) {
  const pathname = usePathname();
  const slug = currentBrandSlug(pathname) ?? data.brands.find((b) => b.isActive)?.slug;
  const brand = data.brands.find((b) => b.slug === slug) ?? null;

  const allowed = (item: NavItem) =>
    (!item.module || (brand?.modules.includes(item.module) ?? false)) &&
    (!item.permission ||
      data.globalPermissions.includes(item.permission) ||
      (brand?.permissions.includes(item.permission) ?? false));

  const adminItems = adminNavigation.filter((item) =>
    data.globalPermissions.includes(item.permission),
  );

  return (
    <>
      {brand &&
        brandNavigation.map((group) => {
          const items = group.items.filter(allowed);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) =>
                  item.path !== undefined ? (
                    <NavLink
                      key={item.title}
                      item={item}
                      href={`/m/${brand.slug}${item.path}`}
                      pathname={pathname}
                    />
                  ) : (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton aria-disabled tooltip={`${item.title} (bientôt)`}>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="text-muted-foreground">Bientôt</SidebarMenuBadge>
                    </SidebarMenuItem>
                  ),
                )}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}

      {adminItems.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarMenu>
            {adminItems.map((item) => (
              <NavLink key={item.href} item={item} href={item.href} pathname={pathname} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </>
  );
}

function NavLink({
  item,
  href,
  pathname,
}: {
  item: Pick<NavItem, "title" | "icon">;
  href: string;
  pathname: string;
}) {
  // Le tableau de bord (/m/x) n'est actif que sur sa propre page.
  const isRoot = /^\/m\/[^/]+$/.test(href);
  const active = pathname === href || (!isRoot && pathname.startsWith(`${href}/`));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} tooltip={item.title} render={<Link href={href} />}>
        <item.icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
