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
import { submitWithoutReset } from "@/lib/submit-without-reset";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };
type CustomProps = { fields: FieldDefinition[]; members: Option[]; customValues?: Record<string, unknown> };

function Select({
  name,
  options,
  defaultValue,
  placeholder = "—",
  required,
}: {
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <NativeSelect id={name} name={name} defaultValue={defaultValue ?? ""} required={required} className="w-full">
      <NativeSelectOption value="" disabled={required}>
        {placeholder}
      </NativeSelectOption>
      {options.map((o) => (
        <NativeSelectOption key={o.id} value={o.id}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function CustomSection({ fields, members, customValues, state }: CustomProps & { state: ActionState }) {
  if (!fields.some((f) => f.isActive)) return null;
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <h2 className="text-sm font-medium">Informations complémentaires</h2>
      <CustomFieldsInputs fields={fields} members={members} state={state} values={customValues} />
    </section>
  );
}

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

/** Entreprise existante ou nouvelle (nom saisi). */
function CompanyPicker({
  companies,
  value,
  onChange,
  state,
}: {
  companies: Option[];
  value: string;
  onChange: (value: string) => void;
  state: ActionState;
}) {
  return (
    <Field label="Entreprise" name="companyId" state={state}>
      <NativeSelect id="companyId" name="companyId" value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
        <NativeSelectOption value="" disabled>
          Choisir…
        </NativeSelectOption>
        <NativeSelectOption value="__new__">+ Nouvelle entreprise</NativeSelectOption>
        {companies.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {c.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {value === "__new__" && (
        <Input name="newCompanyName" required maxLength={200} placeholder="Nom de l'entreprise" aria-label="Nom de la nouvelle entreprise" />
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------
// Prospect
// ---------------------------------------------------------------------

export type CompanyDefaults = {
  name: string;
  sector: string;
  source: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  statusId: string;
  ownerId: string;
  nextFollowUpOn: string;
};

export function CompanyForm({
  action,
  defaults,
  sectors,
  sources,
  statuses,
  owners,
  canAssign,
  submitLabel,
  ...custom
}: CustomProps & {
  action: FormAction;
  defaults: CompanyDefaults;
  sectors: Option[];
  sources: Option[];
  statuses: Option[];
  owners: Option[];
  canAssign: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom de l'entreprise" name="name" state={state} className="sm:col-span-2">
          <Input id="name" name="name" required maxLength={200} defaultValue={defaults.name} />
        </Field>
        <Field label="Statut" name="statusId" state={state}>
          <Select name="statusId" options={statuses} defaultValue={defaults.statusId} />
        </Field>
        <Field label="Responsable" name="ownerId" state={state}>
          {canAssign ? (
            <Select name="ownerId" options={owners} defaultValue={defaults.ownerId} />
          ) : (
            <p className="text-sm text-muted-foreground">{owners.find((o) => o.id === defaults.ownerId)?.label ?? "Vous"}</p>
          )}
        </Field>
        <Field label="Secteur d'activité" name="sector" state={state}>
          <Select name="sector" options={sectors} defaultValue={defaults.sector} />
        </Field>
        <Field label="Source" name="source" state={state}>
          <Select name="source" options={sources} defaultValue={defaults.source} />
        </Field>
        <Field label="Téléphone" name="phone" state={state}>
          <Input id="phone" name="phone" type="tel" maxLength={40} defaultValue={defaults.phone} />
        </Field>
        <Field label="E-mail" name="email" state={state}>
          <Input id="email" name="email" type="email" maxLength={200} defaultValue={defaults.email} />
        </Field>
        <Field label="Ville" name="city" state={state}>
          <Input id="city" name="city" maxLength={120} defaultValue={defaults.city} />
        </Field>
        <Field label="Pays" name="country" state={state}>
          <Input id="country" name="country" maxLength={120} defaultValue={defaults.country} />
        </Field>
        <Field label="Site web" name="website" state={state}>
          <Input id="website" name="website" type="url" placeholder="https://" maxLength={300} defaultValue={defaults.website} />
        </Field>
        <Field label="Prochaine relance" name="nextFollowUpOn" state={state}>
          <Input id="nextFollowUpOn" name="nextFollowUpOn" type="date" defaultValue={defaults.nextFollowUpOn} />
        </Field>
      </div>
      <CustomSection {...custom} state={state} />
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------

export function ContactForm({
  action,
  defaults,
  submitLabel,
}: {
  action: FormAction;
  defaults?: { fullName: string; jobTitle: string; email: string; phone: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const firstError = state && !state.ok ? Object.values(state.fieldErrors ?? {}).flat()[0] ?? state.message : null;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="fullName" required maxLength={160} placeholder="Nom et prénom" aria-label="Nom et prénom" defaultValue={defaults?.fullName} />
        <Input name="jobTitle" maxLength={120} placeholder="Fonction" aria-label="Fonction" defaultValue={defaults?.jobTitle} />
        <Input name="email" type="email" maxLength={200} placeholder="E-mail" aria-label="E-mail" defaultValue={defaults?.email} />
        <Input name="phone" type="tel" maxLength={40} placeholder="Téléphone" aria-label="Téléphone" defaultValue={defaults?.phone} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {submitLabel}
        </Button>
        {firstError && <p className="text-xs text-destructive">{firstError}</p>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Échange
// ---------------------------------------------------------------------

export const INTERACTION_LABELS: Record<string, string> = {
  call: "Appel",
  email: "E-mail",
  meeting: "Rendez-vous",
  note: "Note",
  other: "Autre",
};

export function InteractionForm({
  action,
  contacts,
  now,
}: {
  action: FormAction;
  contacts: Option[];
  /** Date et heure par défaut (AAAA-MM-JJTHH:MM), fournies par le serveur. */
  now: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const firstError = state && !state.ok ? Object.values(state.fieldErrors ?? {}).flat()[0] ?? state.message : null;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <NativeSelect name="type" defaultValue="call" aria-label="Type d'échange" className="w-full">
          {Object.entries(INTERACTION_LABELS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input name="occurredAt" type="datetime-local" required defaultValue={now} aria-label="Date et heure" />
        <NativeSelect name="contactId" defaultValue="" aria-label="Contact" className="w-full">
          <NativeSelectOption value="">Contact (facultatif)</NativeSelectOption>
          {contacts.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <textarea name="summary" required maxLength={5000} placeholder="Compte rendu de l'échange" aria-label="Compte rendu" className={textareaClass} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Enregistrer l&apos;échange
        </Button>
        {firstError && <p className="text-xs text-destructive">{firstError}</p>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Opportunité
// ---------------------------------------------------------------------

export type OpportunityDefaults = {
  companyId: string;
  contactId: string;
  title: string;
  stageId: string;
  amount: string;
  currency: string;
  expectedCloseOn: string;
  source: string;
  lostReason: string;
  ownerId: string;
};

export function OpportunityForm({
  action,
  defaults,
  companies,
  contacts,
  stages,
  sources,
  owners,
  canAssign,
  submitLabel,
  ...custom
}: CustomProps & {
  action: FormAction;
  defaults: OpportunityDefaults;
  companies: Option[];
  contacts: (Option & { companyId: string })[];
  stages: Option[];
  sources: Option[];
  owners: Option[];
  canAssign: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [company, setCompany] = useState(defaults.companyId || (companies.length === 0 ? "__new__" : ""));
  const companyContacts = contacts.filter((c) => c.companyId === company);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Intitulé" name="title" state={state} className="sm:col-span-2">
          <Input id="title" name="title" required maxLength={200} defaultValue={defaults.title} placeholder="Ex. Mandat de gestion locative" />
        </Field>
        <CompanyPicker companies={companies} value={company} onChange={setCompany} state={state} />
        <Field label="Contact" name="contactId" state={state}>
          <Select key={company} name="contactId" options={companyContacts} defaultValue={defaults.companyId === company ? defaults.contactId : ""} />
        </Field>
        <Field label="Étape" name="stageId" state={state}>
          <Select name="stageId" options={stages} defaultValue={defaults.stageId} required placeholder="Choisir…" />
        </Field>
        <Field label="Commercial responsable" name="ownerId" state={state}>
          {canAssign ? (
            <Select name="ownerId" options={owners} defaultValue={defaults.ownerId} />
          ) : (
            <p className="text-sm text-muted-foreground">{owners.find((o) => o.id === defaults.ownerId)?.label ?? "Vous"}</p>
          )}
        </Field>
        <Field label="Montant estimé" name="amount" state={state}>
          <div className="flex gap-2">
            <Input id="amount" name="amount" inputMode="decimal" defaultValue={defaults.amount} className="flex-1" />
            <NativeSelect name="currency" defaultValue={defaults.currency || "XOF"} aria-label="Devise">
              <NativeSelectOption value="XOF">XOF</NativeSelectOption>
              <NativeSelectOption value="EUR">EUR</NativeSelectOption>
              <NativeSelectOption value="USD">USD</NativeSelectOption>
            </NativeSelect>
          </div>
        </Field>
        <Field label="Signature espérée le" name="expectedCloseOn" state={state}>
          <Input id="expectedCloseOn" name="expectedCloseOn" type="date" defaultValue={defaults.expectedCloseOn} />
        </Field>
        <Field label="Source" name="source" state={state}>
          <Select name="source" options={sources} defaultValue={defaults.source} />
        </Field>
        <Field label="Motif de perte (si perdue)" name="lostReason" state={state} className="sm:col-span-2">
          <textarea id="lostReason" name="lostReason" maxLength={2000} defaultValue={defaults.lostReason} className={textareaClass} />
        </Field>
      </div>
      <CustomSection {...custom} state={state} />
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

export function MoveStageForm({ action, stages, current }: { action: FormAction; stages: Option[]; current: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <NativeSelect name="stageId" size="sm" defaultValue={current} aria-label="Étape" className="min-w-0 flex-1">
          {stages.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          OK
        </Button>
      </div>
      {state && !state.ok && <FormMessage state={state} className="text-xs" />}
    </form>
  );
}

// ---------------------------------------------------------------------
// Contrat
// ---------------------------------------------------------------------

export type ContractDefaults = {
  companyId: string;
  opportunityId: string;
  offerId: string;
  title: string;
  signedOn: string;
  amount: string;
  currency: string;
  startOn: string;
  endOn: string;
  comments: string;
  ownerId: string;
};

export function ContractForm({
  action,
  defaults,
  companies,
  opportunities,
  offers,
  owners,
  canAssign,
  submitLabel,
  ...custom
}: CustomProps & {
  action: FormAction;
  defaults: ContractDefaults;
  companies: Option[];
  opportunities: (Option & { companyId: string })[];
  offers: (Option & { companyId: string })[];
  owners: Option[];
  canAssign: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [company, setCompany] = useState(defaults.companyId || (companies.length === 0 ? "__new__" : ""));
  const sameCompany = (c: { companyId: string }) => c.companyId === company;

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Intitulé" name="title" state={state} className="sm:col-span-2">
          <Input id="title" name="title" required maxLength={200} defaultValue={defaults.title} />
        </Field>
        <CompanyPicker companies={companies} value={company} onChange={setCompany} state={state} />
        <Field label="Commercial responsable" name="ownerId" state={state}>
          {canAssign ? (
            <Select name="ownerId" options={owners} defaultValue={defaults.ownerId} />
          ) : (
            <p className="text-sm text-muted-foreground">{owners.find((o) => o.id === defaults.ownerId)?.label ?? "Vous"}</p>
          )}
        </Field>
        <Field label="Opportunité liée" name="opportunityId" state={state}>
          <Select key={`o-${company}`} name="opportunityId" options={opportunities.filter(sameCompany)} defaultValue={defaults.opportunityId} />
        </Field>
        <Field label="Offre liée" name="offerId" state={state}>
          <Select key={`f-${company}`} name="offerId" options={offers.filter(sameCompany)} defaultValue={defaults.offerId} />
        </Field>
        <Field label="Date de signature" name="signedOn" state={state}>
          <Input id="signedOn" name="signedOn" type="date" required defaultValue={defaults.signedOn} />
        </Field>
        <Field label="Montant" name="amount" state={state}>
          <div className="flex gap-2">
            <Input id="amount" name="amount" inputMode="decimal" required defaultValue={defaults.amount} className="flex-1" />
            <NativeSelect name="currency" defaultValue={defaults.currency || "XOF"} aria-label="Devise">
              <NativeSelectOption value="XOF">XOF</NativeSelectOption>
              <NativeSelectOption value="EUR">EUR</NativeSelectOption>
              <NativeSelectOption value="USD">USD</NativeSelectOption>
            </NativeSelect>
          </div>
        </Field>
        <Field label="Début" name="startOn" state={state}>
          <Input id="startOn" name="startOn" type="date" defaultValue={defaults.startOn} />
        </Field>
        <Field label="Fin" name="endOn" state={state}>
          <Input id="endOn" name="endOn" type="date" defaultValue={defaults.endOn} />
        </Field>
        <Field label="Commentaires" name="comments" state={state} className="sm:col-span-2">
          <textarea id="comments" name="comments" maxLength={5000} defaultValue={defaults.comments} className={textareaClass} />
        </Field>
      </div>
      <CustomSection {...custom} state={state} />
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}
