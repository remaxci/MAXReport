import type { AuthContext, BrandSummary } from "@/server/authz/context";
import { indicatorAvailable, INDICATORS, type Indicator } from "./catalog";

// Ce que l'explorateur propose à l'utilisateur : ses marques et les indicateurs
// mesurables sur au moins l'une d'elles (modules actifs, droits).

/** Marques proposées : actives, plus la marque courante. */
export function explorerBrands(ctx: AuthContext, current: BrandSummary): BrandSummary[] {
  return ctx.brands.filter((b) => b.isActive || b.id === current.id);
}

/** Indicateurs mesurables sur au moins une des marques proposées, et l'indicateur par défaut. */
export function explorerIndicators(ctx: AuthContext, brands: BrandSummary[], current: BrandSummary): { indicators: Indicator[]; fallback: string | null } {
  const indicators = INDICATORS.filter((i) => brands.some((b) => indicatorAvailable(i, b, ctx.access)));
  const fallback = (indicators.find((i) => indicatorAvailable(i, current, ctx.access)) ?? indicators[0])?.key ?? null;
  return { indicators, fallback };
}
