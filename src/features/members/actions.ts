"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/server/authz/context";

const id = z.uuid();
const roleSchema = z.object({ roleId: z.uuid("Choisissez un rôle.") });
const addSchema = roleSchema.extend({
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail invalide.")),
});

export async function addMember(
  brandId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id.safeParse(brandId).success) return forbidden();
  if (!(await authorize("members.manage", brandId))) return forbidden();

  const parsed = addSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_brand_member", {
    p_brand_id: brandId,
    p_email: parsed.data.email,
    p_role_id: parsed.data.roleId,
  });
  if (error) return failed(error);

  refresh();
  return { ok: true, message: `${parsed.data.email} a été ajouté.` };
}

export async function updateMemberRole(
  brandId: string,
  membershipId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id.safeParse(brandId).success || !id.safeParse(membershipId).success) return forbidden();
  if (!(await authorize("members.manage", brandId))) return forbidden();

  const parsed = roleSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role_id: parsed.data.roleId })
    .eq("id", membershipId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();

  refresh();
  return { ok: true, message: "Rôle modifié." };
}

export async function removeMember(
  brandId: string,
  membershipId: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!id.safeParse(brandId).success || !id.safeParse(membershipId).success) return forbidden();
  if (!(await authorize("members.manage", brandId))) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();

  refresh();
  return { ok: true, message: "Collaborateur retiré de la marque." };
}
