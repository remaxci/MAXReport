import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SetPasswordForm } from "@/features/auth/components/password-forms";
import { parseEmailLink } from "@/features/auth/email-link";

export const metadata: Metadata = {
  title: "Votre accès · MAXreport",
};

// Page ouverte depuis un e-mail d'invitation ou de réinitialisation. Elle ne
// fait qu'afficher le formulaire : le jeton n'est vérifié qu'à son envoi.
export default function EmailLinkPage({ searchParams }: PageProps<"/confirmer-acces">) {
  return (
    <Suspense fallback={<AuthCard description="Chargement…">{null}</AuthCard>}>
      <EmailLink searchParams={searchParams} />
    </Suspense>
  );
}

async function EmailLink({ searchParams }: Pick<PageProps<"/confirmer-acces">, "searchParams">) {
  const params = await searchParams;
  const link = parseEmailLink(params.type, params.token_hash);

  if (!link) {
    return (
      <AuthCard description="Ce lien est incomplet. Ouvrez-le de nouveau depuis l'e-mail, ou demandez-en un autre.">
        <Link
          href="/mot-de-passe-oublie"
          className="text-sm underline-offset-4 hover:underline"
        >
          Demander un nouveau lien
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description={
        link.type === "invite"
          ? "Bienvenue ! Choisissez le mot de passe de votre compte."
          : "Choisissez votre nouveau mot de passe."
      }
    >
      <SetPasswordForm link={link} />
    </AuthCard>
  );
}
