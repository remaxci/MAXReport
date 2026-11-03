"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { Field } from "@/components/field";
import { FieldError, FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { DATASET_GROUPS, DEFAULT_VALIDITY_DAYS, VALIDITY_DAYS } from "../catalog";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { key: string; label: string; group: string };

/** Clé en clair, affichée une seule fois, avec un bouton pour la copier. */
function NewToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <Label htmlFor="bi-new-token">Nouvelle clé d&apos;accès</Label>
      <div className="flex flex-wrap gap-2">
        <Input id="bi-new-token" readOnly value={token} className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copiée" : "Copier"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Collez-la dans votre outil BI (en-tête « Authorization: Bearer … »). Elle ne sera plus affichée : en cas de perte, révoquez-la et
        créez-en une autre. Ne l&apos;envoyez jamais par e-mail ou messagerie.
      </p>
    </div>
  );
}

export function KeyForm({
  action,
  brandName,
  allowDirection,
  allowBrand,
  brandDatasets,
  directionDatasets,
}: {
  action: FormAction;
  brandName: string;
  allowBrand: boolean;
  allowDirection: boolean;
  brandDatasets: Option[];
  directionDatasets: Option[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [scope, setScope] = useState<"marque" | "direction">(allowBrand ? "marque" : "direction");
  const options = scope === "direction" ? directionDatasets : brandDatasets;

  return (
    <div className="flex flex-col gap-4">
      {state?.ok && state.data && <NewToken key={state.data} token={state.data} />}
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <Field label="Nom de la clé" name="name" state={state} className="min-w-0 flex-1 basis-64">
            <Input id="name" name="name" required maxLength={80} placeholder="Ex. : Power BI Direction commerciale" />
          </Field>
          <Field label="Validité" name="validity" state={state} className="basis-40">
            <NativeSelect id="validity" name="validity" defaultValue={String(DEFAULT_VALIDITY_DAYS)} className="w-full">
              {VALIDITY_DAYS.map((days) => (
                <NativeSelectOption key={days} value={String(days)}>
                  {days === 365 ? "1 an" : `${days} jours`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>

        {allowBrand && allowDirection ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Portée</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="scope" value="marque" checked={scope === "marque"} onChange={() => setScope("marque")} />
              {brandName} seulement
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="scope" value="direction" checked={scope === "direction"} onChange={() => setScope("direction")} />
              Direction : toutes les marques
            </label>
          </fieldset>
        ) : (
          <input type="hidden" name="scope" value={scope} />
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Jeux de données ouverts</legend>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun jeu de données lisible avec vos droits sur cette portée.</p>
          ) : (
            DATASET_GROUPS.map((group) => {
              const items = options.filter((o) => o.group === group);
              if (items.length === 0) return null;
              return (
                <div key={`${scope}-${group}`} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase">{group}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {items.map((o) => (
                      <label key={o.key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="datasets" value={o.key} defaultChecked />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
          <FieldError state={state} name="datasets" />
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || options.length === 0}>
            {pending ? "Création…" : "Créer la clé"}
          </Button>
          {state && !(state.ok && state.data) && <FormMessage state={state} />}
        </div>
      </form>
    </div>
  );
}
