import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { decodeText, readSpreadsheet, shapeSheet, zipUncompressedSize } from "./read";

describe("decodeText", () => {
  it("lit l'UTF-8 et, à défaut, le Windows-1252 d'Excel", () => {
    expect(decodeText(new TextEncoder().encode("Bouaké"))).toBe("Bouaké");
    expect(decodeText(new Uint8Array([0x42, 0x6f, 0x75, 0x61, 0x6b, 0xe9]))).toBe("Bouaké");
  });
});

describe("shapeSheet", () => {
  it("nomme les en-têtes vides et distingue les doublons", () => {
    const result = shapeSheet([
      ["Nom", null, "Nom"],
      ["Alpha", "x", "y"],
    ]);
    expect(result).toEqual({
      ok: true,
      sheet: { headers: ["Nom", "Colonne 2", "Nom (2)"], rows: [["Alpha", "x", "y"]], firstLine: 2 },
    });
  });

  it("saute les lignes vides de tête et retire celles de fin", () => {
    const result = shapeSheet([[null], ["Nom"], ["Alpha"], [null], ["  "]]);
    expect(result).toEqual({ ok: true, sheet: { headers: ["Nom"], rows: [["Alpha"]], firstLine: 3 } });
  });

  it("refuse un fichier sans données", () => {
    expect(shapeSheet([["Nom"]])).toEqual({ ok: false, message: "Le fichier ne contient aucune ligne de données." });
  });
});

describe("readSpreadsheet", () => {
  it("lit un CSV au point-virgule", async () => {
    const bytes = new TextEncoder().encode("Nom;Ville\nAlpha;Abidjan\n");
    expect(await readSpreadsheet("prospects.csv", bytes)).toEqual({
      ok: true,
      sheet: { headers: ["Nom", "Ville"], rows: [["Alpha", "Abidjan"]], firstLine: 2 },
    });
  });

  it("lit un classeur Excel : dates, nombres, formules", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Données");
    sheet.addRow(["Début", "Impressions", "Total"]);
    sheet.addRow([new Date(Date.UTC(2026, 9, 1)), 1200, { formula: "B2*2", result: 2400 }]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    expect(await readSpreadsheet("export.xlsx", bytes)).toEqual({
      ok: true,
      sheet: { headers: ["Début", "Impressions", "Total"], rows: [["2026-10-01", 1200, 2400]], firstLine: 2 },
    });
  });

  it("refuse les autres formats", async () => {
    expect(await readSpreadsheet("photo.png", new Uint8Array([1]))).toEqual({
      ok: false,
      message: "Format non accepté : CSV ou Excel (.xlsx).",
    });
  });
});

describe("zipUncompressedSize", () => {
  it("lit la taille décompressée d'un vrai classeur sans le décompresser", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("A").addRow(["x".repeat(1000)]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const size = zipUncompressedSize(bytes);
    expect(size).not.toBeNull();
    expect(size!).toBeGreaterThan(1000);
  });

  it("refuse un fichier qui n'est pas une archive", async () => {
    expect(zipUncompressedSize(new TextEncoder().encode("pas un classeur"))).toBeNull();
    expect(await readSpreadsheet("faux.xlsx", new TextEncoder().encode("pas un classeur"))).toEqual({
      ok: false,
      message: "Fichier Excel illisible.",
    });
  });
});
