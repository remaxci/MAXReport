"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/server/authz/current-user";
import { emailLinksEnabled } from "./email-link";
import { changePassword, requestPasswordReset, setPasswordWithLink } from "./flows";

export type LoginState = { error: string } | null;

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Renseignez votre e-mail et votre mot de passe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "E-mail ou mot de passe incorrect." };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

export async function requestReset(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!emailLinksEnabled()) {
    return { ok: false, message: "La réinitialisation par e-mail n'est pas encore disponible." };
  }
  const supabase = await createClient();
  return requestPasswordReset(supabase.auth, text(formData, "email"));
}

/** Lien d'invitation ou de réinitialisation reçu par e-mail. */
export async function acceptEmailLink(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const result = await setPasswordWithLink(supabase.auth, {
    type: formData.get("type"),
    tokenHash: formData.get("token_hash"),
    password: text(formData, "password"),
    confirmation: text(formData, "confirmation"),
  });
  if (result?.ok) redirect("/");
  return result;
}

export async function updatePassword(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  return changePassword(supabase.auth, {
    email: user.email,
    current: text(formData, "current"),
    password: text(formData, "password"),
    confirmation: text(formData, "confirmation"),
  });
}
