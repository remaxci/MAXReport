# MAXReport

Reporting REMAX CI.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4)
- **Supabase** : base de données et connexion des utilisateurs
- **Vercel** : hébergement, déploiement automatique à chaque push sur `main`

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis renseigner les deux valeurs
npm run dev
```

L'application tourne sur http://localhost:3000.

## Variables d'environnement

| Variable | Où la trouver |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > Data API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase > Project Settings > API Keys (clé « publishable ») |

Sur Vercel, les ajouter dans Project Settings > Environment Variables.

## Comptes utilisateurs

Il n'y a pas d'inscription publique. Les comptes se créent dans Supabase :
Authentication > Users > Add user.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `src/proxy.ts` | Rafraîchit la session et renvoie vers `/login` si l'utilisateur n'est pas connecté |
| `src/lib/supabase/server.ts` | Client Supabase côté serveur |
| `src/lib/supabase/client.ts` | Client Supabase côté navigateur |
| `src/lib/auth.ts` | `getCurrentUser()` : l'utilisateur connecté, côté serveur |
| `src/app/login/` | Page et action de connexion |
| `src/app/page.tsx` | Tableau de bord |
