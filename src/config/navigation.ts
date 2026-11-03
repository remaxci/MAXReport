import {
  Building,
  Building2,
  CalendarCheck,
  Coins,
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
import type { ModuleKey } from "./modules";

export type NavItem = {
  title: string;
  icon: LucideIcon;
  /** Chemin relatif à /m/[marque]. Absent tant que le module n'est pas développé. */
  path?: string;
  /** Permission requise sur la marque pour afficher l'entrée (une liste : l'une d'elles suffit). */
  permission?: Permission | Permission[];
  /** Module dont dépend l'entrée : masquée si le module est désactivé pour la marque. */
  module?: ModuleKey;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

// Menu d'une marque, filtré par permission et par modules activés.
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
      { title: "Réseaux sociaux", icon: Share2, module: "social", path: "/reseaux-sociaux", permission: ["marketing.read", "marketing.manage"] },
      { title: "Campagnes", icon: Megaphone, module: "campaigns", path: "/campagnes", permission: ["marketing.read", "marketing.manage"] },
      { title: "Sites web", icon: Globe, module: "websites", path: "/sites-web", permission: ["marketing.read", "marketing.manage"] },
    ],
  },
  {
    label: "Commercial",
    items: [
      {
        title: "Activités hebdomadaires",
        icon: CalendarCheck,
        module: "activities",
        path: "/activites",
        permission: ["activities.read_all", "activities.manage_own"],
      },
      { title: "Prospects", icon: Building, module: "crm", path: "/prospects", permission: "crm.read" },
      {
        title: "Opportunités",
        icon: Handshake,
        module: "crm",
        path: "/opportunites",
        permission: ["opportunities.read_all", "opportunities.manage_all", "opportunities.manage_own"],
      },
      {
        title: "Offres",
        icon: FileText,
        module: "offers",
        path: "/offres",
        permission: ["offers.read_all", "offers.manage_all", "offers.manage_own"],
      },
      {
        title: "Mémos stratégiques",
        icon: NotebookPen,
        module: "memos",
        path: "/memos",
        permission: ["memos.read_all", "memos.manage_all", "memos.manage_own"],
      },
      {
        title: "Contrats",
        icon: Signature,
        module: "contracts",
        path: "/contrats",
        permission: ["contracts.read_all", "contracts.manage_all", "contracts.manage_own"],
      },
    ],
  },
  {
    label: "Gestion",
    items: [
      { title: "Objectifs", icon: Target, module: "objectives", path: "/objectifs", permission: "brand.read" },
      { title: "Budgets", icon: Wallet, module: "budgets", path: "/budgets", permission: ["budgets.read", "budgets.manage"] },
      { title: "Rapports", icon: ChartColumn, module: "reports" },
      { title: "Imports", icon: Upload, module: "imports", path: "/imports", permission: "imports.manage" },
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
  { title: "Taux de change", icon: Coins, href: "/parametres/taux-de-change", permission: "fx_rates.manage" },
];

/** Marque courante d'après l'URL (/m/[marque]/…). */
export function currentBrandSlug(pathname: string): string | null {
  const match = pathname.match(/^\/m\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
