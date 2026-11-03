# MAXreport · Connexion BI (Power BI, Excel)

> **État** : évolution développée le 3 novembre 2026 sur la branche `evolution/connexion-bi`
> (migration `20261103210000_connexion_bi`, appliquée sur la base de test), en attente de validation.

MAXreport met ses données à disposition d'un outil BI externe, **en lecture seule**, par des
**clés d'accès**. Power BI et Excel (Power Query) s'y connectent avec leur connecteur « Web » ; tout
outil capable de lire un flux JSON ou CSV avec un en-tête HTTP fonctionne aussi.

## Qui peut créer une clé

- Une nouvelle permission, **« Créer et révoquer les clés de connexion BI »** (`bi.connect`), n'est
  accordée par défaut qu'au **super-administrateur**. C'est lui qui l'ajoute aux rôles de son choix
  (Paramètres › Rôles et permissions).
- **Clé de marque** : `bi.connect` sur la marque. **Clé Direction** (toutes les marques) :
  `bi.connect` et « Vue Direction » au niveau global.
- Les clés se gèrent dans **Paramètres de la marque › Connexion BI** : création (nom, portée, jeux
  de données, validité de 30 jours à 1 an), liste (statut, dernière lecture, nombre de lectures),
  révocation. Créations et révocations sont inscrites au journal d'audit.

## Sécurité

- La clé (256 bits aléatoires, préfixe `mxbi_`) n'est **affichée qu'une fois**, à la création. La
  base n'en garde que l'**empreinte SHA-256** et les quatre derniers caractères.
- Elle s'envoie dans l'en-tête `Authorization: Bearer <clé>`, **jamais dans l'adresse**.
- Une clé ne donne **jamais plus que les droits actuels de son auteur**. À chaque lecture, la base
  revérifie :
  - que la clé n'est ni révoquée ni expirée ;
  - que le compte de l'auteur est actif et qu'il a toujours `bi.connect` (et la Vue Direction pour
    une clé Direction) ;
  - qu'il peut lire le jeu demandé sur chaque marque (permission « tout voir » ou « tout gérer »)
    et que le module est activé.

  Si ses droits changent ou si son compte est désactivé, la clé cesse de fonctionner aussitôt.
- Tout passe par une fonction de la base (`public.bi_read`, sécurité *definer*) : la route
  `/api/bi/v1` n'utilise aucune clé secrète Supabase, et la table des clés reste illisible sans
  session.
- **Lignes détaillées, sans coordonnées des contacts (e-mail, téléphone) ni commentaires libres** ;
  les fiches archivées sont exclues.
  - Un nom de personne n'apparaît que si l'auteur de la clé voit les membres de la marque ;
    l'identifiant de la personne reste disponible.
  - Un nom de client n'apparaît que si l'auteur lit les prospects.
- Limite : 1 000 lectures par clé et par heure. Une valeur vide signifie « aucune donnée », jamais 0.
- Tests : `supabase/tests/rls_bi.sql` (droits de gestion, isolation entre marques, clé Direction,
  jeux non ouverts, modules coupés, limite de débit, expiration, auteur sans droit ou désactivé,
  révocation définitive, journal d'audit) et `src/features/bi/bi.test.ts`.

## Adresses

| Adresse | Contenu |
|---|---|
| `GET /api/bi/v1` | Ce que la clé ouvre : nom, portée, marques, jeux et leurs adresses |
| `GET /api/bi/v1/<jeu>` | Toutes les lignes du jeu, en JSON |
| `GET /api/bi/v1/<jeu>?format=csv` | Les mêmes lignes en CSV (UTF-8, virgule) |

Réponses : 401 clé absente, invalide, expirée, révoquée ou suspendue ; 403 jeu non ouvert par la
clé ; 404 jeu inconnu ; 429 limite de débit atteinte.

## Jeux de données

| Domaine | Jeux |
|---|---|
| Référence | `marques`, `taux_de_change` |
| Commercial | `offres`, `memos`, `opportunites`, `contrats`, `activites`, `objectifs` |
| Marketing | `reseaux_sociaux`, `campagnes`, `campagnes_releves`, `sites_web_releves` |
| Budgets | `budgets`, `lignes_budget`, `depenses` |
| Planification | `projets`, `jalons`, `taches` |

Le détail des colonnes figure dans la page Connexion BI (« Jeux de données et colonnes ») et dans
`src/features/bi/catalog.ts`. Chaque ligne porte le code de sa marque (`marque`) ; les montants
sont dans la devise de la ligne, et le jeu `taux_de_change` permet de convertir.

## Power BI Desktop

1. **Obtenir les données › Web**, puis **Avancé**.
2. **Parties de l'URL** : `https://<adresse de MAXreport>/api/bi/v1/offres?format=csv`.
3. **En-têtes de requête HTTP** : `Authorization` = `Bearer mxbi_…` (le mot « Bearer », une
   espace, puis la clé).
4. Si Power BI demande un mode d'authentification : **Anonyme** (la clé est dans l'en-tête).
5. Répéter pour chaque jeu, puis relier les tables dans le modèle (par exemple `offres.marque` →
   `marques.code`, `taches.projet_id` → `projets.id`).

Dans Power BI Service, l'actualisation planifiée fonctionne avec ces mêmes réglages (identifiants
« Anonyme », passerelle inutile : MAXreport est accessible sur Internet).

## Excel

**Données › À partir du Web › Avancé** : mêmes adresse et en-tête que Power BI. Le CSV peut aussi
être ouvert directement, mais la clé ne doit pas être mise dans l'adresse : passez par Power Query.

## Looker Studio

Pas de connecteur natif pour une source protégée par un en-tête : à prévoir dans un second temps
(connecteur sur mesure), si besoin.
