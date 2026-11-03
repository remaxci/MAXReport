"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { failed, forbidden, invalid, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { findBrand, getAuthContext } from "@/server/authz/context";
import { DEFAULT_VALIDITY_DAYS, VALIDITY_DAYS } from "./catalog";
import { availableDatasets, canManageBrandKeys, canManageDirectionKeys } from "./keys";
import { generateToken, hashToken, tokenHint } from "./token";

// Clés de connexion BI : droits revérifiés ici, écriture sous RLS. La clé en
// clair n'est renvoyée qu'une fois, à la création ; seule son empreinte est
// enregistrée.

const keySchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(80, "80 caractères au maximum."),
  scope: z.enum(["marque", "direction"]),
  validity: z.coerce
    .number()
    .refine((days) => (VALIDITY_DAYS as readonly number[]).includes(days), "Durée non proposée.")
    .default(DEFAULT_VALIDITY_DAYS),
  datasets: z.array(z.string()).min(1, "Choisissez au moins un jeu de données."),
});

export async function createKey(brandSlug: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getAuthContext();
  const brand = findBrand(ctx, brandSlug);
  if (!brand) return forbidden();
  const parsed = keySchema.safeParse({
    name: formData.get("name"),
    scope: formData.get("scope") ?? "marque",
    validity: formData.get("validity") ?? undefined,
    datasets: formData.getAll("datasets").filter((v): v is string => typeof v === "string"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const direction = parsed.data.scope === "direction";
  if (direction ? !canManageDirectionKeys(ctx) : !canManageBrandKeys(ctx, brand.id)) return forbidden();

  const allowed = new Set(availableDatasets(ctx, direction ? ctx.brands : [brand]).map((d) => d.key));
  if (parsed.data.datasets.some((key) => !allowed.has(key))) {
    return { ok: false, message: "Vérifiez les champs signalés.", fieldErrors: { datasets: ["Jeu de données non autorisé."] } };
  }

  const token = generateToken();
  const supabase = await createClient();
  const { error } = await supabase.from("bi_access_keys").insert({
    brand_id: direction ? null : brand.id,
    name: parsed.data.name,
    token_hash: hashToken(token),
    token_hint: tokenHint(token),
    datasets: parsed.data.datasets,
    expires_at: new Date(Date.now() + parsed.data.validity * 86_400_000).toISOString(),
  });
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Clé créée. Copiez-la maintenant : elle ne sera plus jamais affichée.", data: token };
}

export async function revokeKey(keyId: string, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  if (!z.uuid().safeParse(keyId).success) return forbidden();
  const supabase = await createClient();
  // La base date et signe la révocation ; la RLS limite aux clés que l'on gère.
  const { data, error } = await supabase
    .from("bi_access_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .is("revoked_at", null)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Clé révoquée." };
}
