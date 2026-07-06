# MoniteurConnect — guide pour agents (Codex, Claude, etc.)

Plateforme d'annonces reliant auto-écoles et moniteurs indépendants. Projet présenté
devant un jury : la priorité est la feuille de route « features démo » ci-dessous.

## Stack & commandes

- Node.js (CommonJS), Express 5, Twig (autoescape), Prisma (SQLite en dev, prévu
  PostgreSQL en prod), sessions en base (table `Session`), Leaflet auto-hébergé.
- `npm run dev` — serveur en watch (http://localhost:3000). Nécessite un `.env` avec
  `SESSION_SECRET` et `DATABASE_URL="file:./dev.db"` (fail-fast sinon).
- `npm test` — suite complète (9 fichiers `.cjs`, ~275 assertions). TOUJOURS la lancer
  avant de commiter.
- `npm run admin:create -- <email> <motdepasse>` — crée/maj un admin.

## État au 2026-07-06 (passation)

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
- **Prochain travail : Lot I (alertes email moniteurs) — EN COURS, reprendre à la
  Tâche 3.** Tâches 1 et 2 livrées et commitées (`7a7fda8`, `cbbec24`) : modèle
  `Alert` + `subscribe`, formulaire public + email de confirmation. Plan coché au
  fur et à mesure : `docs/superpowers/plans/2026-07-06-lot-i-alertes-email.md`
  (spec : `docs/superpowers/specs/2026-07-06-lot-i-alertes-email-design.md`).
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
- Restes de revue non traités (mineurs, faire si le temps le permet) : pagination des
  listes admin, page dédiée pour l'échec CSRF, valider le jeton de reset au GET,
  invalider les sessions au changement de mot de passe, séparer logout admin/école,
  tests dédiés Lot B.

## Conventions

- **Tout en français** : commentaires (ils expliquent le *pourquoi*), messages
  utilisateur, messages de commit (préfixe du lot : `E: ...`), labels de tests.
- **TDD obligatoire** : test écrit d'abord dans `test/<nom>.cjs`, vu échouer, puis
  implémentation minimale. Pas de framework : serveur dédié sur un port unique
  (4057-4064 déjà pris), assertions `ok(cond, label)`, données suffixées `STAMP`,
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
- **Signatures** (Lot G) : dessin ou import PNG/JPEG dans le pad canvas, puis PNG
  validé par `src/services/signatureImage.js` (data URL, magic bytes, 200 Ko max),
  stocké sous `storage/signatures/` ; toute
  suppression de contrat doit nettoyer `pdfPath`, `schoolSignaturePath`,
  `applicantSignaturePath` ET `signedPdfPath`.
- **Emails** : sans `SMTP_HOST`, mode dev = lien loggé en console ; `mailer.send`
  ne lève jamais (renvoie `false`). Échapper tout texte utilisateur avec `esc()`.
- Windows : shell PowerShell 5.1 ; préférer les chemins via `path.join`, et `git add`
  explicite (des fichiers personnels non suivis traînent à la racine — `contexte.md`,
  `*.xlsx` — ne PAS les commiter).
