# MAXReport

Reporting REMAX CI : pilotage marketing, commercial et budgétaire multimarque.

- Architecture, schéma de données et plan par sprints : [docs/architecture.md](docs/architecture.md)
- Règles de travail (branches, migrations, conventions) : [CLAUDE.md](CLAUDE.md)

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4), **shadcn/ui** (Base UI)
- **Supabase** : base de données, connexion, stockage
- **Vercel** : hébergement. `main` se déploie en production ; chaque autre branche
  reçoit une URL Preview
- **Vitest** : tests des règles métier

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs du projet MAXreport-dev
npm run dev
```

L'application tourne sur http://localhost:3000.

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run lint` | vérification du code |
| `npm test` | tests automatisés |
| `npm run build` | build de production |

## Environnements

| Environnement | Base Supabase |
|---|---|
| Local, Preview Vercel, Development Vercel | MAXreport-dev |
| Production Vercel (`main`) | MAXreport |

## Variables d'environnement

| Variable | Où la trouver |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > Data API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase > Project Settings > API Keys (clé « publishable ») |

Sur Vercel : Project Settings > Environment Variables, avec les valeurs de dev pour
Preview et Development, et celles de prod pour Production.

## Comptes utilisateurs

Il n'y a pas d'inscription publique.

1. Créer le compte dans Supabase : Authentication › Users › Add user (cocher Auto Confirm User).
2. Premier super-administrateur d'une base, dans l'éditeur SQL de Supabase :
   `select app.grant_super_admin('prenom.nom@exemple.com');`
3. Ensuite, tout se fait dans MAXreport :
   - Administration › Marques : créer les marques ;
   - Administration › Utilisateurs : rôles globaux (Direction, super-administrateur), activation ;
   - Paramètres de la marque : collaborateurs et rôles par marque.

L'invitation par e-mail depuis MAXreport nécessitera un service d'envoi d'e-mails
(SMTP) configuré dans Supabase.

| Rôle | Portée | Droits |
|---|---|---|
| Super-administrateur | toutes les marques | tout |
| Direction | toutes les marques | lecture, collaborateurs en lecture, journal |
| Administrateur de marque | une marque | informations et collaborateurs de la marque, journal |
| Responsable commercial | une marque | accès, collaborateurs en lecture |
| Commercial, Marketing, Lecture | une marque | accès (les droits des modules arrivent avec eux) |

## Organisation du code

| Dossier | Rôle |
|---|---|
| `src/app/` | routes : `login/`, `(app)/` (pages connectées, avec le menu) |
| `src/features/<module>/` | actions, requêtes, schémas et composants d'un module |
| `src/server/authz/` | utilisateur connecté et contrôles d'accès côté serveur |
| `src/lib/metrics/` | formules d'indicateurs et conversion de devises, testées |
| `src/lib/supabase/` | clients Supabase et types générés |
| `src/components/` | composants shadcn/ui (`ui/`) et mise en page (`layout/`) |
| `src/config/navigation.ts` | entrées du menu |
| `src/proxy.ts` | rafraîchit la session, renvoie vers `/login` si besoin |
| `supabase/migrations/` | migrations SQL versionnées |
| `supabase/tests/` | tests d'isolation RLS (à lancer sur la base dev) |
