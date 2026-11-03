// Règles d'un mot de passe choisi dans MAXreport. La longueur minimale est
// celle réglée dans Supabase (Authentication › Email) en production :
// l'application refuse avant d'appeler Supabase, ce qui évite de consommer
// un lien d'invitation pour un mot de passe qui serait rejeté.

export const PASSWORD_MIN_LENGTH = 10;
/** Supabase hache les mots de passe avec bcrypt, limité à 72 octets. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordProblem = { field: "password" | "confirmation"; message: string };

export function checkNewPassword(password: string, confirmation: string): PasswordProblem | null {
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) {
    return { field: "password", message: `${PASSWORD_MIN_LENGTH} caractères au minimum.` };
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return { field: "password", message: "Trop long : 72 caractères au maximum (moins avec des accents)." };
  }
  if (password !== confirmation) {
    return { field: "confirmation", message: "Les deux saisies ne correspondent pas." };
  }
  return null;
}
