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
import { PRIORITIES, PRIORITY_LABELS, PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "../config";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };
type CustomProps = { fields: FieldDefinition[]; members: Option[]; customValues?: Record<string, unknown> };

function Select({
  name,
  options,
  defaultValue,
  placeholder = "—",
  required,
  onChange,
}: {
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <NativeSelect
      id={name}
      name={name}
      defaultValue={defaultValue ?? ""}
      required={required}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className="w-full"
    >
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

// ---------------------------------------------------------------------
// Projet
// ---------------------------------------------------------------------

export type ProjectDefaults = {
  name: string;
  description: string;
  ownerId: string;
  status: string;
  startOn: string;
  endOn: string;
  color: string;
};

const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ id: s, label: PROJECT_STATUS_LABELS[s] }));

export function ProjectForm({
  action,
  defaults,
  owners,
  submitLabel,
  ...custom
}: CustomProps & { action: FormAction; defaults: ProjectDefaults; owners: Option[]; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du projet" name="name" state={state} className="sm:col-span-2">
          <Input id="name" name="name" required maxLength={200} defaultValue={defaults.name} placeholder="Ex. Lancement de l'agence de Cocody" />
        </Field>
        <Field label="Responsable" name="ownerId" state={state}>
          <Select name="ownerId" options={owners} defaultValue={defaults.ownerId} />
        </Field>
        <Field label="Statut" name="status" state={state}>
          <Select name="status" options={STATUS_OPTIONS} defaultValue={defaults.status} required />
        </Field>
        <Field label="Début" name="startOn" state={state}>
          <Input id="startOn" name="startOn" type="date" defaultValue={defaults.startOn} />
        </Field>
        <Field label="Fin prévue" name="endOn" state={state}>
          <Input id="endOn" name="endOn" type="date" defaultValue={defaults.endOn} />
        </Field>
        <Field label="Couleur sur la feuille de route" name="color" state={state}>
          <Input id="color" name="color" type="color" defaultValue={defaults.color || "#3b82f6"} className="h-9 w-20 p-1" />
        </Field>
        <Field label="Description" name="description" state={state} className="sm:col-span-2">
          <textarea id="description" name="description" maxLength={5000} defaultValue={defaults.description} className={textareaClass} />
        </Field>
      </div>
      <CustomSection {...custom} state={state} />
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------
// Jalon
// ---------------------------------------------------------------------

export function MilestoneForm({
  action,
  defaults = { name: "", dueOn: "" },
  submitLabel,
}: {
  action: FormAction;
  defaults?: { name: string; dueOn: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Field label="Jalon" name="name" state={state} className="min-w-48 flex-1">
        <Input id="name" name="name" required maxLength={200} defaultValue={defaults.name} placeholder="Ex. Ouverture au public" />
      </Field>
      <Field label="Échéance" name="dueOn" state={state}>
        <Input id="dueOn" name="dueOn" type="date" required defaultValue={defaults.dueOn} />
      </Field>
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------
// Tâche
// ---------------------------------------------------------------------

export type TaskDefaults = {
  title: string;
  description: string;
  projectId: string;
  milestoneId: string;
  parentId: string;
  assigneeId: string;
  statusId: string;
  priority: string;
  startOn: string;
  dueOn: string;
  progress: string;
  estimateHours: string;
  campaignId: string;
  documentId: string;
  companyId: string;
};

const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ id: p, label: PRIORITY_LABELS[p] }));

export function TaskForm({
  action,
  defaults,
  statuses,
  projects,
  milestones,
  parents,
  assignees,
  campaigns,
  documents,
  companies,
  submitLabel,
  ...custom
}: CustomProps & {
  action: FormAction;
  defaults: TaskDefaults;
  statuses: Option[];
  projects: Option[];
  milestones: (Option & { projectId: string })[];
  parents: (Option & { projectId: string | null })[];
  assignees: Option[];
  /** null : module désactivé, champ masqué. */
  campaigns: Option[] | null;
  documents: Option[] | null;
  companies: Option[] | null;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [project, setProject] = useState(defaults.projectId);
  const projectMilestones = milestones.filter((m) => m.projectId === project);
  const links = [campaigns, documents, companies].some((l) => l !== null);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titre" name="title" state={state} className="sm:col-span-2">
          <Input id="title" name="title" required maxLength={300} defaultValue={defaults.title} placeholder="Ex. Valider le plan média" />
        </Field>
        <Field label="Responsable" name="assigneeId" state={state}>
          <Select name="assigneeId" options={assignees} defaultValue={defaults.assigneeId} placeholder="Non attribuée" />
        </Field>
        <Field label="Statut" name="statusId" state={state}>
          <Select name="statusId" options={statuses} defaultValue={defaults.statusId} required placeholder="Choisir…" />
        </Field>
        <Field label="Priorité" name="priority" state={state}>
          <Select name="priority" options={PRIORITY_OPTIONS} defaultValue={defaults.priority || "normal"} required />
        </Field>
        <Field label="Avancement (%)" name="progress" state={state}>
          <Input id="progress" name="progress" type="number" min={0} max={100} step={5} defaultValue={defaults.progress || "0"} />
        </Field>
        <Field label="Début" name="startOn" state={state}>
          <Input id="startOn" name="startOn" type="date" defaultValue={defaults.startOn} />
        </Field>
        <Field label="Échéance" name="dueOn" state={state}>
          <Input id="dueOn" name="dueOn" type="date" defaultValue={defaults.dueOn} />
        </Field>
        <Field label="Projet" name="projectId" state={state}>
          <Select name="projectId" options={projects} defaultValue={defaults.projectId} placeholder="Sans projet" onChange={setProject} />
        </Field>
        <Field label="Jalon" name="milestoneId" state={state}>
          <Select
            key={project}
            name="milestoneId"
            options={projectMilestones}
            defaultValue={project === defaults.projectId ? defaults.milestoneId : ""}
            placeholder={project ? "Aucun jalon" : "Choisissez d'abord un projet"}
          />
        </Field>
        <Field label="Sous-tâche de" name="parentId" state={state}>
          <Select name="parentId" options={parents} defaultValue={defaults.parentId} placeholder="Tâche principale" />
        </Field>
        <Field label="Estimation (heures)" name="estimateHours" state={state}>
          <Input id="estimateHours" name="estimateHours" inputMode="decimal" defaultValue={defaults.estimateHours} />
        </Field>
        <Field label="Description" name="description" state={state} className="sm:col-span-2">
          <textarea id="description" name="description" maxLength={10000} defaultValue={defaults.description} className={textareaClass} />
        </Field>
      </div>
      {links && (
        <section className="grid gap-4 border-t pt-4 sm:grid-cols-3">
          <h2 className="text-sm font-medium sm:col-span-3">Liens</h2>
          {campaigns && (
            <Field label="Campagne" name="campaignId" state={state}>
              <Select name="campaignId" options={campaigns} defaultValue={defaults.campaignId} />
            </Field>
          )}
          {documents && (
            <Field label="Offre ou mémo" name="documentId" state={state}>
              <Select name="documentId" options={documents} defaultValue={defaults.documentId} />
            </Field>
          )}
          {companies && (
            <Field label="Prospect" name="companyId" state={state}>
              <Select name="companyId" options={companies} defaultValue={defaults.companyId} />
            </Field>
          )}
        </section>
      )}
      <CustomSection {...custom} state={state} />
      <Submit pending={pending} label={submitLabel} state={state} />
    </form>
  );
}

/** Statut et avancement : formulaire court, pour le responsable de la tâche. */
export function TaskProgressForm({
  action,
  statuses,
  statusId,
  progress,
}: {
  action: FormAction;
  statuses: Option[];
  statusId: string;
  progress: number;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-wrap items-end gap-3">
      <Field label="Statut" name="statusId" state={state}>
        <Select name="statusId" options={statuses} defaultValue={statusId} required />
      </Field>
      <Field label="Avancement (%)" name="progress" state={state}>
        <Input id="progress" name="progress" type="number" min={0} max={100} step={5} defaultValue={String(progress)} className="w-28" />
      </Field>
      <Submit pending={pending} label="Mettre à jour" state={state} />
    </form>
  );
}

export function CommentForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Field label="Commentaire" name="text" state={state}>
        <textarea id="text" name="text" required maxLength={5000} className={textareaClass} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Envoi…" : "Commenter"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
