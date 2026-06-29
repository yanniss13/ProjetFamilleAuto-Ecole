# Lot B — Notifications & suivi candidat : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au candidat (sans compte) une confirmation de candidature, une page de suivi durable `/suivi/<token>`, et des emails automatiques à l'acceptation/refus.

**Architecture:** Un jeton opaque par candidature (stocké en clair sur `Application`) sert de clé d'une page de suivi publique en lecture seule. Le dépôt de candidature et les actions accept/refus déclenchent des emails best-effort qui rappellent le lien de suivi.

**Tech Stack:** Node.js, Express 5, Twig, Prisma 6, nodemailer (mode dev sans SMTP), tests Node natifs (`node test/smoke.cjs`).

## Global Constraints

- **Jeton de suivi** : opaque 256 bits (`crypto.randomBytes(32).toString('hex')`, 64 caractères hex), **stocké en clair**, **durable, réutilisable, sans expiration**.
- **Emails best-effort** : un échec d'envoi ne doit JAMAIS interrompre le flux HTTP ni changer la redirection/le flash (motif identique à la notif école existante, appelée sans vérifier son retour).
- **Page de suivi — données autorisées UNIQUEMENT** : titre de l'annonce, nom commercial de l'auto-école, date de candidature, statut, message contextuel. JAMAIS : email/téléphone/message du candidat, chemins de pièces, autres candidatures.
- **Contrat** : livraison **manuelle** inchangée (bouton « Envoyer le contrat ») ; aucun PDF exposé sur la page de suivi.
- Tests lancés par `npm test`. Chaque tâche finit par `npm test` au vert + un commit.

---

### Task 1 : Modèle de données — jeton de suivi

**Files:**
- Modify: `prisma/schema.prisma` (model `Application`)
- Create: `prisma/migrations/<timestamp>_application_tracking_token/migration.sql` (généré par Prisma)
- Modify: `src/services/tokens.js` (ajout `generateOpaqueToken`)
- Modify: `src/services/applicationService.js` (ajout `findByTrackingToken`)
- Modify: `src/controllers/applicationController.js` (`apply` génère + stocke le jeton)
- Test: `test/smoke.cjs`

**Interfaces:**
- Produces:
  - `tokens.generateOpaqueToken(): string` — 64 caractères hex.
  - `applicationService.findByTrackingToken(token: string): Promise<Application|null>` — inclut `listing.school` et `contract`.
  - Les candidatures créées par `apply` portent désormais `trackingToken` (64 hex).

- [ ] **Step 1 : Écrire les assertions qui échouent (`test/smoke.cjs`)**

En haut du fichier, après `const { STORAGE_DIR } = require('../src/config/storage');` (~ligne 26), ajouter :

```javascript
const applicationService = require('../src/services/applicationService');
```

Puis, juste après le bloc qui vérifie les chemins de fichiers de `jean` (après la ligne
`ok(jean.licensePath.startsWith('license/') && jean.teachingCardPath.startsWith('teaching/'), ...)`, ~ligne 172), ajouter :

```javascript
    // B (Task 1) : jeton de suivi
    ok(typeof jean.trackingToken === 'string' && /^[0-9a-f]{64}$/.test(jean.trackingToken),
      'B : candidature dotée d’un trackingToken (64 hex)');
    const byTok = await applicationService.findByTrackingToken(jean.trackingToken);
    ok(byTok && byTok.id === jean.id && byTok.listing && byTok.listing.school,
      'B : findByTrackingToken retrouve la candidature (avec annonce + école)');
    ok((await applicationService.findByTrackingToken('inexistant')) === null,
      'B : findByTrackingToken renvoie null pour un jeton inconnu');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC sur `B : candidature dotée d’un trackingToken` (la colonne n'existe pas → `jean.trackingToken` est `undefined`).

- [ ] **Step 3 : Ajouter le champ au schéma (`prisma/schema.prisma`)**

Dans `model Application`, après le champ `status`, ajouter :

```prisma
  // Jeton opaque (256 bits, en clair) servant de clé à la page de suivi publique du
  // candidat. Voir docs/superpowers/specs/2026-06-29-lot-b-notifications-suivi-design.md.
  trackingToken String? @unique
```

- [ ] **Step 4 : Générer et appliquer la migration**

Run: `npx prisma migrate dev --name application_tracking_token`
Expected: création de `prisma/migrations/<timestamp>_application_tracking_token/migration.sql` (ALTER TABLE ... ADD COLUMN "trackingToken"), application sur `dev.db`, et régénération du client Prisma. Aucun backfill nécessaire (les candidatures existantes restent `NULL`).

- [ ] **Step 5 : Ajouter `generateOpaqueToken` (`src/services/tokens.js`)**

Avant `module.exports`, ajouter :

```javascript
// Jeton opaque non hashé (lien de suivi candidat) : non sensible (ne révèle que le statut,
// déjà en base), donc stockable en clair pour pouvoir reconstruire le lien dans les emails.
function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}
```

Et remplacer l'export par :

```javascript
module.exports = { hashToken, generateToken, generateOpaqueToken };
```

- [ ] **Step 6 : Ajouter `findByTrackingToken` (`src/services/applicationService.js`)**

Avant `module.exports`, ajouter :

```javascript
// Candidature retrouvée par son jeton de suivi public (page /suivi). Inclut annonce + école
// (pour l'affichage) et le contrat (pour savoir s'il a été envoyé).
function findByTrackingToken(token) {
  return prisma.application.findUnique({
    where: { trackingToken: token },
    include: { listing: { include: { school: true } }, contract: true },
  });
}
```

Et ajouter `findByTrackingToken` à l'objet exporté :

```javascript
module.exports = {
  createForListing,
  findForOwnedListing,
  findOwnedById,
  updateStatus,
  countBySchool,
  findByTrackingToken,
};
```

- [ ] **Step 7 : Générer et stocker le jeton dans `apply` (`src/controllers/applicationController.js`)**

En haut du fichier, après `const { resolveStored } = require('../config/storage');`, ajouter :

```javascript
const { generateOpaqueToken } = require('../services/tokens');
```

Dans `apply`, remplacer l'appel `await applicationService.createForListing(...)` par :

```javascript
    const trackingToken = generateOpaqueToken();
    await applicationService.createForListing(id, {
      ...value,
      cvPath: relPathOf(cvFile),
      idCardPath: relPathOf(idFile),
      licensePath: relPathOf(licenseFile),
      teachingCardPath: relPathOf(teachingFile),
      trackingToken,
    });
```

(`createForListing` fait `data: { ...data, listingId }`, donc `trackingToken` est persité tel quel.)

- [ ] **Step 8 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont les 3 assertions `B : ... trackingToken / findByTrackingToken`.

- [ ] **Step 9 : Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/services/tokens.js src/services/applicationService.js src/controllers/applicationController.js test/smoke.cjs
git commit -m "$(printf 'B: jeton de suivi sur les candidatures + lookup\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2 : Page de suivi publique

**Files:**
- Create: `src/controllers/trackingController.js`
- Create: `src/routes/trackingRoutes.js`
- Modify: `src/routes/index.js` (montage public `/suivi`)
- Create: `views/tracking/show.twig`
- Test: `test/smoke.cjs`

**Interfaces:**
- Consumes: `applicationService.findByTrackingToken(token)` (Task 1).
- Produces: route publique `GET /suivi/:token`.

- [ ] **Step 1 : Écrire les assertions qui échouent (`test/smoke.cjs`)**

Juste après les assertions de la Task 1 (après `ok((await applicationService.findByTrackingToken('inexistant')) === null, ...)`), ajouter le bloc « statut en attente » :

```javascript
    // B (Task 2) : page de suivi publique (candidature encore en attente à ce stade)
    let trk = await req(pub, 'GET', `/suivi/${jean.trackingToken}`);
    ok(trk.status === 200 && trk.text.includes(keyword), 'B : page de suivi rend l’annonce');
    ok(/En attente/.test(trk.text), 'B : statut « En attente » affiché');
    ok(!trk.text.includes('jean@example.test'), 'B : page de suivi ne fuit pas l’email du candidat');
    trk = await req(pub, 'GET', '/suivi/zzdoesnotexist');
    ok(trk.status === 404, 'B : jeton de suivi inconnu -> 404');
```

Ensuite, juste après l'assertion existante `ok(jeanAfter.contract.teachingAuthNumber === ... , 'Données d'identité ...')` (après l'acceptation, ~ligne 220), ajouter :

```javascript
    trk = await req(pub, 'GET', `/suivi/${jean.trackingToken}`);
    ok(/Acceptée/.test(trk.text), 'B : suivi reflète « Acceptée » après acceptation');
```

Et juste après l'assertion existante `ok(marieAfter.status === 'rejected', ...)` (après le refus, ~ligne 228), ajouter :

```javascript
    trk = await req(pub, 'GET', `/suivi/${marie.trackingToken}`);
    ok(/Refusée/.test(trk.text), 'B : suivi reflète « Refusée » après refus');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC sur `B : page de suivi rend l’annonce` (la route `/suivi/:token` n'existe pas → 404 au lieu de 200).

- [ ] **Step 3 : Créer le contrôleur (`src/controllers/trackingController.js`)**

```javascript
// Page de suivi publique d'une candidature, accessible via un jeton opaque (sans compte).
// Lecture seule, n'expose que des informations non sensibles (voir la vue).
const applicationService = require('../services/applicationService');
const { notFound } = require('../utils/http');

// GET /suivi/:token
async function show(req, res, next) {
  try {
    const token = req.params.token;
    if (!token) return notFound(res);
    const application = await applicationService.findByTrackingToken(token);
    if (!application) return notFound(res);
    res.render('tracking/show', { title: 'Suivi de candidature', application });
  } catch (err) {
    next(err);
  }
}

module.exports = { show };
```

- [ ] **Step 4 : Créer le routeur (`src/routes/trackingRoutes.js`)**

```javascript
// Route publique de suivi de candidature (montée sous /suivi).
const express = require('express');
const trackingController = require('../controllers/trackingController');

const router = express.Router();

router.get('/:token', trackingController.show);

module.exports = router;
```

- [ ] **Step 5 : Monter la route publiquement (`src/routes/index.js`)**

Après `const accountRoutes = require('./accountRoutes');`, ajouter :

```javascript
const trackingRoutes = require('./trackingRoutes');
```

Après la ligne `router.use('/annonces', listingRoutes);`, ajouter (la route reste **publique**, avant les routes gardées par `requireAuth`) :

```javascript
router.use('/suivi', trackingRoutes);
```

- [ ] **Step 6 : Créer la vue (`views/tracking/show.twig`)**

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <div class="page-header"><h1>Suivi de votre candidature</h1></div>

  <p class="muted">
    Annonce : <strong>{{ application.listing.title }}</strong>
    — {{ application.listing.school.businessName }}
  </p>
  <p class="muted">Candidature déposée le {{ application.createdAt|date('d/m/Y') }}</p>

  <p>
    {% if application.status == 'accepted' %}
      <span class="badge badge-available">Acceptée</span>
    {% elseif application.status == 'rejected' %}
      <span class="badge badge-rejected">Refusée</span>
    {% else %}
      <span class="badge badge-pending">En attente</span>
    {% endif %}
  </p>

  {% if application.status == 'accepted' %}
    <p>Votre candidature a été acceptée. L'auto-école vous transmettra votre contrat par email.</p>
    {% if application.contract and application.contract.sentToApplicantAt %}
      <p class="muted">Contrat envoyé le {{ application.contract.sentToApplicantAt|date('d/m/Y à H:i') }}.</p>
    {% endif %}
  {% elseif application.status == 'rejected' %}
    <p>Votre candidature n'a pas été retenue cette fois-ci. Merci de l'intérêt porté à cette auto-école.</p>
  {% else %}
    <p>Votre candidature est en cours d'examen par l'auto-école.</p>
  {% endif %}
{% endblock %}
```

- [ ] **Step 7 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont `B : page de suivi rend l’annonce`, « En attente », pas de fuite d'email, 404 jeton inconnu, et les reflets « Acceptée »/« Refusée ».

- [ ] **Step 8 : Commit**

```bash
git add src/controllers/trackingController.js src/routes/trackingRoutes.js src/routes/index.js views/tracking/show.twig test/smoke.cjs
git commit -m "$(printf 'B: page de suivi publique de candidature (/suivi/:token)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3 : Emails (confirmation + accept/refus auto)

**Files:**
- Modify: `src/services/mailer.js` (3 fonctions + exports)
- Modify: `src/controllers/applicationController.js` (`apply` : email de confirmation)
- Modify: `src/controllers/contractController.js` (`accept`/`reject` : emails auto)
- Test: `test/smoke.cjs`

**Interfaces:**
- Consumes: le `trackingToken` généré dans `apply` (Task 1) et présent sur `application` (colonne).
- Produces:
  - `mailer.sendApplicationConfirmation(email, name, listingTitle, token): Promise<boolean>`
  - `mailer.sendApplicationAccepted(email, name, listingTitle, token): Promise<boolean>`
  - `mailer.sendApplicationRejected(email, name, listingTitle, token): Promise<boolean>`
  - Chacune construit `link = token ? `${APP_URL}/suivi/${token}` : null`.

- [ ] **Step 1 : Écrire les assertions qui échouent (`test/smoke.cjs`)**

En haut du fichier, après `const applicationService = require('../src/services/applicationService');` (ajouté en Task 1), ajouter :

```javascript
const mailer = require('../src/services/mailer');
```

Au tout début du `try` de `main()` (juste après `const createdSchoolIds = [];`, ~ligne 100), ajouter le contrôle d'existence (fonctions réelles en mode dev) puis l'interception du câblage :

```javascript
    // B (Task 3) : les 3 fonctions existent et, en dev (SMTP vide), renvoient true.
    ok((await mailer.sendApplicationConfirmation('t@test.test', 'T', 'Titre', 'abc')) === true, 'B : mailer.sendApplicationConfirmation (dev) OK');
    ok((await mailer.sendApplicationAccepted('t@test.test', 'T', 'Titre', 'abc')) === true, 'B : mailer.sendApplicationAccepted (dev) OK');
    ok((await mailer.sendApplicationRejected('t@test.test', 'T', 'Titre', 'abc')) === true, 'B : mailer.sendApplicationRejected (dev) OK');
    // Interception pour vérifier le CÂBLAGE depuis les contrôleurs (le même objet exports
    // est partagé avec les contrôleurs, donc réassigner ses propriétés est visible).
    const mailCalls = [];
    mailer.sendApplicationConfirmation = (...a) => { mailCalls.push(['confirmation', ...a]); return true; };
    mailer.sendApplicationAccepted = (...a) => { mailCalls.push(['accepted', ...a]); return true; };
    mailer.sendApplicationRejected = (...a) => { mailCalls.push(['rejected', ...a]); return true; };
```

Après le dépôt de la candidature de Jean (après `ok(r.status === 302, 'Candidature Jean (CV + CNI) déposée');`, ~ligne 164), ajouter :

```javascript
    const conf = mailCalls.find((c) => c[0] === 'confirmation' && c[1] === 'jean@example.test');
    ok(conf && typeof conf[4] === 'string' && conf[4].length === 64, 'B : email de confirmation au candidat avec lien de suivi');
```

Après l'acceptation (après `ok(r.status === 302, 'Acceptation + génération du contrat');`, ~ligne 215), ajouter :

```javascript
    ok(mailCalls.some((c) => c[0] === 'accepted' && c[1] === 'jean@example.test'), 'B : email d’acceptation envoyé au candidat');
```

Après le refus (après `ok(marieAfter.status === 'rejected', ...)`, ~ligne 228), ajouter :

```javascript
    ok(mailCalls.some((c) => c[0] === 'rejected' && c[1] === 'marie@example.test'), 'B : email de refus envoyé au candidat');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC dès `B : mailer.sendApplicationConfirmation (dev) OK` (la fonction n'existe pas → `await` lève un `TypeError`).

- [ ] **Step 3 : Ajouter les 3 fonctions (`src/services/mailer.js`)**

Avant le `module.exports`, ajouter :

```javascript
// Confirme au candidat la réception de sa candidature + lien de suivi.
function sendApplicationConfirmation(applicantEmail, applicantName, listingTitle, token) {
  const link = token ? `${APP_URL}/suivi/${token}` : null;
  return send(
    applicantEmail,
    `Candidature reçue — ${listingTitle}`,
    `<p>Bonjour ${applicantName},</p>
     <p>Votre candidature à l'annonce « ${listingTitle} » a bien été reçue.</p>
     ${link ? `<p>Suivez son avancement à tout moment : <a href="${link}">voir le suivi</a></p>` : ''}`,
    { link }
  );
}

// Informe le candidat que sa candidature est acceptée (le contrat suit, envoyé par l'école).
function sendApplicationAccepted(applicantEmail, applicantName, listingTitle, token) {
  const link = token ? `${APP_URL}/suivi/${token}` : null;
  return send(
    applicantEmail,
    `Candidature acceptée — ${listingTitle}`,
    `<p>Bonjour ${applicantName},</p>
     <p>Bonne nouvelle : votre candidature à « ${listingTitle} » a été acceptée. L'auto-école
     vous transmettra votre contrat par email.</p>
     ${link ? `<p>Détails : <a href="${link}">voir le suivi</a></p>` : ''}`,
    { link }
  );
}

// Informe le candidat que sa candidature n'a pas été retenue.
function sendApplicationRejected(applicantEmail, applicantName, listingTitle, token) {
  const link = token ? `${APP_URL}/suivi/${token}` : null;
  return send(
    applicantEmail,
    `Votre candidature — ${listingTitle}`,
    `<p>Bonjour ${applicantName},</p>
     <p>Votre candidature à « ${listingTitle} » n'a pas été retenue cette fois-ci. Merci de
     l'intérêt porté à cette auto-école.</p>
     ${link ? `<p>Suivi : <a href="${link}">voir le suivi</a></p>` : ''}`,
    { link }
  );
}
```

Et compléter l'export (ajouter les 3 noms à l'objet `module.exports` existant) :

```javascript
module.exports = {
  send,
  sendVerification,
  sendReset,
  sendApplicationNotification,
  sendContractToApplicant,
  sendApplicationConfirmation,
  sendApplicationAccepted,
  sendApplicationRejected,
  maskEmail,
  APP_URL,
};
```

- [ ] **Step 4 : Envoyer la confirmation dans `apply` (`src/controllers/applicationController.js`)**

Dans `apply`, juste après la ligne existante
`await mailer.sendApplicationNotification(listing.school.email, listing.title, value.applicantName);`, ajouter :

```javascript
    // Best-effort : confirme au candidat + lien de suivi (n'interrompt pas le flux).
    await mailer.sendApplicationConfirmation(value.applicantEmail, value.applicantName, listing.title, trackingToken);
```

- [ ] **Step 5 : Envoyer les emails accept/refus (`src/controllers/contractController.js`)**

Dans `accept`, juste après `await applicationService.updateStatus(application.id, 'accepted');`, ajouter :

```javascript
    // Best-effort : informe le candidat de l'acceptation (lien de suivi rappelé).
    await mailer.sendApplicationAccepted(application.applicantEmail, application.applicantName, application.listing.title, application.trackingToken);
```

Dans `reject`, juste après `await applicationService.updateStatus(application.id, 'rejected');`, ajouter :

```javascript
    // Best-effort : informe le candidat du refus (lien de suivi rappelé).
    await mailer.sendApplicationRejected(application.applicantEmail, application.applicantName, application.listing.title, application.trackingToken);
```

- [ ] **Step 6 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont les assertions de confirmation/acceptation/refus.

- [ ] **Step 7 : Commit**

```bash
git add src/services/mailer.js src/controllers/applicationController.js src/controllers/contractController.js test/smoke.cjs
git commit -m "$(printf 'B: emails candidat (confirmation, acceptation, refus) best-effort\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage :**
- Email de confirmation à la candidature → Task 3 (Step 4), jeton créé en Task 1. ✔
- Page de suivi `/suivi/<token>` avec statut → Task 2. ✔
- Emails auto accept/refus → Task 3 (Step 5). ✔
- Jeton en clair, durable, 256 bits → Task 1 (`generateOpaqueToken`, champ `@unique`). ✔
- Page de suivi sans fuite de données → Task 2 (vue limitée + test « ne fuit pas l'email »). ✔
- Best-effort emails → appels `await` sans vérification de retour, `send()` ne lève jamais (catch interne) ; cohérent avec la notif école existante. ✔
- Candidatures héritées (`trackingToken` NULL) → emails envoyés sans lien (`link = token ? ... : null`). ✔

**Placeholder scan :** aucun TODO/TBD ; tous les blocs de code sont complets. Les `<timestamp>` de migration sont remplacés par Prisma à la génération (attendu).

**Type consistency :**
- `findByTrackingToken(token)` défini en Task 1, consommé en Task 2 (contrôleur) — signatures cohérentes.
- `generateOpaqueToken()` défini en Task 1, consommé dans `apply` (même tâche).
- Les 3 fonctions mailer `sendApplication{Confirmation,Accepted,Rejected}(email, name, listingTitle, token)` : signatures identiques entre définition (Task 3 Step 3), appels contrôleurs (Steps 4-5) et test (Step 1).
- Champ `trackingToken` : nom identique partout (schéma, service, contrôleurs, vue n'y accède pas).

## Risques / points d'attention

- **Interception mailer dans le test** : repose sur le partage de l'objet `module.exports` entre le test et les contrôleurs (cache `require`). Les fonctions réelles sont tout de même exercées par les 3 assertions « (dev) OK » avant interception, donc une erreur dans leur corps serait détectée.
- **Ordre des tâches** : Task 1 doit précéder Task 2 (qui consomme `findByTrackingToken`) et Task 3 (qui référence `trackingToken` dans `apply`).
- **Migration sur dev.db** : ajout de colonne nullable, sans backfill ; rétro-compatible.
