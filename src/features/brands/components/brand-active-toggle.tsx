"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/form";
import { setBrandActive } from "../actions";

export function BrandActiveToggle({ brandId, isActive }: { brandId: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setBrandActive.bind(null, brandId, !isActive),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {isActive ? "Désactiver" : "Activer"}
      </Button>
      {state && !state.ok && <FormMessage state={state} className="text-xs" />}
    </form>
  );
}
