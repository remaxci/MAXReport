import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Connexion · MAXreport",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">MAXreport</h1>
        <p className="mt-1 mb-8 text-sm text-foreground/60">
          Connectez-vous pour accéder à vos rapports.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
