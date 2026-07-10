# Base de données — modèle v2

Date : 2026-07-10. Source de vérité : [`prisma/schema.prisma`](../../prisma/schema.prisma)
(commenté) et les 13 migrations de [`prisma/migrations/`](../../prisma/migrations/).
Le MCD/MLD initial (4 entités, juin 2026) est conservé sous
[`../historique/2026-06/diagrammes/`](../historique/2026-06/diagrammes/).

![Modèle de données v2 — 8 modèles Prisma](diagrammes/bdd-v2.png)

Source vectorielle : [`diagrammes/bdd-v2.svg`](diagrammes/bdd-v2.svg).

## Lecture du diagramme

La rangée du haut est le cœur relationnel : une **School** publie 0-n
**Listing**, un Listing reçoit 0-n **Application**, une Application génère au
plus un **Contract** (relation 1-1 garantie par `applicationId @unique`).
Toutes ces relations sont en suppression **en cascade** : supprimer une
annonce emporte ses candidatures et leurs contrats — le code supprime d'abord
les fichiers privés associés (voir `test/smoke.cjs`, assertions A1).

La rangée du bas regroupe les entités **autonomes** (aucune clé étrangère) :

- **Session** : sessions express persistées en base (survivent aux
  redémarrages, identiques en SQLite et PostgreSQL) ;
- **Admin** : comptes de modération, créés par script CLI uniquement ;
- **Alert** : alertes email publiques en double opt-in, dédupliquées par la
  contrainte composée `@@unique(email, department, keywordLower)` ;
- **PurgeRun** : journal des purges RGPD, trace de conformité affichée sur le
  dashboard admin.

## Évolution : de 4 à 8 entités

| Entité / colonnes | Origine | Rôle |
|---|---|---|
| `School`, `Listing`, `Application`, `Contract` | MCD v1 (juin) | Cœur métier, inchangé dans sa structure |
| `School.address/latitude/longitude` | MVP carte | Localisation géocodée (Nominatim) |
| `Listing.*Lower` | Lot A | Recherche insensible à la casse, portable SQLite/PostgreSQL |
| `Application.trackingToken` | Lot B | Suivi candidat sans compte, jeton opaque unique |
| `School.suspended` + `Admin` | Lot C | Modération et suspension |
| `Session` | Revue de code | Sessions en base au lieu de la mémoire |
| `School.siretStatus/siretVerifiedName/siretCheckedAt` | Lot F | Vérification Sirene, jamais bloquante |
| 7 colonnes de signature sur `Contract` | Lot G | Signatures, horodatages, empreintes SHA-256 |
| `Listing.viewsCount` | Lot H | Compteur de vues, incrément fire-and-forget |
| `Alert` | Lot I | Alertes email double opt-in |
| `Application.rejectedAt` + `PurgeRun` | Lot J | Point de départ et journal de la purge RGPD |

## Trois contraintes d'intégrité à citer au jury

1. **`School.siret @unique`** : deux écoles ne peuvent pas partager un SIRET ;
   la collision en course retombe sur l'erreur Prisma `P2002`, transformée en
   message utilisateur (testé dans `test/correctifs.cjs`).
2. **`Contract.applicationId @unique`** : le 1-1 est garanti par la base, pas
   seulement par le code — impossible de générer deux contrats pour une même
   candidature (testé dans `test/lot-g.cjs`).
3. **Cascades `onDelete`** : School → Listing → Application → Contract ;
   l'intégrité référentielle ne laisse jamais d'orphelins, et le code nettoie
   les fichiers privés avant la suppression (testé dans `test/smoke.cjs`).

## SQLite en développement, PostgreSQL en production

Le provider est déclaré dans le datasource Prisma ; la bascule se fait en
changeant `provider = "sqlite"` en `"postgresql"` et la `DATABASE_URL` —
**aucun changement de code**. Les choix qui rendent cette bascule sûre :

- recherche insensible à la casse par colonnes `*Lower` maintenues à
  l'écriture (le `LOWER()` SQL se comporte différemment selon les moteurs) ;
- bucketing des séries hebdomadaires en JavaScript plutôt qu'en SQL dépendant
  du dialecte (lot H) ;
- sessions et jetons stockés en colonnes portables (chaînes, dates).

Commandes : `npx prisma validate` (schéma), `npx prisma migrate deploy`
(application des migrations), `npm run seed:demo` (jeu de démonstration).
La procédure complète de sauvegarde/restauration fait partie du prochain
chantier documentaire (voir la feuille de route de
l'[audit](audit-certification-dwwm.md)).
