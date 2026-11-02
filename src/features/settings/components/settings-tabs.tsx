"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { currentBrandSlug } from "@/config/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "", label: "Général" },
  { path: "/modules", label: "Modules" },
  { path: "/listes", label: "Listes" },
  { path: "/statuts", label: "Statuts" },
  { path: "/pipeline", label: "Pipeline" },
  { path: "/champs", label: "Champs personnalisés" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const slug = currentBrandSlug(pathname);
  if (!slug) return null;
  const base = `/m/${slug}/parametres`;

  return (
    <nav aria-label="Paramètres de la marque" className="flex gap-1 overflow-x-auto border-b px-4 sm:px-6">
      {TABS.map((tab) => {
        const href = `${base}${tab.path}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
