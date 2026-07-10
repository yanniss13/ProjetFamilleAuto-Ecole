# MoniteurConnect — guide pour agents (Codex, Claude, etc.)

Plateforme d'annonces reliant auto-écoles et moniteurs indépendants. Projet présenté
devant un jury : la priorité est la feuille de route « features démo » ci-dessous.

## Stack & commandes

- Node.js (CommonJS), Express 5, Twig (autoescape), Prisma (SQLite en dev, prévu
  PostgreSQL en prod), sessions en base (table `Session`), Leaflet auto-hébergé.
- `npm run dev` — serveur en watch (http://localhost:3000). Nécessite un `.env` avec
  `SESSION_SECRET` et `DATABASE_URL="file:./dev.db"` (fail-fast sinon).
- `npm test` — suite complète (15 fichiers `.cjs`, 442 assertions). TOUJOURS la lancer
  avant de commiter.
- `npm run admin:create -- <email> <motdepasse>` — crée/maj un admin.
- `npm run purge` — purge RGPD à la demande (sinon : automatique, 30 s après le
  démarrage puis toutes les 24 h).
- `npm run seed:demo` — jeu de données de démo relançable (comptes et URLs affichés
  en fin de script). À relancer avant chaque répétition de la démo.

## État au 2026-07-07 (passation)

- Lots A (correctifs), B (notifications/suivi candidat), C (admin/modération) : livrés.
- Revue de code complète : 9 correctifs/durcissements livrés (commit « Revue de code :
  correctifs et durcissements ») — CSRF multipart différé, vérif email idempotente,
  P2002 inscription, admin 404=P2025 seulement, sessions Prisma, limites de longueur,
  magic bytes des uploads, géocodage hors requête, écriture PDF async.
- **Lot E (carte des annonces + rayon) : LIVRÉ le 2026-07-06** (exécuté par Codex,
  revu et validé — 33 assertions dans `test/lot-e.cjs`, plan entièrement coché).
- **Lot F (vérification SIRET) : LIVRÉ le 2026-07-06** (exécuté par Codex, revu et
  validé — 21 assertions dans `test/lot-f.cjs`, plan entièrement coché).
- **Lot G (signature électronique du contrat) : LIVRÉ** — pad canvas école + candidat,
  PDF final avec page de signatures (horodatages + empreintes SHA-256), invitation par
  email, invalidation à la ré-édition. Tests : `test/lot-g.cjs`.
- **Lot H (dashboard statistiques) : LIVRÉ** — compteur de vues par annonce (fire-and-forget),
  `statsService` (séries hebdo 12 semaines bornées à 84 jours, bucketing JS), tableau de bord
  école (5 tuiles, barres, entonnoir, top annonces) et admin (4 tuiles, 2 barres), SVG en DOM
  via le bloc `#stats-data`. Tests : `test/lot-h.cjs`.
- **Lot I (alertes email moniteurs) : LIVRÉ** — abonnement public double opt-in
  (département + mot-clé), jeton de confirmation haché / désabonnement opaque,
  notification fire-and-forget à la publication (`alertService.notifyNewListing`),
  désabonnement en deux temps avec suppression réelle. Tests : `test/lot-i.cjs`.
- **Lot J (purge RGPD automatique) : LIVRÉ** — purge des alertes jamais confirmées
  (7 j), des candidatures refusées avec leurs fichiers (180 j, `rejectedAt` posé au
  refus), des jetons expirés ; journal `PurgeRun` + tuile et bouton sur `/admin` ;
  planifiée dans `server.js` (30 s puis 24 h, unref) + CLI `npm run purge`.
  Tests : `test/lot-j.cjs`. **La feuille de route démo E→J est complète.**
- **Lot K (seed de démo) : LIVRÉ** — `npm run seed:demo` : 15 écoles géolocalisées,
  38 annonces, 60 candidatures sur 12 semaines, 4 alertes, école vitrine avec
  contrat réellement signé (services du Lot G) et fichiers réels sous `storage/`.
  Données marquées `@demo.moniteur-connect.example`, relançable (delete puis
  recreate), identifiants affichés en fin de script. Tests : `test/lot-k.cjs`.
- **Lot L (autocomplétion d'adresse via l'API Adresse adresse.data.gouv.fr) :
  LIVRÉ le 2026-07-07** — relais interne `/api/adresse?q=...` (CSP, rate-limit
  30/min/IP), service cache 10 min jamais bloquant, datalist navigateur sur les
  champs `address` d'inscription et de profil. Tests : `test/lot-l.cjs` (port
  4070, 20 assertions).
- **La préparation documentaire du jury DWWM est TERMINÉE (2026-07-10)** :
  trois chantiers livrés le même jour — « consolidation du dossier »,
  « conformité visible » (W3C 0 erreur, responsive 0 débordement, axe
  0 violation) et « script de soutenance » (deck 28 diapos
  `docs/jury/soutenance/soutenance.html`, démo minutée, 26 Q/R, deux
  veilles, README réécrit, DESIGN classé, Mailpit géré nativement — `auth`
  seulement si `SMTP_USER`). Audit : **29 validés / 4 à renforcer /
  0 manquant**. Point de reprise : `docs/jury/README.md`. **Prochain
  travail : côté utilisateur uniquement** (répétitions, checklist clavier,
  décision de push) ; pour un agent, les restes hors jury sont la
  sauvegarde/restauration BDD et l'hébergement de production. ⚠️ Pièges :
  redémarrer le serveur après toute modif de vue (cache Twig) ; seeder
  APRÈS le démarrage du serveur (la purge auto consomme l'alerte de démo
  30 s après le boot). Les documents de juin sous `docs/historique/2026-06/`
  restent des v1 intactes.
- ⚠️ Un seul agent à la fois sur le dépôt : le staging git est partagé (un commit
  concurrent a déjà avalé le travail d'un autre agent une fois).
- Habitude à surveiller côté exécution : remplacer la typographie française (— … )
  par de l'ASCII dans les textes utilisateur — deux corrections déjà nécessaires
  (lots E et F). La typographie des vues/messages doit rester française.
- Feuille de route validée avec l'utilisateur (démo jury, dans cet ordre) :
  E carte+rayon → F vérification SIRET (API Recherche d'entreprises) → G signature
  électronique du contrat (canvas + incrustation PDF) → H dashboard statistiques →
  I alertes email moniteurs → J purge RGPD automatique. Chaque lot suit le cycle
  spec → plan → implémentation (`docs/superpowers/{specs,plans}/`).
- **Session du 2026-07-07 (Claude) — TOUS les restes de revue sont traités :**
  - Revue du travail Codex « nav double session / modération en cartes / emails
    habillés » : 3 bugs corrigés (`adminSessionActive` non nettoyé par
    `detachAuthenticatedSession` sur `/suivi` ; école suspendue qui voyait le
    formulaire de candidature mais recevait 403 à l'envoi — le prédicat
    `backOfficeSession` est maintenant posé par `sessionLocals` sur la session
    BRUTE, même critère que `rejectBackOfficeApplication` ; limiteur anti-spam
    déplacé APRÈS le rejet back-office) + 3 nettoyages (branches nav dupliquées,
    `{% set backOfficeSession %}` dupliqué dans 2 vues, `else` mort de la carte).
  - Améliorations v2 (`test/ameliorations-v2.cjs`, port 4068, 24 assertions) :
    jeton de reset validé dès le GET ; les sessions ouvertes ailleurs sont
    détruites après réinitialisation (`src/services/sessionService.js`) ; page
    dédiée `errors/csrf.twig` en échec CSRF ; pagination de `/admin/annonces` et
    `/admin/ecoles` (helper `paginateAdminList` dans `adminController`).
    « Séparer logout admin/école » : SANS OBJET — les deux logins font
    `session.regenerate()` (anti-fixation), une session mixte est impossible ;
    documenté par assertions « cloisonnement ».
  - Dette de tests Lot B soldée : `test/lot-b.cjs` (port 4069, 11 assertions) —
    jeton de suivi opaque, page `/suivi` sans PII, 404, statuts, câblage emails.

## Conventions

- **Tout en français** : commentaires (ils expliquent le *pourquoi*), messages
  utilisateur, messages de commit (préfixe du lot : `E: ...`), labels de tests.
- **TDD obligatoire** : test écrit d'abord dans `test/<nom>.cjs`, vu échouer, puis
  implémentation minimale. Pas de framework : serveur dédié sur un port unique
  (4055-4070 déjà pris), assertions `ok(cond, label)`, données suffixées `STAMP`,
  nettoyage en `finally`. Nouveau fichier de test → l'ajouter à `"test"` dans
  `package.json`.
- Architecture : `routes → contrôleurs → services (Prisma) → vues Twig`. Toute requête
  de gestion est scopée par `schoolId` (isolation entre écoles). Validation serveur
  dans `src/validators/` (longueurs max incluses).

## Pièges connus

- **Migrations Prisma** : `prisma migrate dev` échoue en shell non interactif dès
  qu'une confirmation est demandée (contraintes uniques...). Recette fiable :
  1) éditer `prisma/schema.prisma` ; 2) `npx prisma migrate diff --from-migrations
  ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script` ;
  3) écrire le SQL dans `prisma/migrations/<YYYYMMDDHHMMSS>_<nom>/migration.sql` ;
  4) `npx prisma migrate deploy` ; 5) `npx prisma generate`.
- **CSP stricte** (helmet, `script-src 'self'`) : aucun JS/CSS inline dans les vues ;
  JS dans `public/js/`, données éventuelles via `data-*` ou bloc
  `<script type="application/json">` (JSON échappé côté serveur — seuls usages autorisés
  de `|raw` : #map-data et #stats-data, cf. commentaire dans `src/app.js`).
- **CSRF** : jeton de session vérifié globalement (`src/middlewares/csrf.js`) ; les
  routes multipart doivent être dans la liste blanche `DEFERRED_MULTIPART` et vérifier
  le jeton APRÈS multer (`verifyAfterUpload`), jamais en query string.
- **Fichiers téléversés** : stockage PRIVÉ sous `storage/` (jamais `public/`), noms
  régénérés, magic bytes vérifiés (`src/middlewares/upload.js`), accès via routes
  protégées uniquement.
- **Nominatim** (géocodage) : jamais d'appel à l'affichage ; à l'enregistrement ou via
  `geocodeCached` (à créer en Lot E, cache 24 h). `GEOCODING_DISABLED=1` dans les tests.
- **API Sirene** (vérification SIRET) : relais interne `/api/siret/:siret` uniquement
  (CSP) ; `SIRET_LOOKUP_DISABLED=1` dans les tests ; cache 1 h dans `src/services/siret.js`.
- **API Adresse** (autocomplétion d'adresse) : relais interne `/api/adresse?q=...`
  uniquement (CSP) ; `ADRESSE_LOOKUP_DISABLED=1` dans les tests ; cache 10 min
  dans `src/services/adresse.js` ; front dans `public/js/adresse-autocomplete.js`
  branché via `data-adresse-autocomplete`.
- **Signatures** (Lot G) : dessin ou import PNG/JPEG dans le pad canvas, puis PNG
  validé par `src/services/signatureImage.js` (data URL, magic bytes, 200 Ko max),
  stocké sous `storage/signatures/` ; toute
  suppression de contrat doit nettoyer `pdfPath`, `schoolSignaturePath`,
  `applicantSignaturePath` ET `signedPdfPath`.
- **Emails** : sans `SMTP_HOST`, mode dev = lien loggé en console ; `mailer.send`
  ne lève jamais (renvoie `false`). Échapper tout texte utilisateur avec `esc()`.
- **Alertes email** (Lot I) : `notifyNewListing` est fire-and-forget et ne lève
  jamais ; le mailer s'appelle toujours via l'objet (`mailer.sendListingAlert(...)`,
  jamais destructuré) pour rester interceptable dans les tests.
- **Purge RGPD** (Lot J) : délais surchargables par `PURGE_ALERTES_JOURS` /
  `PURGE_CANDIDATURES_REFUSEES_JOURS` ; `schedulePurge()` s'appelle UNIQUEMENT
  dans `src/server.js` (jamais `app.js` — les tests importent `app` et ne doivent
  déclencher aucun timer) ; jamais de purge des candidatures acceptées/contrats.
- **Données de démo** (Lot K) : elles PERSISTENT en base (c'est voulu). Tout
  nouveau test doit rester robuste à leur présence : jamais de comptage exact sur
  des données globales — scoper par `STAMP` (cf. correctif du test lot-i). La
  purge du Lot J supprime l'alerte démo non confirmée : `npm run seed:demo` la
  recrée (le seed tourne aussi en dernier dans `npm test`).
- Windows : shell PowerShell 5.1 ; préférer les chemins via `path.join`, et `git add`
  explicite (des fichiers personnels non suivis traînent à la racine — `contexte.md`,
  `*.xlsx` — ne PAS les commiter).
