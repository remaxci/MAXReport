"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/server/authz/context";
import { brandCreateSchema, brandUpdateSchema } from "./schemas";

const brandId = z.uuid();

export async function createBrand(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await authorize("brands.manage"))) return forbidden();

  const parsed = brandCreateSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const values = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("brands").insert({
    name: values.name,
    code: values.code,
    slug: values.slug,
    primary_color: values.primaryColor,
    reporting_currency: values.reportingCurrency,
  });
  if (error) return failed(error);

  refresh();
  return { ok: true, message: `Marque « ${values.name} » créée.` };
}

export async function updateBrand(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!brandId.safeParse(id).success) return forbidden();
  if (!(await authorize("brand.settings", id))) return forbidden();

  const parsed = brandUpdateSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const values = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .update({
      name: values.name,
      primary_color: values.primaryColor,
      reporting_currency: values.reportingCurrency,
    })
    .eq("id", id)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();

  refresh();
  return { ok: true, message: "Informations enregistrées." };
}

export async function setBrandActive(
  id: string,
  active: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!brandId.safeParse(id).success) return forbidden();
  if (!(await authorize("brands.manage"))) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .update({ is_active: active })
    .eq("id", id)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();

  refresh();
  return { ok: true, message: active ? "Marque activée." : "Marque désactivée." };
}
