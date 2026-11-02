// Formules des indicateurs : docs/architecture.md, section 6.
// Règle : une valeur absente n'est pas un zéro. Un ratio dont un terme manque,
// ou dont le dénominateur vaut 0, renvoie null (affiché « n/d »).

export type Measure = number | null | undefined;

export function ratio(
  numerator: Measure,
  denominator: Measure,
  factor = 1,
): number | null {
  if (numerator == null || denominator == null || denominator === 0) {
    return null;
  }
  return (numerator / denominator) * factor;
}

/** Taux de clics, en %. */
export const ctr = (clicks: Measure, impressions: Measure) =>
  ratio(clicks, impressions, 100);

/** Coût par clic. */
export const cpc = (spend: Measure, clicks: Measure) => ratio(spend, clicks);

/** Coût pour 1 000 impressions. */
export const cpm = (spend: Measure, impressions: Measure) =>
  ratio(spend, impressions, 1000);

/** Coût par lead. */
export const cpl = (spend: Measure, leads: Measure) => ratio(spend, leads);

/** Retour sur dépense publicitaire. */
export const roas = (conversionValue: Measure, spend: Measure) =>
  ratio(conversionValue, spend);

/** Taux de conversion d'un site, en %. */
export const conversionRate = (conversions: Measure, sessions: Measure) =>
  ratio(conversions, sessions, 100);

/** Taux d'atteinte d'un objectif, en %. */
export const achievementRate = (actual: Measure, target: Measure) =>
  ratio(actual, target, 100);

export type EngagementRate = {
  value: number | null;
  /** Base utilisée : la portée, à défaut les impressions (à signaler à l'écran). */
  basis: "reach" | "impressions" | null;
};

/** Taux d'engagement, en % : interactions ÷ portée, à défaut ÷ impressions. */
export function engagementRate(
  interactions: Measure,
  reach: Measure,
  impressions: Measure,
): EngagementRate {
  const onReach = ratio(interactions, reach, 100);
  if (onReach !== null) return { value: onReach, basis: "reach" };

  const onImpressions = ratio(interactions, impressions, 100);
  if (onImpressions !== null) return { value: onImpressions, basis: "impressions" };

  return { value: null, basis: null };
}
