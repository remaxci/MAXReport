import type { ModuleKey } from "@/config/modules";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { cpc, cpl, cpm, conversionRate, ctr, engagementRate, ratio, roas } from "@/lib/metrics/formulas";
import type { Aggregation } from "@/lib/metrics/snapshots";

// Marketing : un objet suivi (compte social, campagne, site) et ses relevés.
// Les mesures et leur règle d'agrégation sont décrites ici, une fois.

export const MARKETING_KINDS = ["social", "campaign", "website"] as const;
export type MarketingKind = (typeof MARKETING_KINDS)[number];

export type Measure = {
  key: string;
  label: string;
  aggregation: Aggregation;
  /** Montant, dans la devise de la campagne. */
  money?: true;
  help?: string;
};

const SOCIAL_MEASURES: Measure[] = [
  { key: "followers_total", label: "Abonnés", aggregation: "stock", help: "Nombre total en fin de période" },
  { key: "followers_new", label: "Nouveaux abonnés", aggregation: "flow" },
  { key: "posts", label: "Publications", aggregation: "flow" },
  { key: "impressions", label: "Impressions", aggregation: "flow" },
  { key: "reach", label: "Portée", aggregation: "exact", help: "Personnes uniques touchées sur la période du relevé" },
  { key: "interactions", label: "Interactions", aggregation: "flow", help: "Réactions, commentaires, partages, enregistrements" },
  { key: "clicks", label: "Clics", aggregation: "flow" },
];

const CAMPAIGN_MEASURES: Measure[] = [
  { key: "spend", label: "Dépense", aggregation: "flow", money: true, help: "Relevée sur la plateforme" },
  { key: "impressions", label: "Impressions", aggregation: "flow" },
  { key: "reach", label: "Portée", aggregation: "exact", help: "Personnes uniques touchées sur la période du relevé" },
  { key: "clicks", label: "Clics", aggregation: "flow" },
  { key: "leads", label: "Leads", aggregation: "flow" },
  { key: "conversions", label: "Conversions", aggregation: "flow" },
  { key: "conversion_value", label: "Valeur des conversions", aggregation: "flow", money: true },
];

const WEBSITE_MEASURES: Measure[] = [
  { key: "users", label: "Utilisateurs", aggregation: "exact", help: "Visiteurs uniques sur la période du relevé" },
  { key: "sessions", label: "Sessions", aggregation: "flow" },
  { key: "page_views", label: "Pages vues", aggregation: "flow" },
  { key: "conversions", label: "Conversions", aggregation: "flow" },
  { key: "form_submissions", label: "Formulaires envoyés", aggregation: "flow" },
];

/** Sessions par canal d'acquisition (sites web). */
export const WEBSITE_CHANNELS: Measure[] = [
  { key: "sessions_organic", label: "Recherche naturelle", aggregation: "flow" },
  { key: "sessions_direct", label: "Accès direct", aggregation: "flow" },
  { key: "sessions_social", label: "Réseaux sociaux", aggregation: "flow" },
  { key: "sessions_paid", label: "Publicité payante", aggregation: "flow" },
  { key: "sessions_referral", label: "Sites référents", aggregation: "flow" },
  { key: "sessions_email", label: "E-mail", aggregation: "flow" },
  { key: "sessions_other", label: "Autres canaux", aggregation: "flow" },
];

export type KindConfig = {
  module: ModuleKey;
  /** Chemin relatif à /m/[marque]. */
  path: string;
  title: string;
  /** « le compte », « la campagne », « le site ». */
  noun: string;
  newLabel: string;
  measures: Measure[];
  /** Mesures saisies mais affichées à part (ventilation des sessions). */
  extraMeasures: Measure[];
};

export const KINDS: Record<MarketingKind, KindConfig> = {
  social: {
    module: "social",
    path: "/reseaux-sociaux",
    title: "Réseaux sociaux",
    noun: "le compte",
    newLabel: "Nouveau compte",
    measures: SOCIAL_MEASURES,
    extraMeasures: [],
  },
  campaign: {
    module: "campaigns",
    path: "/campagnes",
    title: "Campagnes",
    noun: "la campagne",
    newLabel: "Nouvelle campagne",
    measures: CAMPAIGN_MEASURES,
    extraMeasures: [],
  },
  website: {
    module: "websites",
    path: "/sites-web",
    title: "Sites web",
    noun: "le site",
    newLabel: "Nouveau site",
    measures: WEBSITE_MEASURES,
    extraMeasures: WEBSITE_CHANNELS,
  },
};

/** Toutes les mesures saisies d'un type, avec leur règle d'agrégation. */
export function aggregationFields(kind: MarketingKind): Record<string, Aggregation> {
  const { measures, extraMeasures } = KINDS[kind];
  return Object.fromEntries([...measures, ...extraMeasures].map((m) => [m.key, m.aggregation]));
}

export const CAMPAIGN_OBJECTIVES = {
  awareness: "Notoriété",
  traffic: "Trafic",
  engagement: "Engagement",
  leads: "Génération de leads",
  conversions: "Conversions",
  other: "Autre",
} as const;
export type CampaignObjective = keyof typeof CAMPAIGN_OBJECTIVES;

export const CAMPAIGN_STATUSES = {
  planned: "Prévue",
  active: "En cours",
  paused: "En pause",
  completed: "Terminée",
  cancelled: "Annulée",
} as const;
export type CampaignStatus = keyof typeof CAMPAIGN_STATUSES;

// ---------------------------------------------------------------------
// Indicateurs calculés (formules : src/lib/metrics/formulas.ts)
// ---------------------------------------------------------------------

export type Derived = { key: string; label: string; value: string; note?: string };
type Values = Readonly<Record<string, number | null>>;

export function derivedIndicators(kind: MarketingKind, v: Values, currency: string): Derived[] {
  const money = (value: number | null) => (value === null ? "n/d" : formatMoney(value, currency));
  switch (kind) {
    case "social": {
      const engagement = engagementRate(v.interactions, v.reach, v.impressions);
      return [
        {
          key: "engagement",
          label: "Taux d'engagement",
          value: formatPercent(engagement.value, 1),
          note: engagement.basis === "impressions" ? "Calculé sur les impressions (portée inconnue)" : undefined,
        },
        { key: "ctr", label: "Taux de clics", value: formatPercent(ctr(v.clicks, v.impressions), 1) },
      ];
    }
    case "campaign":
      return [
        { key: "ctr", label: "Taux de clics (CTR)", value: formatPercent(ctr(v.clicks, v.impressions), 1) },
        { key: "cpc", label: "Coût par clic (CPC)", value: money(cpc(v.spend, v.clicks)) },
        { key: "cpm", label: "Coût pour 1 000 impressions", value: money(cpm(v.spend, v.impressions)) },
        { key: "cpl", label: "Coût par lead (CPL)", value: money(cpl(v.spend, v.leads)) },
        { key: "cost_per_conversion", label: "Coût par conversion", value: money(ratio(v.spend, v.conversions)) },
        {
          key: "roas",
          label: "Retour sur dépense (ROAS)",
          value: (() => {
            const value = roas(v.conversion_value, v.spend);
            return value === null ? "n/d" : `${formatNumber(value)} ×`;
          })(),
        },
      ];
    case "website":
      return [
        { key: "conversion_rate", label: "Taux de conversion", value: formatPercent(conversionRate(v.conversions, v.sessions), 1) },
        { key: "pages_per_session", label: "Pages par session", value: formatNumber(ratio(v.page_views, v.sessions)) },
      ];
  }
}
