import { describe, expect, it } from "vitest";
import { KINDS, WEBSITE_CHANNELS } from "./config";
import { channelsExceedTotal, parseSnapshotForm } from "./parse";

const SOCIAL = KINDS.social.measures;
const CAMPAIGN = KINDS.campaign.measures;

describe("parseSnapshotForm", () => {
  it("lit une période type et laisse vides les mesures non saisies", () => {
    const result = parseSnapshotForm(SOCIAL, { periodKind: "month", anchor: "2026-10-15", followers_total: "1 250", impressions: "0" });
    expect(result).toEqual({
      ok: true,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      values: {
        followers_total: 1250,
        followers_new: null,
        posts: null,
        impressions: 0,
        reach: null,
        interactions: null,
        clicks: null,
      },
    });
  });

  it("accepte des dates libres dans la limite d'un an", () => {
    const ok = parseSnapshotForm(SOCIAL, { periodKind: "custom", periodStart: "2026-10-05", periodEnd: "2026-10-18", posts: "4" });
    expect(ok).toMatchObject({ ok: true, periodStart: "2026-10-05", periodEnd: "2026-10-18" });
    const inverted = parseSnapshotForm(SOCIAL, { periodKind: "custom", periodStart: "2026-10-18", periodEnd: "2026-10-05", posts: "4" });
    expect(inverted).toMatchObject({ ok: false, errors: { periodEnd: "La fin précède le début." } });
    const tooLong = parseSnapshotForm(SOCIAL, { periodKind: "custom", periodStart: "2025-01-01", periodEnd: "2026-06-30", posts: "4" });
    expect(tooLong.ok).toBe(false);
  });

  it("refuse les nombres négatifs, décimaux ou illisibles", () => {
    const result = parseSnapshotForm(SOCIAL, {
      periodKind: "week",
      anchor: "2026-11-02",
      followers_new: "-3",
      posts: "2,5",
      impressions: "beaucoup",
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        followers_new: "Valeur positive attendue.",
        posts: "Nombre entier attendu.",
        impressions: "Nombre attendu.",
      },
    });
  });

  it("accepte les montants à deux décimales au plus", () => {
    expect(parseSnapshotForm(CAMPAIGN, { periodKind: "month", anchor: "2026-10-01", spend: "1 250,50" })).toMatchObject({
      ok: true,
      values: { spend: 1250.5 },
    });
    expect(parseSnapshotForm(CAMPAIGN, { periodKind: "month", anchor: "2026-10-01", spend: "0,29" })).toMatchObject({ ok: true });
    expect(parseSnapshotForm(CAMPAIGN, { periodKind: "month", anchor: "2026-10-01", spend: "10,505" }).ok).toBe(false);
  });

  it("exige au moins une mesure", () => {
    expect(parseSnapshotForm(SOCIAL, { periodKind: "month", anchor: "2026-10-01" })).toEqual({
      ok: false,
      errors: { followers_total: "Saisissez au moins une mesure." },
    });
  });
});

describe("channelsExceedTotal", () => {
  const keys = WEBSITE_CHANNELS.map((c) => c.key);

  it("détecte une ventilation supérieure au total des sessions", () => {
    expect(channelsExceedTotal({ sessions: 100, sessions_organic: 80, sessions_direct: 30 }, keys)).toBe(true);
    expect(channelsExceedTotal({ sessions: 100, sessions_organic: 80, sessions_direct: 20 }, keys)).toBe(false);
  });

  it("ne bloque rien sans total de sessions", () => {
    expect(channelsExceedTotal({ sessions: null, sessions_organic: 80 }, keys)).toBe(false);
  });
});
