import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
};

// Point d'entrée unique pour lire l'utilisateur connecté côté serveur.
// Lit les cookies : à appeler derrière un <Suspense> (Cache Components).
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  return {
    id: data.claims.sub,
    email: data.claims.email ?? "",
  };
}
