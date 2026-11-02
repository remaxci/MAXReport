"use client";

import { useActionState } from "react";
import { FieldError, FormMessage } from "@/components/form-message";
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

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;
export type RoleOption = { id: string; label: string };

export function MemberAddForm({ action, roles }: { action: FormAction; roles: RoleOption[] }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="member-email">E-mail du compte</Label>
          <Input id="member-email" name="email" type="email" required placeholder="prenom.nom@exemple.com" />
          <FieldError state={state} name="email" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="member-role">Rôle</Label>
          <RoleSelect id="member-role" roles={roles} />
          <FieldError state={state} name="roleId" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "Ajouter"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function MemberRoleForm({
  action,
  roles,
  currentRoleId,
}: {
  action: FormAction;
  roles: RoleOption[];
  currentRoleId: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <RoleSelect roles={roles} defaultValue={currentRoleId} size="sm" />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Enregistrer
        </Button>
      </div>
      {state && !state.ok && <FormMessage state={state} className="text-xs" />}
    </form>
  );
}

export function MemberRemoveButton({ action, name }: { action: FormAction; name: string }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Retirer</AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction} className="contents">
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer {name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ce collaborateur n&apos;aura plus accès à cette marque. Son compte n&apos;est pas supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {state && !state.ok && <FormMessage state={state} />}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
              {pending ? "Retrait…" : "Retirer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RoleSelect({
  roles,
  id,
  defaultValue,
  size,
}: {
  roles: RoleOption[];
  id?: string;
  defaultValue?: string;
  size?: "sm" | "default";
}) {
  return (
    <NativeSelect
      id={id}
      name="roleId"
      required
      size={size}
      defaultValue={defaultValue ?? ""}
      className="w-full"
      aria-label="Rôle"
    >
      {!defaultValue && (
        <NativeSelectOption value="" disabled>
          Choisir…
        </NativeSelectOption>
      )}
      {roles.map((role) => (
        <NativeSelectOption key={role.id} value={role.id}>
          {role.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
