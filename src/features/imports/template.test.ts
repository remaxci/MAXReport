import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { checkBatch, DEFAULT_OPTIONS, type ImportContext } from "./normalize";
import { readSpreadsheet } from "./read";
import { IMPORT_TARGETS, suggestMapping, TARGETS, type ImportTarget } from "./targets";
import { buildTemplate, type TemplateLists } from "./template";
import { normalizeKey } from "./values";

const LISTS: TemplateLists = {
  parents: ["Page Facebook", "Budget 2026 › Média"],
  options: { industries: ["Immobilier", "Banque et assurance"], lead_sources: ["Site web"] },
  members: ["Awa Koné"],
};

/** Modèle rempli d'une ligne, relu comme un fichier envoyé. */
async function fill(target: ImportTarget, values: Record<string, ExcelJS.CellValue>) {
  const workbook = buildTemplate(target, LISTS);
  workbook.getWorksheet("À remplir")!.addRow(values);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const read = await readSpreadsheet("modele.xlsx", bytes);
  if (!read.ok) throw new Error(read.message);
  return read.sheet;
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("buildTemplate", () => {
  it.each(IMPORT_TARGETS)("%s : chaque colonne est reconnue à l'import, à sa place", async (target) => {
    const first = TARGETS[target].fields[0];
    const sheet = await fill(target, { [first.key]: "x" });
    expect(sheet.headers).toEqual(TARGETS[target].fields.map((f) => f.label));
    expect(suggestMapping(target, sheet.headers)).toEqual(
      Object.fromEntries(TARGETS[target].fields.map((f, i) => [f.key, i])),
    );
  });

  it("ne contient aucune ligne de données : rien n'est importable tel quel", async () => {
    const bytes = new Uint8Array(await buildTemplate("companies", LISTS).xlsx.writeBuffer());
    expect(await readSpreadsheet("modele.xlsx", bytes)).toEqual({
      ok: false,
      message: "Le fichier ne contient aucune ligne de données.",
    });
  });

  it("propose les listes de la marque dans un onglet masqué", () => {
    const workbook = buildTemplate("companies", LISTS);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["À remplir", "Aide", "Listes"]);
    const lists = workbook.getWorksheet("Listes")!;
    expect(lists.state).toBe("hidden");
    expect(lists.getColumn(1).values.slice(1)).toEqual(["Secteur", "Immobilier", "Banque et assurance"]);
    expect(lists.getColumn(2).values.slice(1)).toEqual(["Origine", "Site web"]);
  });

  it("signale dans l'aide une liste encore vide", () => {
    const workbook = buildTemplate("social_snapshots", { parents: [] });
    const help = workbook.getWorksheet("Aide")!;
    expect(String(help.getRow(2).getCell(3).value)).toMatch(/créez-les dans MAXreport/);
    expect(String(help.getRow(3).getCell(2).value)).toBe("Oui");
  });
});

describe("modèle rempli avec les choix proposés", () => {
  it("prospects : secteur et origine reconnus", async () => {
    const sheet = await fill("companies", { name: "Alpha SA", sector: "Immobilier", source: "Site web", city: "Abidjan" });
    const context: ImportContext = {
      existingNames: new Set(),
      options: {
        industries: [{ value: "immobilier", label: "Immobilier" }],
        lead_sources: [{ value: "site_web", label: "Site web" }],
      },
    };
    const { lines } = checkBatch("companies", sheet.rows, suggestMapping("companies", sheet.headers), DEFAULT_OPTIONS, context);
    expect(lines).toMatchObject([{ status: "ok", record: { name: "Alpha SA", sector: "immobilier", source: "site_web" } }]);
  });

  it("historique agrégé : indicateur, collaborateur et devise reconnus", async () => {
    const sheet = await fill("historical_metrics", {
      metric_key: "Chiffre d'affaires signé",
      member: "Awa Koné",
      period_start: day("2026-01-01"),
      period_end: day("2026-03-31"),
      value: 2500000,
      currency: "XOF",
    });
    const context: ImportContext = {
      members: [{ id: "u1", label: "Awa Koné", keys: [normalizeKey("Awa Koné")] }],
      existingHistorical: [],
    };
    const { lines } = checkBatch(
      "historical_metrics",
      sheet.rows,
      suggestMapping("historical_metrics", sheet.headers),
      DEFAULT_OPTIONS,
      context,
    );
    expect(lines).toMatchObject([
      {
        status: "ok",
        record: { user_id: "u1", metric_key: "revenue_signed", period_start: "2026-01-01", period_end: "2026-03-31", currency: "XOF" },
      },
    ]);
  });

  it("dépenses : ligne budgétaire « Budget › Ligne » et état « Payée » reconnus", async () => {
    const sheet = await fill("expenses", {
      parent: "Budget 2026 › Média",
      expense_date: day("2026-02-10"),
      description: "Campagne radio",
      amount: 450000,
      currency: "XOF",
      status: "Payée",
      paid_on: day("2026-02-20"),
    });
    const context: ImportContext = {
      parents: [{ id: "l1", label: "Budget 2026 › Média", keys: [normalizeKey("Média"), normalizeKey("Budget 2026 Média")] }],
      existingExpenses: [],
    };
    const { lines } = checkBatch("expenses", sheet.rows, suggestMapping("expenses", sheet.headers), DEFAULT_OPTIONS, context);
    expect(lines).toMatchObject([{ status: "ok", record: { budget_line_id: "l1", status: "paid", paid_on: "2026-02-20" } }]);
  });
});
