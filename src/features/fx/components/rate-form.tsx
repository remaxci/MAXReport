"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export function RateForm({ action, today }: { action: FormAction; today: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  const currencySelect = (name: string, defaultValue: string) => (
    <NativeSelect id={name} name={name} defaultValue={defaultValue} className="w-full">
      {CURRENCIES.map((c) => (
        <NativeSelectOption key={c} value={c}>
          {c}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Date d'effet" name="date" state={state}>
          <Input id="date" name="date" type="date" defaultValue={today} required />
        </Field>
        <Field label="1 unité de" name="from" state={state}>
          {currencySelect("from", "USD")}
        </Field>
        <Field label="Vaut, en" name="to" state={state}>
          {currencySelect("to", "XOF")}
        </Field>
        <Field label="Taux" name="rate" state={state}>
          <Input id="rate" name="rate" inputMode="decimal" placeholder="Ex. 605,25" required />
        </Field>
        <Field label="Source" name="source" state={state}>
          <Input id="source" name="source" maxLength={200} placeholder="BCEAO, banque…" required />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Ajouter le taux"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
