import { getMemberOptions } from "@/features/registers/queries";
import type { ActionState } from "@/lib/form";
import type { Json } from "@/lib/supabase/database.types";
import { parseCustomFields } from "./parse";
import { getCustomFields } from "./queries";
import type { FieldEntity } from "./types";

/**
 * Champs personnalisés d'une fiche envoyés par un formulaire : validation, puis
 * fusion avec les valeurs existantes des champs désactivés (conservées).
 * La base revalide tout (trigger validate_custom_values).
 */
export async function readCustomValues(
  brandId: string,
  entity: FieldEntity,
  formData: FormData,
  existing: Record<string, unknown>,
): Promise<{ values: Json } | { state: ActionState }> {
  const [fields, members] = await Promise.all([getCustomFields(brandId, entity), getMemberOptions(brandId)]);
  const parsed = parseCustomFields(fields, formData, new Set(members.map((m) => m.id)), existing);
  if (Object.keys(parsed.errors).length > 0) {
    return {
      state: {
        ok: false,
        message: "Vérifiez les champs signalés.",
        fieldErrors: Object.fromEntries(Object.entries(parsed.errors).map(([k, v]) => [k, [v]])),
      },
    };
  }
  const active = new Set(fields.filter((f) => f.isActive).map((f) => f.key));
  return {
    values: {
      ...Object.fromEntries(Object.entries(existing).filter(([key]) => !active.has(key))),
      ...parsed.values,
    } as Json,
  };
}
