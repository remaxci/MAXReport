import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "./actions";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-4 sm:px-6">
        <span className="text-lg font-semibold tracking-tight">MAXreport</span>
        {/* Lit la session : doit rester derrière un Suspense (Cache Components). */}
        <Suspense fallback={<span className="text-sm text-foreground/50">…</span>}>
          <UserMenu />
        </Suspense>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-foreground/60">Les rapports apparaîtront ici.</p>
      </main>
    </div>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-w-0 items-center gap-3 text-sm">
      <span className="truncate text-foreground/70">{user.email}</span>
      <form action={signOut}>
        <button
          type="submit"
          className="shrink-0 rounded-md border border-foreground/20 px-3 py-1.5 transition-colors hover:bg-foreground/5"
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
