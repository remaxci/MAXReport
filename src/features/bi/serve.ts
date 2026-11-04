import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DATASETS, findDataset } from "./catalog";
import { orderRow, toCsv, type Row } from "./format";
import { bearerToken } from "./token";

// Flux de la connexion BI (/api/bi/v1/…) : sans session, la clé seule ouvre
// l'accès. Le contrôle est fait par la base (public.bi_read, sécurité
// definer) : clé valide, auteur toujours habilité, jeu ouvert, marques et
// modules autorisés, limite de débit. Aucune clé secrète côté serveur.

const PAGE = 5000;
/** Au-delà, l'outil BI doit lire par morceaux (pas encore proposé) : on le dit plutôt que de couper. */
const MAX_ROWS = 100_000;

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function anonClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...HEADERS, ...extra } });
}

const unauthorized = (message = "Clé d'accès manquante : en-tête « Authorization: Bearer <clé> » attendu.") =>
  json({ erreur: message }, 401, { "WWW-Authenticate": 'Bearer realm="MAXreport BI"' });

/** Erreur renvoyée par la base → réponse HTTP ; seuls nos propres messages sont relayés. */
export function errorResponse(error: { code?: string; message: string }): Response {
  switch (error.code) {
    case "28000":
      return unauthorized(error.message);
    case "42501":
      return json({ erreur: error.message }, 403);
    case "53400":
      return json({ erreur: error.message }, 429, { "Retry-After": "3600" });
    case "22023":
      return json({ erreur: error.message }, 400);
    default:
      console.error("bi:", error.code, error.message);
      return json({ erreur: "Erreur du serveur : réessayez plus tard." }, 500);
  }
}

/** GET /api/bi/v1 : ce que la clé ouvre, avec l'adresse de chaque jeu. */
export async function serveCatalog(request: Request): Promise<Response> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized();
  const { data, error } = await anonClient().rpc("bi_catalog", { p_token: token });
  if (error) return errorResponse(error);
  const catalog = data as { nom: string; portee: string; expire_le: string; marques: string[]; jeux: string[] };
  const base = new URL("/api/bi/v1/", request.url);
  return json({
    ...catalog,
    jeux: DATASETS.filter((d) => catalog.jeux.includes(d.key)).map((d) => ({
      jeu: d.key,
      libelle: d.label,
      description: d.description,
      colonnes: d.columns,
      json: new URL(d.key, base).toString(),
      csv: `${new URL(d.key, base).toString()}?format=csv`,
    })),
  });
}

/** GET /api/bi/v1/<jeu>[?format=csv] : toutes les lignes du jeu (JSON par défaut). */
export async function serveDataset(request: Request, key: string): Promise<Response> {
  const dataset = findDataset(key);
  if (!dataset) return json({ erreur: "Jeu de données inconnu." }, 404);
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized();
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";

  const supabase = anonClient();
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.rpc("bi_read", { p_token: token, p_dataset: dataset.key, p_offset: offset, p_limit: PAGE });
    if (error) return errorResponse(error);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
    if (rows.length >= MAX_ROWS) {
      return json({ erreur: `Plus de ${MAX_ROWS} lignes : contactez l'administrateur de MAXreport.` }, 413);
    }
  }

  const ordered = rows.map((row) => orderRow(row, dataset.columns));
  if (format === "csv") {
    // BOM : Excel reconnaît l'UTF-8 (accents).
    return new Response(`﻿${toCsv(ordered, dataset.columns)}`, {
      headers: {
        ...HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="maxreport-${dataset.key}.csv"`,
      },
    });
  }
  return json(ordered);
}
