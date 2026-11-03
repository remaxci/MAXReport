import { describe, expect, it } from "vitest";
import { aggregationFields, derivedIndicators } from "./config";

const plain = (value: string) => value.replace(/[  ]/g, " ");
const byKey = (items: ReturnType<typeof derivedIndicators>) => Object.fromEntries(items.map((d) => [d.key, d]));

describe("derivedIndicators", () => {
  it("calcule l'engagement sur la portée, à défaut sur les impressions (signalé)", () => {
    const onReach = byKey(derivedIndicators("social", { interactions: 50, reach: 1000, impressions: 5000, clicks: null }, "XOF"));
    expect(plain(onReach.engagement.value)).toBe("5 %");
    expect(onReach.engagement.note).toBeUndefined();

    const onImpressions = byKey(derivedIndicators("social", { interactions: 50, reach: null, impressions: 5000, clicks: null }, "XOF"));
    expect(plain(onImpressions.engagement.value)).toBe("1 %");
    expect(onImpressions.engagement.note).toMatch(/impressions/);
  });

  it("donne les coûts d'une campagne, n/d sans dénominateur", () => {
    const kpis = byKey(
      derivedIndicators("campaign", { spend: 450000, impressions: 120000, clicks: 3000, leads: 45, conversions: 0, conversion_value: null }, "XOF"),
    );
    expect(plain(kpis.ctr.value)).toBe("2,5 %");
    expect(plain(kpis.cpc.value)).toBe("150 F CFA");
    expect(plain(kpis.cpl.value)).toBe("10 000 F CFA");
    expect(kpis.cost_per_conversion.value).toBe("n/d");
    expect(kpis.roas.value).toBe("n/d");
  });

  it("calcule le taux de conversion d'un site", () => {
    const kpis = byKey(derivedIndicators("website", { conversions: 25, sessions: 1000, page_views: 3000 }, "XOF"));
    expect(plain(kpis.conversion_rate.value)).toBe("2,5 %");
    expect(kpis.pages_per_session.value).toBe("3");
  });
});

describe("aggregationFields", () => {
  it("applique la bonne règle à chaque mesure", () => {
    expect(aggregationFields("social")).toMatchObject({ followers_total: "stock", impressions: "flow", reach: "exact" });
    expect(aggregationFields("website")).toMatchObject({ users: "exact", sessions: "flow", sessions_organic: "flow" });
  });
});
