"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

// ---------------------------------------------------------------------
// Envoi d'un fichier
// ---------------------------------------------------------------------

export function UploadForm({
  action,
  targets,
  accept,
}: {
  action: FormAction;
  targets: { key: string; label: string; description: string }[];
  accept: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [target, setTarget] = useState(targets[0]?.key ?? "");
  const description = targets.find((t) => t.key === target)?.description;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Données importées" name="target" state={state}>
          <NativeSelect id="target" name="target" value={target} onChange={(e) => setTarget(e.target.value)} className="w-full">
            {targets.map((t) => (
              <NativeSelectOption key={t.key} value={t.key}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </Field>
        <Field label="Fichier CSV ou Excel (.xlsx), 4 Mo au plus" name="file" state={state}>
          <Input id="file" name="file" type="file" accept={accept} required />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || targets.length === 0}>
          {pending ? "Lecture du fichier…" : "Envoyer et vérifier"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Correspondance des colonnes
// ---------------------------------------------------------------------

export type MappingField = { key: string; label: string; required: boolean };

export function MappingForm({
  action,
  fields,
  headers,
  mapping,
  options,
  parents,
  parentLabel,
  showCurrency,
  showPeriod,
}: {
  action: FormAction;
  fields: MappingField[];
  headers: string[];
  mapping: Record<string, number>;
  options: { dateFormat: string; numberFormat: string; periodKind: string; defaultParentId?: string; currency?: string };
  /** Objets suivis (relevés marketing) : objet par défaut sans colonne. */
  parents?: { id: string; label: string }[];
  parentLabel?: string;
  showCurrency: boolean;
  showPeriod: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-6">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Label htmlFor={`map_${field.key}`}>
              {field.label}
              {field.required && <span className="text-destructive"> *</span>}
            </Label>
            <NativeSelect
              id={`map_${field.key}`}
              name={`map_${field.key}`}
              defaultValue={mapping[field.key] === undefined ? "" : String(mapping[field.key])}
              className="w-full"
            >
              <NativeSelectOption value="">— Non importé —</NativeSelectOption>
              {headers.map((header, index) => (
                <NativeSelectOption key={index} value={String(index)}>
                  {header}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>

      <section className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateFormat">Dates du fichier</Label>
          <NativeSelect id="dateFormat" name="dateFormat" defaultValue={options.dateFormat} className="w-full">
            <NativeSelectOption value="dmy">Jour/mois/année (31/10/2026)</NativeSelectOption>
            <NativeSelectOption value="mdy">Mois/jour/année (10/31/2026)</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="numberFormat">Nombres du fichier</Label>
          <NativeSelect id="numberFormat" name="numberFormat" defaultValue={options.numberFormat} className="w-full">
            <NativeSelectOption value="fr">Français (1 234,56)</NativeSelectOption>
            <NativeSelectOption value="en">Anglais (1,234.56)</NativeSelectOption>
          </NativeSelect>
        </div>
        {showPeriod && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="periodKind">Sans colonne « fin », une date vaut</Label>
            <NativeSelect id="periodKind" name="periodKind" defaultValue={options.periodKind} className="w-full">
              <NativeSelectOption value="day">Le jour même</NativeSelectOption>
              <NativeSelectOption value="week">Sa semaine</NativeSelectOption>
              <NativeSelectOption value="month">Son mois</NativeSelectOption>
              <NativeSelectOption value="quarter">Son trimestre</NativeSelectOption>
              <NativeSelectOption value="year">Son année</NativeSelectOption>
            </NativeSelect>
          </div>
        )}
        {parents && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defaultParentId">{parentLabel ?? "Objet"} sans colonne</Label>
            <NativeSelect id="defaultParentId" name="defaultParentId" defaultValue={options.defaultParentId ?? ""} className="w-full">
              <NativeSelectOption value="">— Désigné par le fichier —</NativeSelectOption>
              {parents.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        {showCurrency && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency">Devise sans colonne</Label>
            <NativeSelect id="currency" name="currency" defaultValue={options.currency ?? "XOF"} className="w-full">
              {CURRENCIES.map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {c}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Vérification…" : "Vérifier la correspondance"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Action confirmée (importer, annuler, abandonner)
// ---------------------------------------------------------------------

export function ConfirmAction({
  action,
  label,
  title,
  description,
  confirmLabel,
  destructive = false,
  disabled = false,
}: {
  action: FormAction;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <div className="flex flex-col gap-1">
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant={destructive ? "outline" : "default"} disabled={disabled} />}>{label}</AlertDialogTrigger>
        <AlertDialogContent>
          <form action={formAction} className="contents">
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Retour</AlertDialogCancel>
              <AlertDialogAction type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
                {pending ? "En cours…" : confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      <FormMessage state={state} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Date de bascule de l'historique
// ---------------------------------------------------------------------

export function CutoverForm({ action, cutover }: { action: FormAction; cutover: string | null }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-wrap items-end gap-3">
      <Field label="Date de bascule" name="cutover" state={state}>
        <Input id="cutover" name="cutover" type="date" defaultValue={cutover ?? ""} className="w-44" />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        Enregistrer
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
