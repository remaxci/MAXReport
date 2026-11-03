"use client";

import { useActionState } from "react";
import { Field, textareaClass } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Création ou modification d'un tableau : nom, description, portée (création), partage. */
export function DashboardForm({
  action,
  defaults,
  scopes,
  submitLabel,
}: {
  action: FormAction;
  defaults?: { name: string; description: string; shared: boolean };
  /** Portées proposées à la création ; absent en modification (la portée ne change pas). */
  scopes?: { value: "marque" | "direction"; label: string }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" name="name" state={state}>
          <Input id="name" name="name" required maxLength={120} defaultValue={defaults?.name} />
        </Field>
        {scopes && scopes.length > 0 && (
          <Field label="Portée" name="scope" state={state}>
            <NativeSelect id="scope" name="scope" defaultValue={scopes[0].value} className="w-full">
              {scopes.map((s) => (
                <NativeSelectOption key={s.value} value={s.value}>
                  {s.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
      <Field label="Description (facultative)" name="description" state={state}>
        <textarea id="description" name="description" maxLength={500} defaultValue={defaults?.description} className={textareaClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="shared" value="1" defaultChecked={defaults?.shared ?? true} className="size-4 accent-primary" />
        Partagé avec les collaborateurs qui ont les droits (sinon, visible par vous seul)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : submitLabel}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
