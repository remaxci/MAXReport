import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Cadre des pages accessibles sans session : connexion, lien reçu par e-mail. */
export function AuthCard({ description, children }: { description: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">MAXreport</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
