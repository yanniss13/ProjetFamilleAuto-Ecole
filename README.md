# MoniteurConnect

Plateforme d'annonces reliant les **auto-écoles** et les **moniteurs
indépendants**. Les auto-écoles publient leurs besoins et gèrent les
candidatures jusqu'au **contrat signé électroniquement** ; les moniteurs
consultent les annonces (recherche, carte, rayon), **postulent sans créer de
compte** avec leurs pièces justificatives, suivent leur dossier par un lien
privé et contresignent leur contrat en ligne.

Le MVP et **douze lots itératifs** sont livrés (A–C et E–M ; le lot D est resté
réservé) : notifications et suivi candidat, administration/modération, carte
des annonces, vérification SIRET, signature électronique, tableaux de bord
statistiques, alertes email en double opt-in, purge RGPD automatique, jeu de
démonstration, autocomplétion d'adresse et suivi des candidatures en temps réel.

## Fonctionnalités livrées

- Recherche d'annonces par mots-clés, département, ville + rayon, et vue carte ;
- candidature publique avec 4 pièces (CV, identité, permis, autorisation
  d'enseigner), stockées en privé et vérifiées (types, magic bytes) ;
- suivi de candidature sans compte, par jeton opaque reçu par email ;
- actualisation en direct des candidatures et des contrats, côté école comme
  côté candidat (Server-Sent Events), avec un parcours complet sans JavaScript ;
- acceptation avec génération de contrat PDF, signature au pad par l'école,
  contreseing du candidat, empreintes SHA-256 et horodatages ;
- inscription auto-école avec email vérifié et SIRET contrôlé (répertoire
  Sirene), autocomplétion d'adresse (API Adresse) ;
- tableaux de bord statistiques (école et plateforme) ;
- alertes email moniteurs en double opt-in, désabonnement réel ;
- espace d'administration : modération, suspension, purge RGPD journalisée.

## Stack

Node.js ≥ 22.18 · Express 5 · Twig (rendu serveur) · Prisma 7 avec SQLite
(adaptateur better-sqlite3 ; PostgreSQL possible via `@prisma/adapter-pg`, non
configuré) · sessions persistées en base · bcrypt · helmet (CSP stricte) ·
express-rate-limit · multer · nodemailer · PDFKit · Server-Sent Events ·
Leaflet auto-hébergé.

## Démarrage

```bash
npm install                  # génère aussi le client Prisma (postinstall)

# Configuration
copy .env.example .env       # Windows  (cp .env.example .env sous macOS/Linux)
#   -> renseigner au minimum SESSION_SECRET

# Base de données (applique les migrations)
npx prisma migrate deploy

# Lancement
npm run dev                  # rechargement auto
# ou : npm start
```

Application sur http://localhost:3000

## Scripts

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur en mode développement (watch) |
| `npm start` | Serveur en mode standard |
| `npm test` | Suite complète : 17 fichiers de tests, sans framework |
| `npm run seed:demo` | Jeu de démonstration relançable (comptes affichés en fin de script) |
| `npm run demo:start` | Démo publique : migrations, seed puis serveur (voir ci-dessous) |
| `npm run admin:create -- <email> <mdp>` | Crée ou met à jour un administrateur |
| `npm run purge` | Purge RGPD à la demande (sinon automatique, toutes les 24 h) |
| `npm run prisma:studio` | Explorateur de base |

## Variables d'environnement

Voir [`.env.example`](.env.example). `SESSION_SECRET` est **obligatoire**
(fail-fast au démarrage si absent). Sans `SMTP_HOST`, les emails ne partent
pas : les liens sont affichés en console (mode dev). Avec Mailpit en local :
`SMTP_HOST=localhost`, `SMTP_PORT=1025` (sans `SMTP_USER`, aucun bloc
d'authentification n'est envoyé).

## Démo publique (Render)

[`render.yaml`](render.yaml) décrit une instance de démonstration gratuite :
Render > **New > Blueprint** > ce dépôt. Avec `DEMO_MODE=true`, un bandeau
signale les données fictives et les pages de connexion affichent les accès de
démonstration. L'offre gratuite n'a pas de disque persistant : la base SQLite
et les fichiers sont recréés par le seed à chaque démarrage, et aucun email
n'est envoyé.

## Documentation

- [`docs/README.md`](docs/README.md) — index de la documentation ;
- conception initiale de juin 2026 :
  [`docs/historique/2026-06/`](docs/historique/2026-06/README.md) (préservée
  comme v1).

## Avertissement

Les contrats générés sont des **modèles indicatifs** : ils doivent être
validés juridiquement avant tout usage réel.
