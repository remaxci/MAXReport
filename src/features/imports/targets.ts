import type { ModuleKey } from "@/config/modules";
import { KINDS, type MarketingKind } from "@/features/marketing/config";
import { METRIC_KEYS, METRICS, type MetricKey } from "@/lib/metrics/actuals";
import type { Permission } from "@/server/authz/permissions";
import { normalizeKey } from "./values";

// Tables alimentées par import et champs attendus. Les alias servent à
// proposer la correspondance des colonnes (exports Excel français, Meta,
// Google Ads, GA4…).

export const IMPORT_TARGETS = [
  "social_snapshots",
  "campaign_snapshots",
  "website_snapshots",
  "companies",
  "historical_metrics",
] as const;
export type ImportTarget = (typeof IMPORT_TARGETS)[number];

export function isImportTarget(value: string): value is ImportTarget {
  return (IMPORT_TARGETS as readonly string[]).includes(value);
}

export type FieldKind =
  | "parent"
  | "date"
  | "count"
  | "money"
  | "number"
  | "text"
  | "email"
  | "url"
  | "option"
  | "member"
  | "metric"
  | "currency";

export type TargetField = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  max?: number;
  /** Liste de choix de la marque (champs « option »). */
  list?: string;
  aliases: string[];
};

export type TargetConfig = {
  label: string;
  description: string;
  /** Module à activer pour la marque. */
  module: ModuleKey;
  /** Droit sur la table cible, en plus de imports.manage. */
  permission: Permission;
  /** Type d'objet marketing dont on importe les relevés. */
  marketing?: MarketingKind;
  fields: TargetField[];
};

const ALIASES: Record<string, string[]> = {
  period_start: ["début", "date de début", "début des rapports", "reporting starts", "start date", "date", "jour", "day", "du"],
  period_end: ["fin", "date de fin", "fin des rapports", "reporting ends", "end date", "au"],
  followers_total: ["abonnés", "followers", "fans", "total abonnés", "total followers", "nombre d'abonnés"],
  followers_new: ["nouveaux abonnés", "new followers", "nouveaux fans", "new fans", "gains d'abonnés"],
  posts: ["publications", "posts", "nombre de publications"],
  impressions: ["impressions"],
  reach: ["portée", "reach", "couverture", "personnes atteintes"],
  interactions: ["interactions", "engagement", "engagements", "post engagement"],
  clicks: ["clics", "clicks", "clics sur un lien", "link clicks", "clicks (all)", "clics (tous)"],
  spend: ["dépense", "dépenses", "montant dépensé", "amount spent", "spend", "coût", "cost"],
  leads: ["leads", "prospects"],
  conversions: ["conversions", "résultats", "results", "key events", "événements clés"],
  conversion_value: ["valeur des conversions", "valeur de conversion", "conversion value", "purchase value", "revenus"],
  users: ["utilisateurs", "users", "total users", "utilisateurs actifs", "active users", "visiteurs"],
  sessions: ["sessions", "visites"],
  page_views: ["pages vues", "vues", "views", "page views", "vues de page"],
  form_submissions: ["formulaires envoyés", "form submissions", "envois de formulaire", "form submit"],
  sessions_organic: ["organic search", "recherche organique", "recherche naturelle"],
  sessions_direct: ["direct", "accès direct"],
  sessions_social: ["organic social", "réseaux sociaux"],
  sessions_paid: ["paid search", "paid social", "publicité payante"],
  sessions_referral: ["referral", "sites référents", "référents"],
  sessions_email: ["email", "e-mail"],
  sessions_other: ["unassigned", "autres canaux", "other"],
  comments: ["commentaires", "commentaire", "notes", "remarques"],
};

function measureFields(kind: MarketingKind): TargetField[] {
  const { measures, extraMeasures } = KINDS[kind];
  return [...measures, ...extraMeasures].map((m) => ({
    key: m.key,
    label: m.label,
    kind: m.money ? "money" : "count",
    aliases: ALIASES[m.key] ?? [],
  }));
}

function snapshotFields(kind: MarketingKind, parentLabel: string, parentAliases: string[]): TargetField[] {
  return [
    { key: "parent", label: parentLabel, kind: "parent", aliases: parentAliases },
    { key: "period_start", label: "Début de période", kind: "date", required: true, aliases: ALIASES.period_start },
    { key: "period_end", label: "Fin de période", kind: "date", aliases: ALIASES.period_end },
    ...measureFields(kind),
    { key: "comments", label: "Commentaires", kind: "text", max: 2000, aliases: ALIASES.comments },
  ];
}

/** Alias des indicateurs commerciaux (historique agrégé). */
export const METRIC_ALIASES: Record<MetricKey, string[]> = {
  calls: ["appels", "calls"],
  emails_sent: ["e-mails", "emails", "e-mails envoyés"],
  qualified_meetings: ["rendez-vous", "rdv", "rendez-vous qualifiés", "meetings"],
  opportunities_created: ["opportunités", "opportunities"],
  offers_sent: ["offres", "offres envoyées", "offers"],
  memos_sent: ["mémos", "memos", "mémos envoyés"],
  contracts_signed: ["contrats", "contrats signés", "contracts"],
  revenue_signed: ["ca", "chiffre d'affaires", "ca signé", "revenue"],
};

export const TARGETS: Record<ImportTarget, TargetConfig> = {
  social_snapshots: {
    label: "Relevés des réseaux sociaux",
    description: "Une ligne par compte et par période (export Meta Business Suite, LinkedIn…).",
    module: "social",
    permission: "marketing.manage",
    marketing: "social",
    fields: snapshotFields("social", "Compte", ["compte", "page", "account", "nom du compte", "page name", "réseau"]),
  },
  campaign_snapshots: {
    label: "Relevés des campagnes",
    description: "Une ligne par campagne et par période (export Meta Ads, Google Ads…). Montants dans la devise de la campagne.",
    module: "campaigns",
    permission: "marketing.manage",
    marketing: "campaign",
    fields: snapshotFields("campaign", "Campagne (nom ou référence)", [
      "campagne",
      "nom de la campagne",
      "campaign name",
      "campaign",
      "campaign id",
      "id de la campagne",
    ]),
  },
  website_snapshots: {
    label: "Relevés des sites web",
    description: "Une ligne par site et par période (export Google Analytics…).",
    module: "websites",
    permission: "marketing.manage",
    marketing: "website",
    fields: snapshotFields("website", "Site (nom ou adresse)", ["site", "site web", "website", "propriété", "property"]),
  },
  companies: {
    label: "Prospects",
    description: "Une ligne par entreprise. Les noms déjà présents dans l'annuaire sont signalés comme doublons.",
    module: "crm",
    permission: "crm.manage",
    fields: [
      {
        key: "name",
        label: "Nom de l'entreprise",
        kind: "text",
        required: true,
        max: 200,
        aliases: ["nom", "entreprise", "société", "raison sociale", "company", "name", "client", "prospect", "nom de l'entreprise"],
      },
      { key: "sector", label: "Secteur", kind: "option", list: "industries", aliases: ["secteur", "secteur d'activité", "industry", "activité"] },
      { key: "source", label: "Origine", kind: "option", list: "lead_sources", aliases: ["source", "origine", "provenance", "lead source"] },
      { key: "city", label: "Ville", kind: "text", max: 120, aliases: ["ville", "city", "localité", "commune"] },
      { key: "country", label: "Pays", kind: "text", max: 120, aliases: ["pays", "country"] },
      { key: "phone", label: "Téléphone", kind: "text", max: 40, aliases: ["téléphone", "tel", "tél", "phone", "mobile"] },
      { key: "email", label: "E-mail", kind: "email", max: 200, aliases: ["e-mail", "email", "courriel", "mail"] },
      { key: "website", label: "Site web", kind: "url", max: 300, aliases: ["site web", "site", "website", "url"] },
      {
        key: "next_follow_up_on",
        label: "Prochaine relance",
        kind: "date",
        aliases: ["prochaine relance", "relance", "date de relance", "follow up"],
      },
    ],
  },
  historical_metrics: {
    label: "Historique agrégé",
    description:
      "Chiffres d'avant MAXreport, par indicateur et par période, pour l'équipe ou un collaborateur. Ils restent séparés des données saisies.",
    module: "imports",
    permission: "imports.manage",
    fields: [
      { key: "metric_key", label: "Indicateur", kind: "metric", required: true, aliases: ["indicateur", "kpi", "métrique", "metric"] },
      {
        key: "member",
        label: "Collaborateur (vide : équipe)",
        kind: "member",
        aliases: ["collaborateur", "commercial", "utilisateur", "nom du commercial", "e-mail du collaborateur"],
      },
      { key: "period_start", label: "Début de période", kind: "date", required: true, aliases: ALIASES.period_start },
      { key: "period_end", label: "Fin de période", kind: "date", aliases: ALIASES.period_end },
      { key: "value", label: "Valeur", kind: "number", required: true, aliases: ["valeur", "réalisé", "montant", "value", "total", "nombre"] },
      { key: "currency", label: "Devise (chiffre d'affaires)", kind: "currency", aliases: ["devise", "currency", "monnaie"] },
      { key: "comments", label: "Commentaires", kind: "text", max: 2000, aliases: ALIASES.comments },
    ],
  },
};

/** Indicateur reconnu par sa clé, son libellé ou un alias. */
export function matchMetric(raw: string): MetricKey | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  for (const metric of METRIC_KEYS) {
    const names = [metric, METRICS[metric].label, ...METRIC_ALIASES[metric]];
    if (names.some((name) => normalizeKey(name) === key)) return metric;
  }
  return null;
}

export type Mapping = Record<string, number>;

/**
 * Correspondance proposée : d'abord les en-têtes identiques à un alias, puis
 * ceux qui en contiennent un (alias de 5 caractères au moins, le plus long
 * l'emporte). Une colonne ne sert qu'une fois.
 */
export function suggestMapping(target: ImportTarget, headers: readonly string[]): Mapping {
  const fields = TARGETS[target].fields;
  const keys = headers.map(normalizeKey);
  const mapping: Mapping = {};
  const used = new Set<number>();
  const names = (field: TargetField) => [field.label, field.key, ...field.aliases].map(normalizeKey).filter(Boolean);

  for (const field of fields) {
    const index = keys.findIndex((key, i) => !used.has(i) && names(field).includes(key));
    if (index >= 0) {
      mapping[field.key] = index;
      used.add(index);
    }
  }
  for (const field of fields) {
    if (mapping[field.key] !== undefined) continue;
    let bestIndex = -1;
    let bestLength = 0;
    for (const alias of names(field)) {
      if (alias.length < 5) continue;
      keys.forEach((key, i) => {
        if (!used.has(i) && key.includes(alias) && alias.length > bestLength) {
          bestIndex = i;
          bestLength = alias.length;
        }
      });
    }
    if (bestIndex >= 0) {
      mapping[field.key] = bestIndex;
      used.add(bestIndex);
    }
  }
  return mapping;
}
