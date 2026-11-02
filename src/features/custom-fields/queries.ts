import { createClient } from "@/lib/supabase/server";
import { getOptionLists } from "@/features/settings/queries";
import type { FieldDefinition, FieldEntity, FieldType } from "./types";

export type FieldDefinitionRow = FieldDefinition & {
  listId: string | null;
  listLabel: string | null;
  writePermission: string | null;
};

function readValidation(raw: unknown): FieldDefinition["validation"] {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const validation: FieldDefinition["validation"] = {};
  for (const key of ["min", "max", "max_length"] as const) {
    if (typeof source[key] === "number") validation[key] = source[key];
  }
  return validation;
}

/** Définitions des champs d'une fiche, avec les choix de leurs listes. */
export async function getCustomFields(
  brandId: string,
  entity: FieldEntity,
): Promise<FieldDefinitionRow[]> {
  const supabase = await createClient();
  const [fields, lists] = await Promise.all([
    supabase
      .from("custom_field_definitions")
      .select("id, key, label, help_text, type, required, is_active, validation, options_list_id, write_permission")
      .eq("brand_id", brandId)
      .eq("entity", entity)
      .order("position"),
    getOptionLists(brandId),
  ]);
  if (fields.error) throw fields.error;

  const listsById = new Map(lists.map((l) => [l.id, l]));
  return fields.data.map((f) => {
    const list = f.options_list_id ? listsById.get(f.options_list_id) : undefined;
    return {
      id: f.id,
      key: f.key,
      label: f.label,
      helpText: f.help_text,
      type: f.type as FieldType,
      required: f.required,
      isActive: f.is_active,
      validation: readValidation(f.validation),
      options: list?.items.map((i) => ({ value: i.value, label: i.label, isActive: i.isActive })) ?? [],
      listId: f.options_list_id,
      listLabel: list?.label ?? null,
      writePermission: f.write_permission,
    };
  });
}
