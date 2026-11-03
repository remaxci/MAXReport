"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/form";
import { acceptEmailLink, requestReset, updatePassword } from "../actions";
import type { EmailLink } from "../email-link";
import { PASSWORD_MIN_LENGTH } from "../password";

const linkClass = "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

function NewPasswordFields({ state }: { state: ActionState }) {
  return (
    <>
      <Field label="Nouveau mot de passe" name="password" state={state}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </Field>
      <Field label="Confirmation" name="confirmation" state={state}>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        {PASSWORD_MIN_LENGTH} caractères au minimum. Une phrase de quelques mots est plus sûre
        et plus facile à retenir qu&apos;un mot compliqué.
      </p>
    </>
  );
}

/** Demande d'un lien de réinitialisation. */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestReset, null);
  return (
    <div className="flex flex-col gap-4">
      {state?.ok ? (
        <FormMessage state={state} />
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="E-mail" name="email" state={state}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <FormMessage state={state} />
          <Button type="submit" disabled={pending}>
            {pending ? "Envoi…" : "Recevoir un lien"}
          </Button>
        </form>
      )}
      <Link href="/login" className={linkClass}>
        Retour à la connexion
      </Link>
    </div>
  );
}

/** Choix du mot de passe depuis un lien d'invitation ou de réinitialisation. */
export function SetPasswordForm({ link }: { link: EmailLink }) {
  const [state, formAction, pending] = useActionState(acceptEmailLink, null);
  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="type" value={link.type} />
        <input type="hidden" name="token_hash" value={link.tokenHash} />
        <NewPasswordFields state={state} />
        <FormMessage state={state} />
        <Button type="submit" disabled={pending}>
          {pending
            ? "Enregistrement…"
            : link.type === "invite"
              ? "Activer mon compte"
              : "Enregistrer le mot de passe"}
        </Button>
      </form>
      <Link href="/mot-de-passe-oublie" className={linkClass}>
        Lien expiré ? Demander un nouveau lien
      </Link>
    </div>
  );
}

/** Changement de mot de passe d'une personne connectée. */
export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, null);
  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <Field label="Mot de passe actuel" name="current" state={state}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <NewPasswordFields state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Changer le mot de passe"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
