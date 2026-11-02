import { startTransition, type FormEvent } from "react";

/**
 * Envoie un formulaire à une action useActionState sans la réinitialisation
 * automatique de React 19 (qui viderait la saisie même en cas d'erreur).
 */
export function submitWithoutReset(formAction: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  };
}
