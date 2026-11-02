"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionState } from "@/lib/form";
import { reorderConfig } from "../actions";
import type { ReorderableTable } from "../constants";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Un bouton qui déclenche une Server Action (activer, désactiver, par défaut…). */
export function ActionButton({
  action,
  children,
  variant = "outline",
}: {
  action: FormAction;
  children: ReactNode;
  variant?: "outline" | "ghost" | "destructive" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {children}
      </Button>
      {state && !state.ok && <FormMessage state={state} className="max-w-56 text-right text-xs" />}
    </form>
  );
}

/** Flèches pour monter ou descendre un élément dans sa liste. */
export function ReorderButtons({
  brandId,
  table,
  ids,
  index,
}: {
  brandId: string;
  table: ReorderableTable;
  ids: string[];
  index: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const move = (delta: -1 | 1) => {
    const next = [...ids];
    const target = index + delta;
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(async () => {
      const result = await reorderConfig(brandId, table, next);
      setError(result && !result.ok ? result.message : null);
    });
  };

  return (
    <div className="flex items-center" title={error ?? undefined}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Monter"
        disabled={pending || index === 0}
        onClick={() => move(-1)}
      >
        <ArrowUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Descendre"
        disabled={pending || index === ids.length - 1}
        onClick={() => move(1)}
      >
        <ArrowDown />
      </Button>
    </div>
  );
}

/** Formulaire court : libellé, et selon le cas couleur, probabilité ou catégorie. */
export function ConfigForm({
  action,
  submitLabel,
  defaults,
  withColor = false,
  withProbability = false,
  categories,
  placeholder = "Libellé",
}: {
  action: FormAction;
  submitLabel: string;
  defaults?: { label?: string; color?: string | null; probability?: number };
  withColor?: boolean;
  withProbability?: boolean;
  categories?: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const firstError =
    state && !state.ok
      ? (Object.values(state.fieldErrors ?? {}).find((e) => e?.length)?.[0] ?? state.message)
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="label"
          required
          maxLength={80}
          defaultValue={defaults?.label}
          placeholder={placeholder}
          aria-label="Libellé"
          className="w-56 max-w-full"
        />
        {withColor && (
          <Input
            name="color"
            type="color"
            defaultValue={defaults?.color ?? "#64748b"}
            aria-label="Couleur"
            className="h-8 w-10 p-1"
          />
        )}
        {withProbability && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Input
              name="probability"
              type="number"
              min={0}
              max={100}
              step={1}
              required
              defaultValue={defaults?.probability ?? 50}
              aria-label="Probabilité de signature"
              className="w-20"
            />
            %
          </div>
        )}
        {categories && (
          <NativeSelect name="category" required defaultValue="" aria-label="Catégorie">
            <NativeSelectOption value="" disabled>
              Catégorie…
            </NativeSelectOption>
            {categories.map((c) => (
              <NativeSelectOption key={c.value} value={c.value}>
                {c.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
      {firstError && <p className="text-xs text-destructive">{firstError}</p>}
    </form>
  );
}

/** Zone « Modifier » repliée par défaut. */
export function EditDetails({ children, label = "Modifier" }: { children: ReactNode; label?: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export function ColorDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
