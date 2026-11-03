"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { submitWithoutReset } from "@/lib/submit-without-reset";
import { saveNotificationPreferences } from "../actions";
import type { NotificationPreferences } from "../queries";

const LEAD_TIMES = [
  { value: 0, label: "Le jour même" },
  { value: 1, label: "La veille" },
  { value: 2, label: "2 jours avant" },
  { value: 3, label: "3 jours avant" },
  { value: 7, label: "Une semaine avant" },
];

export function PreferencesForm({ preferences }: { preferences: NotificationPreferences }) {
  const [state, formAction, pending] = useActionState(saveNotificationPreferences, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex max-w-md flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="dailyDigest" value="1" defaultChecked={preferences.dailyDigest} className="size-4 accent-primary" />
        Recevoir le récapitulatif de mes tâches (jours ouvrés, vers 6 h)
      </label>
      <Field label="Rappel d'échéance" name="dueSoonDays" state={state}>
        <NativeSelect id="dueSoonDays" name="dueSoonDays" defaultValue={String(preferences.dueSoonDays)} className="w-full">
          {[...LEAD_TIMES, ...(LEAD_TIMES.some((t) => t.value === preferences.dueSoonDays) ? [] : [{ value: preferences.dueSoonDays, label: `${preferences.dueSoonDays} jours avant` }])].map((t) => (
            <NativeSelectOption key={t.value} value={String(t.value)}>
              {t.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
