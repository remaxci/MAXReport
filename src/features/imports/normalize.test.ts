import { describe, expect, it } from "vitest";
import { checkBatch, DEFAULT_OPTIONS, readOptions, type ImportContext } from "./normalize";
import { suggestMapping } from "./targets";

const PAGE = { id: "acc-1", label: "Page officielle", keys: ["pageofficielle", "marquex"] };

describe("suggestMapping", () => {
  it("propose les colonnes d'un export Meta Ads", () => {
    const headers = ["Nom de la campagne", "Début des rapports", "Fin des rapports", "Montant dépensé (XOF)", "Impressions", "Clics sur un lien"];
    expect(suggestMapping("campaign_snapshots", headers)).toEqual({
      parent: 0,
      period_start: 1,
      period_end: 2,
      spend: 3,
      impressions: 4,
      clicks: 5,
    });
  });

  it("n'utilise jamais deux fois la même colonne", () => {
    const mapping = suggestMapping("companies", ["Société", "Ville", "E-mail", "Site web"]);
    expect(mapping).toEqual({ name: 0, city: 1, email: 2, website: 3 });
  });
});

describe("checkBatch · relevés", () => {
  const context: ImportContext = {
    parents: [PAGE],
    existingPeriods: [{ parentId: "acc-1", start: "2026-09-01", end: "2026-09-30" }],
  };
  const mapping = { parent: 0, period_start: 1, period_end: 2, impressions: 3, followers_total: 4 };

  it("prépare les lignes valides, avec mesures vides laissées vides", () => {
    const result = checkBatch("social_snapshots", [["@marquex", "01/10/2026", "31/10/2026", "12 500", ""]], mapping, DEFAULT_OPTIONS, context);
    expect(result.counts).toEqual({ ok: 1, duplicate: 0, error: 0 });
    expect(result.lines[0].record).toMatchObject({
      account_id: "acc-1",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      impressions: 12500,
      followers_total: null,
    });
  });

  it("signale doublons en base et chevauchements dans le fichier", () => {
    const result = checkBatch(
      "social_snapshots",
      [
        ["Page officielle", "2026-09-15", "2026-09-21", "10", ""],
        ["Page officielle", "2026-10-01", "2026-10-31", "10", ""],
        ["Page officielle", "2026-10-20", "2026-11-05", "10", ""],
      ],
      mapping,
      DEFAULT_OPTIONS,
      context,
    );
    expect(result.lines.map((l) => [l.line, l.status])).toEqual([
      [2, "duplicate"],
      [3, "ok"],
      [4, "duplicate"],
    ]);
    expect(result.lines[2].message).toBe("Chevauche la ligne 3 du fichier.");
  });

  it("refuse les lignes sans objet connu, sans mesure ou illisibles", () => {
    const result = checkBatch(
      "social_snapshots",
      [
        ["Autre page", "2026-10-01", "2026-10-31", "10", ""],
        ["Page officielle", "2026-11-01", "2026-11-30", "", ""],
        ["Page officielle", "31/02/2026", "", "10", ""],
        ["Page officielle", "2026-12-01", "2026-12-31", "-4", ""],
      ],
      mapping,
      DEFAULT_OPTIONS,
      context,
    );
    expect(result.lines.map((l) => l.message)).toEqual([
      "Introuvable dans MAXreport : « Autre page ».",
      "Aucune mesure renseignée.",
      "Date de début illisible : « 31/02/2026 ».",
      "Impressions : valeur positive attendue.",
    ]);
  });

  it("déduit la période d'une seule date et utilise l'objet choisi par défaut", () => {
    const options = readOptions({ periodKind: "month", defaultParentId: "acc-1" });
    const result = checkBatch("social_snapshots", [["2026-10-15", "800"]], { period_start: 0, impressions: 1 }, options, context);
    expect(result.lines[0].record).toMatchObject({ account_id: "acc-1", period_start: "2026-10-01", period_end: "2026-10-31" });
  });

  it("ignore les lignes entièrement vides et numérote comme le fichier", () => {
    const result = checkBatch("social_snapshots", [["", "", "", "", ""], ["@marquex", "2026-10-01", "2026-10-31", "5", ""]], mapping, DEFAULT_OPTIONS, context, 3);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].line).toBe(4);
  });
});

describe("checkBatch · sites web", () => {
  it("refuse une ventilation par canal supérieure aux sessions", () => {
    const context: ImportContext = { parents: [{ id: "site-1", label: "Site", keys: ["site"] }] };
    const result = checkBatch(
      "website_snapshots",
      [["Site", "2026-10-01", "2026-10-31", "100", "80", "30"]],
      { parent: 0, period_start: 1, period_end: 2, sessions: 3, sessions_organic: 4, sessions_direct: 5 },
      DEFAULT_OPTIONS,
      context,
    );
    expect(result.lines[0].message).toBe("La ventilation par canal dépasse le total des sessions.");
  });
});

describe("checkBatch · prospects", () => {
  const context: ImportContext = {
    existingNames: new Set(["alpha"]),
    options: { industries: [{ value: "immobilier", label: "Immobilier" }], lead_sources: [] },
  };
  const mapping = { name: 0, sector: 1, email: 2, website: 3 };

  it("rapproche les listes par libellé et complète l'adresse web", () => {
    const result = checkBatch("companies", [["Beta SA", "immobilier", "contact@beta.ci", "beta.ci"]], mapping, DEFAULT_OPTIONS, context);
    expect(result.lines[0]).toMatchObject({
      status: "ok",
      record: { name: "Beta SA", sector: "immobilier", email: "contact@beta.ci", website: "https://beta.ci" },
    });
  });

  it("signale les noms déjà connus et les valeurs hors liste", () => {
    const result = checkBatch(
      "companies",
      [
        ["ALPHA", "", "", ""],
        ["Gamma", "Banque", "", ""],
        ["Delta", "", "pas-un-mail", ""],
        ["Epsilon", "", "", ""],
        ["epsilon", "", "", ""],
      ],
      mapping,
      DEFAULT_OPTIONS,
      context,
    );
    expect(result.lines.map((l) => l.status)).toEqual(["duplicate", "error", "error", "ok", "duplicate"]);
    expect(result.lines[1].message).toMatch(/^Secteur inconnu/);
  });
});

describe("checkBatch · historique agrégé", () => {
  const context: ImportContext = {
    members: [{ id: "user-1", label: "Awa Koné", keys: ["awakone", "awakonetestci"] }],
    existingHistorical: [{ metric: "calls", userId: null, currency: null, start: "2024-01-01", end: "2024-12-31" }],
  };
  const mapping = { metric_key: 0, member: 1, period_start: 2, period_end: 3, value: 4, currency: 5 };

  it("reconnaît indicateurs et collaborateurs, équipe par défaut", () => {
    const result = checkBatch(
      "historical_metrics",
      [
        ["Appels", "", "01/01/2025", "31/12/2025", "1 200", ""],
        ["CA signé", "awa.kone@test.ci", "01/01/2025", "31/12/2025", "25 000 000", "xof"],
      ],
      mapping,
      DEFAULT_OPTIONS,
      context,
    );
    expect(result.lines.map((l) => l.record)).toEqual([
      { user_id: null, metric_key: "calls", period_start: "2025-01-01", period_end: "2025-12-31", value: 1200, currency: null, comments: null },
      {
        user_id: "user-1",
        metric_key: "revenue_signed",
        period_start: "2025-01-01",
        period_end: "2025-12-31",
        value: 25000000,
        currency: "XOF",
        comments: null,
      },
    ]);
  });

  it("signale les recouvrements et exige une devise pour le chiffre d'affaires", () => {
    const result = checkBatch(
      "historical_metrics",
      [
        ["calls", "", "2024-06-01", "2024-06-30", "10", ""],
        ["revenue_signed", "", "2025-01-01", "2025-12-31", "100", ""],
        ["inconnu", "", "2025-01-01", "2025-12-31", "1", ""],
      ],
      mapping,
      DEFAULT_OPTIONS,
      context,
    );
    expect(result.lines.map((l) => [l.status, l.message])).toEqual([
      ["duplicate", "Déjà en base : un chiffre couvre tout ou partie de cette période."],
      ["error", "Devise manquante pour le chiffre d'affaires."],
      ["error", "Indicateur inconnu : « inconnu »."],
    ]);
  });
});
