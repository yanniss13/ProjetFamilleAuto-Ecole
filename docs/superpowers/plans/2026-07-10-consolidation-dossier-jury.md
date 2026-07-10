# Consolidation du dossier jury - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Le dépôt impose un seul agent actif : ne pas utiliser de sous-agents.

**Goal:** Produire les cinq livrables jury du checkpoint (résumé, besoin v2, compétences DWWM, comparaison maquettes, BDD v2) plus le script de captures réutilisable.

**Architecture:** Un fichier Markdown par livrable sous `docs/jury/`, captures PNG sous `docs/jury/captures/`, diagramme SVG/PNG sous `docs/jury/diagrammes/`. Un script `scripts/captures-jury.js` pilote Edge headless en CDP (WebSocket natif Node 22) contre le serveur local nourri par `npm run seed:demo`. Spec : `docs/superpowers/specs/2026-07-10-consolidation-dossier-jury-design.md`.

**Tech Stack:** Markdown, SVG, Node.js 22 (WebSocket natif, aucune dépendance nouvelle), Edge headless, Prisma en lecture seule, PowerShell 5.1.

## Global Constraints

- Branche `jury-consolidation-dossier` ; commits préfixés `Jury: ...` ; tout en français, typographie française dans les documents.
- Aucun code métier modifié ; seul ajout hors docs : `scripts/captures-jury.js`.
- Ne jamais stager `contexte.md`, `Suivi_candidatures_stage_1_1_mails_plus_naturels_v3.xlsx`, `.claude/settings.local.json`.
- `npm test` (438 assertions) avant chaque commit.
- Les documents historiques sous `docs/historique/2026-06/` ne sont JAMAIS modifiés.
- Le script de captures n'écrit jamais en base (Prisma en lecture seule uniquement).
- Serveur de captures sur le port 4071 (hors plage de tests 4055-4070).
- Comptes seed : `ecole.vitrine@demo.moniteur-connect.example` / `demo1234` ; `admin@demo.moniteur-connect.example` / `admin1234`.
- Champs de connexion (école ET admin) : `#email`, `#password`, jeton CSRF porté par le formulaire (soumettre le VRAI formulaire via le DOM, jamais un POST fabriqué).

---

### Task 1: Script de captures et génération des 15 PNG

**Files:**
- Create: `scripts/captures-jury.js`
- Create: `docs/jury/captures/*.png` (15 fichiers, générés)

**Interfaces:**
- Produces: les captures nommées `accueil.png`, `annonces.png`, `annonce-detail.png`, `carte.png`, `inscription.png`, `connexion.png`, `alertes.png`, `suivi.png`, `dashboard.png`, `mes-annonces.png`, `annonce-form.png`, `candidatures.png`, `contrat.png`, `compte.png`, `admin.png` — consommées par la Task 6.

- [x] **Step 1:** Vérifier l'environnement : `node -v` (>= 22), présence d'Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, sinon `C:\Program Files\...`), et que `src/server.js` honore `process.env.PORT` (le lire ; si le port est codé en dur, utiliser la variable qu'il attend).

- [x] **Step 2:** `npm run seed:demo` puis démarrer le serveur en tâche de fond : `$env:PORT='4071'; node src/server.js` (le `.env` fournit `SESSION_SECRET` et `DATABASE_URL`). Vérifier `http://127.0.0.1:4071/annonces` répond 200.

- [x] **Step 3:** Écrire `scripts/captures-jury.js` sur le modèle ci-dessous (structure identique aux scripts existants : constantes en tête, runner `if (require.main === module)`). Points imposés :

```js
// scripts/captures-jury.js — captures d'écran pour le dossier jury.
// Lecture seule : interroge la base uniquement pour retrouver les IDs de démo,
// n'écrit jamais rien. Prérequis : npm run seed:demo + serveur sur PORT (4071).
// Usage : node scripts/captures-jury.js [--largeur=1440] [--sortie=docs/jury/captures]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:4071';
const DEMO_SUFFIX = '@demo.moniteur-connect.example';
const ECOLE = { email: `ecole.vitrine${DEMO_SUFFIX}`, password: 'demo1234' };
const ADMIN = { email: `admin${DEMO_SUFFIX}`, password: 'admin1234' };
const EDGES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
```

  - `donneesDemo()` : Prisma lecture seule — l'école vitrine par email ; `phare` = `listing.findFirst({ where: { schoolId, status: 'open' }, orderBy: { viewsCount: 'desc' } })` ; `pending` = première candidature `pending` de cette annonce ; `signee` = `application.findFirst({ where: { listing: { schoolId }, contract: { isNot: null } } })` pour le `trackingToken`. `$disconnect()` dans un `finally`.
  - Lancement d'Edge : `spawn(edge, ['--headless=new', '--remote-debugging-port=9223', `--window-size=${largeur},1000`, `--user-data-dir=${dossierTemporaire}`, '--no-first-run', 'about:blank'])` ; boucle d'attente sur `fetch('http://127.0.0.1:9223/json')` jusqu'à obtenir la cible `type: 'page'` et son `webSocketDebuggerUrl`.
  - Classe `Cdp` : WebSocket natif (`new WebSocket(url)`), compteur d'`id`, `cmd(method, params)` renvoie une promesse résolue sur la réponse au même `id`, `attendChargement()` renvoie une promesse résolue au prochain événement `Page.loadEventFired`. `Page.enable` + `Runtime.enable` à la connexion.
  - `navigue(url)` : `Page.navigate` + `attendChargement()` + pause de 1500 ms (Leaflet, graphiques SVG).
  - `connecte(urlLogin, compte)` : `navigue(urlLogin)` puis `Runtime.evaluate` avec l'expression : remplir `#email` et `#password`, `document.querySelector('form').submit()` (le champ CSRF caché part avec le formulaire) ; puis `attendChargement()`.
  - `capture(nom)` : `Page.captureScreenshot({ format: 'png', captureBeyondViewport: true })`, décoder le base64, écrire `<sortie>/<nom>.png`.
  - Liste `PAGES` déclarée en tête (nom, URL, session `null`/`'ecole'`/`'admin'`) dans cet ordre : publiques (`accueil` `/`, `annonces` `/annonces`, `annonce-detail` `/annonces/<phareId>`, `carte` `/annonces?vue=carte`, `inscription` `/inscription`, `connexion` `/connexion`, `alertes` `/alertes`, `suivi` `/suivi/<token>`), puis connexion école et pages école (`dashboard` `/tableau-de-bord`, `mes-annonces` `/mes-annonces`, `annonce-form` `/mes-annonces/nouvelle`, `candidatures` `/mes-annonces/<phareId>/candidatures`, `contrat` `/mes-annonces/<phareId>/candidatures/<pendingId>/accepter`, `compte` `/mon-compte`), puis connexion admin (qui régénère la session — cloisonnement voulu) et `admin` `/admin`.
  - Fail-soft : chaque page dans un `try/catch`, échec signalé sur `stderr`, le script continue ; à la fin, tuer Edge, lister les fichiers produits, `process.exitCode = 1` si au moins une capture attendue manque.

- [x] **Step 4:** Exécuter `node scripts/captures-jury.js` puis vérifier :

```powershell
Get-ChildItem docs/jury/captures/*.png | ForEach-Object { "$($_.Name) $([math]::Round($_.Length/1kb)) Ko" }
```

Attendu : 15 fichiers, chacun > 10 Ko. Ouvrir 2 ou 3 captures (`accueil.png`, `dashboard.png`, `contrat.png`) avec l'outil Read pour contrôle visuel : page complète, données de démo visibles, pad de signature visible en bas de `contrat.png`.

- [x] **Step 5:** Arrêter le serveur de fond. `npm test` (438 assertions attendues). Commit :

```powershell
git add scripts/captures-jury.js docs/jury/captures
git commit -m "Jury: script de captures Edge headless + 15 captures 1440 px"
```

### Task 2: `docs/jury/resume-projet.md`

**Files:**
- Create: `docs/jury/resume-projet.md`

- [x] **Step 1:** Rédiger le résumé d'une page (environ 60 lignes Markdown), au présent, sections : **Le problème** (recrutement de moniteurs diplômés difficile pour les auto-écoles, canaux généralistes inadaptés) ; **Les acteurs** (auto-école = seul compte self-service, moniteur indépendant = sans compte, administrateur = modération) ; **La solution** (job board métier : publication, candidature avec 4 pièces justificatives, suivi par jeton, acceptation → contrat PDF signé électroniquement) ; **La valeur** (friction minimale côté moniteur, dossier complet côté école, conformité RGPD) ; **Le périmètre livré** (MVP + une ligne par lot A→L, reprendre les intitulés de `AGENTS.md`) ; **La stack** (une ligne : Node.js/Express 5, Twig SSR, Prisma, SQLite dev → PostgreSQL prod, 15 fichiers de tests / 438 assertions). Sources de vérité : `AGENTS.md`, `contexte.md` interdit de commit mais lisible, `package.json`.

- [x] **Step 2:** Vérifier les liens relatifs du document (chaque cible existe). `npm test`. Commit : `git add docs/jury/resume-projet.md` ; message `Jury: resume du projet (une page, etat reel A-L)`.

### Task 3: `docs/jury/expression-du-besoin-v2.md`

**Files:**
- Create: `docs/jury/expression-du-besoin-v2.md`

- [x] **Step 1:** Rédiger la v2 du cahier des charges, sections : **Chronologie** (v1 du 22/06 conservée sous [`../historique/2026-06/CAHIER-DES-CHARGES.md`](../historique/2026-06/CAHIER-DES-CHARGES.md), itérations lots A–L, présente v2 datée 2026-07-10) ; **Le besoin** et **Objectifs** (repris de la v1, reformulés au présent) ; **Acteurs et cas d'usage** (3 acteurs, leurs parcours réels — utiliser les routes actuelles comme référence) ; **Contraintes** (sécurité : CSRF, bcrypt, CSP, magic bytes, rate limiting ; RGPD : minimisation, purge automatique 7 j/180 j, double opt-in ; accessibilité : lien d'évitement, focus visible, aria-live ; zéro service payant : Nominatim, API Adresse, API Recherche d'entreprises) ; **Critères d'acceptation** (mesurables, chacun adossé à un fichier de test existant, tableau critère → test) ; **Hors-périmètre assumé** (comptes moniteurs, paiement, messagerie interne, application mobile native) ; **Écarts corrigés depuis la v1** (« mots de passe chiffrés » → « hachés (bcrypt) », déploiement traité dans un chantier ultérieur, admin/purge annoncés futurs désormais livrés).

- [x] **Step 2:** Vérifier les liens relatifs. `npm test`. Commit : `Jury: expression du besoin v2 (chronologie v1 -> lots -> v2)`.

### Task 4: `docs/jury/competences-dwwm.md`

**Files:**
- Create: `docs/jury/competences-dwwm.md`

- [x] **Step 1:** Rédiger la matrice. En-tête : titre professionnel DWWM niveau 5, REAC RNCP37674, libellés vérifiés le 2026-07-10 sur https://www.francecompetences.fr/recherche/rncp/37674/. Une section par bloc (libellés verbatim de la spec, section « Livrables » point 3), puis un tableau par compétence : **réalisation dans MoniteurConnect** / **preuves** (2 à 4 : fichier source, fichier de test, document, moment de démo). Mapping imposé :
  1. Environnement de travail → `.env.example`, fail-fast `SESSION_SECRET` (`src/server.js`), scripts npm, `AGENTS.md` (méthode), migrations Prisma ;
  2. Maquetter → wireframes v1 (`docs/historique/2026-06/wireframes/`), comparaison maquettes (`comparaison-maquettes.md`) ;
  3. Interfaces statiques → vues Twig, `public/css/style.css`, layout, accessibilité (lien d'évitement, `:focus-visible`) ;
  4. Partie dynamique → `public/js/` (carte Leaflet, pad de signature, graphiques SVG DOM, autocomplétion débouncée), CSP stricte sans inline ;
  5. BDD relationnelle → `prisma/schema.prisma` (8 modèles), 13+ migrations, contraintes d'intégrité, `base-de-donnees.md` ;
  6. Composants d'accès aux données → `src/services/*.js` (Prisma), pagination, scoping `schoolId` ; **honnêteté NoSQL** : aucun NoSQL en production — dire pourquoi (données fortement relationnelles) et citer le cache mémoire clé-valeur (`src/services/adresse.js`, `siret.js`) comme structure non relationnelle assumée, sans le survendre ;
  7. Composants métier serveur → services contrats/signature (SHA-256, horodatages), purge RGPD, alertes double opt-in, statistiques ;
  8. Documenter le déploiement → **partiellement couvert** : `.env.example`, bascule SQLite→PostgreSQL documentée dans le schéma, `README.md` ; consolidation prévue dans un chantier ultérieur (le dire).

- [x] **Step 2:** Relire : chaque preuve citée existe (vérifier chaque chemin de fichier mentionné). `npm test`. Commit : `Jury: matrice des competences REAC RNCP37674 (critere manquant solde)`.

### Task 5: `docs/jury/base-de-donnees.md` + `docs/jury/diagrammes/bdd-v2.{svg,png}`

**Files:**
- Create: `docs/jury/diagrammes/bdd-v2.svg`
- Create: `docs/jury/diagrammes/bdd-v2.png` (généré)
- Create: `docs/jury/base-de-donnees.md`

- [x] **Step 1:** Créer `bdd-v2.svg` en réutilisant les classes CSS et la grammaire visuelle de `docs/historique/2026-06/spec-assets/mcd.svg` (`.ent-box`, `.ent-head`, `.ent-name`, `.attr`, `.attr.id`, `.patte`, `.card` ; ajouter `.attr.fk` en italique et une classe `.note`). Deux rangées :
  - Rangée 1 (le cœur relationnel) : `School`, `Listing`, `Application`, `Contract` avec les noms de colonnes RÉELS de `prisma/schema.prisma` (School : + `suspended`, `siretStatus`, `siretVerifiedName`, `siretCheckedAt` ; Listing : + `viewsCount`, `titleLower`, `descriptionLower`, `cityLower` ; Application : + `licensePath`, `teachingCardPath`, `rejectedAt`, `trackingToken` ; Contract : + les 7 colonnes de signature). Relations en pattes avec cardinalités : School 1—N Listing (cascade), Listing 1—N Application (cascade), Application 1—1 Contract (cascade, `applicationId @unique`).
  - Rangée 2 (les entités autonomes, apparues aux lots B/C/I/J) : `Session`, `Admin`, `Alert` (avec `@@unique([email, department, keywordLower])`), `PurgeRun` — sans patte, avec une courte note expliquant leur indépendance.
  - Titre dans le SVG : « MoniteurConnect — modèle de données v2 (2026-07-10, 8 modèles Prisma) ».
- [x] **Step 2:** Vérifier que le SVG est bien formé : `[xml](Get-Content docs/jury/diagrammes/bdd-v2.svg -Raw)` en PowerShell (échoue si XML invalide). Le lire avec l'outil Read pour contrôle visuel.
- [x] **Step 3:** Exporter le PNG : `& $edge --headless=new --screenshot="$PWD\docs\jury\diagrammes\bdd-v2.png" --window-size=1900,1000 --default-background-color=FFFFFFFF "file:///$PWD/docs/jury/diagrammes/bdd-v2.svg"`. Vérifier taille > 30 Ko et contrôle visuel (Read).
- [x] **Step 4:** Rédiger `base-de-donnees.md` : lecture guidée du diagramme (image PNG intégrée, lien vers le SVG source) ; tableau « évolution 4 → 8 » (entité → lot d'origine → rôle) ; trois contraintes d'intégrité à citer au jury (SIRET `@unique`, `applicationId @unique` sur Contract = 1-1, cascades `onDelete`) ; renvoi vers le MCD/MLD v1 (`../historique/2026-06/diagrammes/`) et vers `prisma/schema.prisma` + `prisma/migrations/` comme source de vérité ; noter la bascule SQLite→PostgreSQL (provider + `DATABASE_URL`, aucun changement de code).
- [x] **Step 5:** Vérifier les liens relatifs. `npm test`. Commit : `Jury: diagramme BDD v2 (8 modeles) + lecture guidee`.

### Task 6: `docs/jury/comparaison-maquettes.md`

**Files:**
- Create: `docs/jury/comparaison-maquettes.md`

**Interfaces:**
- Consumes: les 15 captures de la Task 1 (`captures/<nom>.png`).

- [x] **Step 1:** Rédiger le document, trois sections :
  1. **Écrans maquettés en v1** — tableau de 11 lignes (une par wireframe : accueil, annonces, annonce-detail, annonce-form, candidatures, compte, connexion, contrat, dashboard, inscription, mes-annonces) avec colonnes : maquette v1 (lien `../historique/2026-06/spec-assets/wf-<nom>.png`) / application finale (lien `captures/<nom>.png`) / écarts et justification. Écarts factuels à couvrir : badge « École vérifiée » (lot F), recherche par rayon et lien carte (lot E), compteur de vues et statistiques sur le dashboard (lot H), pad de signature sur le formulaire contrat (lot G), autocomplétion d'adresse sur inscription/compte (lot L), lien Alertes dans la navigation (lot I).
  2. **Écrans nés après les maquettes** — carte (`captures/carte.png`, lot E), suivi candidat (`captures/suivi.png`, lots B et G — état « contrat signé »), administration (`captures/admin.png`, lots C, H, J), alertes (`captures/alertes.png`, lot I). Préciser : le pad de signature est visible dans `captures/contrat.png` et la page de contreseing candidat sera montrée en démo live (aucun contrat « envoyé non contresigné » dans le seed, et le script de captures n'écrit pas en base).
  3. **Prévu en v1 mais non réalisé sous cette forme** — reprendre le tableau « Fonctions historiques non présentes » de [`inventaire-documents-historiques.md`](inventaire-documents-historiques.md) en une ligne par écart avec sa justification produit (ex. : pas de candidature depuis une session école = anti-usurpation).
  Conclusion courte : la chronologie v1 → itérations → v2 comme argument de méthode.
- [x] **Step 2:** Vérifier chaque lien (11 `wf-*.png` historiques + 15 captures + liens internes). `npm test`. Commit : `Jury: comparaison maquettes v1 / application finale`.

### Task 7: Cohérence, contrôle final et checkpoint

**Files:**
- Modify: `docs/jury/README.md`
- Modify: `docs/jury/audit-certification-dwwm.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-07-10-consolidation-dossier-jury.md` (cocher)

- [x] **Step 1:** `docs/jury/README.md` : ajouter les 5 livrables à « Documents de référence » ; mettre à jour « État au 2026-07-10 » ; remplacer « Prochaine action recommandée » (le chantier 1 est fait ; restent « conformité visible » puis « script de soutenance ») ; réécrire « Dernier checkpoint » (action terminée, fichiers, vérifications avec résultats, premier travail restant sans ambiguïté).
- [x] **Step 2:** `docs/jury/audit-certification-dwwm.md` : passer à VALIDÉ (constat mis à jour, mention des nouveaux documents) les critères « Résumé du projet », « Cahier des charges / expression du besoin », « Liste des compétences » (MANQUANT → VALIDÉ), « Diagramme de base de données », « Cohérence entre maquette initiale et application finale » ; actualiser la synthèse (19 validés / 12 à renforcer / 2 manquants — recompter réellement) ; cocher les cases P0/P1 correspondantes de la feuille de route.
- [x] **Step 3:** `AGENTS.md` : mettre à jour le paragraphe « Prochain travail » (consolidation livrée, prochains chantiers : conformité visible, puis script de soutenance ; mentionner `scripts/captures-jury.js --largeur=` pour le responsive).
- [x] **Step 4:** Contrôle global des liens Markdown relatifs sur tous les `.md` créés/modifiés (script PowerShell : extraire `\[.*?\]\((?!http)([^)#]+)\)`, tester `Test-Path` depuis le dossier du fichier). Attendu : zéro lien cassé. `git status --short` : aucun fichier personnel.
- [x] **Step 5:** `npm test` (438 assertions) + `npx prisma validate`. Cocher toutes les cases de ce plan. Commit final : `Jury: consolidation du dossier livree (checkpoint + audit a jour)`.
