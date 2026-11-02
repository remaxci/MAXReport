import { describe, expect, it } from "vitest";
import { dbErrorMessage } from "./errors";

describe("dbErrorMessage", () => {
  it("masque les refus RLS techniques", () => {
    expect(
      dbErrorMessage({
        code: "42501",
        message: 'new row violates row-level security policy for table "brands"',
      }),
    ).toBe("Action non autorisée.");
  });

  it("reprend nos messages métier en français", () => {
    const message = "Vous ne pouvez pas attribuer un rôle plus étendu que le vôtre.";
    expect(dbErrorMessage({ code: "42501", message })).toBe(message);
    expect(dbErrorMessage({ code: "23514", message: "Un rôle global ne s'attribue pas sur une marque." }))
      .toBe("Un rôle global ne s'attribue pas sur une marque.");
    expect(dbErrorMessage({ code: "P0002", message: "Aucun compte actif avec cet e-mail." }))
      .toBe("Aucun compte actif avec cet e-mail.");
  });

  it("explique les doublons connus", () => {
    expect(
      dbErrorMessage({
        code: "23505",
        message: 'duplicate key value violates unique constraint "brands_code_key"',
      }),
    ).toBe("Ce code de marque est déjà utilisé.");
  });

  it("remplace les contraintes techniques par un message générique", () => {
    expect(
      dbErrorMessage({
        code: "23514",
        message: 'new row for relation "brands" violates check constraint "brands_code_check"',
      }),
    ).toBe("Valeur invalide.");
  });

  it("ne divulgue pas les erreurs inconnues", () => {
    expect(dbErrorMessage({ code: "XX000", message: "internal error at ..." })).toBe(
      "Une erreur est survenue. Réessayez.",
    );
  });
});
