"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { setGlobalRole, setUserActive } from "../actions";

const GLOBAL_ROLE_LABELS: Record<string, string> = {
  none: "Aucun",
  direction: "Direction",
  super_admin: "Super-administrateur",
};

export function GlobalRoleForm({ userId, current }: { userId: string; current: string | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setGlobalRole.bind(null, userId),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <NativeSelect name="roleKey" size="sm" defaultValue={current ?? "none"} aria-label="Rôle global">
          {Object.entries(GLOBAL_ROLE_LABELS).map(([key, label]) => (
            <NativeSelectOption key={key} value={key}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Enregistrer
        </Button>
      </div>
      {state && !state.ok && <FormMessage state={state} className="text-xs" />}
    </form>
  );
}

export function UserActiveToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setUserActive.bind(null, userId, !isActive),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {isActive ? "Désactiver" : "Réactiver"}
      </Button>
      {state && !state.ok && <FormMessage state={state} className="max-w-48 text-right text-xs" />}
    </form>
  );
}
