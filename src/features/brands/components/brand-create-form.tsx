"use client";

import { useActionState, useState } from "react";
import { FieldError, FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/form";
import { createBrand } from "../actions";
import { slugify } from "../schemas";
import { CurrencySelect } from "./currency-select";

export function BrandCreateForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (previous, formData) => {
      const result = await createBrand(previous, formData);
      if (result?.ok) {
        setName("");
        setSlug("");
        setSlugEdited(false);
      }
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="brand-name">Nom</Label>
        <Input
          id="brand-name"
          name="name"
          required
          maxLength={120}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
        />
        <FieldError state={state} name="name" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="brand-code">Code court</Label>
        <Input
          id="brand-code"
          name="code"
          required
          maxLength={10}
          placeholder="RMXCI"
          className="uppercase"
        />
        <FieldError state={state} name="code" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="brand-slug">Adresse</Label>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>/m/</span>
          <Input
            id="brand-slug"
            name="slug"
            required
            maxLength={40}
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugEdited(true);
            }}
          />
        </div>
        <FieldError state={state} name="slug" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="brand-color">Couleur</Label>
        <Input
          id="brand-color"
          name="primaryColor"
          type="color"
          defaultValue="#1d4ed8"
          className="h-8 w-16 p-1"
        />
        <FieldError state={state} name="primaryColor" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="brand-currency">Devise de reporting</Label>
        <CurrencySelect id="brand-currency" />
        <FieldError state={state} name="reportingCurrency" />
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Création…" : "Créer la marque"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
