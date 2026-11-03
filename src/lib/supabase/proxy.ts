import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages accessibles sans être connecté : connexion, demande d'un lien de
// réinitialisation, lien d'invitation ou de réinitialisation reçu par e-mail.
const PUBLIC_PATHS = ["/login", "/mot-de-passe-oublie", "/confirmer-acces"];

// Rafraîchit la session Supabase à chaque requête et renvoie vers /login
// les visiteurs non connectés. C'est une vérification rapide : les données
// restent protégées par les règles RLS de Supabase et par getCurrentUser().
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // En-têtes anti-cache : une réponse qui pose un cookie de session
          // ne doit jamais être servie à un autre utilisateur.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Ne rien placer entre createServerClient et getClaims : c'est cet appel
  // qui rafraîchit le jeton expiré.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!isLoggedIn && !isPublic) {
    return redirectTo(request, "/login");
  }
  if (isLoggedIn && pathname === "/login") {
    return redirectTo(request, "/");
  }

  return response;
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}
