import type { ReactNode } from "react";
import { FieldError } from "@/components/form-message";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/form";
import { cn } from "@/lib/utils";

/** Libellé, contrôle et erreur de validation renvoyée par le serveur. */
export function Field({
  label,
  name,
  state,
  children,
  className,
  htmlFor,
}: {
  label: string;
  name: string;
  state: ActionState;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor ?? name}>{label}</Label>
      {children}
      <FieldError state={state} name={name} />
    </div>
  );
}

export const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
