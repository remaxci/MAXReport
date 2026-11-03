"use client";

import { useActionState } from "react";
import { Field, textareaClass } from "@/components/field";
import { FieldError, FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type TemplateDefaults = { name: string; description: string; periodKind: string; sections: string[] };

export function TemplateForm({
  action,
  defaults,
  sections,
  periodKinds,
  submitLabel,
}: {
  action: FormAction;
  defaults: TemplateDefaults;
  /** Sections proposées : celles que la marque et vos droits permettent d'afficher. */
  sections: { key: string; label: string }[];
  periodKinds: { key: string; label: string }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du modèle" name="name" state={state}>
          <Input id="name" name="name" required maxLength={120} defaultValue={defaults.name} placeholder="Ex. Rapport mensuel marketing" />
        </Field>
        <Field label="Période par défaut" name="periodKind" state={state}>
          <NativeSelect id="periodKind" name="periodKind" defaultValue={defaults.periodKind} className="w-full">
            {periodKinds.map((p) => (
              <NativeSelectOption key={p.key} value={p.key}>
                {p.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Description" name="description" state={state} className="sm:col-span-2">
          <textarea id="description" name="description" maxLength={500} defaultValue={defaults.description} className={textareaClass} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Sections du rapport</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {sections.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sections" value={s.key} defaultChecked={defaults.sections.includes(s.key)} className="size-4 accent-primary" />
              {s.label}
            </label>
          ))}
        </div>
        <FieldError state={state} name="sections" />
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : submitLabel}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
