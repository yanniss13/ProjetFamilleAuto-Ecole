# MoniteurConnect

Plateforme d'annonces reliant les **auto-écoles** et les **moniteurs indépendants**.
Les auto-écoles publient leurs besoins ; les moniteurs **postulent directement depuis
le site** (avec CV), sans créer de compte.

> 🛠️ **État : squelette.** L'architecture, la configuration, le modèle de données et le
> socle de sécurité sont en place. La logique des fonctionnalités reste à implémenter —
> voir **[`docs/DESIGN.md`](docs/DESIGN.md)** (spécification complète, à lire en premier).

## Stack

Node.js · Express 5 · Twig (rendu serveur) · Prisma 6 · SQLite (dev) / PostgreSQL (prod) ·
bcrypt · helmet · express-rate-limit · multer · nodemailer.

## Démarrage

```bash
npm install

# Configuration
copy .env.example .env       # Windows  (cp .env.example .env sous macOS/Linux)
#   -> renseigner au minimum SESSION_SECRET

# Base de données (crée prisma/dev.db + le client Prisma)
npm run prisma:migrate

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
| `npm run prisma:migrate` | Crée/applique une migration + génère le client |
| `npm run prisma:studio` | Explorateur de base |
| `npm test` | Smoke test de bout en bout (à écrire) |

## Variables d'environnement

Voir [`.env.example`](.env.example). `SESSION_SECRET` est **obligatoire** (fail-fast au
démarrage si absent). Sans `SMTP_HOST`, les emails ne sont pas envoyés : les liens de
vérification/réinitialisation sont affichés dans la console (mode dev).

## Structure

```
moniteur-connect/
├── docs/DESIGN.md          # Spécification de référence
├── prisma/schema.prisma    # Modèle School / Listing / Application
├── src/
│   ├── app.js              # Câblage Express (sécurité, vues, routes)
│   ├── server.js           # Point d'entrée (fail-fast env + arrêt propre)
│   ├── config/             # Client Prisma (singleton)
│   ├── middlewares/        # csrf, flash, requireAuth, redirectIfAuth, loadSchool, upload
│   ├── controllers/        # auth, listing (public + gestion), application, dashboard
│   ├── services/           # accès données + mailer + tokens
│   ├── validators/         # validation serveur
│   ├── routes/             # routeurs + agrégation
│   └── utils/              # password (bcrypt), http (parseId/notFound)
├── views/                  # templates Twig
├── public/                 # CSS + uploads (CV)
└── test/smoke.cjs          # test de bout en bout (à écrire)
```
