@AGENTS.md

# MAXreport

Application de pilotage marketing, commercial et budgétaire multimarque (REMAX CI).
L'architecture, le schéma de données, les règles de calcul et le plan par sprints
sont dans [docs/architecture.md](docs/architecture.md) : le lire avant toute évolution.

## Règles de travail

- **Ne jamais pousser sur `main`.** `main` se déploie automatiquement en production.
  Travailler sur une branche (`sprint-N/sujet`), qui reçoit une URL Preview Vercel.
  La fusion dans `main` se fait uniquement après validation explicite de l'utilisateur.
- **Ne jamais modifier la base de production sans validation explicite.**
  | Environnement | Projet Supabase | Ref |
  |---|---|---|
  | Local, Preview Vercel | MAXreport-dev | `ourlvpblwrufdymsbink` |
  | Production (`main`) | MAXreport | `ayxqdxvgdtmrnxpikaya` |
- Ne pas inventer de données ni simuler de connexions API (GA4, Search Console, régies).

## Commandes

```bash
npm run dev      # http://localhost:3000, base dev
npm run lint
npm test         # Vitest
npm run build
```

Après chaque étape : lint, tests, build, conseillers Supabase (sécurité et performance).

## Migrations Supabase

1. Appliquer la migration sur **MAXreport-dev** (outil MCP `apply_migration`).
2. Enregistrer le même SQL dans `supabase/migrations/<version>_<nom>.sql`,
   `<version>` étant celle renvoyée par `list_migrations`.
3. Régénérer `src/lib/supabase/database.types.ts` (`generate_typescript_types`).
4. Vérifier les conseillers (`get_advisors`, sécurité et performance).
5. Lancer les tests RLS de `supabase/tests/` sur dev (`execute_sql` avec le contenu du
   fichier). Chaque script crée ses données dans une transaction annulée à la fin, et
   s'arrête sur la première règle non respectée (« ECHEC … »). Toute nouvelle table
   métier ajoute ses cas : isolation entre marques, propriétaire, Direction en lecture seule.
6. La production reçoit les migrations au moment de la fusion validée.

## Permissions

- Catalogue : table `permissions` (migrations) et miroir TypeScript dans
  `src/server/authz/permissions.ts`. Une nouvelle permission s'ajoute aux deux, et au rôle
  `super_admin`.
- RLS : `brand_id = any ((select app.brands_with('x.y'))::uuid[])` ; le cast `::uuid[]`
  est obligatoire. Pour un contrôle sans marque : `(select app.has_global_permission('x.y'))`.
- Côté serveur : `getAuthContext()` dans les pages (derrière `<Suspense>`),
  `authorize(permission, brandId)` au début de chaque Server Action.
- Premier super-administrateur d'une base : `select app.grant_super_admin('e-mail');`
  dans l'éditeur SQL Supabase.

## Conventions

- Interface en français, utilisable sur mobile.
- Toute table métier porte `brand_id` et une RLS. Les fonctions internes vont dans le schéma `app`.
- Mutations : Server Actions validées avec Zod, permissions vérifiées côté serveur
  avant l'appel à Supabase (la RLS reste le dernier verrou).
- Code par module dans `src/features/<module>/` (queries, actions, schemas, components).
  Autorisation dans `src/server/authz/`. Formules d'indicateurs dans `src/lib/metrics/`, avec tests.
- Une valeur absente n'est pas un zéro : les ratios renvoient `null` (« n/d »).
- shadcn/ui est en style `base-nova` (Base UI) : composer avec la prop `render`, pas `asChild`.
- Cache Components est activé : toute lecture de cookies ou de session se fait derrière un
  `<Suspense>`. Pas de `Math.random()` ni de date courante dans un rendu prérendu.
- Secrets (`SUPABASE_SECRET_KEY`…) uniquement côté serveur, jamais préfixés `NEXT_PUBLIC_`.
