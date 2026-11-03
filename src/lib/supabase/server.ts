import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";

// Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
// Créer un nouveau client à chaque requête : ne jamais le partager.
export async function createClient() {
  // La session Supabase lit l'heure (Date.now) pour vérifier son expiration.
  // Les cookies seuls autorisent encore un prérendu ; connection() réserve
  // la suite à la requête réelle (sinon Next signale « Date.now() while prerendering »).
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component, qui ne peut pas écrire de cookies.
            // Sans risque : src/proxy.ts rafraîchit la session à chaque requête.
          }
        },
      },
    },
  );
}
