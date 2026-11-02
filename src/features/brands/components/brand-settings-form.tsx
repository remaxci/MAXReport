"use client";

import { useActionState } from "react";
import { FieldError, FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/form";
import { CurrencySelect } from "./currency-select";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  brand: { name: string; code: string; slug: string; primaryColor: string | null; reportingCurrency: string };
};

export function BrandSettingsForm({ action, brand }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="settings-name">Nom</Label>
        <Input id="settings-name" name="name" required maxLength={120} defaultValue={brand.name} />
        <FieldError state={state} name="name" />
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Code court</span>
        <span className="text-muted-foreground">{brand.code} (non modifiable)</span>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Adresse</span>
        <span className="text-muted-foreground">/m/{brand.slug} (non modifiable)</span>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-color">Couleur</Label>
        <Input
          id="settings-color"
          name="primaryColor"
          type="color"
          defaultValue={brand.primaryColor ?? "#1d4ed8"}
          className="h-8 w-16 p-1"
        />
        <FieldError state={state} name="primaryColor" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-currency">Devise de reporting</Label>
        <CurrencySelect id="settings-currency" defaultValue={brand.reportingCurrency} />
        <FieldError state={state} name="reportingCurrency" />
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
