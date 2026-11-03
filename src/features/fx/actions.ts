"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseNumber } from "@/features/custom-fields/parse";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import { isIsoDate } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";

// Taux de change : rôle global fx_rates.manage, revérifié ici et par la RLS.

const FIXED = new Set(["EUR", "XOF"]);

const rateSchema = z
  .object({
    date: z.string().refine(isIsoDate, "Date invalide."),
    from: z.enum(CURRENCIES),
    to: z.enum(CURRENCIES),
    rate: z.preprocess(
      (value) => parseNumber(String(value ?? "")) ?? Number.NaN,
      z.number({ error: "Taux invalide." }).positive("Le taux doit être positif.").max(1e9),
    ),
    source: z.string().trim().min(1, "Indiquez la source (BCEAO, banque…).").max(200, "200 caractères au maximum."),
  })
  .refine((d) => d.from !== d.to, { path: ["to"], message: "Choisissez deux devises différentes." })
  .refine((d) => !(FIXED.has(d.from) && FIXED.has(d.to)), {
    path: ["to"],
    message: "La parité EUR/XOF est fixe (655,957) : elle ne se saisit pas.",
  });

async function canManage() {
  const ctx = await getAuthContext();
  return can(ctx.access, "fx_rates.manage");
}

export async function saveFxRate(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await canManage())) return forbidden();
  const parsed = rateSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("fx_rates")
    .insert({ rate_date: d.date, from_currency: d.from, to_currency: d.to, rate: d.rate, source: d.source });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Un taux existe déjà pour cette paire à cette date." };
    return failed(error);
  }
  refresh();
  return { ok: true, message: "Taux enregistré." };
}

export async function deleteFxRate(id: string, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success || !(await canManage())) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase.from("fx_rates").delete().eq("id", id).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Taux supprimé." };
}
