import type { ModuleKey } from "@/config/modules";
import type { Permission } from "@/server/authz/permissions";

// Jeux de données de la connexion BI : miroir de la fonction public.bi_read
// (migration connexion_bi), qui seule décide de ce qui est lu. Ce catalogue
// sert à l'interface (jeux proposés), à l'ordre des colonnes des exports et à
// la documentation. Lignes détaillées, sans coordonnées des contacts ni
// commentaires libres ; fiches archivées exclues.

export type DatasetGroup = "Référence" | "Commercial" | "Marketing" | "Budgets" | "Planification";

export type Dataset = {
  key: string;
  label: string;
  group: DatasetGroup;
  description: string;
  /** L'une de ces permissions sur la marque (en plus de brand.read) ; aucune pour les taux de change. */
  permissions: Permission[];
  module?: ModuleKey;
  /** Colonnes, dans l'ordre des exports. */
  columns: string[];
};

const PEOPLE = "Noms de personnes visibles seulement si l'auteur de la clé voit les membres de la marque (sinon vide).";
const CLIENT = "Nom du client visible seulement si l'auteur de la clé lit les prospects (sinon vide).";
const MARKETING: Permission[] = ["marketing.read", "marketing.manage"];
const BUDGETS: Permission[] = ["budgets.read", "budgets.manage"];

export const DATASETS: Dataset[] = [
  {
    key: "marques",
    label: "Marques",
    group: "Référence",
    description: "Les marques couvertes par la clé (code, nom, devise de reporting).",
    permissions: [],
    columns: ["id", "code", "nom", "devise_reporting", "active"],
  },
  {
    key: "taux_de_change",
    label: "Taux de change",
    group: "Référence",
    description: "Taux saisis dans MAXreport, pour convertir les montants dans une même devise.",
    permissions: [],
    columns: ["id", "date", "de", "vers", "taux", "source"],
  },
  {
    key: "offres",
    label: "Offres",
    group: "Commercial",
    description: `Offres commerciales : numéro, objet, statut, dates, montant. ${CLIENT} ${PEOPLE}`,
    permissions: ["offers.read_all", "offers.manage_all"],
    module: "offers",
    columns: [
      "id", "marque", "numero", "objet", "client", "statut", "categorie_statut", "emis_le", "envoye_le", "relance_le",
      "valable_jusqu_au", "montant", "devise", "responsable_id", "responsable", "cree_le", "modifie_le",
    ],
  },
  {
    key: "memos",
    label: "Mémos stratégiques",
    group: "Commercial",
    description: `Mémos : numéro, objet, statut, dates. ${CLIENT} ${PEOPLE}`,
    permissions: ["memos.read_all", "memos.manage_all"],
    module: "memos",
    columns: [
      "id", "marque", "numero", "objet", "client", "statut", "categorie_statut", "emis_le", "envoye_le", "relance_le",
      "responsable_id", "responsable", "cree_le", "modifie_le",
    ],
  },
  {
    key: "opportunites",
    label: "Opportunités",
    group: "Commercial",
    description: `Opportunités : étape du pipeline, probabilité, montant, dates de clôture. ${CLIENT} ${PEOPLE}`,
    permissions: ["opportunities.read_all", "opportunities.manage_all"],
    module: "crm",
    columns: [
      "id", "marque", "titre", "client", "etape", "categorie_etape", "probabilite_pct", "montant", "devise",
      "cloture_prevue_le", "cloturee_le", "source", "responsable_id", "responsable", "cree_le", "modifie_le",
    ],
  },
  {
    key: "contrats",
    label: "Contrats",
    group: "Commercial",
    description: `Contrats signés : dates, montant, offre et opportunité d'origine. ${CLIENT} ${PEOPLE}`,
    permissions: ["contracts.read_all", "contracts.manage_all"],
    module: "contracts",
    columns: [
      "id", "marque", "titre", "client", "signe_le", "debut_le", "fin_le", "montant", "devise", "offre_id",
      "opportunite_id", "responsable_id", "responsable", "cree_le", "modifie_le",
    ],
  },
  {
    key: "activites",
    label: "Activités hebdomadaires",
    group: "Commercial",
    description: `Rapports d'activité de la semaine : appels, e-mails, rendez-vous, déclarations. ${PEOPLE}`,
    permissions: ["activities.read_all"],
    module: "activities",
    columns: [
      "id", "marque", "collaborateur_id", "collaborateur", "semaine_du", "statut", "appels_prospection", "appels_suivi",
      "emails_envoyes", "rdv_qualifies", "opportunites_declarees", "memos_declares", "soumis_le", "valide_le",
    ],
  },
  {
    key: "objectifs",
    label: "Objectifs",
    group: "Commercial",
    description: `Objectifs par indicateur et période ; collaborateur vide = objectif d'équipe. ${PEOPLE}`,
    permissions: ["objectives.read_all"],
    module: "objectives",
    columns: ["id", "marque", "indicateur", "collaborateur_id", "collaborateur", "du", "au", "cible", "devise"],
  },
  {
    key: "reseaux_sociaux",
    label: "Réseaux sociaux (relevés)",
    group: "Marketing",
    description: "Relevés par compte et par période : abonnés, publications, portée, impressions, interactions, clics.",
    permissions: MARKETING,
    module: "social",
    columns: [
      "id", "marque", "compte_id", "compte", "plateforme", "du", "au", "abonnes_total", "nouveaux_abonnes", "publications",
      "portee", "impressions", "interactions", "clics", "source",
    ],
  },
  {
    key: "campagnes",
    label: "Campagnes",
    group: "Marketing",
    description: "Campagnes : plateforme, objectif, statut, dates, budget prévu.",
    permissions: MARKETING,
    module: "campaigns",
    columns: ["id", "marque", "nom", "plateforme", "objectif", "statut", "debut_le", "fin_le", "budget_prevu", "devise"],
  },
  {
    key: "campagnes_releves",
    label: "Campagnes (relevés)",
    group: "Marketing",
    description: "Résultats des campagnes par période : dépense, impressions, portée, clics, leads, conversions.",
    permissions: MARKETING,
    module: "campaigns",
    columns: [
      "id", "marque", "campagne_id", "campagne", "du", "au", "depense", "devise", "impressions", "portee", "clics", "leads",
      "conversions", "valeur_conversions", "source",
    ],
  },
  {
    key: "sites_web_releves",
    label: "Sites web (relevés)",
    group: "Marketing",
    description: "Audience par site et par période : utilisateurs, sessions (par canal), pages vues, conversions.",
    permissions: MARKETING,
    module: "websites",
    columns: [
      "id", "marque", "site_id", "site", "du", "au", "utilisateurs", "sessions", "pages_vues", "conversions", "formulaires",
      "sessions_organiques", "sessions_directes", "sessions_reseaux_sociaux", "sessions_payantes", "sessions_referents",
      "sessions_email", "sessions_autres", "source",
    ],
  },
  {
    key: "budgets",
    label: "Budgets",
    group: "Budgets",
    description: "Budgets : périmètre, statut, période, montant.",
    permissions: BUDGETS,
    module: "budgets",
    columns: ["id", "marque", "nom", "perimetre", "statut", "du", "au", "montant", "devise"],
  },
  {
    key: "lignes_budget",
    label: "Lignes budgétaires",
    group: "Budgets",
    description: "Lignes de chaque budget : libellé, catégorie, campagne liée, montant prévu.",
    permissions: BUDGETS,
    module: "budgets",
    columns: ["id", "marque", "budget_id", "libelle", "categorie", "campagne_id", "montant", "devise"],
  },
  {
    key: "depenses",
    label: "Dépenses",
    group: "Budgets",
    description: "Dépenses engagées ou payées : fournisseur, date, montant, statut, ligne budgétaire.",
    permissions: BUDGETS,
    module: "budgets",
    columns: [
      "id", "marque", "ligne_budget_id", "campagne_id", "fournisseur", "date_depense", "montant", "devise", "statut",
      "payee_le", "source",
    ],
  },
  {
    key: "projets",
    label: "Projets",
    group: "Planification",
    description: `Projets : statut, responsable, dates. ${PEOPLE}`,
    permissions: ["planning.read"],
    module: "planning",
    columns: ["id", "marque", "nom", "statut", "responsable_id", "responsable", "debut_le", "fin_le"],
  },
  {
    key: "jalons",
    label: "Jalons",
    group: "Planification",
    description: "Jalons des projets : échéance et date d'atteinte.",
    permissions: ["planning.read"],
    module: "planning",
    columns: ["id", "marque", "projet_id", "nom", "echeance", "atteint_le"],
  },
  {
    key: "taches",
    label: "Tâches",
    group: "Planification",
    description: `Tâches : projet, jalon, statut, responsable, priorité, avancement, échéance. ${PEOPLE}`,
    permissions: ["planning.read"],
    module: "planning",
    columns: [
      "id", "marque", "titre", "projet_id", "jalon_id", "tache_parente_id", "statut", "categorie_statut", "responsable_id",
      "responsable", "priorite", "avancement_pct", "debut_le", "echeance", "terminee_le", "estimation_heures", "cree_le",
    ],
  },
];

export const DATASET_GROUPS: DatasetGroup[] = ["Référence", "Commercial", "Marketing", "Budgets", "Planification"];

export function findDataset(key: string): Dataset | undefined {
  return DATASETS.find((d) => d.key === key);
}

/** Durées de validité proposées (jours) ; la base refuse au-delà d'un an. */
export const VALIDITY_DAYS = [30, 90, 180, 365] as const;
export const DEFAULT_VALIDITY_DAYS = 90;
