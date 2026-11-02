import { z } from "zod";
import { dbErrorMessage } from "@/lib/supabase/errors";

// État renvoyé par les Server Actions de formulaire (useActionState).
export type ActionState =
  | { ok: true; message: string; data?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> }
  | null;

export function invalid(error: z.ZodError): ActionState {
  return {
    ok: false,
    message: "Vérifiez les champs signalés.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
  };
}

export function forbidden(): ActionState {
  return { ok: false, message: "Vous n'avez pas les droits pour cette action." };
}

export function failed(error: { code?: string; message: string }): ActionState {
  console.error(error);
  return { ok: false, message: dbErrorMessage(error) };
}

/** Lit un FormData en objet simple pour la validation Zod. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  });
  return values;
}
