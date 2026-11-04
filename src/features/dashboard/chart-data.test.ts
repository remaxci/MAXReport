import { describe, expect, it } from "vitest";
import { seriesPeriods } from "@/lib/metrics/series";
import { periodRange } from "@/lib/periods";
import { knownKeys, rowsByEntity, shortCategory, stageFunnel, timeRows } from "./chart-data";

describe("graphiques par élément suivi", () => {
  const parents = [
    { parentId: "fb", values: { clicks: 1074, impressions: 63141 } },
    { parentId: "li", values: { clicks: 587, impressions: 11711 } },
    { parentId: "x", values: { clicks: null, impressions: 10 } },
    { parentId: "ancien", values: { clicks: 5, impressions: null } },
  ];
  const names = new Map([["fb", "Facebook"], ["li", "LinkedIn"], ["x", "Sans clics"]]);

  it("du plus grand au plus petit, sans ceux dont la mesure est inconnue", () => {
    const rows = rowsByEntity(parents, names, (v) => ({ clicks: v.clicks, impressions: v.impressions }), "clicks");
    expect(rows.map((r) => r.label)).toEqual(["Facebook", "LinkedIn", "Élément supprimé"]);
    expect(rows[0].values.impressions).toBe(63141);
  });

  it("un 0 connu reste affiché", () => {
    expect(rowsByEntity([{ parentId: "fb", values: { clicks: 0 } }], names, (v) => ({ clicks: v.clicks }), "clicks")).toHaveLength(1);
  });

  it("le calcul reçoit l'identifiant (conversion selon la devise de la campagne)", () => {
    const rows = rowsByEntity(parents.slice(0, 1), names, (_, id) => ({ clicks: id === "fb" ? 1 : 2 }), "clicks");
    expect(rows[0].values.clicks).toBe(1);
  });
});

describe("noms sur l'axe d'un graphique en barres", () => {
  it("entiers quand la place suffit, raccourcis sur un téléphone", () => {
    expect(shortCategory("Aminata K. (démo)", 4, 560)).toBe("Aminata K. (démo)");
    expect(shortCategory("Aminata K. (démo)", 4, 311)).toBe("Aminata…");
    expect(shortCategory("Yao S. (démo)", 4, 311)).toBe("Yao S.…");
  });

  it("jamais moins de quatre caractères, même nombreux ; largeur inconnue au premier affichage", () => {
    expect(shortCategory("Aminata K. (démo)", 20, 311)).toBe("Ami…");
    expect(shortCategory("Aminata K. (démo)", 4, 0)).toBe("Aminata K. (démo)");
  });
});

describe("données des graphiques", () => {
  it("une ligne par période, libellés courts et complets", () => {
    const rows = timeRows(seriesPeriods(periodRange("month", "2026-11-03"), 2), (p, i) => ({ x: i === 0 ? null : 5 }));
    expect(rows).toEqual([
      { key: "2026-10-01", label: "oct. 26", title: "Octobre 2026", values: { x: null } },
      { key: "2026-11-01", label: "nov. 26", title: "Novembre 2026", values: { x: 5 } },
    ]);
  });

  it("entonnoir : étapes dans l'ordre, montants convertis, sans taux exclus et comptés", () => {
    const stages = [
      { id: "s1", label: "Découverte", isActive: true },
      { id: "s2", label: "Proposition", isActive: true },
      { id: "s3", label: "Ancienne étape", isActive: false },
    ];
    const opportunities = [
      { stageId: "s1", amount: 1000, currency: "EUR" },
      { stageId: "s1", amount: null, currency: null },
      { stageId: "s2", amount: 500, currency: "USD" },
    ];
    const { rows, excluded } = stageFunnel(stages, opportunities, "XOF", "2026-11-03", []);
    expect(rows.map((r) => r.label)).toEqual(["Découverte", "Proposition"]);
    expect(rows[0].values.count).toBe(2);
    expect(rows[0].values.amount).toBeCloseTo(655957);
    // Dollar sans taux saisi : exclu, montant inconnu (jamais 0).
    expect(rows[1].values).toEqual({ count: 1, amount: null });
    expect(excluded).toBe(1);
  });

  it("une étape désactivée reste visible tant qu'elle porte des opportunités", () => {
    const { rows } = stageFunnel([{ id: "old", label: "Ancienne", isActive: false }], [{ stageId: "old", amount: 10, currency: "XOF" }], "XOF", "2026-11-03", []);
    expect(rows).toHaveLength(1);
  });

  it("ne garde que les canaux réellement relevés", () => {
    const rows = [
      { key: "a", label: "a", values: { organic: null, direct: 3, social: null } },
      { key: "b", label: "b", values: { organic: 0, direct: null, social: null } },
    ];
    expect(knownKeys(rows, ["organic", "direct", "social"])).toEqual(["organic", "direct"]);
  });
});
