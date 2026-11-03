"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Ajoute le graphique affiché à un tableau personnalisé (les réglages sont liés à l'action). */
export function AddToDashboard({ action, dashboards }: { action: FormAction; dashboards: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Field label="Tableau" name="dashboardId" state={state} className="min-w-0 flex-1 basis-56">
        <NativeSelect id="dashboardId" name="dashboardId" required defaultValue="" className="w-full">
          <NativeSelectOption value="" disabled>
            Choisir un tableau…
          </NativeSelectOption>
          {dashboards.map((d) => (
            <NativeSelectOption key={d.id} value={d.id}>
              {d.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Titre (facultatif)" name="title" state={state} className="min-w-0 flex-1 basis-56">
        <Input id="title" name="title" maxLength={120} placeholder="Titre du graphique dans le tableau" />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Ajout…" : "Ajouter au tableau"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
