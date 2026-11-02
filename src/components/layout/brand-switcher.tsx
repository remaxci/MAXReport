"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { currentBrandSlug } from "@/config/navigation";
import { BrandMark } from "./brand-mark";
import type { SidebarBrand } from "./sidebar-data";

export function BrandSwitcher({ brands }: { brands: SidebarBrand[] }) {
  const pathname = usePathname();
  const slug = currentBrandSlug(pathname);
  const current = brands.find((b) => b.slug === slug) ?? null;
  const selectable = brands.filter((b) => b.isActive);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}
          >
            <BrandMark code={current?.code ?? "MX"} color={current?.primaryColor ?? null} />
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-semibold">{current?.name ?? "MAXreport"}</span>
              <span className="truncate text-xs text-muted-foreground">
                {current ? current.code : "Choisir une marque"}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Marques</DropdownMenuLabel>
              {selectable.length === 0 && (
                <DropdownMenuItem disabled>Aucune marque disponible</DropdownMenuItem>
              )}
              {selectable.map((brand) => (
                <DropdownMenuItem key={brand.slug} render={<Link href={`/m/${brand.slug}`} />}>
                  <BrandMark code={brand.code} color={brand.primaryColor} className="size-6 text-[10px]" />
                  <span className="truncate">{brand.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
