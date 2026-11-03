import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/password-forms";
import { emailLinksEnabled } from "@/features/auth/email-link";

export const metadata: Metadata = {
  title: "Mot de passe oublié · MAXreport",
};

export default function ForgotPasswordPage() {
  if (!emailLinksEnabled()) {
    return (
      <AuthCard description="La réinitialisation par e-mail n'est pas encore disponible. Demandez un mot de passe provisoire à votre administrateur, puis remplacez-le dans « Mon compte ».">
        <Link href="/login" className="text-sm underline-offset-4 hover:underline">
          Retour à la connexion
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard description="Saisissez l'adresse de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
