# MAXreport · Recette et mise en production

> Sprint 9 · 3 novembre 2026. La production (`max-report.vercel.app`, base Supabase `MAXreport`)
> n'a pas encore reçu l'application : elle sert toujours le tout premier socle, et sa base est vide.
> **Rien de ce qui suit n'est fait sans la validation explicite de la Direction.**

## 1. Résultat de la recette

| Contrôle | Résultat |
|---|---|
| Tests applicatifs (Vitest) | 214 tests, tous verts : calculs (formules, devises, périodes, budgets, historique), imports, droits, exports |
| Tests de sécurité de la base (`supabase/tests/`) | Sprints 1 à 8 verts sur la base de test : isolation entre marques, dossiers personnels des commerciaux, lecture seule de la Direction, garde-fous métier |
| Build, lint, typage | Sans erreur |
| Conseillers Supabase | Sécurité : une alerte, réglage d'authentification à activer (voir §2). Performance : aucune clé étrangère sans index |
| Revue de la base | 38 tables, toutes avec RLS et politiques ; aucun accès anonyme ; fonctions exposées en `security invoker` à `search_path` figé ; fonctions internes dans le schéma `app`, non exposé ; pièces jointes dans un compartiment privé (4 Mo) |
| Revue de l'application | 76 actions serveur : chacune vérifie les droits avant de lire ou d'écrire ; exports Excel soumis aux mêmes droits que les pages ; aucune clé secrète dans le code ni côté navigateur |
| En-têtes HTTP | `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP `frame-ancestors 'none'; form-action 'self'; object-src 'none'` ; en-tête `X-Powered-By` retiré |
| Imports | Fichiers de 4 Mo et 5 000 lignes au plus ; classeurs Excel refusés au-delà de 60 Mo décompressés (protection contre les « bombes zip ») |
| Performances | Index ajoutés pour les lectures des tableaux de bord (offres par date d'envoi, relevés par période) |
| Affichage mobile | Menu en tiroir, tableaux défilant horizontalement, formulaires sur une colonne ; page de connexion vérifiée à 375 px |

### Risques acceptés

- **Dépendances** : `npm audit` signale 9 alertes modérées, toutes dans `exceljs` (archivage zip : `glob`, `minimatch`, `uuid` v8). Elles portent sur des motifs de fichiers et un paramètre que l'application n'utilise pas ; la seule correction proposée est un retour en arrière cassant. À revoir à chaque nouvelle version d'`exceljs`.
- **PDF** : produit par l'impression du navigateur (mise en page dédiée), pas par un générateur côté serveur.
- **Aucune connexion aux plateformes** (Meta, Google, GA4…) : relevés saisis ou importés.

## 2. À faire par vous avant la bascule

1. **Offres payantes** (données réelles, usage commercial) :
   - Supabase **Pro** pour le projet `MAXreport` : sauvegardes quotidiennes, pas de mise en pause après 7 jours d'inactivité ;
   - Vercel **Pro** : le plan gratuit (Hobby) est réservé à un usage non commercial.
2. **Supabase › Authentication** du projet `MAXreport` (production), à régler aussi sur `MAXreport-dev` :
   - **Désactiver les inscriptions libres** (*Allow new users to sign up*) : les comptes sont créés par un administrateur. Sinon, n'importe qui peut créer un compte avec la clé publique (il ne verrait rien grâce à la RLS, mais le compte existerait) ;
   - activer la **protection des mots de passe compromis** (seule alerte de sécurité restante) et une longueur minimale de 10 caractères ;
   - **URL Configuration** : *Site URL* = l'adresse définitive (`https://max-report.vercel.app` ou votre domaine) ;
   - **SMTP** de votre messagerie (adresse d'envoi REMAX CI) pour les invitations et les réinitialisations de mot de passe.
3. **Domaine** (facultatif) : un sous-domaine du type `maxreport.remax.ci` à relier au projet Vercel.
4. Préparer la **liste des marques** (code court, nom, devise) et des **collaborateurs** (e-mail, marque, rôle).

## 3. Procédure de bascule (après votre validation)

1. **Base de production** : appliquer les 18 migrations de `supabase/migrations/`, dans l'ordre et sans modification (mêmes fichiers que sur la base de test).
2. Vérifier : liste des migrations identique à la base de test, conseillers sécurité et performance, RLS active sur toutes les tables.
3. **Super-administrateur** : `select app.grant_super_admin('communication@remax.ci');` (le compte existe déjà en production ; son profil est créé par la migration « multimarque »).
4. **Application** : fusionner la branche `sprint-9/recette` (qui contient les sprints 0 à 9) dans `main` ; Vercel déploie la production, qui utilise déjà les variables de la base de production.
5. **Contrôles après déploiement** : connexion, création d'une marque (valeurs par défaut posées), activation des modules, ajout d'un collaborateur, tableau de bord, export Excel, impression PDF, en-têtes de sécurité.
6. **Mise en service** : marques, collaborateurs et rôles ; taux de change USD du mois ; imports de l'existant (prospects, historique agrégé avec sa date de bascule) ; premières saisies.

### Retour arrière

- Application : *Instant Rollback* Vercel vers le déploiement précédent (quelques secondes).
- Base : les migrations s'appliquent sur une base vide ; en cas d'échec, la transaction de la migration fautive est annulée. Une fois des données saisies, restauration depuis les sauvegardes quotidiennes (plan Pro).

## 4. Exploitation courante

- **Chaque mois** : saisir le taux USD → XOF (Paramètres › Taux de change), avec sa source.
- **Comptes** : créer le compte (Supabase › Authentication, ou invitation par e-mail une fois le SMTP réglé), puis l'affecter à une marque avec un rôle.
- **Journal d'audit** : toute création, modification ou suppression est tracée (auteur, date, valeurs avant et après).
- **Évolutions** : branche dédiée, migration testée sur la base de test, tests de `supabase/tests/` relancés, Preview validée, puis fusion dans `main` après validation.
