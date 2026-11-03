import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/password-forms";

export const metadata: Metadata = {
  title: "Mot de passe oublié · MAXreport",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard description="Saisissez l'adresse de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
