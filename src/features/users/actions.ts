"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/server/authz/context";

const id = z.uuid();
const GLOBAL_ROLE_CHOICES = ["none", "direction", "super_admin"] as const;
const globalRoleSchema = z.object({
  roleKey: z.enum(GLOBAL_ROLE_CHOICES, { error: "Rôle invalide." }),
});

/** Attribue, change ou retire le rôle global d'un compte. */
export async function setGlobalRole(
  userId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id.safeParse(userId).success) return forbidden();
  if (!(await authorize("users.manage"))) return forbidden();

  const parsed = globalRoleSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { roleKey } = parsed.data;

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .is("brand_id", null)
    .maybeSingle();
  if (readError) return failed(readError);

  if (roleKey === "none") {
    if (existing) {
      const { error } = await supabase.from("memberships").delete().eq("id", existing.id);
      if (error) return failed(error);
    }
  } else {
    const { data: role, error: roleError } = await supabase
      .from("roles")
      .select("id")
      .eq("key", roleKey)
      .single();
    if (roleError) return failed(roleError);

    const { error } = existing
      ? await supabase.from("memberships").update({ role_id: role.id }).eq("id", existing.id)
      : await supabase.from("memberships").insert({ user_id: userId, brand_id: null, role_id: role.id });
    if (error) return failed(error);
  }

  refresh();
  return { ok: true, message: "Rôle global enregistré." };
}

export async function setUserActive(
  userId: string,
  active: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!id.safeParse(userId).success) return forbidden();
  if (!(await authorize("users.manage"))) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", userId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();

  refresh();
  return { ok: true, message: active ? "Compte réactivé." : "Compte désactivé." };
}
