import { describe, expect, it } from "vitest";
import { inputName, parseCustomFields, parseNumber } from "./parse";
import type { FieldDefinition } from "./types";

function field(partial: Partial<FieldDefinition> & Pick<FieldDefinition, "key" | "type">): FieldDefinition {
  return {
    id: partial.key,
    label: partial.key,
    helpText: null,
    required: false,
    isActive: true,
    validation: {},
    options: [],
    ...partial,
  };
}

function form(entries: [string, string][]) {
  const data = new FormData();
  entries.forEach(([k, v]) => data.append(k, v));
  return data;
}

const sources = [
  { value: "site_web", label: "Site web", isActive: true },
  { value: "partenaire", label: "Partenaire", isActive: false },
];

describe("parseNumber", () => {
  it("accepte la virgule décimale et les espaces", () => {
    expect(parseNumber("1 250,5")).toBe(1250.5);
    expect(parseNumber("25 000 000")).toBe(25000000);
  });

  it("refuse le texte", () => {
    expect(parseNumber("douze")).toBeNull();
    expect(parseNumber("12abc")).toBeNull();
  });
});

describe("parseCustomFields", () => {
  it("lit et type chaque valeur", () => {
    const fields = [
      field({ key: "ref", type: "text" }),
      field({ key: "surface", type: "number" }),
      field({ key: "budget", type: "money" }),
      field({ key: "echeance", type: "date" }),
      field({ key: "vip", type: "boolean" }),
      field({ key: "source", type: "select", options: sources }),
      field({ key: "canaux", type: "multiselect", options: sources }),
    ];
    const { values, errors } = parseCustomFields(
      fields,
      form([
        [inputName("ref"), " OF-12 "],
        [inputName("surface"), "120,5"],
        [inputName("budget", "amount"), "25 000 000"],
        [inputName("budget", "currency"), "XOF"],
        [inputName("echeance"), "2026-12-31"],
        [inputName("vip"), "on"],
        [inputName("source"), "site_web"],
        [inputName("canaux"), "site_web"],
      ]),
    );
    expect(errors).toEqual({});
    expect(values).toEqual({
      ref: "OF-12",
      surface: 120.5,
      budget: { amount: 25000000, currency: "XOF" },
      echeance: "2026-12-31",
      vip: true,
      source: "site_web",
      canaux: ["site_web"],
    });
  });

  it("signale un champ obligatoire vide", () => {
    const { errors } = parseCustomFields([field({ key: "ref", type: "text", required: true })], form([]));
    expect(errors[inputName("ref")]).toBe("Champ obligatoire.");
  });

  it("applique minimum, maximum et longueur", () => {
    const fields = [
      field({ key: "surface", type: "number", validation: { min: 0, max: 1000 } }),
      field({ key: "ref", type: "text", validation: { max_length: 5 } }),
    ];
    const { errors } = parseCustomFields(
      fields,
      form([
        [inputName("surface"), "5000"],
        [inputName("ref"), "TROP-LONG"],
      ]),
    );
    expect(errors[inputName("surface")]).toBe("Maximum : 1000.");
    expect(errors[inputName("ref")]).toBe("5 caractères au maximum.");
  });

  it("refuse une date impossible, un e-mail et une URL invalides", () => {
    const fields = [
      field({ key: "echeance", type: "date" }),
      field({ key: "mail", type: "email" }),
      field({ key: "site", type: "url" }),
    ];
    const { errors, values } = parseCustomFields(
      fields,
      form([
        [inputName("echeance"), "2026-02-30"],
        [inputName("mail"), "pas-un-email"],
        [inputName("site"), "exemple.ci"],
      ]),
    );
    expect(Object.keys(errors)).toHaveLength(3);
    expect(values).toEqual({});
  });

  it("refuse un choix désactivé ou inconnu", () => {
    const fields = [
      field({ key: "source", type: "select", options: sources }),
      field({ key: "canaux", type: "multiselect", options: sources }),
    ];
    const { errors } = parseCustomFields(
      fields,
      form([
        [inputName("source"), "partenaire"],
        [inputName("canaux"), "site_web"],
        [inputName("canaux"), "inconnu"],
      ]),
    );
    expect(errors[inputName("source")]).toBe("Choix invalide.");
    expect(errors[inputName("canaux")]).toBe("Choix invalide.");
  });

  it("refuse une devise hors XOF, USD, EUR", () => {
    const { errors } = parseCustomFields(
      [field({ key: "budget", type: "money" })],
      form([
        [inputName("budget", "amount"), "10"],
        [inputName("budget", "currency"), "GBP"],
      ]),
    );
    expect(errors[inputName("budget")]).toBe("Devise invalide.");
  });

  it("n'accepte que les collaborateurs de la marque", () => {
    const fields = [field({ key: "responsable", type: "user" })];
    const allowed = new Set(["u1"]);
    expect(parseCustomFields(fields, form([[inputName("responsable"), "u1"]]), allowed).values).toEqual({
      responsable: "u1",
    });
    expect(
      parseCustomFields(fields, form([[inputName("responsable"), "u2"]]), allowed).errors[inputName("responsable")],
    ).toBe("Collaborateur inconnu pour cette marque.");
  });

  it("ignore les champs désactivés", () => {
    const { values, errors } = parseCustomFields(
      [field({ key: "ancien", type: "text", required: true, isActive: false })],
      form([[inputName("ancien"), "valeur"]]),
    );
    expect(values).toEqual({});
    expect(errors).toEqual({});
  });

  it("conserve une valeur inchangée même si elle n'est plus valide", () => {
    const fields = [
      field({ key: "source", type: "select", options: sources }),
      field({ key: "ref", type: "text", validation: { max_length: 3 } }),
    ];
    const previous = { source: "partenaire", ref: "ANCIEN" };
    const { values, errors } = parseCustomFields(
      fields,
      form([
        [inputName("source"), "partenaire"],
        [inputName("ref"), "ANCIEN"],
      ]),
      new Set(),
      previous,
    );
    expect(errors).toEqual({});
    expect(values).toEqual(previous);
  });

  it("revalide une valeur modifiée", () => {
    const { errors } = parseCustomFields(
      [field({ key: "ref", type: "text", validation: { max_length: 3 } })],
      form([[inputName("ref"), "NOUVEAU"]]),
      new Set(),
      { ref: "ANC" },
    );
    expect(errors[inputName("ref")]).toBe("3 caractères au maximum.");
  });

  it("enregistre « non » pour une case décochée", () => {
    const { values } = parseCustomFields([field({ key: "vip", type: "boolean" })], form([]));
    expect(values).toEqual({ vip: false });
  });
});
