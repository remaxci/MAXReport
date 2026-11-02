import type { ActionState } from "@/lib/form";
import { cn } from "@/lib/utils";

/** Message global d'un formulaire (succès ou erreur). */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn("text-sm", state.ok ? "text-muted-foreground" : "text-destructive", className)}
    >
      {state.message}
    </p>
  );
}

/** Erreurs d'un champ, renvoyées par la validation serveur. */
export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const errors = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}
