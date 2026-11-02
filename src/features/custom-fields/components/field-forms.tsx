"use client";

import { useActionState, useState } from "react";
import { FieldError, FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { FIELD_TYPE_LABELS, FIELD_TYPES, type FieldDefinition, type FieldType } from "../types";
import { CustomFieldsInputs, type MemberOption } from "./custom-fields-inputs";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;
export type ListOption = { id: string; label: string };
export type PermissionOption = { key: string; label: string };

const NUMERIC: FieldType[] = ["number", "money"];
const TEXTUAL: FieldType[] = ["text", "long_text", "url", "email", "phone"];
const WITH_LIST: FieldType[] = ["select", "multiselect"];

export function FieldCreateForm({
  action,
  lists,
  permissions,
}: {
  action: FormAction;
  lists: ListOption[];
  permissions: PermissionOption[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [type, setType] = useState<FieldType>("text");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="field-label">Libellé</Label>
          <Input id="field-label" name="label" required maxLength={80} placeholder="Ex. Type de bien" />
          <FieldError state={state} name="label" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="field-type">Type</Label>
          <NativeSelect
            id="field-type"
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as FieldType)}
            className="w-full"
          >
            {FIELD_TYPES.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">Le type ne pourra plus être changé.</p>
        </div>

        {WITH_LIST.includes(type) && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="field-list">Liste des choix</Label>
            <NativeSelect id="field-list" name="listId" defaultValue="" className="w-full">
              <NativeSelectOption value="" disabled>
                Choisir une liste…
              </NativeSelectOption>
              {lists.map((l) => (
                <NativeSelectOption key={l.id} value={l.id}>
                  {l.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError state={state} name="listId" />
          </div>
        )}

        <RuleInputs type={type} state={state} />
        <CommonInputs state={state} permissions={permissions} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "Ajouter le champ"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function FieldEditForm({
  action,
  field,
  permissions,
}: {
  action: FormAction;
  field: FieldDefinition & { writePermission: string | null };
  permissions: PermissionOption[];
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`edit-${field.id}-label`}>Libellé</Label>
          <Input id={`edit-${field.id}-label`} name="label" required maxLength={80} defaultValue={field.label} />
          <FieldError state={state} name="label" />
        </div>
        <RuleInputs type={field.type} state={state} defaults={field.validation} idPrefix={`edit-${field.id}`} />
        <CommonInputs
          state={state}
          permissions={permissions}
          defaults={{ helpText: field.helpText, required: field.required, writePermission: field.writePermission }}
          idPrefix={`edit-${field.id}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          Enregistrer
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function RuleInputs({
  type,
  state,
  defaults,
  idPrefix = "field",
}: {
  type: FieldType;
  state: ActionState;
  defaults?: FieldDefinition["validation"];
  idPrefix?: string;
}) {
  if (NUMERIC.includes(type)) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Bornes (facultatif)</span>
        <div className="flex items-center gap-2">
          <Input name="min" inputMode="decimal" placeholder="Min." aria-label="Minimum" defaultValue={defaults?.min} />
          <Input name="max" inputMode="decimal" placeholder="Max." aria-label="Maximum" defaultValue={defaults?.max} />
        </div>
        <FieldError state={state} name="min" />
        <FieldError state={state} name="max" />
      </div>
    );
  }
  if (TEXTUAL.includes(type)) {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-max-length`}>Longueur maximale (facultatif)</Label>
        <Input
          id={`${idPrefix}-max-length`}
          name="maxLength"
          inputMode="numeric"
          placeholder="Ex. 100"
          defaultValue={defaults?.max_length}
        />
        <FieldError state={state} name="maxLength" />
      </div>
    );
  }
  return null;
}

function CommonInputs({
  state,
  permissions,
  defaults,
  idPrefix = "field",
}: {
  state: ActionState;
  permissions: PermissionOption[];
  defaults?: { helpText: string | null; required: boolean; writePermission: string | null };
  idPrefix?: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-help`}>Aide (facultatif)</Label>
        <Input
          id={`${idPrefix}-help`}
          name="helpText"
          maxLength={200}
          defaultValue={defaults?.helpText ?? ""}
          placeholder="Texte affiché sous le champ"
        />
        <FieldError state={state} name="helpText" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-permission`}>Modifiable par</Label>
        <NativeSelect
          id={`${idPrefix}-permission`}
          name="writePermission"
          defaultValue={defaults?.writePermission ?? ""}
          className="w-full"
        >
          <NativeSelectOption value="">Toute personne qui peut modifier la fiche</NativeSelectOption>
          {permissions.map((p) => (
            <NativeSelectOption key={p.key} value={p.key}>
              Seulement : {p.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
        <input type="checkbox" name="required" defaultChecked={defaults?.required} className="size-4 accent-primary" />
        Champ obligatoire
        <span className="font-normal text-muted-foreground">
          (exigé à la création ; une fiche existante ne peut plus le vider)
        </span>
      </label>
    </>
  );
}

export function FieldPreviewForm({
  action,
  fields,
  members,
}: {
  action: FormAction;
  fields: FieldDefinition[];
  members: MemberOption[];
}) {
  const [state, formAction, pending] = useActionState(action, null);

  if (fields.every((f) => !f.isActive)) {
    return <p className="text-sm text-muted-foreground">Aucun champ actif sur cette fiche.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <CustomFieldsInputs fields={fields} members={members} state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          Vérifier la saisie
        </Button>
        <FormMessage state={state} />
      </div>
      {state?.ok && state.data && (
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{state.data}</pre>
      )}
    </form>
  );
}
