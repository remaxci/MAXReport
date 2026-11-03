"use client";

import { useActionState, useState } from "react";
import { Field, textareaClass } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CustomFieldsInputs } from "@/features/custom-fields/components/custom-fields-inputs";
import type { FieldDefinition } from "@/features/custom-fields/types";
import type { ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import { PERIOD_KINDS, PERIOD_LABELS, type PeriodKind } from "@/lib/periods";
import { submitWithoutReset } from "@/lib/submit-without-reset";
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_STATUSES, type Measure } from "../config";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type PlatformOption = { key: string; label: string; group?: string };

function Submit({ pending, label, state }: { pending: boolean; label: string; state: ActionState }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : label}
      </Button>
      <FormMessage state={state} />
    </div>
  );
}

function PlatformSelect({ platforms, defaultValue }: { platforms: PlatformOption[]; defaultValue: string }) {
  const groups = [...new Set(platforms.map((p) => p.group ?? ""))];
  const options = (group: string) =>
    platforms
      .filter((p) => (p.group ?? "") === group)
      .map((p) => (
        <NativeSelectOption key={p.key} value={p.key}>
          {p.label}
        </NativeSelectOption>
      ));
  return (
    <NativeSelect id="platform" name="platform" defaultValue={defaultValue} required className="w-full">
      <NativeSelectOption value="" disabled>
        Choisir…
      </NativeSelectOption>
      {groups.map((group) =>
        group ? (
          <optgroup key={group} label={group}>
            {options(group)}
          </optgroup>
        ) : (
          options(group)
        ),
      )}
    </NativeSelect>
  );
}

// ---------------------------------------------------------------------
// Compte social et site web
// ---------------------------------------------------------------------

export type AccountDefaults = { platform: string; name: string; handle: string; url: string };

export function AccountForm({
  action,
  defaults,
  platforms,
  submitLabel,
}: {
  action: FormAction;
  defaults: AccountDefaults;
  platforms: PlatformOption[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Réseau" name="platform" state={state}>
          <PlatformSelect platforms={platforms} defaultValue={defaults.platform} />
        </Field>
        <Field label="Nom du compte" name="name" state={state}>
          <Input id="name" name="name" required maxLength={200} defaultValue={defaults.name} placeholder="Ex. Page officielle" />
        </Field>
        <Field label="Identifiant" name="handle" state={state}>
          <Input id="handle" name="handle" maxLength={200} defaultValue={defaults.handle} placeholder="@marque" />
        </Field>
        <Field label="Adresse" name="url" state={state}>
          <Input id="url" name="url" type="url" maxLength={500} defaultValue={defaults.url} placeholder="https://" />
        </Field>
      </div>
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

export type WebsiteDefaults = { name: string; url: string };

export function WebsiteForm({ action, defaults, submitLabel }: { action: FormAction; defaults: WebsiteDefaults; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du site" name="name" state={state}>
          <Input id="name" name="name" required maxLength={200} defaultValue={defaults.name} placeholder="Ex. Site vitrine" />
        </Field>
        <Field label="Adresse" name="url" state={state}>
          <Input id="url" name="url" type="url" maxLength={500} defaultValue={defaults.url} placeholder="https://" />
        </Field>
      </div>
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------
// Campagne
// ---------------------------------------------------------------------

export type CampaignDefaults = {
  platform: string;
  name: string;
  objective: string;
  status: string;
  startOn: string;
  endOn: string;
  plannedBudget: string;
  currency: string;
  externalId: string;
  comments: string;
};

export function CampaignForm({
  action,
  defaults,
  platforms,
  currencyLocked,
  fields,
  members,
  customValues,
  submitLabel,
}: {
  action: FormAction;
  defaults: CampaignDefaults;
  platforms: PlatformOption[];
  /** Des relevés existent : la devise est figée. */
  currencyLocked: boolean;
  fields: FieldDefinition[];
  members: { id: string; label: string }[];
  customValues?: Record<string, unknown>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom de la campagne" name="name" state={state} className="sm:col-span-2">
          <Input id="name" name="name" required maxLength={200} defaultValue={defaults.name} />
        </Field>
        <Field label="Support" name="platform" state={state}>
          <PlatformSelect platforms={platforms} defaultValue={defaults.platform} />
        </Field>
        <Field label="Objectif" name="objective" state={state}>
          <NativeSelect id="objective" name="objective" defaultValue={defaults.objective} className="w-full">
            {Object.entries(CAMPAIGN_OBJECTIVES).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Statut" name="status" state={state}>
          <NativeSelect id="status" name="status" defaultValue={defaults.status} className="w-full">
            {Object.entries(CAMPAIGN_STATUSES).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Début" name="startOn" state={state}>
            <Input id="startOn" name="startOn" type="date" defaultValue={defaults.startOn} />
          </Field>
          <Field label="Fin" name="endOn" state={state}>
            <Input id="endOn" name="endOn" type="date" defaultValue={defaults.endOn} />
          </Field>
        </div>
        <Field label="Budget prévu" name="plannedBudget" state={state}>
          <Input id="plannedBudget" name="plannedBudget" inputMode="decimal" defaultValue={defaults.plannedBudget} placeholder="Ex. 2 500 000" />
        </Field>
        <Field label="Devise" name="currency" state={state}>
          {currencyLocked ? (
            <>
              <input type="hidden" name="currency" value={defaults.currency} />
              <Input id="currency" value={defaults.currency} disabled />
              <p className="text-xs text-muted-foreground">Figée : des relevés sont saisis dans cette devise.</p>
            </>
          ) : (
            <NativeSelect id="currency" name="currency" defaultValue={defaults.currency} className="w-full">
              {CURRENCIES.map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {c}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Référence sur la plateforme" name="externalId" state={state}>
          <Input id="externalId" name="externalId" maxLength={200} defaultValue={defaults.externalId} placeholder="Facultatif" />
        </Field>
        <Field label="Commentaires" name="comments" state={state} className="sm:col-span-2">
          <textarea id="comments" name="comments" maxLength={5000} defaultValue={defaults.comments} className={textareaClass} />
        </Field>
      </div>
      {fields.some((f) => f.isActive) && (
        <section className="flex flex-col gap-3 border-t pt-4">
          <h2 className="text-sm font-medium">Informations complémentaires</h2>
          <CustomFieldsInputs fields={fields} members={members} state={state} values={customValues} />
        </section>
      )}
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------
// Relevé
// ---------------------------------------------------------------------

export type SnapshotDefaults = {
  periodKind: PeriodKind | "custom";
  anchor: string;
  periodStart: string;
  periodEnd: string;
  values: Record<string, number | null>;
  comments: string;
};

function MeasureInputs({
  measures,
  defaults,
  currency,
  state,
}: {
  measures: Measure[];
  defaults: Record<string, number | null>;
  currency?: string;
  state: ActionState;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {measures.map((m) => (
        <Field key={m.key} label={m.money && currency ? `${m.label} (${currency})` : m.label} name={m.key} state={state}>
          <Input
            id={m.key}
            name={m.key}
            inputMode={m.money ? "decimal" : "numeric"}
            defaultValue={defaults[m.key] == null ? "" : String(defaults[m.key]).replace(".", ",")}
            placeholder="Non relevé"
            aria-describedby={m.help ? `${m.key}-aide` : undefined}
          />
          {m.help && (
            <p id={`${m.key}-aide`} className="text-xs text-muted-foreground">
              {m.help}
            </p>
          )}
        </Field>
      ))}
    </div>
  );
}

export function SnapshotForm({
  action,
  measures,
  extraMeasures,
  extraTitle,
  currency,
  defaults,
  submitLabel,
}: {
  action: FormAction;
  measures: Measure[];
  extraMeasures: Measure[];
  extraTitle?: string;
  currency?: string;
  defaults: SnapshotDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [periodKind, setPeriodKind] = useState(defaults.periodKind);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Période du relevé" name="periodKind" state={state}>
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
          <>
            <Field label="Du" name="periodStart" state={state}>
              <Input id="periodStart" name="periodStart" type="date" defaultValue={defaults.periodStart} required />
            </Field>
            <Field label="Au" name="periodEnd" state={state}>
              <Input id="periodEnd" name="periodEnd" type="date" defaultValue={defaults.periodEnd} required />
            </Field>
          </>
        ) : (
          <Field label="Contenant le" name="anchor" state={state}>
            <Input id="anchor" name="anchor" type="date" defaultValue={defaults.anchor} required />
          </Field>
        )}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Laissez vide une mesure non relevée : elle restera « n/d », jamais 0. Deux relevés d&apos;un même objet ne peuvent pas se chevaucher.
      </p>
      <MeasureInputs measures={measures} defaults={defaults.values} currency={currency} state={state} />
      {extraMeasures.length > 0 && (
        <section className="flex flex-col gap-3 border-t pt-4">
          {extraTitle && <h2 className="text-sm font-medium">{extraTitle}</h2>}
          <MeasureInputs measures={extraMeasures} defaults={defaults.values} state={state} />
        </section>
      )}
      <Field label="Commentaires" name="comments" state={state}>
        <textarea id="comments" name="comments" maxLength={2000} defaultValue={defaults.comments} className={textareaClass} />
      </Field>
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}
