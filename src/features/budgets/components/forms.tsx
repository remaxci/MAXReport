"use client";

import { useActionState, useState } from "react";
import { Field, textareaClass } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };

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

function Select({ name, options, defaultValue, empty }: { name: string; options: Option[]; defaultValue: string; empty?: string }) {
  return (
    <NativeSelect id={name} name={name} defaultValue={defaultValue} className="w-full">
      {empty !== undefined && <NativeSelectOption value="">{empty}</NativeSelectOption>}
      {options.map((o) => (
        <NativeSelectOption key={o.id} value={o.id}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ id: c, label: c }));

// ---------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------

export type BudgetDefaults = {
  name: string;
  scope: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  currency: string;
  comments: string;
};

export function BudgetForm({
  action,
  defaults,
  scopes,
  statuses,
  currencyLocked,
  submitLabel,
}: {
  action: FormAction;
  defaults: BudgetDefaults;
  scopes: Option[];
  statuses: Option[];
  currencyLocked: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du budget" name="name" state={state} className="sm:col-span-2">
          <Input id="name" name="name" required maxLength={200} defaultValue={defaults.name} placeholder="Ex. Marketing 2027" />
        </Field>
        <Field label="Périmètre" name="scope" state={state}>
          <Select name="scope" options={scopes} defaultValue={defaults.scope} />
        </Field>
        <Field label="Statut" name="status" state={state}>
          <Select name="status" options={statuses} defaultValue={defaults.status} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Du" name="periodStart" state={state}>
            <Input id="periodStart" name="periodStart" type="date" required defaultValue={defaults.periodStart} />
          </Field>
          <Field label="Au" name="periodEnd" state={state}>
            <Input id="periodEnd" name="periodEnd" type="date" required defaultValue={defaults.periodEnd} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-4">
          <Field label="Enveloppe" name="amount" state={state}>
            <Input id="amount" name="amount" inputMode="decimal" required defaultValue={defaults.amount} placeholder="Ex. 25 000 000" />
          </Field>
          <Field label="Devise" name="currency" state={state}>
            {currencyLocked ? (
              <>
                <input type="hidden" name="currency" value={defaults.currency} />
                <Input id="currency" value={defaults.currency} disabled />
              </>
            ) : (
              <Select name="currency" options={CURRENCY_OPTIONS} defaultValue={defaults.currency} />
            )}
          </Field>
        </div>
        <Field label="Commentaires" name="comments" state={state} className="sm:col-span-2">
          <textarea id="comments" name="comments" maxLength={5000} defaultValue={defaults.comments} className={textareaClass} />
        </Field>
      </div>
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------
// Ligne budgétaire
// ---------------------------------------------------------------------

export type LineDefaults = { label: string; category: string; campaignId: string; amount: string };

export function LineForm({
  action,
  defaults,
  categories,
  campaigns,
  currency,
  submitLabel,
}: {
  action: FormAction;
  defaults: LineDefaults;
  categories: Option[];
  campaigns: Option[];
  currency: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Libellé" name="label" state={state}>
          <Input id="label" name="label" required maxLength={200} defaultValue={defaults.label} placeholder="Ex. Publicité Meta" />
        </Field>
        <Field label="Catégorie" name="category" state={state}>
          <Select name="category" options={categories} defaultValue={defaults.category} empty="—" />
        </Field>
        <Field label="Campagne liée" name="campaignId" state={state}>
          <Select name="campaignId" options={campaigns} defaultValue={defaults.campaignId} empty="Aucune" />
        </Field>
        <Field label={`Montant (${currency})`} name="amount" state={state}>
          <Input id="amount" name="amount" inputMode="decimal" required defaultValue={defaults.amount} />
        </Field>
      </div>
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------
// Dépense
// ---------------------------------------------------------------------

export type ExpenseDefaults = {
  lineId: string;
  supplier: string;
  description: string;
  date: string;
  amount: string;
  currency: string;
  status: string;
  paidOn: string;
  externalRef: string;
  comments: string;
};

export function ExpenseForm({
  action,
  defaults,
  lines,
  submitLabel,
}: {
  action: FormAction;
  defaults: ExpenseDefaults;
  lines: Option[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [status, setStatus] = useState(defaults.status);
  const askDuplicate = state !== null && !state.ok && state.fieldErrors?.confirmDuplicate !== undefined;
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ligne budgétaire" name="lineId" state={state} className="lg:col-span-2">
          <NativeSelect id="lineId" name="lineId" defaultValue={defaults.lineId} required className="w-full">
            <NativeSelectOption value="" disabled>
              Choisir…
            </NativeSelectOption>
            {lines.map((l) => (
              <NativeSelectOption key={l.id} value={l.id}>
                {l.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Fournisseur" name="supplier" state={state}>
          <Input id="supplier" name="supplier" maxLength={200} defaultValue={defaults.supplier} />
        </Field>
        <Field label="N° de facture ou de commande" name="externalRef" state={state}>
          <Input id="externalRef" name="externalRef" maxLength={100} defaultValue={defaults.externalRef} />
        </Field>
        <Field label="Description" name="description" state={state} className="sm:col-span-2">
          <Input id="description" name="description" required maxLength={500} defaultValue={defaults.description} />
        </Field>
        <Field label="Date" name="date" state={state}>
          <Input id="date" name="date" type="date" required defaultValue={defaults.date} />
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Montant" name="amount" state={state}>
            <Input id="amount" name="amount" inputMode="decimal" required defaultValue={defaults.amount} />
          </Field>
          <Field label="Devise" name="currency" state={state}>
            <Select name="currency" options={CURRENCY_OPTIONS} defaultValue={defaults.currency} />
          </Field>
        </div>
        <Field label="État" name="status" state={state}>
          <NativeSelect id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full">
            <NativeSelectOption value="committed">Engagée (commandée)</NativeSelectOption>
            <NativeSelectOption value="paid">Payée</NativeSelectOption>
          </NativeSelect>
        </Field>
        {status === "paid" && (
          <Field label="Payée le" name="paidOn" state={state}>
            <Input id="paidOn" name="paidOn" type="date" defaultValue={defaults.paidOn} />
          </Field>
        )}
        <Field label="Commentaires" name="comments" state={state} className="sm:col-span-2">
          <textarea id="comments" name="comments" maxLength={2000} defaultValue={defaults.comments} className={textareaClass} />
        </Field>
      </div>
      {askDuplicate && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirmDuplicate" value="1" className="size-4 accent-primary" />
          C&apos;est bien une autre dépense (même ligne, même date, même montant).
        </label>
      )}
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------
// Seuil d'alerte
// ---------------------------------------------------------------------

export function ThresholdForm({ action, threshold }: { action: FormAction; threshold: number }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-wrap items-end gap-3">
      <Field label="Alerte à partir de (% engagé)" name="threshold" state={state}>
        <Input id="threshold" name="threshold" type="number" min={1} max={100} step={1} defaultValue={threshold} className="w-28" />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        Enregistrer
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
