import { describe, expect, it } from "vitest";
import { toKey, uniqueKey } from "./keys";

const KEY_FORMAT = /^[a-z][a-z0-9_]{1,40}$/;

describe("toKey", () => {
  it("convertit un libellé français en clé technique", () => {
    expect(toKey("Relance prévue")).toBe("relance_prevue");
    expect(toKey("Secteurs d'activité")).toBe("secteurs_d_activite");
  });

  it("commence toujours par une lettre", () => {
    expect(toKey("2e relance")).toBe("x_2e_relance");
    expect(toKey("2e relance")).toMatch(KEY_FORMAT);
  });

  it("respecte la longueur maximale", () => {
    const key = toKey("Un libellé vraiment très long pour tester la limite de longueur");
    expect(key).toMatch(KEY_FORMAT);
  });

  it("produit une clé valide même pour un libellé sans lettre", () => {
    expect(toKey("!!!")).toMatch(KEY_FORMAT);
    expect(toKey("A")).toMatch(KEY_FORMAT);
  });
});

describe("uniqueKey", () => {
  it("garde la clé si elle est libre", () => {
    expect(uniqueKey("Villa", ["appartement"])).toBe("villa");
  });

  it("ajoute un suffixe si la clé est prise", () => {
    expect(uniqueKey("Villa", ["villa", "villa_2"])).toBe("villa_3");
  });

  it("reste au bon format avec un suffixe sur une clé longue", () => {
    const label = "Un libellé vraiment très long pour tester la limite";
    const key = uniqueKey(label, [toKey(label)]);
    expect(key).toMatch(KEY_FORMAT);
    expect(key.endsWith("_2")).toBe(true);
  });
});
