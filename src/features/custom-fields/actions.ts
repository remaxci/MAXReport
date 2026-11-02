"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { listBrandMembers } from "@/features/members/queries";
import { uniqueKey } from "@/features/settings/keys";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/server/authz/context";
import { can, PERMISSIONS } from "@/server/authz/permissions";
import { parseCustomFields } from "./parse";
import { getCustomFields } from "./queries";
import { FIELD_ENTITIES, FIELD_TYPES, type FieldEntity, type FieldType } from "./types";

const id = z.uuid();
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalNumber = z.preprocess(blankToUndefined, z.coerce.number({ error: "Nombre attendu." }).optional());
const optionalLength = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ error: "Nombre attendu." })
    .int("Nombre entier attendu.")
    .min(1, "Au moins 1.")
    .max(5000, "5 000 au maximum.")
    .optional(),
);

const fieldBase = z.object({
  label: z.string().trim().min(1, "Le libellé est obligatoire.").max(80, "80 caractères au maximum."),
  helpText: z
    .string()
    .trim()
    .max(200, "200 caractères au maximum.")
    .optional()
    .transform((value) => value || null),
  required: z
    .string()
    .optional()
    .transform((value) => value === "on"),
  min: optionalNumber,
  max: optionalNumber,
  maxLength: optionalLength,
  writePermission: z
    .string()
    .optional()
    .transform((value) => value || null)
    .refine((value) => value === null || (PERMISSIONS as readonly string[]).includes(value), "Permission inconnue."),
});

const createSchema = fieldBase
  .extend({
    type: z.enum(FIELD_TYPES, { error: "Type invalide." }),
    listId: z
      .string()
      .optional()
      .transform((value) => value || null),
  })
  .refine((d) => !["select", "multiselect"].includes(d.type) || d.listId !== null, {
    message: "Choisissez la liste des choix.",
    path: ["listId"],
  })
  .refine((d) => d.min === undefined || d.max === undefined || d.min <= d.max, {
    message: "Le minimum dépasse le maximum.",
    path: ["max"],
  });

const updateSchema = fieldBase.refine(
  (d) => d.min === undefined || d.max === undefined || d.min <= d.max,
  { message: "Le minimum dépasse le maximum.", path: ["max"] },
);

/** Règles enregistrées selon le type : bornes pour les nombres, longueur pour les textes. */
function buildValidation(
  type: FieldType,
  rules: { min?: number; max?: number; maxLength?: number },
): Record<string, number> {
  const validation: Record<string, number> = {};
  if (type === "number" || type === "money") {
    if (rules.min !== undefined) validation.min = rules.min;
    if (rules.max !== undefined) validation.max = rules.max;
  }
  if (["text", "long_text", "url", "email", "phone"].includes(type) && rules.maxLength !== undefined) {
    validation.max_length = rules.maxLength;
  }
  return validation;
}

async function canSettings(brandId: string) {
  return id.safeParse(brandId).success && (await authorize("settings.manage", brandId)) !== null;
}

function isEntity(entity: string): entity is FieldEntity {
  return (FIELD_ENTITIES as readonly string[]).includes(entity);
}

export async function createCustomField(
  brandId: string,
  entity: FieldEntity,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isEntity(entity) || !(await canSettings(brandId))) return forbidden();
  const parsed = createSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const withList = d.type === "select" || d.type === "multiselect";

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("custom_field_definitions")
    .select("key, position")
    .eq("brand_id", brandId)
    .eq("entity", entity);
  if (readError) return failed(readError);

  const { error } = await supabase.from("custom_field_definitions").insert({
    brand_id: brandId,
    entity,
    key: uniqueKey(d.label, existing.map((f) => f.key)),
    label: d.label,
    help_text: d.helpText,
    type: d.type,
    options_list_id: withList ? d.listId : null,
    required: d.required,
    validation: buildValidation(d.type, d),
    write_permission: d.writePermission,
    position: Math.max(0, ...existing.map((f) => f.position)) + 10,
  });
  if (error) return failed(error);

  refresh();
  return { ok: true, message: `Champ « ${d.label} » ajouté.` };
}

export async function updateCustomField(
  brandId: string,
  fieldId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!id.safeParse(fieldId).success || !(await canSettings(brandId))) return forbidden();
  const parsed = updateSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("custom_field_definitions")
    .select("type")
    .eq("id", fieldId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (readError) return failed(readError);
  if (!current) return forbidden();

  const { error } = await supabase
    .from("custom_field_definitions")
    .update({
      label: d.label,
      help_text: d.helpText,
      required: d.required,
      validation: buildValidation(current.type as FieldType, d),
      write_permission: d.writePermission,
    })
    .eq("id", fieldId)
    .eq("brand_id", brandId);
  if (error) return failed(error);

  refresh();
  return { ok: true, message: "Champ modifié." };
}

export async function setCustomFieldActive(
  brandId: string,
  fieldId: string,
  active: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  if (!id.safeParse(fieldId).success || !(await canSettings(brandId))) return forbidden();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_field_definitions")
    .update({ is_active: active })
    .eq("id", fieldId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();

  refresh();
  return { ok: true, message: active ? "Champ réactivé." : "Champ désactivé." };
}

/** Aperçu : valide un formulaire de test sans rien enregistrer. */
export async function previewCustomFields(
  brandId: string,
  entity: FieldEntity,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isEntity(entity) || !id.safeParse(brandId).success) return forbidden();
  const ctx = await authorize("settings.manage", brandId);
  if (!ctx) return forbidden();

  const [fields, members] = await Promise.all([
    getCustomFields(brandId, entity),
    can(ctx.access, "members.read", brandId) ? listBrandMembers(brandId) : Promise.resolve([]),
  ]);
  const { values, errors } = parseCustomFields(
    fields,
    formData,
    new Set(members.map((m) => m.userId)),
  );

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      message: "Le formulaire contient des erreurs : elles seraient refusées à l'enregistrement.",
      fieldErrors: Object.fromEntries(Object.entries(errors).map(([name, message]) => [name, [message]])),
    };
  }
  return {
    ok: true,
    message: "Valeurs valides. Voici ce qui serait enregistré :",
    data: JSON.stringify(values, null, 2),
  };
}
