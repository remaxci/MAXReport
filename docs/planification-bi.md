# MAXreport · Planification et BI

> **État** : plan validé le 3 novembre 2026 (Planification d'abord). Sprint 10 développé sur la
> branche `sprint-10/planification` (base de test, Preview), en attente de validation.
>
> Proposition du 3 novembre 2026. Deux modules
> ajoutés à MAXreport, avec les mêmes comptes, marques, rôles et règles de sécurité
> (RLS par marque) que le reste de l'application. Même méthode : sprint par sprint,
> base de test, Preview, validation, puis production.

## 1. Planification

### Ce que l'on gère

| Objet | Contenu |
|---|---|
| **Projet** | Chantier d'une marque : nom, description, responsable, dates de début et de fin, statut (prévu, en cours, en pause, terminé, abandonné), couleur. Exemples : « Lancement agence Cocody », « Refonte du site », « Campagne T1 ». |
| **Jalon** | Étape datée d'un projet : nom, échéance, atteint ou non. Ce sont les points de la feuille de route. |
| **Tâche** | Titre, description, projet (facultatif), jalon (facultatif), responsable, statut, priorité (basse, normale, haute, urgente), début, échéance, avancement en %, estimation en heures, champs personnalisés. Lien facultatif vers une campagne, une offre, un mémo ou un prospect de la marque. |
| **Sous-tâche** | Tâche rattachée à une autre (un niveau). |
| **Dépendance** | « B commence quand A est terminée ». Uniquement entre tâches d'une même marque, sans boucle (vérifié par la base). |
| **Commentaire et chronologie** | Comme pour les offres : commentaires, changements de statut, de responsable et d'échéance, tracés automatiquement. |

Les **statuts des tâches** se paramètrent par marque dans l'écran *Statuts* existant (À faire, En cours, En revue, Terminé, Annulé par défaut). Comme ailleurs, les calculs (retard, avancement) s'appuient sur la catégorie du statut, jamais sur son libellé.

### Les vues

| Vue | Usage |
|---|---|
| **Feuille de route** | Frise par trimestre : projets en barres, jalons en losanges, aujourd'hui en repère. Par marque, ou toutes marques pour la Direction. |
| **Liste** | Toutes les tâches, avec filtres (responsable, statut, priorité, projet, échéance) et export Excel. |
| **Kanban** | Une colonne par statut ; on déplace une carte pour changer son statut (glisser-déposer, ou au clavier). |
| **Calendrier** | Mois ou semaine : échéances des tâches et jalons. |
| **Gantt** | Tâches en barres sur leurs dates, flèches de dépendance, alerte quand une tâche commence avant la fin de celle dont elle dépend, ou finit après l'échéance de son jalon. |
| **Charge** | Par collaborateur et par semaine : nombre de tâches et heures estimées. |
| **Mes tâches** | Pour chacun, toutes ses tâches, toutes marques confondues : en retard, aujourd'hui, cette semaine. |

### Droits

| Permission | Effet |
|---|---|
| `planning.read` | Voir les projets et les tâches de la marque. |
| `planning.manage` | Créer et modifier projets, jalons, tâches, dépendances. |
| *(responsable de la tâche)* | Avec `planning.read`, peut changer le statut et l'avancement de **ses** tâches et les commenter ; la base refuse toute autre modification. |

Rôles par défaut : administrateur de marque, responsable commercial et marketing gèrent ; commercial lit et met à jour ses tâches ; Direction et lecture lisent.

### Règles

- Une tâche, ses commentaires, ses dépendances et ses pièces jointes appartiennent à une seule marque ; la RLS l'impose comme pour toutes les autres tables.
- Échéance avant le début, dépendance circulaire, responsable étranger à la marque : refusés par la base.
- En retard : échéance passée et statut non terminé. Avancement d'un projet : part des tâches terminées (ou des heures estimées terminées, si renseignées).
- Notifications par e-mail (échéance proche, tâche assignée) : prévues, actives une fois le SMTP en service.

### Sprint 10 : ce qui est en place

- Migration `planification` : module `planning`, permissions, statuts de tâche par défaut (nouvelles marques et marques existantes), tables `projects`, `milestones`, `tasks`, `task_events`, triggers de contrôle et de chronologie, RLS ; tests `supabase/tests/rls_sprint10.sql`.
- Contrôles de la base : responsable sans `planning.manage` limité au statut, à l'avancement et à l'ordre de ses tâches ; tâche terminée = 100 % et date d'achèvement ; sous-tâches sur un seul niveau ; jalon du même projet ; statut de nature « tâche » et actif ; responsable membre de la marque.
- Écrans : Projets (avancement, tâches à faire et en retard), fiche projet (jalons, tâches), Tâches (filtres), fiche tâche (statut et avancement, sous-tâches, chronologie et commentaires), Mes tâches (toutes marques, par échéance). Statuts et champs personnalisés des tâches et projets dans les paramètres de la marque.
- Règles testées (`src/features/planning/rules.ts`) : retard, regroupement par échéance, avancement d'un projet (pondéré par les heures estimées s'il y en a), tri.
- Un lien (campagne, offre ou mémo, prospect) ne peut viser qu'un élément que l'utilisateur voit.

## 2. BI : graphiques et tableaux de bord

### Graphiques

Bibliothèque : composant *Chart* de shadcn/ui (Recharts), aux couleurs de l'application, en mode clair et sombre. Chaque graphique a sa version tableau (accessibilité, export) et suit les règles de calcul déjà en place :

- les séries temporelles sont calculées côté serveur, par semaine, mois ou trimestre, avec les fonctions existantes (flux additionnés, stocks en dernière valeur connue, valeurs non additives sur la période exacte seulement) ;
- une valeur absente reste un trou dans la courbe, jamais un 0 ;
- montants convertis en devise de reporting avec les taux saisis ; un montant sans taux est exclu et signalé ;
- avant la date de bascule, l'historique importé ; après, les données saisies.

### Où ils apparaissent

| Endroit | Graphiques |
|---|---|
| **Tableau de bord de la marque** | CA signé par mois, offres et contrats, entonnoir du pipeline par étape, leads et dépense des campagnes, abonnés et portée, sessions web par canal, budget prévu / engagé / payé, objectifs / réalisé, tâches en retard et avancement des projets. |
| **Vue Direction** | Comparaison des marques (barres), tendances consolidées en XOF, part de chaque marque. |
| **Explorateur** | Choisir un indicateur, une ou plusieurs marques, une période et un découpage (semaine, mois, trimestre), une comparaison (période précédente ou année précédente) et un type de graphique ; résultat en graphique, en tableau et en Excel. |
| **Tableaux de bord personnalisés** | Composés de graphiques de l'explorateur, enregistrés par marque (ou toutes marques pour la Direction), partagés avec les collaborateurs qui ont les droits. Comme les modèles de rapports, ils ne stockent que des réglages, jamais de chiffres. |

Un graphique ne montre jamais plus que ce que son lecteur peut déjà consulter : tout est lu sous sa RLS.

## 3. Découpage en sprints

| Sprint | Contenu | Taille |
|---|---|---|
| **10 · Planification : socle** | Module `planning`, permissions, projets, jalons, tâches, sous-tâches, statuts de tâche, champs personnalisés, chronologie et commentaires, liste et fiche tâche, « Mes tâches », RLS et tests | L |
| **11 · Vues de planification** | Kanban (glisser-déposer et clavier), calendrier, feuille de route (frise, multimarque pour la Direction) | M |
| **12 · Gantt et dépendances** | Dépendances sans boucle, Gantt, alertes de retard, vue de charge, pièces jointes des tâches | M |
| **13 · BI : graphiques** | Composant graphique, séries temporelles (fonctions testées), graphiques des tableaux de bord marque et Direction | M |
| **14 · BI : explorateur et tableaux de bord personnalisés** | Explorateur d'indicateurs, tableaux de bord enregistrés et partagés, export | L |

Chaque sprint : migrations sur la base de test, tests RLS et tests des règles, build et lint, conseillers Supabase, Preview à valider, puis production après votre accord.

## 4. Décisions à valider

1. Le périmètre ci-dessus (objets, vues, droits).
2. L'ordre : Planification (10 à 12) puis BI (13 et 14), ou l'inverse.
3. La bibliothèque de graphiques : shadcn/ui *Chart* (Recharts), seule dépendance ajoutée.
4. Les statuts de tâche par défaut : À faire, En cours, En revue, Terminé, Annulé.
