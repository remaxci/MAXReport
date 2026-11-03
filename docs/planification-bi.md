# MAXreport · Planification et BI

> **État** : plan validé le 3 novembre 2026 (Planification d'abord). Sprint 10 en production le
> 3 novembre 2026 (migration `20261103120950_planification`), Sprint 11 le même jour (sans migration).
> Sprint 12 en production le 3 novembre 2026 (migration `20261103133036_planification_dependances`).
> Sprint 13 (graphiques BI) en production le 3 novembre 2026 (sans migration). Sprint 14 (explorateur et
> tableaux de bord personnalisés) en production le 3 novembre 2026 (migration `20261103163000_tableaux_personnalises`) :
> le plan est réalisé. Évolution « notifications des tâches » développée sur la branche
> `evolution/notifications-taches` (migration `20261103180000_notifications_taches`, appliquée sur la base de test),
> en attente de validation ; l'envoi ne s'active qu'avec la messagerie (voir mise-en-production.md, §4).
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
| **Charge** | Par collaborateur et par semaine : heures restantes des tâches à faire, comparées à une capacité hebdomadaire réglable. |
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
- Notifications par e-mail : un récapitulatif quotidien (jours ouvrés, vers 6 h) des tâches confiées depuis le dernier envoi, à rendre aujourd'hui ou bientôt (délai réglable dans « Mon compte », la veille par défaut) et en retard. Le contenu est préparé par la base (`task_digests`), avec les mêmes droits que l'application : profil actif, `planning.read` sur la marque, marque active avec la planification. Un envoi par personne et par jour au plus, tracé dans `notification_digests` ; préférences dans `notification_preferences` (chacun les siennes). Rien n'est envoyé tant que la messagerie et les réglages d'activation ne sont pas en place. Tests `supabase/tests/rls_notifications.sql` et `src/features/notifications/notifications.test.ts`.

### Sprint 10 : ce qui est en place

- Migration `planification` : module `planning`, permissions, statuts de tâche par défaut (nouvelles marques et marques existantes), tables `projects`, `milestones`, `tasks`, `task_events`, triggers de contrôle et de chronologie, RLS ; tests `supabase/tests/rls_sprint10.sql`.
- Contrôles de la base : responsable sans `planning.manage` limité au statut, à l'avancement et à l'ordre de ses tâches ; tâche terminée = 100 % et date d'achèvement ; sous-tâches sur un seul niveau ; jalon du même projet ; statut de nature « tâche » et actif ; responsable membre de la marque.
- Écrans : Projets (avancement, tâches à faire et en retard), fiche projet (jalons, tâches), Tâches (filtres), fiche tâche (statut et avancement, sous-tâches, chronologie et commentaires), Mes tâches (toutes marques, par échéance). Statuts et champs personnalisés des tâches et projets dans les paramètres de la marque.
- Règles testées (`src/features/planning/rules.ts`) : retard, regroupement par échéance, avancement d'un projet (pondéré par les heures estimées s'il y en a), tri.
- Un lien (campagne, offre ou mémo, prospect) ne peut viser qu'un élément que l'utilisateur voit.

### Sprint 11 : vues

- Onglets des tâches : Liste, Kanban, Calendrier ; menu « Feuille de route ». Aucune migration.
- **Kanban** : une colonne par statut (les statuts désactivés n'apparaissent que s'ils portent encore des tâches). Glisser une carte change son statut et son ordre ; au clavier, la liste « Déplacer vers » de chaque carte. L'ordre utilise des positions espacées (`src/features/planning/board.ts`) : en général seule la carte déplacée est réécrite. Sans `planning.manage`, on ne déplace que ses propres tâches, en fin de colonne (jamais les cartes des autres). Affichage immédiat, annulé si la base refuse.
- **Calendrier** : mois du lundi au dimanche ; échéances des tâches (en retard en rouge, terminées barrées) et jalons (◆) ; filtres responsable et projet ; liste des jours sur mobile.
- **Feuille de route** : une année par trimestres et mois ; projet = barre (ses dates, à défaut celles de ses jalons) avec son avancement ; jalons ◆ (atteint) ou ◇ ; repère du jour. « Toutes les marques » pour qui lit la planification de plusieurs marques. Projets abandonnés masqués ; projets sans date listés à part.

### Sprint 12 : dépendances, Gantt, charge, pièces jointes

- Migration `planification_dependances` : tables `task_dependencies` et `task_attachments`, événements de chronologie (dépendance ajoutée ou retirée, pièce jointe ajoutée ou supprimée), politiques du stockage privé pour le dossier `{marque}/taches/{tâche}/` ; tests `supabase/tests/rls_sprint12.sql`.
- **Dépendances** (« B attend la fin de A ») : entre tâches d'une même marque, créées et retirées par `planning.manage`. La base refuse les boucles, même indirectes, sous un verrou par marque (deux ajouts simultanés ne peuvent pas en former une). Le contrôle des droits passe avant la recherche de boucle : un utilisateur sans droit n'apprend rien des dépendances existantes. La fiche tâche ne propose que les tâches qui ne fermeraient pas de boucle.
- **Fiche tâche** : sections « Attend la fin de » et « Bloque », badge « Bloquée » tant qu'un prédécesseur reste à faire (un prédécesseur annulé ne bloque plus), « Dates incompatibles » quand une tâche commence avant l'échéance de celle qu'elle attend (le même jour est admis), « Après son jalon » quand elle finit après un jalon pas encore atteint.
- **Pièces jointes des tâches** : mêmes formats et même limite (4 Mo) que pour les offres, bucket privé, liens de téléchargement valables 60 secondes. Ajout et suppression par `planning.manage` ou par le responsable de la tâche (tâche non archivée) ; lecture avec `planning.read`.
- **Gantt** (onglet des tâches) : trois mois, un groupe par projet avec ses jalons, barres du début à l'échéance (avancement en couleur), traits de dépendance (rouges en cas de conflit), repère du jour ; filtres responsable et projet ; défilement horizontal sur mobile, titres fixes. Encadré d'alertes : dates incompatibles, tâches après leur jalon, tâches qui devaient commencer mais attendent encore.
- **Charge** (onglet des tâches) : huit semaines à partir de la semaine en cours. Heures restantes = estimation × part non réalisée, réparties sur les jours ouvrés de la tâche à partir d'aujourd'hui ; une tâche en retard pèse sur aujourd'hui. Capacité de référence réglable (40 h par défaut) : orange à 80 %, rouge au-delà. Colonnes « Sans date » (heures non placées) et « Sans estimation » (tâches non comptées). Aucune donnée inventée : sans estimation, rien n'est compté.
- Règles testées : `src/features/planning/schedule.ts` (boucles, blocage, conflits, semaines ISO, charge) et `gantt.ts` (fenêtre, barres, repères, traits).

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

### Sprint 13 : graphiques

- Composant *Chart* de shadcn/ui (Recharts). Palette catégorielle de huit couleurs validée (daltonisme, contraste) en clair et en sombre, dans un ordre fixe (`--chart-1` à `--chart-8`). Une seule échelle par graphique ; info-bulle au survol ; légende dès deux séries ; sous chaque graphique, « Voir les valeurs » ouvre le tableau des données.
- Séries temporelles (`src/lib/metrics/series.ts`) : 13 semaines, 12 mois, 8 trimestres ou 5 ans selon la période choisie, jusqu'à la période affichée. Chaque point est calculé par les mêmes fonctions que les indicateurs (historique avant la bascule, conversion des devises, flux, stocks, valeurs non additives) ; une valeur inconnue reste un trou, jamais un 0. Un relevé qui couvre plusieurs points n'est pas compté, et le graphique le signale.
- **Tableau de bord de la marque**, sous les indicateurs de chaque section : CA signé ; opportunités, offres et contrats ; pipeline par étape (montant dans le tableau) ; taux d'atteinte des objectifs d'équipe ; abonnés, impressions et interactions ; leads et dépense des campagnes ; sessions par canal (ou total, sans ventilation) ; budgets prévu, engagé, payé ; carte Planification (tâches en retard, avancement des projets).
- **Vue Direction** : CA signé par marque avec la part de chacune (tableau), CA consolidé empilé par marque (au-delà de huit marques, « Autres marques »).
- Les graphiques se chargent à part : les indicateurs s'affichent sans les attendre. Les lectures partagées (taux de change, date de bascule, historique) sont faites une fois par page.
- Règles testées : `series.test.ts` (périodes, libellés, sommes et parts sans 0 inventé) et `chart-data.test.ts` (entonnoir, devises sans taux, canaux relevés).

### Sprint 14 : explorateur et tableaux de bord personnalisés

- **Explorateur** (menu Pilotage) : un indicateur, une à huit marques, un découpage (semaine, mois, trimestre), 6, 12 ou 24 périodes jusqu'à une date, une comparaison (période précédente ou année précédente, pour une seule marque) et un graphique (courbe, barres, barres empilées entre marques). Résultat en graphique, en tableau (total entre marques, évolution) et en Excel. Indicateurs : ceux des tableaux de bord qui s'additionnent (réalisés commerciaux, mesures des relevés en flux ou en stock, sessions par canal) ; les valeurs non additives (portée, utilisateurs uniques) n'y figurent pas. Montants dans la devise de la marque, en XOF dès deux marques. Une marque où l'indicateur n'est pas suivi ou pas ouvert est écartée et signalée.
- **Tableaux personnalisés** : migration `tableaux_personnalises`, table `custom_dashboards`. Un tableau appartient à une marque, ou à la Direction (toutes marques). Il ne contient que des réglages : au plus douze graphiques, validés par l'application et contrôlés par la base (une liste d'objets, taille bornée). Chaque graphique est recalculé à l'ouverture, sous les droits du lecteur. Lecture : `brand.read` (Direction : `direction.read`) ; création et modification : `reports.manage` (Direction : `direction.read`). Un tableau personnel n'est visible et modifiable que par son auteur, et personne d'autre ne peut rendre personnel le tableau d'un autre. Un tableau de marque ne reçoit que des graphiques de sa marque. Suppression confirmée ; journal d'audit. Tests `supabase/tests/rls_sprint14.sql`.
- Règles testées : `settings.test.ts` (catalogue, adresse ↔ réglages, comparaison et empilement, périodes, format des graphiques enregistrés) et `dashboards.test.ts` (droits, graphiques acceptés, ordre).

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
