import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Cette page n&apos;existe pas, ou vous n&apos;y avez pas accès.
      </p>
      <Button nativeButton={false} render={<Link href="/" />}>
        Retour à l&apos;accueil
      </Button>
    </main>
  );
}
