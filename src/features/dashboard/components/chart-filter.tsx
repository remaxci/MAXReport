"use client";

import { useActionState, useRef } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/form";
import { submitWithoutReset } from "@/lib/submit-without-reset";
import type { ChartGroup } from "../chart-catalog";

/** Choix des graphiques affichés : cases à cocher par groupe, enregistrées pour la personne. */
export function ChartFilter({
  action,
  groups,
  hidden,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  groups: ChartGroup[];
  hidden: string[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  const total = groups.reduce((sum, group) => sum + group.charts.length, 0);
  const shown = groups.reduce((sum, group) => sum + group.charts.filter((c) => !hidden.includes(c.id)).length, 0);

  const setAll = (checked: boolean) => {
    form.current?.querySelectorAll<HTMLInputElement>('input[name="visible"]').forEach((box) => {
      box.checked = checked;
    });
  };

  return (
    <details className="rounded-xl border p-3 print:hidden">
      <summary className="cursor-pointer text-sm font-medium">
        Choisir les graphiques à afficher <span className="font-normal text-muted-foreground">· {shown} sur {total}</span>
      </summary>
      <form ref={form} onSubmit={submitWithoutReset(formAction)} className="mt-3 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <fieldset key={group.key} className="flex flex-col gap-1.5">
              <legend className="mb-1 text-xs font-medium text-muted-foreground uppercase">{group.label}</legend>
              {group.charts.map((chart) => (
                <label key={chart.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="visible" value={chart.id} defaultChecked={!hidden.includes(chart.id)} className="mt-0.5 size-4 shrink-0 accent-primary" />
                  {chart.label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setAll(true)}>
            Tout cocher
          </Button>
          <Button type="button" variant="outline" onClick={() => setAll(false)}>
            Tout décocher
          </Button>
          <FormMessage state={state} />
        </div>
      </form>
    </details>
  );
}
