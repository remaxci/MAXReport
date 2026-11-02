"use client";

import { useActionState, useState } from "react";
import { FieldError, FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CustomFieldsInputs } from "@/features/custom-fields/components/custom-fields-inputs";
import type { FieldDefinition } from "@/features/custom-fields/types";
import type { ActionState } from "@/lib/form";
import { submitWithoutReset } from "@/lib/submit-without-reset";
import type { RegisterKind } from "../config";

type Option = { id: string; label: string };

export type DocumentFormDefaults = {
  companyId: string;
  contactName: string;
  contactEmail: string;
  ownerId: string;
  subject: string;
  issuedOn: string;
  sentOn: string;
  statusId: string;
  followUpOn: string;
  comments: string;
  amount: string;
  currency: string;
  validUntil: string;
  recipientResponse: string;
};

const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function DocumentForm({
  kind,
  action,
  defaults,
  companies,
  statuses,
  owners,
  canAssign,
  fields,
  members,
  labels,
  submitLabel,
  customValues,
}: {
  kind: RegisterKind;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: DocumentFormDefaults;
  companies: Option[];
  statuses: Option[];
  owners: Option[];
  canAssign: boolean;
  fields: FieldDefinition[];
  members: Option[];
  labels: { issued: string; followUp: string };
  submitLabel: string;
  customValues?: Record<string, unknown>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [company, setCompany] = useState(defaults.companyId || (companies.length === 0 ? "__new__" : ""));

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="companyId">Entreprise destinataire</Label>
          <NativeSelect
            id="companyId"
            name="companyId"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className="w-full"
          >
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
          {company === "__new__" && (
            <Input name="newCompanyName" required maxLength={200} placeholder="Nom de l'entreprise" aria-label="Nom de la nouvelle entreprise" />
          )}
          <FieldError state={state} name="companyId" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="contactName">Contact destinataire</Label>
          <Input id="contactName" name="contactName" maxLength={160} defaultValue={defaults.contactName} placeholder="Nom et prénom (facultatif)" />
          <Input name="contactEmail" type="email" maxLength={200} defaultValue={defaults.contactEmail} placeholder="E-mail du contact (facultatif)" aria-label="E-mail du contact" />
          <FieldError state={state} name="contactName" />
          <FieldError state={state} name="contactEmail" />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="subject">Objet</Label>
          <Input id="subject" name="subject" required maxLength={200} defaultValue={defaults.subject} />
          <FieldError state={state} name="subject" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ownerId">Commercial responsable</Label>
          {canAssign ? (
            <NativeSelect id="ownerId" name="ownerId" defaultValue={defaults.ownerId} className="w-full">
              {owners.map((o) => (
                <NativeSelectOption key={o.id} value={o.id}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : (
            <p className="text-sm text-muted-foreground">
              {owners.find((o) => o.id === defaults.ownerId)?.label ?? "Vous"}
            </p>
          )}
          <FieldError state={state} name="ownerId" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="statusId">Statut</Label>
          <NativeSelect id="statusId" name="statusId" defaultValue={defaults.statusId} className="w-full">
            {statuses.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError state={state} name="statusId" />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="issuedOn">{labels.issued}</Label>
          <Input id="issuedOn" name="issuedOn" type="date" required defaultValue={defaults.issuedOn} />
          <FieldError state={state} name="issuedOn" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sentOn">Date d&apos;envoi</Label>
          <Input id="sentOn" name="sentOn" type="date" defaultValue={defaults.sentOn} />
          <FieldError state={state} name="sentOn" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="followUpOn">{labels.followUp}</Label>
          <Input id="followUpOn" name="followUpOn" type="date" defaultValue={defaults.followUpOn} />
          <FieldError state={state} name="followUpOn" />
        </div>

        {kind === "offer" && (
          <>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="amount">Montant (facultatif)</Label>
              <div className="flex gap-2">
                <Input id="amount" name="amount" inputMode="decimal" defaultValue={defaults.amount} placeholder="Ex. 1 500 000" className="flex-1" />
                <NativeSelect name="currency" defaultValue={defaults.currency || "XOF"} aria-label="Devise">
                  <NativeSelectOption value="XOF">XOF</NativeSelectOption>
                  <NativeSelectOption value="EUR">EUR</NativeSelectOption>
                  <NativeSelectOption value="USD">USD</NativeSelectOption>
                </NativeSelect>
              </div>
              <FieldError state={state} name="amount" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="validUntil">Valable jusqu&apos;au</Label>
              <Input id="validUntil" name="validUntil" type="date" defaultValue={defaults.validUntil} />
              <FieldError state={state} name="validUntil" />
            </div>
          </>
        )}
      </section>

      {kind === "memo" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="recipientResponse">Réponse du destinataire</Label>
          <textarea id="recipientResponse" name="recipientResponse" maxLength={5000} defaultValue={defaults.recipientResponse} className={textareaClass} />
          <FieldError state={state} name="recipientResponse" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="comments">Commentaires</Label>
        <textarea id="comments" name="comments" maxLength={5000} defaultValue={defaults.comments} className={textareaClass} />
        <FieldError state={state} name="comments" />
      </div>

      {fields.some((f) => f.isActive) && (
        <section className="flex flex-col gap-3 border-t pt-4">
          <h2 className="text-sm font-medium">Informations complémentaires</h2>
          <CustomFieldsInputs fields={fields} members={members} state={state} values={customValues} />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : submitLabel}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
