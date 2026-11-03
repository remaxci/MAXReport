import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Section } from "./data";
import { sectionsWorkbook } from "./export";
import { formatKpi, kpiEvolution } from "./format";

const plain = (value: string | null) => value?.replace(/[  ]/g, " ") ?? null;

const sections: Section[] = [
  {
    key: "commercial",
    title: "Commercial",
    kpis: [
      { key: "calls", label: "Appels", value: 120, previous: 100, format: "count" },
      { key: "revenue_signed", label: "Chiffre d'affaires signé", value: 2_500_000, previous: null, format: "money", currency: "XOF" },
      { key: "offer_success_rate", label: "Taux de transformation des offres", value: 40, previous: 25, format: "percent" },
      { key: "emails_sent", label: "E-mails envoyés", value: null, previous: 30, format: "count" },
    ],
    notes: ["Montants en USD exclus faute de taux de change."],
  },
];

describe("formatKpi et kpiEvolution", () => {
  it("formate selon le type et n'affiche jamais 0 pour l'inconnu", () => {
    expect(plain(formatKpi(sections[0].kpis[1]))).toBe("2 500 000 F CFA");
    expect(plain(formatKpi(sections[0].kpis[2]))).toBe("40 %");
    expect(formatKpi(sections[0].kpis[3])).toBe("—");
  });

  it("exprime l'évolution en %, et celle d'un taux en points", () => {
    expect(plain(kpiEvolution(sections[0].kpis[0]))).toBe("+20 %");
    expect(plain(kpiEvolution(sections[0].kpis[2]))).toBe("+15 pt");
    expect(kpiEvolution(sections[0].kpis[1])).toBeNull();
    expect(plain(kpiEvolution(sections[0].kpis[3]))).toBe("n/d");
  });
});

describe("sectionsWorkbook", () => {
  it("écrit les mêmes chiffres qu'à l'écran, valeurs inconnues laissées vides", async () => {
    const buffer = await sectionsWorkbook("Tableau de bord · Marque X", "Période : novembre 2026", sections).xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Synthèse")!;
    const rows = sheet.getSheetValues().filter(Boolean) as unknown[][];
    const find = (label: string) => rows.find((r) => r[1] === label)!;
    expect(rows[0][1]).toBe("Tableau de bord · Marque X");
    expect(find("Appels").slice(2, 5)).toEqual([120, 100, 0.2]);
    expect(find("Chiffre d'affaires signé")[5]).toBe("XOF");
    expect(find("E-mails envoyés")[2]).toBeUndefined();
    expect(rows.some((r) => r[1] === "Montants en USD exclus faute de taux de change.")).toBe(true);
  });
});
