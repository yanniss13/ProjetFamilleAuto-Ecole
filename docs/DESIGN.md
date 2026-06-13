# MoniteurConnect — Design / Spécification

> Document de référence issu du cadrage. **À lire en premier** pour reprendre le projet.
> Date : 2026-06-13. Statut : squelette généré, implémentation des fonctionnalités à faire.

## 1. Vision

Plateforme web reliant les **auto-écoles** et les **moniteurs (enseignants de la
conduite) indépendants**. Les auto-écoles publient des **annonces** décrivant leur
besoin (poste, lieu, volume horaire, rémunération). Les moniteurs indépendants
parcourent les annonces et **postulent directement depuis le site**, sans créer de
compte.

C'est un **job board spécialisé**, pas une place de marché à deux faces : un seul
type de compte (l'auto-école), le moniteur reste un visiteur qui candidate.

## 2. Acteurs

| Acteur | Compte ? | Ce qu'il fait |
|---|---|---|
| **Auto-école** | Oui (email + mot de passe, **email vérifié**) | Publie / gère ses annonces, consulte les candidatures reçues |
| **Moniteur indépendant** | Non | Parcourt les annonces publiques, filtre par département, **postule** (formulaire + CV PDF) |
| **Visiteur** | Non | Parcourt les annonces publiques |

## 3. Décisions de cadrage (verrouillées)

- **Type de projet** : vrai produit destiné à être lancé (MVP v1 focalisé, puis itérations).
- **Auth auto-écoles** : email + mot de passe **avec vérification d'email** + réinitialisation de mot de passe. Le SIRET est une info d'entreprise (collectée à l'inscription).
- **Annonces** : publiées par les auto-écoles connectées ; localisées (**ville + département**).
- **Moniteurs** : **aucun compte**. Ils postulent via un formulaire sur l'annonce.
- **Candidature** : nom, email, téléphone, message + **CV PDF (upload)**. Elle est **stockée** (visible dans le tableau de bord de l'école) **ET** envoyée par **notification email** à l'école.
- **Recherche** : page publique avec **filtre par département** + recherche texte (mot-clé).
- **Base de données** : **SQLite en dev**, **PostgreSQL en prod** (changement de `provider`/`DATABASE_URL` Prisma, sans réécriture).

## 4. Modèle de données

Voir `prisma/schema.prisma`. Trois entités :

- **School** — compte auto-école : `email` (unique), `passwordHash`, `businessName`,
  `siret` (unique), `phone?`, champs de vérification email + reset (jetons **hachés**),
  `emailVerified`.
- **Listing** — annonce : `title`, `description`, `contractType?`, `city`,
  `department`, `hoursPerWeek?`, `compensation?`, `status` (open/closed), `schoolId`.
  Index sur `department` et `status`.
- **Application** — candidature : `applicantName`, `applicantEmail`, `applicantPhone?`,
  `message`, `cvPath?`, `listingId`. Index sur `listingId`.

Relations : School 1—N Listing 1—N Application. `onDelete: Cascade` partout
(supprimer une école supprime ses annonces et leurs candidatures).

## 5. Pages & routes

### Public (sans compte)
- `GET /` — accueil (présentation + accès aux annonces).
- `GET /annonces` — liste des annonces ouvertes, **filtre `?departement=` + recherche `?q=`**.
- `GET /annonces/:id` — détail d'une annonce + **formulaire de candidature**.
- `POST /annonces/:id/postuler` — dépôt d'une candidature (multipart : champs + CV PDF). Rate-limité.

### Auth auto-école
- `GET/POST /inscription` — création de compte (envoi email de vérification).
- `GET /verifier-email/:token` — validation de l'adresse.
- `GET/POST /connexion`, `POST /deconnexion`.
- `GET/POST /mot-de-passe-oublie`, `GET/POST /reinitialiser/:token`.

### Espace auto-école (protégé : connecté + email vérifié)
- `GET /tableau-de-bord` — résumé (nb annonces, nb candidatures).
- `GET /mes-annonces` — liste des annonces de l'école.
- `GET/POST /mes-annonces/nouvelle`, `GET/POST /mes-annonces/:id/modifier`,
  `POST /mes-annonces/:id/supprimer`, `POST /mes-annonces/:id/cloturer`.
- `GET /mes-annonces/:id/candidatures` — candidatures reçues (+ téléchargement du CV).

## 6. Flux clés

1. **Inscription** → email de vérification (lien avec jeton haché, expirant) → `emailVerified=true`.
2. **Publier une annonce** (école connectée + vérifiée) → annonce visible publiquement.
3. **Parcourir** → filtre par département + recherche texte → page détail.
4. **Postuler** (moniteur, sans compte) → upload CV (PDF, taille limitée) → candidature
   stockée + email de notification à l'école.
5. **Gérer** → l'école consulte les candidatures, télécharge les CV, clôture l'annonce.

## 7. Sécurité (réutilise les patterns éprouvés d'AutoSchool Manager / MonoblocLivre)

- Mots de passe **bcrypt** (min 8, max 72 octets).
- **CSRF** par jeton de session (synchronizer token) sur tout POST.
- **Helmet** (en-têtes HTTP), **auto-échappement Twig** (anti-XSS), aucune vue `|raw`.
- Cookie de session `httpOnly` + `sameSite=lax` + `secure` en prod ; **régénération de session** à la connexion.
- **Rate-limiting** : connexion, inscription, mot de passe oublié, et **dépôt de candidature** (anti-spam).
- **Upload CV** : multer, **PDF uniquement**, taille max (~5 Mo), nom de fichier régénéré (jamais le nom client), extension dérivée du mimetype.
- Jetons email/reset **hachés** (SHA-256) en base, à usage unique et expirants.
- **Fail-fast** au démarrage si `SESSION_SECRET` absent.
- IDs d'URL validés → 404 propre ; annonces filtrées par `schoolId` de session côté gestion (isolation).

## 8. Stack technique

Node.js (≥ 18) · Express 5 · Twig (SSR) · Prisma 6 · SQLite (dev) / PostgreSQL (prod) ·
bcrypt · express-session · helmet · express-rate-limit · multer (CV) · nodemailer (emails) ·
CSS custom (sans framework).

## 9. Périmètre

### MVP v1 (à implémenter)
Inscription/vérif/connexion/reset · CRUD annonces (école) · liste publique + filtre
département + recherche · page détail · candidature (form + CV) stockée + email ·
consultation des candidatures + téléchargement CV · clôture d'annonce.

### V2 / plus tard (hors v1)
Modération des annonces/candidatures · comptes moniteurs + profils · alertes email
(nouvelles annonces par département) · pagination/tri avancés · géocodage/carte ·
RGPD avancé (purge auto des candidatures, consentement) · tableau de bord analytics ·
signalement d'abus.

## 10. État du squelette

**Fait** : structure du projet, `package.json`, `.env.example`, schéma Prisma,
câblage Express + middlewares de sécurité (CSRF, flash, requireAuth, session),
mailer (avec fallback console en dev), utilitaires (password, http, tokens),
layout + CSS de base, pages d'accueil/erreur, et **stubs** des contrôleurs / services /
validateurs / routes / vues (avec `TODO`).

**À faire (nouvelle conversation)** : implémenter la logique des stubs en suivant ce
document, créer la 1re migration Prisma, écrire le smoke test, peaufiner les vues.

### Pour démarrer
```bash
npm install
copy .env.example .env   # puis renseigner SESSION_SECRET
npm run prisma:migrate   # crée la base + le client Prisma
npm run dev
```
