"use client";

import { useActionState, useState } from "react";
import { Field, textareaClass } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { METRICS, type MetricKey } from "@/lib/metrics/actuals";
import { CURRENCIES } from "@/lib/metrics/currency";
import { PERIOD_KINDS, PERIOD_LABELS, type PeriodKind } from "@/lib/periods";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type ObjectiveDefaults = {
  metric: MetricKey | "";
  scope: string;
  periodKind: PeriodKind | "custom";
  anchor: string;
  periodStart: string;
  periodEnd: string;
  target: string;
  currency: string;
  comments: string;
};

export function ObjectiveForm({
  action,
  defaults,
  metrics,
  members,
  submitLabel,
}: {
  action: FormAction;
  defaults: ObjectiveDefaults;
  metrics: MetricKey[];
  members: { id: string; label: string }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [metric, setMetric] = useState(defaults.metric);
  const [periodKind, setPeriodKind] = useState(defaults.periodKind);
  const money = metric !== "" && METRICS[metric].money;

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Indicateur" name="metric" state={state}>
          <NativeSelect
            id="metric"
            name="metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            required
            className="w-full"
          >
            <NativeSelectOption value="" disabled>
              Choisir…
            </NativeSelectOption>
            {metrics.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {METRICS[m].label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {metric !== "" && <p className="text-xs text-muted-foreground">Source : {METRICS[metric].source}</p>}
        </Field>
        <Field label="Concerne" name="scope" state={state}>
          <NativeSelect id="scope" name="scope" defaultValue={defaults.scope} className="w-full">
            <NativeSelectOption value="team">Toute l&apos;équipe (objectif collectif)</NativeSelectOption>
            {members.map((m) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {m.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Période" name="periodKind" state={state}>
          <NativeSelect
            id="periodKind"
            name="periodKind"
            value={periodKind}
            onChange={(e) => setPeriodKind(e.target.value as PeriodKind | "custom")}
            className="w-full"
          >
            {PERIOD_KINDS.map((kind) => (
              <NativeSelectOption key={kind} value={kind}>
                {PERIOD_LABELS[kind]}
              </NativeSelectOption>
            ))}
            <NativeSelectOption value="custom">Dates libres</NativeSelectOption>
          </NativeSelect>
        </Field>
        {periodKind === "custom" ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Du" name="periodStart" state={state}>
              <Input id="periodStart" name="periodStart" type="date" defaultValue={defaults.periodStart} required />
            </Field>
            <Field label="Au" name="periodEnd" state={state}>
              <Input id="periodEnd" name="periodEnd" type="date" defaultValue={defaults.periodEnd} required />
            </Field>
          </div>
        ) : (
          <Field label="Contenant le" name="anchor" state={state}>
            <Input id="anchor" name="anchor" type="date" defaultValue={defaults.anchor} required />
            <p className="text-xs text-muted-foreground">
              Toute la période ({PERIOD_LABELS[periodKind].toLowerCase()}) qui contient cette date.
            </p>
          </Field>
        )}
        <Field label={money ? "Montant cible" : "Valeur cible"} name="target" state={state}>
          <Input
            id="target"
            name="target"
            inputMode="decimal"
            defaultValue={defaults.target}
            placeholder={money ? "Ex. 25 000 000" : "Ex. 120"}
            required
          />
        </Field>
        {money && (
          <Field label="Devise" name="currency" state={state}>
            <NativeSelect id="currency" name="currency" defaultValue={defaults.currency || "XOF"} className="w-full">
              {CURRENCIES.map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {c}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field label="Commentaires" name="comments" state={state} className="sm:col-span-2">
          <textarea id="comments" name="comments" maxLength={2000} defaultValue={defaults.comments} className={textareaClass} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : submitLabel}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
