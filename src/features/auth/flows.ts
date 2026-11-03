import { z } from "zod";
import type { ActionState } from "@/lib/form";
import { parseEmailLink, type EmailLinkType } from "./email-link";
import { checkNewPassword, type PasswordProblem } from "./password";

// Parcours d'accès par e-mail et de mot de passe. Ils reçoivent la partie de
// supabase.auth qu'ils utilisent, ce qui permet de les tester sans réseau.

type AuthError = { code?: string; message: string };
type AuthResult = Promise<{ error: AuthError | null }>;

export type AuthApi = {
  resetPasswordForEmail(email: string): AuthResult;
  verifyOtp(params: { type: EmailLinkType; token_hash: string }): AuthResult;
  updateUser(attributes: { password: string }): AuthResult;
  signInWithPassword(credentials: { email: string; password: string }): AuthResult;
  signOut(): Promise<unknown>;
};

export const RESET_REQUESTED =
  "Si un compte existe pour cette adresse, un e-mail vient de partir avec un lien valable une heure. Pensez à regarder dans les courriers indésirables.";
export const LINK_INVALID =
  "Ce lien n'est plus valable : il a expiré ou a déjà servi. Demandez-en un nouveau.";
const TOO_MANY = "Trop de tentatives depuis cette connexion. Réessayez dans quelques minutes.";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

function fieldError(field: string, message: string): ActionState {
  return { ok: false, message: "Vérifiez les champs signalés.", fieldErrors: { [field]: [message] } };
}

function passwordError(problem: PasswordProblem): ActionState {
  return fieldError(problem.field, problem.message);
}

/**
 * Demande d'un lien de réinitialisation. La réponse est la même, que le
 * compte existe ou non : la page ne révèle pas quelles adresses ont un compte.
 */
export async function requestPasswordReset(auth: AuthApi, rawEmail: string): Promise<ActionState> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return fieldError("email", "Adresse e-mail invalide.");

  const { error } = await auth.resetPasswordForEmail(email.data);
  if (error?.code === "over_request_rate_limit") return { ok: false, message: TOO_MANY };
  if (error) console.error("Lien de réinitialisation", error.code ?? error.message);
  return { ok: true, message: RESET_REQUESTED };
}

/**
 * Lien d'invitation ou de réinitialisation : vérifie le jeton (ce qui ouvre
 * la session) puis enregistre le mot de passe choisi.
 */
export async function setPasswordWithLink(
  auth: AuthApi,
  input: { type: unknown; tokenHash: unknown; password: string; confirmation: string },
): Promise<ActionState> {
  const link = parseEmailLink(input.type, input.tokenHash);
  if (!link) return { ok: false, message: LINK_INVALID };
  const problem = checkNewPassword(input.password, input.confirmation);
  if (problem) return passwordError(problem);

  const verified = await auth.verifyOtp({ type: link.type, token_hash: link.tokenHash });
  if (verified.error) return { ok: false, message: LINK_INVALID };

  const { error } = await auth.updateUser({ password: input.password });
  // Mot de passe identique à l'ancien (réinitialisation) : rien à changer.
  if (error && error.code !== "same_password") {
    console.error("Mot de passe après lien", error.code ?? error.message);
    // Le jeton est consommé : on ferme la session plutôt que de laisser un
    // compte ouvert sans mot de passe connu.
    await auth.signOut();
    return {
      ok: false,
      message:
        error.code === "weak_password"
          ? "Ce mot de passe est jugé trop faible. Demandez un nouveau lien et choisissez-en un autre."
          : "Le mot de passe n'a pas pu être enregistré. Demandez un nouveau lien.",
    };
  }
  return { ok: true, message: "Mot de passe enregistré." };
}

/** Changement de mot de passe d'une personne connectée, qui confirme l'actuel. */
export async function changePassword(
  auth: AuthApi,
  input: { email: string; current: string; password: string; confirmation: string },
): Promise<ActionState> {
  if (!input.current) return fieldError("current", "Saisissez votre mot de passe actuel.");
  const problem = checkNewPassword(input.password, input.confirmation);
  if (problem) return passwordError(problem);
  if (input.password === input.current) {
    return fieldError("password", "Choisissez un mot de passe différent de l'actuel.");
  }

  const check = await auth.signInWithPassword({ email: input.email, password: input.current });
  if (check.error?.code === "over_request_rate_limit") return { ok: false, message: TOO_MANY };
  if (check.error) return fieldError("current", "Mot de passe actuel incorrect.");

  const { error } = await auth.updateUser({ password: input.password });
  if (error?.code === "weak_password") {
    return fieldError("password", "Mot de passe jugé trop faible : choisissez-en un autre.");
  }
  if (error) {
    console.error("Changement de mot de passe", error.code ?? error.message);
    return { ok: false, message: "Le mot de passe n'a pas pu être modifié. Réessayez." };
  }
  return { ok: true, message: "Mot de passe modifié." };
}
