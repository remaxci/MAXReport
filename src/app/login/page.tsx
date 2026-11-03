import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { emailLinksEnabled } from "@/features/auth/email-link";

export const metadata: Metadata = {
  title: "Connexion · MAXreport",
};

export default function LoginPage() {
  return (
    <AuthCard description="Connectez-vous pour accéder à vos rapports.">
      <LoginForm forgotPassword={emailLinksEnabled()} />
    </AuthCard>
  );
}
