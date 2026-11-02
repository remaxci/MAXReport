import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { inputName } from "../parse";
import type { FieldDefinition } from "../types";

// Rendu des champs personnalisés d'une fiche, selon leur type.
// Sans état : utilisable dans tout formulaire (aperçu, offres, mémos…).

export type MemberOption = { id: string; label: string };

const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function CustomFieldsInputs({
  fields,
  members = [],
  state = null,
  values = {},
}: {
  fields: FieldDefinition[];
  members?: MemberOption[];
  state?: ActionState;
  /** Valeurs déjà enregistrées (colonne custom), pour la modification. */
  values?: Record<string, unknown>;
}) {
  const active = fields.filter((f) => f.isActive);
  if (active.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {active.map((field) => {
        const name = inputName(field.key);
        const error = state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined;
        const describedBy = field.helpText ? `${name}-aide` : undefined;
        const wide = field.type === "long_text" || field.type === "multiselect";

        return (
          <div key={field.id} className={wide ? "flex flex-col gap-2 sm:col-span-2" : "flex flex-col gap-2"}>
            {field.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name={name}
                  defaultChecked={values[field.key] === true}
                  className="size-4 accent-primary"
                  aria-describedby={describedBy}
                />
                {field.label}
              </label>
            ) : (
              <Label htmlFor={field.type === "multiselect" ? undefined : name}>
                {field.label}
                {field.required && <span className="text-destructive"> *</span>}
              </Label>
            )}

            <FieldControl
              field={field}
              name={name}
              members={members}
              invalid={!!error}
              describedBy={describedBy}
              value={values[field.key]}
            />

            {field.helpText && (
              <p id={describedBy} className="text-xs text-muted-foreground">
                {field.helpText}
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        );
      })}
    </div>
  );
}

function FieldControl({
  field,
  name,
  members,
  invalid,
  describedBy,
  value,
}: {
  field: FieldDefinition;
  name: string;
  members: MemberOption[];
  invalid: boolean;
  describedBy?: string;
  value?: unknown;
}) {
  const common = { id: name, name, "aria-invalid": invalid || undefined, "aria-describedby": describedBy };
  const { min, max, max_length: maxLength } = field.validation;
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const money =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { amount?: unknown; currency?: unknown })
      : {};
  const chosen = Array.isArray(value) ? value : [];

  switch (field.type) {
    case "text":
      return <Input {...common} defaultValue={text} maxLength={maxLength ?? 500} />;
    case "long_text":
      return <textarea {...common} defaultValue={text} maxLength={maxLength ?? 5000} className={textareaClass} />;
    case "email":
      return <Input {...common} type="email" defaultValue={text} maxLength={maxLength ?? 500} />;
    case "url":
      return <Input {...common} type="url" defaultValue={text} placeholder="https://" maxLength={maxLength ?? 500} />;
    case "phone":
      return <Input {...common} type="tel" defaultValue={text} placeholder="+225 07 00 00 00 00" maxLength={maxLength ?? 30} />;
    case "number":
      return <Input {...common} defaultValue={text} inputMode="decimal" placeholder={rangeHint(min, max)} />;
    case "date":
      return <Input {...common} type="date" defaultValue={text} />;
    case "money":
      return (
        <div className="flex gap-2">
          <Input
            id={name}
            name={inputName(field.key, "amount")}
            defaultValue={typeof money.amount === "number" ? String(money.amount) : ""}
            inputMode="decimal"
            placeholder={rangeHint(min, max) ?? "Montant"}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="flex-1"
          />
          <NativeSelect
            name={inputName(field.key, "currency")}
            defaultValue={typeof money.currency === "string" ? money.currency : "XOF"}
            aria-label="Devise"
          >
            <NativeSelectOption value="XOF">XOF</NativeSelectOption>
            <NativeSelectOption value="EUR">EUR</NativeSelectOption>
            <NativeSelectOption value="USD">USD</NativeSelectOption>
          </NativeSelect>
        </div>
      );
    case "select":
      return (
        <NativeSelect {...common} defaultValue={text} className="w-full">
          <NativeSelectOption value="">—</NativeSelectOption>
          {field.options
            .filter((o) => o.isActive || o.value === text)
            .map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      );
    case "multiselect":
      return (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2" aria-describedby={describedBy}>
          <legend className="sr-only">{field.label}</legend>
          {field.options
            .filter((o) => o.isActive || chosen.includes(o.value))
            .map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  value={o.value}
                  defaultChecked={chosen.includes(o.value)}
                  className="size-4 accent-primary"
                />
                {o.label}
              </label>
            ))}
        </fieldset>
      );
    case "user":
      return (
        <NativeSelect {...common} defaultValue={text} className="w-full">
          <NativeSelectOption value="">—</NativeSelectOption>
          {members.map((m) => (
            <NativeSelectOption key={m.id} value={m.id}>
              {m.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
    case "boolean":
      return null;
  }
}

function rangeHint(min?: number, max?: number): string | undefined {
  if (min !== undefined && max !== undefined) return `Entre ${min} et ${max}`;
  if (min !== undefined) return `Au moins ${min}`;
  if (max !== undefined) return `Au plus ${max}`;
  return undefined;
}
