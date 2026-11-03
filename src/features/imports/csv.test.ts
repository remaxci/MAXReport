import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv } from "./csv";

describe("detectDelimiter", () => {
  it("reconnaît le point-virgule des exports Excel français", () => {
    expect(detectDelimiter("Nom;Ville;Montant\nAlpha;Abidjan;1,5")).toBe(";");
  });

  it("reconnaît la virgule et la tabulation", () => {
    expect(detectDelimiter("name,city\nAlpha,Abidjan")).toBe(",");
    expect(detectDelimiter("name\tcity\nAlpha\tAbidjan")).toBe("\t");
  });

  it("ignore les séparateurs entre guillemets", () => {
    expect(detectDelimiter('"Nom, prénom";Ville\nA;B')).toBe(";");
  });
});

describe("parseCsv", () => {
  it("découpe lignes et cellules, fins de ligne Windows comprises", () => {
    expect(parseCsv("Nom;Ville\r\nAlpha;Abidjan\r\nBeta;Bouaké\r\n")).toEqual([
      ["Nom", "Ville"],
      ["Alpha", "Abidjan"],
      ["Beta", "Bouaké"],
    ]);
  });

  it("gère guillemets, guillemets doublés et retours à la ligne dans une cellule", () => {
    expect(parseCsv('Nom;Note\n"Alpha; SA";"Il a dit ""oui""\nsur deux lignes"')).toEqual([
      ["Nom", "Note"],
      ["Alpha; SA", 'Il a dit "oui"\nsur deux lignes'],
    ]);
  });

  it("retire la marque d'ordre des octets et garde les cellules vides", () => {
    expect(parseCsv("﻿a;b;c\n1;;3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });
});
