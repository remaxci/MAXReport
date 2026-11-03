import { describe, expect, it } from "vitest";
import { findIndicator, INDICATORS } from "./catalog";
import {
  comparisonPeriods,
  effectiveSettings,
  explorerPeriods,
  parseSettings,
  readWidgets,
  settingsSearch,
  widgetSchema,
  type ExplorerSettings,
} from "./settings";

const A = "00000000-0000-4000-9000-00000000000a";
const B = "00000000-0000-4000-9000-00000000000b";
const brands = [
  { id: A, slug: "athypik" },
  { id: B, slug: "remax" },
];
const options = { brands, defaultBrandId: A, defaultIndicator: "commercial.revenue_signed" };

describe("catalogue des indicateurs", () => {
  it("indicateurs commerciaux et relevés additifs ; jamais de valeur non additive", () => {
    expect(findIndicator("commercial.revenue_signed")?.format).toBe("money");
    expect(findIndicator("campaign.spend")?.format).toBe("money");
    expect(findIndicator("social.followers_total")?.group).toBe("Réseaux sociaux");
    expect(findIndicator("website.sessions_organic")?.label).toBe("Sessions · Recherche naturelle");
    expect(findIndicator("social.reach")).toBeUndefined();
    expect(findIndicator("website.users")).toBeUndefined();
    expect(new Set(INDICATORS.map((i) => i.key)).size).toBe(INDICATORS.length);
  });
});

describe("réglages de l'explorateur", () => {
  it("valeurs par défaut quand l'adresse est vide ou fausse", () => {
    expect(parseSettings({ indicateur: "inconnu", points: "7", decoupage: "jour" }, options)).toEqual({
      indicator: "commercial.revenue_signed",
      brandIds: [A],
      granularity: "month",
      points: 12,
      comparison: "none",
      chart: "line",
      end: null,
    });
  });

  it("lit les marques (répétées ou séparées par des virgules) parmi celles visibles seulement", () => {
    expect(parseSettings({ marques: ["remax", "inconnue"] }, options).brandIds).toEqual([B]);
    expect(parseSettings({ marques: "athypik,remax" }, options).brandIds).toEqual([A, B]);
  });

  it("aller-retour adresse ↔ réglages", () => {
    const settings: ExplorerSettings = {
      indicator: "campaign.leads",
      brandIds: [A, B],
      granularity: "week",
      points: 24,
      comparison: "last_year",
      chart: "bar",
    };
    const search = settingsSearch(settings, new Map(brands.map((b) => [b.id, b.slug])), "2026-11-03");
    const query = Object.fromEntries([...new URLSearchParams(search).keys()].map((k) => [k, new URLSearchParams(search).getAll(k)]));
    expect(parseSettings(query, options)).toEqual({ ...settings, end: "2026-11-03" });
  });

  it("comparaison : une seule marque ; empilement : plusieurs marques sans comparaison", () => {
    const base: ExplorerSettings = { indicator: "campaign.leads", brandIds: [A, B], granularity: "month", points: 12, comparison: "previous", chart: "stacked" };
    const multi = effectiveSettings(base);
    expect(multi.comparison).toBe("none");
    expect(multi.chart).toBe("stacked");
    expect(multi.notes).toHaveLength(1);
    expect(effectiveSettings({ ...base, brandIds: [A] })).toMatchObject({ comparison: "previous", chart: "bar" });
  });
});

describe("périodes", () => {
  it("six mois jusqu'au mois de la date choisie", () => {
    const periods = explorerPeriods({ granularity: "month", points: 6 }, "2026-11-03");
    expect(periods.map((p) => p.start)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]);
  });

  it("comparaison alignée point par point : bloc précédent ou année précédente", () => {
    const periods = explorerPeriods({ granularity: "month", points: 3 }, "2026-11-03");
    expect(comparisonPeriods(periods, "previous")?.map((p) => p.start)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
    expect(comparisonPeriods(periods, "last_year")?.map((p) => p.start)).toEqual(["2025-09-01", "2025-10-01", "2025-11-01"]);
    expect(comparisonPeriods(periods, "none")).toBeNull();
  });
});

describe("graphiques enregistrés", () => {
  const widget = { indicator: "commercial.offers_sent", brandIds: [A], granularity: "month", points: 12, comparison: "none", chart: "line" };

  it("n'accepte que des réglages connus : jamais de chiffres ni de champ libre", () => {
    expect(widgetSchema.safeParse(widget).success).toBe(true);
    expect(widgetSchema.safeParse({ ...widget, indicator: "drop table" }).success).toBe(false);
    expect(widgetSchema.safeParse({ ...widget, points: 1000 }).success).toBe(false);
    expect(widgetSchema.safeParse({ ...widget, brandIds: [] }).success).toBe(false);
    expect(widgetSchema.parse({ ...widget, values: [1, 2, 3] })).not.toHaveProperty("values");
  });

  it("écarte à la lecture un graphique devenu illisible", () => {
    expect(readWidgets([widget, { indicator: "x" }, "texte"])).toMatchObject({ invalid: 2 });
    expect(readWidgets(null)).toEqual({ widgets: [], invalid: 0 });
  });
});
