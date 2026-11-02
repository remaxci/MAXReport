"use client";

import { useActionState } from "react";
import { Field, textareaClass } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomFieldsInputs } from "@/features/custom-fields/components/custom-fields-inputs";
import type { FieldDefinition } from "@/features/custom-fields/types";
import type { ActionState } from "@/lib/form";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type ReportDefaults = {
  callsProspecting: number;
  callsFollowUp: number;
  emailsSent: number;
  qualifiedMeetings: number;
  opportunitiesDeclared: number;
  memosDeclared: number;
  comments: string;
};

function CountField({
  label,
  name,
  defaultValue,
  state,
}: {
  label: string;
  name: keyof ReportDefaults;
  defaultValue: number;
  state: ActionState;
}) {
  return (
    <Field label={label} name={name} state={state}>
      <Input id={name} name={name} type="number" inputMode="numeric" min={0} max={10000} step={1} defaultValue={defaultValue} />
    </Field>
  );
}

/** Fiche hebdomadaire : enregistrer un brouillon ou soumettre au responsable. */
export function ReportForm({
  action,
  defaults,
  declareOpportunities,
  declareMemos,
  submitted,
  fields,
  members,
  customValues,
}: {
  action: FormAction;
  defaults: ReportDefaults;
  /** Le CRM est désactivé : les opportunités se déclarent dans la fiche. */
  declareOpportunities: boolean;
  /** Le registre des mémos est désactivé : les mémos se déclarent dans la fiche. */
  declareMemos: boolean;
  submitted: boolean;
  fields: FieldDefinition[];
  members: { id: string; label: string }[];
  customValues: Record<string, unknown>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <CountField label="Appels de prospection" name="callsProspecting" defaultValue={defaults.callsProspecting} state={state} />
        <CountField label="Appels de relance" name="callsFollowUp" defaultValue={defaults.callsFollowUp} state={state} />
        <CountField label="E-mails envoyés" name="emailsSent" defaultValue={defaults.emailsSent} state={state} />
        <CountField label="Rendez-vous qualifiés" name="qualifiedMeetings" defaultValue={defaults.qualifiedMeetings} state={state} />
        {declareOpportunities && (
          <CountField label="Opportunités créées" name="opportunitiesDeclared" defaultValue={defaults.opportunitiesDeclared} state={state} />
        )}
        {declareMemos && (
          <CountField label="Mémos stratégiques envoyés" name="memosDeclared" defaultValue={defaults.memosDeclared} state={state} />
        )}
        <Field label="Commentaires" name="comments" state={state} className="sm:col-span-2">
          <textarea
            id="comments"
            name="comments"
            maxLength={5000}
            defaultValue={defaults.comments}
            placeholder="Faits marquants, difficultés, besoins de soutien…"
            className={textareaClass}
          />
        </Field>
      </div>
      {fields.some((f) => f.isActive) && (
        <section className="flex flex-col gap-3 border-t pt-4">
          <h2 className="text-sm font-medium">Informations complémentaires</h2>
          <CustomFieldsInputs fields={fields} members={members} state={state} values={customValues} />
        </section>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="submit" disabled={pending}>
          {pending ? "Enregistrement…" : submitted ? "Mettre à jour la fiche soumise" : "Soumettre la fiche"}
        </Button>
        <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>
          {submitted ? "Repasser en brouillon" : "Enregistrer le brouillon"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
