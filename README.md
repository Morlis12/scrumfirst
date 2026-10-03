# ScrumFirst — Suivi Scrum (Next.js + Prisma + PostgreSQL)

Application de suivi Scrum : Product Backlog, Sprint Planning, Suivi du Sprint
(Kanban + validation DoD), Definition of Done, chronos d'événements, obstacles,
actions de rétrospective et notes de Daily Scrum.

## Démarrage

```bash
npm install
npm run dev        # http://localhost:3000
```

Comptes de démonstration (créés par le seed) :

| Email                | Mot de passe | Rôle équipe    |
|----------------------|--------------|----------------|
| admin@scrumfirst.local | change-me-seed-admin | PRODUCT_OWNER (+ ADMIN global) |
| sm@scrumfirst.local    | change-me-seed-sm    | SCRUM_MASTER   |
| dev@scrumfirst.local   | change-me-seed-dev   | DEVELOPER      |
| sh@scrumfirst.local    | change-me-seed-sh    | STAKEHOLDER (lecture seule) |

## Base de données (workflow `db push`, sans migrations)

Le schéma de référence est `prisma/schema.prisma`. Il n'y a pas de dossier
`prisma/migrations` : la base est synchronisée par push.

```bash
# 1. Appliquer le schéma sur la base (colonnes/tables manquantes créées)
npx prisma db push --schema prisma/schema.prisma

# 2. Régénérer le client Prisma (inclus automatiquement à la fin du db push,
#    à relancer à la main si besoin)
npx prisma generate --schema prisma/schema.prisma

# 3. (Optionnel) Rejouer les données de démo
node prisma/seed.ts

# 4. Redémarrer le serveur dev (obligatoire : le client Prisma est mis en
#    cache en mémoire, un simple hot-reload ne suffit pas après un generate)
npm run dev
```

> En production (Docker), l'entrée du conteneur exécute déjà
> `prisma db push` + `seed` au démarrage — voir `docker-compose.yml`.

Évolutions du schéma appliquées par `db push` (champs à valeur par défaut,
aucune perte de données) :

| Champ | Modèle | Usage |
|---|---|---|
| `DailyNote` + relations `dailyNotes` | `User`, `BacklogItem`, `Sprint` | Notes du Daily Scrum persistées (ticket optionnel + colonne capturée à la saisie) |
| `DailyNote.title` (ex. « 📅 Daily du 03/10/2026 ») | `DailyNote` | Tag auto généré à la création (date système), conservé lors des corrections |
| `DailyNote.nature` (défaut `AVANCEMENT`) | `DailyNote` | Nature du point : `AVANCEMENT` 🔵 · `OBSTACLE` ⚠️ · `ANNONCE` 📢 |
| `ScrumEvent.completed` (défaut `false`) | `ScrumEvent` | Étape marquée « faite » par le SM (barre remplie à 100 % d'un coup) |
| `BacklogItem.boardColumn` (défaut `"TODO"`) | `BacklogItem` | Colonne Kanban persistée (TODO → IN_PROGRESS → REVIEW) |

## Fonctionnalités par page

- `/backlog` — Product Backlog (PO) : création, affinage, Ready + estimation.
- `/products`, `/dod` — Produits et Definition of Done unique par produit.
- `/planning` — Sprint Planning : création/démarrage/clôture de Sprint (séquence
  stricte : un seul Sprint ouvert à la fois), tirage des items READY,
  **Événements & chronos (Scrum Master)** : Démarrer/Stopper/Relancer, curseur
  déplaçable manuellement (`adjustEventTime`) et bouton « Terminer ✓ »
  (`completeEvent`, barre remplie d'un coup).
- `/sprint` — Suivi du Sprint : Kanban TODO → IN_PROGRESS → REVIEW → DONE avec
  **règle de transition affichée sous chaque colonne**, déplacement persistant
  par **flèches ← →** ou **drag-and-drop** (`moveBoardColumn`, Developers
  uniquement), modale de validation DoD au clic (promotion en Incrément
  **strictement bloquée tant que la DoD n'est pas à 100 %**), et **historique
  des notes du Daily par étape** en modale (clic sur « X note(s) du Daily sur
  cette étape », notes rattachées à l'étape sans ticket obligatoire) : titre auto « 📅 Daily du JJ/MM/AAAA », nature du point
  (Avancement / Obstacle / Annonce), **correction d'une note** (« ✏️ Modifier »
  → « Mettre à jour la note », titre/date/nature conservés) et bouton
  **« ➡️ Passer à l'étape suivante »** (`advanceStage` : avance TODO/IN_PROGRESS
  en masse, promeut en REVIEW les seuls tickets à DoD 100 %).

## Règles métier

- Source de vérité : gardes serveur `src/lib/scrum-guards.ts` (adossées DB) +
  règles pures `src/lib/scrum-rules.ts` ; auto-test sur `/api/scrum-guards`.
- Time-box : clôture automatique des Sprints expirés (`autoCloseExpiredSprints`).
- Permissions : tableau Developers · cochage DoD Scrum Team · chronos et notes
  Daily Developers + Scrum Master (+ Admin) · Stakeholder lecture seule.
- Les messages d'erreur affichés à l'écran sont en français, sans identifiant
  technique (les codes `*_NOT_FOUND` et noms de gardes restent internes).

## Vérifications

```bash
npx tsc --noEmit   # 0 erreur de type exigée
npm run build      # compilation de production
```
