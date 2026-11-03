import { describe, expect, it } from "vitest";
import { checkBatch, readOptions } from "./normalize";
import { readSpreadsheet } from "./read";
import { suggestMapping } from "./targets";

// Chaîne complète d'un import, du fichier aux enregistrements prêts pour commit_import.
describe("import d'un export Meta Ads (CSV français)", () => {
  const csv = [
    "Nom de la campagne;Début des rapports;Fin des rapports;Montant dépensé (XOF);Impressions;Clics sur un lien;Résultats",
    "Lancement T4;01/10/2026;31/10/2026;450 000;120 000;3 000;45",
    "Lancement T4;01/10/2026;31/10/2026;450 000;120 000;3 000;45",
    "Campagne inconnue;01/10/2026;31/10/2026;1 000;10;1;0",
    "",
  ].join("\r\n");

  it("lit, associe les colonnes, vérifie et écarte doublons et inconnus", async () => {
    const read = await readSpreadsheet("meta.csv", new TextEncoder().encode(csv));
    if (!read.ok) throw new Error(read.message);
    const { headers, rows, firstLine } = read.sheet;
    const mapping = suggestMapping("campaign_snapshots", headers);
    expect(mapping).toMatchObject({ parent: 0, period_start: 1, period_end: 2, spend: 3, impressions: 4, clicks: 5, conversions: 6 });

    const result = checkBatch(
      "campaign_snapshots",
      rows,
      mapping,
      readOptions({}),
      { parents: [{ id: "camp-1", label: "Lancement T4", keys: ["lancementt4"] }], existingPeriods: [] },
      firstLine,
    );
    expect(result.counts).toEqual({ ok: 1, duplicate: 1, error: 1 });
    expect(result.lines[0].record).toEqual({
      campaign_id: "camp-1",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      spend: 450000,
      impressions: 120000,
      reach: null,
      clicks: 3000,
      leads: null,
      conversions: 45,
      conversion_value: null,
      comments: null,
    });
    expect(result.lines.map((l) => l.line)).toEqual([2, 3, 4]);
  });
});
