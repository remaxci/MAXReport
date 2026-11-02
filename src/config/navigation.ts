import {
  Building,
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
  Signature,
  Target,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  icon: LucideIcon;
  // Absent tant que le module n'est pas développé : l'entrée s'affiche grisée.
  href?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

// Menu principal. Au Sprint 1, les entrées deviendront propres à chaque marque
// (/m/[marque]/...) et filtrées selon les modules activés et les permissions.
export const navigation: NavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { title: "Tableau de bord", icon: LayoutDashboard, href: "/" },
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
    label: "Administration",
    items: [{ title: "Paramètres", icon: Settings }],
  },
];
