# Messagerie école ↔ moniteur — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un fil de messages par candidature entre l'auto-école et le moniteur, avec email et temps réel.

**Architecture:** modèle Prisma `Message` rattaché à `Application` (cascade), service `messageService`, contrôleur `messageController` monté côté suivi (jeton) et côté gestion (école connectée). Le temps réel du lot M publie `message-created` ; les pages rechargent la liste des messages via fragment.

**Tech Stack:** Node ≥ 22.18, Express 5, Twig, Prisma 7 + SQLite, tests `.cjs` maison (fetch sur un port dédié), `public/js/realtime.js`.

**Spec:** `docs/specs/2026-11-18-messagerie-design.md`

## Global Constraints

- Corps de message : texte, 1 à 2 000 caractères après `trim()`.
- `author` vaut exactement `"school"` ou `"applicant"`.
- Fil ouvert si `status` ∈ { `pending`, `accepted` } ; `rejected` → lecture seule, POST refusé (302 + flash d'erreur).
- Limiteur : 30 messages / 15 min par IP, sur les deux POST.
- Email au destinataire sans recopier le texte du message ; best-effort (`mailer.send` ne lève jamais).
- Événement temps réel `message-created`, données `{ type, applicationId }` uniquement.
- Ressource d'une autre école → 404 ; CSRF existant ; aucun script inline (CSP stricte).
- Textes et commits en français. Port de test : **4075**.

## Review Focus

1. Formulaire en cours de saisie quand un message arrive : la zone rafraîchie ne contient que la liste, jamais le formulaire → test : le fragment ne contient pas de `<textarea`.
2. Message vide ou fait d'espaces : refusé (400) sans écriture → test côté moniteur et côté école.
3. Message de plus de 2 000 caractères : refusé (400) → test côté moniteur.
4. HTML dans le message (`<script>`) : affiché échappé → test sur la page école.
5. Candidature purgée : messages supprimés avec elle → test de cascade (Task 1).

---

### Task 1: Modèle, migration et service

**Files:**
- Create: `prisma/schema/message.prisma`, migration `prisma/schema/migrations/20261118120000_messages/migration.sql`
- Modify: `prisma/schema/application.prisma` (relation `messages Message[]`)
- Create: `src/services/messageService.js`
- Create: `test/messagerie.cjs` (ajouté à `npm test`)

**Interfaces:**
- Produces:
  - `MAX_BODY = 2000`
  - `isThreadOpen(application) -> boolean`
  - `validateBody(raw) -> { value: string } | { error: string }`
  - `create(applicationId: number, author: 'school'|'applicant', body: string) -> Promise<Message>`
  - `listForApplication(applicationId) -> Promise<Message[]>` (ordre `createdAt` croissant, puis `id`)
  - `markReadBy(applicationId, reader: 'school'|'applicant') -> Promise<number>` (marque lus les messages de l'AUTRE partie)

- [ ] **Step 1: Test** — `service : ...` : `validateBody('   ')` → `error` ; `validateBody('x'.repeat(2001))` → `error` ; `validateBody(' Bonjour ')` → `{ value: 'Bonjour' }` ; `isThreadOpen({status:'rejected'}) === false`, `pending`/`accepted` → true ; `create` puis `listForApplication` rend 2 messages dans l'ordre ; `markReadBy(id,'school')` ne marque que les messages `applicant` ; suppression de la candidature → `prisma.message.count({where:{applicationId}}) === 0`.
- [ ] **Step 2:** `node test/messagerie.cjs` → échec (module absent).
- [ ] **Step 3:** schéma + migration SQL écrite à la main (table `Message`, FK `ON DELETE CASCADE`, index `applicationId`), `npx prisma migrate deploy && npm run prisma:generate`, puis le service.
- [ ] **Step 4:** test vert.
- [ ] **Step 5:** commit.

### Task 2: Côté moniteur (lien de suivi)

**Files:**
- Modify: `src/routes/trackingRoutes.js` (POST `/:token/messages`, limiteur), `src/services/applicationService.js` (`include.messages` ordonnés dans `findByTrackingToken` et `findByIdForTracking`), `src/controllers/trackingController.js` (marque lus les messages de l'école à l'affichage), `views/tracking/show.twig` (formulaire HORS de `_status`), `views/tracking/_status.twig` (inclut `partials/messages-list.twig`), `src/services/mailer.js` (`sendNewMessage`), `src/services/realtimeService.js` (`MESSAGE_CREATED: 'message-created'`)
- Create: `src/controllers/messageController.js` (`postFromApplicant`), `views/partials/messages-list.twig` (racine `data-message-list`)

**Interfaces:**
- Consumes: Task 1.
- Produces: `mailer.sendNewMessage(to: string, name: string, listingTitle: string, link: string) -> Promise<boolean>` ; `realtimeService.EVENT_TYPES.MESSAGE_CREATED`.

- [ ] **Step 1: Test** — `moniteur : ...` : POST valide → 302 vers `/suivi/<jeton>`, message `applicant` en base, `sendNewMessage` appelé avec l'email de l'école et un lien `/mes-annonces/<id>/candidatures/<appId>/messages`, publication `message-created` ; POST vide → 400, rien en base ; 2 001 caractères → 400 ; candidature refusée → 302 + aucun message ; la page de suivi affiche le message de l'école et le marque lu ; le fragment `/suivi/fragment/<id>` contient `data-message-list` et pas de `<textarea`.
- [ ] **Step 2:** échec attendu.
- [ ] **Step 3:** implémentation.
- [ ] **Step 4:** test vert + `npm test`.
- [ ] **Step 5:** commit.

### Task 3: Côté école

**Files:**
- Modify: `src/routes/manageRoutes.js` (GET/POST `/:id/candidatures/:appId/messages`, GET `.../messages/fragment`), `src/services/applicationService.js` (`_count` des messages `applicant` non lus dans `findForOwnedListing` et `findOwnedById`), `views/dashboard/_application-card.twig` (lien « Messages » + compteur)
- Modify: `src/controllers/messageController.js` (`showForSchool`, `postFromSchool`, `schoolFragment`)
- Create: `views/dashboard/messages.twig`

**Interfaces:**
- Consumes: Tasks 1–2.

- [ ] **Step 1: Test** — `ecole : ...` : la carte affiche « Messages » et `1` non lu ; GET du fil → 200, message du moniteur affiché, `<script>` échappé, compteur retombé à 0 ; POST valide → 302, message `school`, `sendNewMessage` vers l'email du candidat avec `/suivi/<jeton>`, publication `message-created` ; POST vide → 400 ; une autre école → 404 en GET et POST ; candidature refusée → formulaire absent et POST refusé.
- [ ] **Step 2:** échec attendu.
- [ ] **Step 3:** implémentation (scopée par `findOwnedById`).
- [ ] **Step 4:** test vert + `npm test`.
- [ ] **Step 5:** commit.

### Task 4: Temps réel, démo et documentation

**Files:**
- Modify: `public/js/realtime.js` (mode `thread` : remplace `[data-message-list]`), `views/dashboard/messages.twig` (contexte temps réel : flux de l'annonce, fragment du fil), `scripts/seed-demo.js` (2 messages sur la candidature vitrine en attente), `README.md` (fonctionnalité + lot N)

- [ ] **Step 1: Test** — `temps reel : ...` : `realtime.js` contient le sélecteur `[data-message-list]` pour le mode `thread` ; la page du fil porte `data-realtime-mode="thread"` ; seed : la vitrine a au moins 2 messages.
- [ ] **Step 2:** échec attendu.
- [ ] **Step 3:** implémentation.
- [ ] **Step 4:** `npm test` complet vert.
- [ ] **Step 5:** commit + push.
