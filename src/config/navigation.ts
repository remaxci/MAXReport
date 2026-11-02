import {
  Building,
  Building2,
  CalendarCheck,
  ChartColumn,
  ChartNoAxesCombined,
  FileText,
  Globe,
  Handshake,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  Settings,
  Share2,
  ShieldCheck,
  Signature,
  Target,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/server/authz/permissions";

export type NavItem = {
  title: string;
  icon: LucideIcon;
  /** Chemin relatif à /m/[marque]. Absent tant que le module n'est pas développé. */
  path?: string;
  /** Permission requise sur la marque pour afficher l'entrée. */
  permission?: Permission;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

// Menu d'une marque. Les modules seront aussi filtrés par marque (Sprint 2).
export const brandNavigation: NavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { title: "Tableau de bord", icon: LayoutDashboard, path: "" },
      { title: "Vue Direction", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Marketing",
    items: [
      { title: "Réseaux sociaux", icon: Share2 },
      { title: "Campagnes", icon: Megaphone },
      { title: "Sites web", icon: Globe },
    ],
  },
  {
    label: "Commercial",
    items: [
      { title: "Activités hebdomadaires", icon: CalendarCheck },
      { title: "Prospects", icon: Building },
      { title: "Opportunités", icon: Handshake },
      { title: "Offres", icon: FileText },
      { title: "Mémos stratégiques", icon: NotebookPen },
      { title: "Contrats", icon: Signature },
    ],
  },
  {
    label: "Gestion",
    items: [
      { title: "Objectifs", icon: Target },
      { title: "Budgets", icon: Wallet },
      { title: "Rapports", icon: ChartColumn },
      { title: "Imports", icon: Upload },
    ],
  },
  {
    label: "Marque",
    items: [
      { title: "Paramètres", icon: Settings, path: "/parametres", permission: "members.read" },
    ],
  },
];

export type AdminNavItem = {
  title: string;
  icon: LucideIcon;
  href: string;
  /** Permission globale requise. */
  permission: Permission;
};

// Administration de toutes les marques : rôles globaux uniquement.
export const adminNavigation: AdminNavItem[] = [
  { title: "Marques", icon: Building2, href: "/parametres/marques", permission: "brands.manage" },
  { title: "Utilisateurs", icon: Users, href: "/parametres/utilisateurs", permission: "users.manage" },
  { title: "Rôles et permissions", icon: ShieldCheck, href: "/parametres/roles", permission: "users.manage" },
];

/** Marque courante d'après l'URL (/m/[marque]/…). */
export function currentBrandSlug(pathname: string): string | null {
  const match = pathname.match(/^\/m\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
