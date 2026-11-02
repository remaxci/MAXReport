import { describe, expect, it } from "vitest";
import { checkAttachment, MAX_ATTACHMENT_BYTES } from "./attachments";

describe("checkAttachment", () => {
  it("accepte un PDF de taille raisonnable", () => {
    expect(checkAttachment({ name: "offre.pdf", size: 120_000, type: "application/pdf" })).toEqual({
      ok: true,
      extension: "pdf",
    });
  });

  it("refuse un fichier trop lourd", () => {
    const result = checkAttachment({ name: "gros.pdf", size: MAX_ATTACHMENT_BYTES + 1, type: "application/pdf" });
    expect(result.ok).toBe(false);
  });

  it("refuse un format non prévu", () => {
    expect(checkAttachment({ name: "script.exe", size: 100, type: "application/x-msdownload" }).ok).toBe(false);
  });

  it("refuse un fichier vide", () => {
    expect(checkAttachment({ name: "vide.pdf", size: 0, type: "application/pdf" }).ok).toBe(false);
  });
});
