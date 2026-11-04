import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AuthContext, BrandSummary } from "@/server/authz/context";
import { buildAccess, type Permission } from "@/server/authz/permissions";
import { DATASETS } from "./catalog";
import { csvCell, orderRow, toCsv } from "./format";
import { availableDatasets, canManageBrandKeys, canManageDirectionKeys, keyStatus } from "./keys";
import { errorResponse } from "./serve";
import { bearerToken, generateToken, hashToken, tokenHint } from "./token";

const MIGRATION = readFileSync(new URL("../../../supabase/migrations/20261103210000_connexion_bi.sql", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("catalogue et fonction de lecture en base", () => {
  it("mêmes jeux que la liste autorisée par la base", () => {
    const list = MIGRATION.match(/datasets <@ array\[([\s\S]*?)\]::text\[\]/)?.[1] ?? "";
    const keys = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...keys].sort()).toEqual(DATASETS.map((d) => d.key).sort());
  });

  it("chaque colonne du catalogue est produite par public.bi_read", () => {
    const body = MIGRATION.slice(MIGRATION.indexOf("  case p_dataset\n"));
    for (const dataset of DATASETS) {
      const start = body.search(new RegExp(`\\n  when '${dataset.key}'(,| then)|, '${dataset.key}' then`));
      expect(start, dataset.key).toBeGreaterThan(-1);
      const next = body.indexOf("\n  when '", start + 10);
      const block = body.slice(start, next === -1 ? undefined : next);
      for (const column of dataset.columns) {
        expect(new RegExp(`(\\bas ${column}\\b|\\.${column}\\b)`).test(block), `${dataset.key}.${column}`).toBe(true);
      }
    }
  });

  it("aucune coordonnée de contact ni commentaire libre", () => {
    const columns = DATASETS.flatMap((d) => d.columns);
    for (const banned of ["email", "telephone", "phone", "commentaires", "comments", "description", "motif_perte"]) {
      expect(columns).not.toContain(banned);
    }
    expect(MIGRATION).not.toMatch(/\.(comments|phone|lost_reason|description)\b/);
  });
});

describe("clés d'accès", () => {
  it("256 bits aléatoires, préfixe reconnaissable, indice conforme à la base", () => {
    const a = generateToken();
    expect(a).toMatch(/^mxbi_[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
    expect(tokenHint(a)).toMatch(/^[A-Za-z0-9_-]{4}$/);
  });

  it("empreinte SHA-256 hexadécimale (même calcul que la base)", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("lue seulement dans l'en-tête Authorization: Bearer", () => {
    const token = generateToken();
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer   ${token} `)).toBe(token);
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(token)).toBeNull();
    expect(bearerToken("Bearer court")).toBeNull();
    expect(bearerToken(`Basic ${token}`)).toBeNull();
  });

  it("statut : active, expirée, révoquée", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    expect(keyStatus({ revokedAt: null, expiresAt: "2026-12-01T00:00:00Z" }, now)).toBe("active");
    expect(keyStatus({ revokedAt: null, expiresAt: "2026-11-01T00:00:00Z" }, now)).toBe("expired");
    expect(keyStatus({ revokedAt: "2026-11-02T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" }, now)).toBe("revoked");
  });
});

describe("droits de gestion et jeux proposés", () => {
  const brand = (id: string, modules: string[]): BrandSummary => ({
    id,
    code: id.toUpperCase(),
    slug: id,
    name: id,
    primaryColor: null,
    reportingCurrency: "XOF",
    isActive: true,
    enabledModules: modules,
  });
  const ctx = (grants: { brandId: string | null; permissions: Permission[] }[], brands: BrandSummary[]): AuthContext => ({
    userId: "u",
    email: "u@test.local",
    fullName: null,
    defaultBrandId: null,
    access: buildAccess(grants),
    brands,
  });
  const x = brand("x", ["offers", "planning"]);
  const y = brand("y", ["offers"]);

  it("bi.connect sur la marque pour ses clés ; global + Direction pour les clés toutes marques", () => {
    const admin = ctx([{ brandId: "x", permissions: ["brand.read", "bi.connect"] }], [x]);
    expect(canManageBrandKeys(admin, "x")).toBe(true);
    expect(canManageBrandKeys(admin, "y")).toBe(false);
    expect(canManageDirectionKeys(admin)).toBe(false);
    const direction = ctx([{ brandId: null, permissions: ["brand.read", "bi.connect", "direction.read"] }], [x, y]);
    expect(canManageDirectionKeys(direction)).toBe(true);
    const globalWithoutDirection = ctx([{ brandId: null, permissions: ["brand.read", "bi.connect"] }], [x, y]);
    expect(canManageDirectionKeys(globalWithoutDirection)).toBe(false);
  });

  it("seulement les jeux lisibles (permission et module activé)", () => {
    const admin = ctx([{ brandId: "x", permissions: ["brand.read", "bi.connect", "offers.read_all"] }], [x]);
    expect(availableDatasets(admin, [x]).map((d) => d.key)).toEqual(["marques", "taux_de_change", "offres"]);
    const planner = ctx([{ brandId: "y", permissions: ["brand.read", "planning.read"] }], [y]);
    expect(availableDatasets(planner, [y]).map((d) => d.key)).not.toContain("taches");
    expect(availableDatasets(planner, [x]).map((d) => d.key)).toEqual([]);
  });
});

describe("exports", () => {
  it("colonnes dans l'ordre du catalogue, absence = vide", () => {
    expect(orderRow({ b: 2, a: 1, extra: "x" }, ["a", "b", "c"])).toEqual({ a: 1, b: 2, c: null });
  });

  it("CSV : guillemets, séparateurs, et formules neutralisées pour Excel", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(true)).toBe("true");
    expect(csvCell('Dupont "SA", Abidjan')).toBe('"Dupont ""SA"", Abidjan"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+225 07")).toBe("'+225 07");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(toCsv([{ a: 1, b: "x;y" }, { a: null, b: "z" }], ["a", "b"])).toBe('a,b\r\n1,"x;y"\r\n,z\r\n');
  });

  it("erreurs de la base → codes HTTP, sans détail technique", async () => {
    expect(errorResponse({ code: "28000", message: "Clé d'accès invalide, expirée ou révoquée." }).status).toBe(401);
    expect(errorResponse({ code: "42501", message: "Ce jeu de données n'est pas ouvert par cette clé." }).status).toBe(403);
    const limited = errorResponse({ code: "53400", message: "Trop de lectures" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
    const internal = errorResponse({ code: "XX000", message: "détail interne de la base" });
    expect(internal.status).toBe(500);
    expect(await internal.text()).not.toContain("détail interne");
  });
});
