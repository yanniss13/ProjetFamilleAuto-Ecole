# Lot M — Suivi des candidatures en temps réel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Actualiser en direct, sans rechargement manuel, les candidatures et les états de contrat entre l'espace école et le suivi candidat, tout en conservant la base comme source de vérité et un parcours complet sans JavaScript.

**Architecture:** Un service mémoire publie des signaux d'invalidation sur un canal par annonce et un canal par candidature. Deux endpoints SSE autorisés par session envoient ces signaux ; le navigateur récupère ensuite un fragment Twig frais, avec un rattrapage systématique à chaque reconnexion et une fermeture forcée toutes les cinq minutes pour revalider la session.

**Tech Stack:** Node.js 22.18+, CommonJS, Express 5, Twig autoéchappé, Prisma 7, sessions Prisma, Server-Sent Events natifs, JavaScript navigateur sans dépendance, tests `.cjs` maison et `node:vm`.

## Global Constraints

- Lire d'abord `AGENTS.md` et la spécification `docs/superpowers/specs/2026-07-16-lot-m-temps-reel-design.md`.
- TDD strict : écrire chaque assertion, exécuter le test et voir l'échec attendu avant le code minimal.
- Avant **chaque** commit de code, exécuter aussi `& "C:\nvm4w\nodejs\npm.cmd" test`, conformément à `AGENTS.md`, en plus des tests ciblés indiqués dans la tâche.
- Tout texte utilisateur, commentaire et message de commit reste en français ; préfixe de commit : `M:`.
- Utiliser Node `C:\nvm4w\nodejs\node.exe` et npm `C:\nvm4w\nodejs\npm.cmd` si le `PATH` ne les expose pas.
- Port de test réservé : **4072**. Poser `GEOCODING_DISABLED=1`, `SIRET_LOOKUP_DISABLED=1`, `ADRESSE_LOOKUP_DISABLED=1` et `SMTP_HOST=''`.
- Aucune migration Prisma et aucune nouvelle dépendance npm.
- CSP stricte : aucun script inline, aucune donnée utilisateur passée à `innerHTML`, tout le navigateur dans `public/js/realtime.js`.
- Les événements ne contiennent que `{ type, applicationId }` ; jamais de PII, document ou jeton.
- Le jeton candidat reste uniquement dans le lien initial et les liens métier existants. Les URLs SSE et fragments utilisent l'identifiant autorisé en session.
- Un flux par page, heartbeat 25 s, durée maximale 5 min, `retry: 5000`, réponse SSE 204 si la session est absente, fragment 401, ressource d'autrui 404.
- `publishApplicationUpdate` est best-effort et appelé via l'objet `realtimeService`, jamais destructuré, pour rester interceptable dans les tests.
- Sans JavaScript ou en panne SSE, formulaires, emails, redirections et actualisation manuelle restent inchangés.
- Un seul agent intervient à la fois. Des agents successifs sont permis, jamais concurrents sur le dépôt ou le staging.
- **Précondition d'exécution :** le worktree contient actuellement des modifications utilisateur non commitées dans `package*.json`, `src/controllers/contractController.js`, `src/services/applicationService.js` et `test/lot-g.cjs`. Avant la Tâche 1, exécuter `git status --short`. Si l'un de ces changements est encore présent, arrêter et demander au propriétaire de les committer ou de préciser leur sort ; ne pas les stasher, les écraser ni les absorber dans un commit Lot M.

---

## File map

### Nouveaux fichiers

- `src/services/realtimeService.js` — registre mémoire, noms de canaux, types d'événement, publication best-effort et désabonnement.
- `src/middlewares/realtimeAuthResponse.js` — reconnaissance des requêtes SSE/fragment et réponses 204/401 partagées par les gardes école.
- `src/controllers/realtimeController.js` — transport SSE, heartbeat, durée maximale, fragments candidat/école et isolation.
- `views/partials/realtime-status.twig` — indicateur accessible, annonce polie et lien de rechargement.
- `views/tracking/_status.twig` — fragment remplaçable de l'état candidat.
- `views/dashboard/_application-card.twig` — carte candidature remplaçable côté école.
- `public/js/realtime.js` — machine d'état EventSource, rattrapage, fetch des fragments et remplacement DOM prudent.
- `test/lot-m.cjs` — tests service, HTTP, session, publications et simulation `vm`.

### Fichiers modifiés

- `src/middlewares/requireAuth.js`, `src/middlewares/loadSchool.js` — sémantique 204/401 uniquement pour les en-têtes temps réel.
- `src/services/applicationService.js` — lecture d'une candidature par identifiant pour un suivi déjà autorisé.
- `src/controllers/trackingController.js` — liste de cinq candidatures autorisées, sauvegardée avant rendu.
- `src/routes/trackingRoutes.js` — routes statiques avant `/:token`.
- `src/routes/manageRoutes.js` — routes `:id` SSE et fragment école.
- `src/controllers/applicationController.js`, `src/controllers/contractController.js`, `src/controllers/signatureController.js` — publications après écritures métier réussies.
- `views/tracking/show.twig`, `views/dashboard/applications.twig` — contextes temps réel et partials.
- `public/css/style.css` — indicateurs, états, bandeau et utilitaire visuellement masqué.
- `scripts/seed-demo.js`, `test/lot-k.cjs` — candidature en attente et URL dédiée à la scène temps réel.
- `package.json` — ajout de `node test/lot-m.cjs` à la suite, sans toucher aux versions de dépendances.
- `AGENTS.md`, `docs/jury/README.md`, `docs/jury/soutenance/demo-11-minutes.md` — passation et scène de jury.

---

### Task 1: Registre mémoire et contrat d'événement

**Files:**
- Create: `src/services/realtimeService.js`
- Create: `test/lot-m.cjs`

**Interfaces:**
- Consumes: identifiants numériques Prisma `Listing.id` et `Application.id`.
- Produces: `EVENT_TYPES`, `listingChannel(id)`, `applicationChannel(id)`, `subscribe(channel, callback)`, `publish(channel, event)`, `publishApplicationUpdate(application, type)`, `subscriberCount(channel)`, `_resetForTests()`.

- [x] **Step 1: Vérifier la précondition de worktree**

Run:

```powershell
git status --short
```

Expected: aucun changement non commité dans les cinq fichiers signalés par les contraintes globales. S'ils sont encore modifiés, arrêter l'exécution et demander une décision ; le plan lui-même peut rester commité.

- [x] **Step 2: Écrire le harnais et les assertions RED du service**

Créer `test/lot-m.cjs` avec l'en-tête, les helpers et cette première section :

```js
/**
 * Tests du Lot M — suivi des candidatures en temps réel par SSE.
 * Spec : docs/superpowers/specs/2026-07-16-lot-m-temps-reel-design.md
 */
'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'lotm-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';
process.env.ADRESSE_LOOKUP_DISABLED = '1';
process.env.REALTIME_HEARTBEAT_MS = '30';
process.env.REALTIME_MAX_CONNECTION_MS = '30000';

const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const realtimeService = require('../src/services/realtimeService');
const passwordUtil = require('../src/utils/password');
const mailer = require('../src/services/mailer');
const { resolveStored } = require('../src/config/storage');

const PORT = 4072;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
const createdSchoolIds = [];
const openSseRequests = new Set();

function ok(condition, label) {
  if (!condition) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function eventually(fn, tries = 50, delayMs = 10) {
  for (let i = 0; i < tries; i += 1) {
    if (await fn()) return true;
    await wait(delayMs);
  }
  return false;
}

async function main() {
  let server;
  try {
    realtimeService._resetForTests();
    server = app.listen(PORT);
    await new Promise((resolve) => server.once('listening', resolve));

    // --- 1. Registre mémoire isolé et best-effort ---
    const listingChannel = realtimeService.listingChannel(12);
    const applicationChannel = realtimeService.applicationChannel(34);
    ok(listingChannel === 'listing:12' && applicationChannel === 'application:34',
      'service : noms de canaux stables et distincts');

    const received = [];
    const unsubscribe = realtimeService.subscribe(listingChannel, (event) => received.push(event));
    realtimeService.subscribe(listingChannel, () => { throw new Error('abonne en panne'); });
    realtimeService.publish(listingChannel, { type: 'application-created', applicationId: 34 });
    ok(received.length === 1 && received[0].applicationId === 34,
      'service : un abonne en erreur ne bloque pas les autres');
    ok(realtimeService.subscriberCount(listingChannel) === 2,
      'service : compteur diagnostic des abonnes');

    unsubscribe();
    unsubscribe();
    realtimeService.publish(listingChannel, { type: 'application-created', applicationId: 35 });
    ok(received.length === 1, 'service : desabonnement idempotent et definitif');

    const byListing = [];
    const byApplication = [];
    const stopListing = realtimeService.subscribe(realtimeService.listingChannel(12), (e) => byListing.push(e));
    const stopApplication = realtimeService.subscribe(realtimeService.applicationChannel(34), (e) => byApplication.push(e));
    realtimeService.publishApplicationUpdate(
      { id: 34, listingId: 12 },
      realtimeService.EVENT_TYPES.APPLICATION_ACCEPTED
    );
    ok(byListing.length === 1 && byApplication.length === 1,
      'service : une transition met a jour les deux publics');
    ok(byListing[0].type === 'application-accepted' && byListing[0].applicationId === 34,
      'service : charge utile minimale sans donnee personnelle');

    stopListing();
    stopApplication();
    realtimeService._resetForTests();
    ok(realtimeService.subscriberCount(applicationChannel) === 0,
      'service : reset de test vide tous les canaux');

    console.log(`\n✅ Lot M tests reussis - ${passed} assertions.`);
  } finally {
    realtimeService._resetForTests();
    for (const request of openSseRequests) request.destroy();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (createdSchoolIds.length) {
      const storedApplications = await prisma.application.findMany({
        where: { listing: { schoolId: { in: createdSchoolIds } } },
        include: { contract: true },
      });
      for (const application of storedApplications) {
        const paths = [application.cvPath, application.idCardPath,
          application.licensePath, application.teachingCardPath];
        if (application.contract) {
          paths.push(application.contract.pdfPath, application.contract.signedPdfPath,
            application.contract.schoolSignaturePath, application.contract.applicantSignaturePath);
        }
        for (const relativePath of paths.filter(Boolean)) {
          const absolutePath = resolveStored(relativePath);
          if (absolutePath && fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
        }
      }
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
```

- [x] **Step 3: Exécuter le test et constater l'échec**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: FAIL avec `Cannot find module '../src/services/realtimeService'`.

- [x] **Step 4: Implémenter le service minimal complet**

Créer `src/services/realtimeService.js` :

```js
'use strict';

// Bus mémoire local au processus. Les événements ne font qu'invalider une vue :
// la base Prisma reste la source de vérité après chaque reconnexion.
const subscribers = new Map();

const EVENT_TYPES = Object.freeze({
  APPLICATION_CREATED: 'application-created',
  APPLICATION_ACCEPTED: 'application-accepted',
  APPLICATION_REJECTED: 'application-rejected',
  CONTRACT_SENT: 'contract-sent',
  CONTRACT_SIGNED: 'contract-signed',
});
const ALLOWED_TYPES = new Set(Object.values(EVENT_TYPES));

function positiveId(id) {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new TypeError('Identifiant temps reel invalide.');
  return parsed;
}

function listingChannel(id) {
  return `listing:${positiveId(id)}`;
}

function applicationChannel(id) {
  return `application:${positiveId(id)}`;
}

function subscribe(channel, callback) {
  if (typeof channel !== 'string' || typeof callback !== 'function') {
    throw new TypeError('Abonnement temps reel invalide.');
  }
  let channelSubscribers = subscribers.get(channel);
  if (!channelSubscribers) {
    channelSubscribers = new Set();
    subscribers.set(channel, channelSubscribers);
  }
  channelSubscribers.add(callback);
  let active = true;
  return function unsubscribe() {
    if (!active) return;
    active = false;
    channelSubscribers.delete(callback);
    if (channelSubscribers.size === 0) subscribers.delete(channel);
  };
}

function publish(channel, event) {
  const channelSubscribers = subscribers.get(channel);
  if (!channelSubscribers) return;
  for (const callback of [...channelSubscribers]) {
    try {
      callback(event);
    } catch {
      // Un navigateur parti entre deux écritures ne doit affecter ni les autres
      // abonnés ni l'action métier déjà validée en base.
    }
  }
}

function publishApplicationUpdate(application, type) {
  if (!application || !ALLOWED_TYPES.has(type)) return;
  const applicationId = positiveId(application.id);
  const listingId = positiveId(application.listingId);
  const event = { type, applicationId };
  publish(listingChannel(listingId), event);
  publish(applicationChannel(applicationId), event);
}

function subscriberCount(channel) {
  const channelSubscribers = subscribers.get(channel);
  return channelSubscribers ? channelSubscribers.size : 0;
}

function resetForTests() {
  subscribers.clear();
}

module.exports = {
  EVENT_TYPES,
  listingChannel,
  applicationChannel,
  subscribe,
  publish,
  publishApplicationUpdate,
  subscriberCount,
  _resetForTests: resetForTests,
};
```

- [x] **Step 5: Exécuter le test du lot**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: sortie 0 et toutes les assertions de la section « Registre mémoire » vertes.

- [x] **Step 6: Commit ciblé**

```powershell
git add -- src/services/realtimeService.js test/lot-m.cjs
git commit -m "M: ajouter le registre temps reel en memoire"
```

---

### Task 2: Authentification HTTP et cycle de vie SSE école

**Files:**
- Create: `src/middlewares/realtimeAuthResponse.js`
- Create: `src/controllers/realtimeController.js`
- Modify: `src/middlewares/requireAuth.js:1-12`
- Modify: `src/middlewares/loadSchool.js:1-25`
- Modify: `src/routes/manageRoutes.js:18-24`
- Test: `test/lot-m.cjs`

**Interfaces:**
- Consumes: `realtimeService.listingChannel(id)`, `subscribe`, `listingService.findOwnedById(schoolId, id)`, `req.school` fourni par `loadSchool`.
- Produces: `realtimeAuthResponse.respond(req, res): boolean`, `realtimeController.openStream(req, res, channel)`, `realtimeController.schoolStream(req, res, next)`.

- [x] **Step 1: Ajouter les helpers HTTP/SSE au harnais**

Ajouter avant `main()` dans `test/lot-m.cjs` :

```js
function makeJar() { return { cookie: '' }; }

function storeCookies(jar, res) {
  const values = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const value of values) jar.cookie = value.split(';')[0];
}

async function req(jar, method, urlPath, { body, headers = {} } = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    redirect: 'manual',
    headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...headers },
    body,
  });
  storeCookies(jar, res);
  return {
    status: res.status,
    location: res.headers.get('location'),
    headers: res.headers,
    text: await res.text(),
  };
}

function csrfFrom(html) {
  const match = html.match(/name="csrf-token" content="([^"]+)"/);
  if (!match) throw new Error('Jeton CSRF introuvable.');
  return match[1];
}

function form(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) params.append(key, value);
  return { body: params.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } };
}

function openSse(jar, urlPath) {
  return new Promise((resolve, reject) => {
    const request = http.get(BASE + urlPath, {
      headers: {
        accept: 'text/event-stream',
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
    });
    openSseRequests.add(request);
    request.on('response', (response) => {
      response.once('close', () => openSseRequests.delete(request));
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('error', reject);
      const ready = async () => {
        if (response.statusCode !== 200 || await eventually(() => body.includes(': connexion'))) {
          resolve({ request, response, body: () => body });
        } else {
          reject(new Error('Flux SSE ouvert sans trame de connexion.'));
        }
      };
      ready().catch(reject);
    });
    request.on('error', reject);
  });
}
```

- [x] **Step 2: Écrire les assertions RED HTTP et nettoyage**

Dans `main()`, après la section service, créer une école et une annonce puis ajouter :

```js
    // --- 2. Garde école et transport SSE ---
    const school = await prisma.school.create({
      data: {
        email: `m.school.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'M Ecole',
        siret: `6${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(school.id);
    const listing = await prisma.listing.create({
      data: {
        title: `Lot M annonce ${STAMP}`,
        description: 'Annonce de test temps reel',
        city: 'Marseille',
        department: '13',
        schoolId: school.id,
        titleLower: `lot m annonce ${STAMP}`,
        descriptionLower: 'annonce de test temps reel',
        cityLower: 'marseille',
      },
    });

    let r = await req(makeJar(), 'GET', `/mes-annonces/${listing.id}/candidatures/temps-reel`, {
      headers: { accept: 'text/event-stream' },
    });
    ok(r.status === 204, 'auth : flux ecole sans session -> 204 sans reconnexion');

    r = await req(makeJar(), 'GET', `/mes-annonces/${listing.id}/candidatures/999/carte`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 401, 'auth : fragment ecole sans session -> 401');

    r = await req(makeJar(), 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(r.status === 302 && r.location === '/connexion',
      'auth : navigation HTML sans session conserve la redirection');

    const staleSchool = await prisma.school.create({
      data: {
        email: `m.stale.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'M Ecole supprimee',
        siret: `4${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    const staleJar = makeJar();
    r = await req(staleJar, 'GET', '/connexion');
    r = await req(staleJar, 'POST', '/connexion', form({
      _csrf: csrfFrom(r.text), email: staleSchool.email, password: 'motdepasse123',
    }));
    await prisma.school.delete({ where: { id: staleSchool.id } });
    r = await req(staleJar, 'GET', '/mes-annonces/999/candidatures/temps-reel', {
      headers: { accept: 'text/event-stream' },
    });
    ok(r.status === 204, 'auth : ecole supprimee en session -> flux 204 apres destruction');

    const schoolJar = makeJar();
    r = await req(schoolJar, 'GET', '/connexion');
    r = await req(schoolJar, 'POST', '/connexion', form({
      _csrf: csrfFrom(r.text), email: school.email, password: 'motdepasse123',
    }));
    ok(r.status === 302, 'auth : connexion ecole pour le flux');

    const stream = await openSse(schoolJar, `/mes-annonces/${listing.id}/candidatures/temps-reel`);
    const channel = realtimeService.listingChannel(listing.id);
    ok(stream.response.headers['content-type'].startsWith('text/event-stream')
      && stream.response.headers['cache-control'] === 'no-store'
      && stream.response.headers['x-accel-buffering'] === 'no',
    'sse : en-tetes anti-cache et anti-buffering');
    ok(stream.body().includes('retry: 5000') && realtimeService.subscriberCount(channel) === 1,
      'sse : delai de reconnexion et abonnement actif');
    ok(await eventually(() => stream.body().includes(': heartbeat')),
      'sse : heartbeat emis pendant la connexion');

    stream.request.destroy();
    ok(await eventually(() => realtimeService.subscriberCount(channel) === 0),
      'sse : coupure cliente libere l abonnement');
    realtimeService.publish(channel, { type: 'application-created', applicationId: 999 });
    ok(realtimeService.subscriberCount(channel) === 0,
      'sse : publication apres close ne ressuscite pas le callback');

    const previousMaxConnection = process.env.REALTIME_MAX_CONNECTION_MS;
    process.env.REALTIME_MAX_CONNECTION_MS = '140';
    try {
      const timedStream = await openSse(schoolJar, `/mes-annonces/${listing.id}/candidatures/temps-reel`);
      ok(await eventually(() => timedStream.response.complete, 50, 10)
        && realtimeService.subscriberCount(channel) === 0,
      'sse : duree maximale de test ferme et nettoie le flux');
    } finally {
      process.env.REALTIME_MAX_CONNECTION_MS = previousMaxConnection;
    }
```

- [x] **Step 3: Exécuter et observer l'échec de route**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: FAIL, la requête SSE authentifiée obtient 404 ou la première assertion 204 obtient encore la redirection actuelle.

- [x] **Step 4: Créer la réponse d'authentification spécialisée**

Créer `src/middlewares/realtimeAuthResponse.js` :

```js
'use strict';

function isSse(req) {
  return String(req.get('accept') || '').toLowerCase().includes('text/event-stream');
}

function isFragment(req) {
  return req.get('x-realtime-fragment') === '1';
}

function respond(req, res) {
  if (isSse(req)) {
    res.status(204).end();
    return true;
  }
  if (isFragment(req)) {
    res.status(401).end();
    return true;
  }
  return false;
}

module.exports = { isSse, isFragment, respond };
```

Modifier `requireAuth.js` :

```js
const realtimeAuthResponse = require('./realtimeAuthResponse');

module.exports = function requireAuth(req, res, next) {
  if (!req.session || !req.session.schoolId) {
    if (realtimeAuthResponse.respond(req, res)) return;
    req.flash('error', 'Veuillez vous connecter pour accéder à cette page.');
    return res.redirect('/connexion');
  }
  next();
};
```

Modifier `loadSchool.js` en factorisant la destruction :

```js
const schoolService = require('../services/schoolService');
const realtimeAuthResponse = require('./realtimeAuthResponse');

function destroyInvalidSchoolSession(req, res) {
  return req.session.destroy(() => {
    if (!realtimeAuthResponse.respond(req, res)) res.redirect('/connexion');
  });
}

module.exports = async function loadSchool(req, res, next) {
  try {
    const school = await schoolService.findById(req.session.schoolId);
    if (!school || school.suspended) return destroyInvalidSchoolSession(req, res);
    req.school = school;
    res.locals.currentSchool = school;
    next();
  } catch (err) {
    next(err);
  }
};
```

- [x] **Step 5: Créer le transport SSE et la route école**

Créer `src/controllers/realtimeController.js` :

```js
'use strict';

const listingService = require('../services/listingService');
const realtimeService = require('../services/realtimeService');
const { parseId, notFound } = require('../utils/http');

function duration(name, fallback) {
  if (process.env.NODE_ENV !== 'test') return fallback;
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function openStream(req, res, channel) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n: connexion\n\n');

  const unsubscribe = realtimeService.subscribe(channel, (event) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: invalidate\ndata: ${JSON.stringify(event)}\n\n`);
    }
  });
  let cleaned = false;
  let heartbeat;
  let lifetime;

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    unsubscribe();
  }

  res.once('close', cleanup);
  heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': heartbeat\n\n');
  }, duration('REALTIME_HEARTBEAT_MS', 25_000));
  lifetime = setTimeout(() => {
    cleanup();
    if (!res.writableEnded && !res.destroyed) res.end();
  }, duration('REALTIME_MAX_CONNECTION_MS', 300_000));
  if (heartbeat.unref) heartbeat.unref();
  if (lifetime.unref) lifetime.unref();
}

async function schoolStream(req, res, next) {
  try {
    const listingId = parseId(req.params.id);
    if (!listingId) return notFound(res);
    const listing = await listingService.findOwnedById(req.school.id, listingId);
    if (!listing) return notFound(res);
    openStream(req, res, realtimeService.listingChannel(listingId));
  } catch (err) {
    next(err);
  }
}

module.exports = { openStream, schoolStream };
```

Dans `manageRoutes.js`, utiliser le paramètre existant `:id` et placer la route juste après la liste :

```js
const realtimeController = require('../controllers/realtimeController');

router.get('/:id/candidatures', applicationController.forListing);
router.get('/:id/candidatures/temps-reel', realtimeController.schoolStream);
```

- [x] **Step 6: Rejouer les tests ciblés puis les gardes existantes**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
& "C:\nvm4w\nodejs\node.exe" test/ameliorations-v2.cjs
```

Expected: deux sorties 0 ; le Lot M prouve heartbeat/close/204, et les redirections/cloisonnements existants restent verts.

- [x] **Step 7: Commit ciblé**

```powershell
git add -- src/middlewares/realtimeAuthResponse.js src/middlewares/requireAuth.js src/middlewares/loadSchool.js src/controllers/realtimeController.js src/routes/manageRoutes.js test/lot-m.cjs
git commit -m "M: securiser et borner les flux SSE ecole"
```

---

### Task 3: Autorisation candidat et fragment de suivi

**Files:**
- Create: `views/tracking/_status.twig`
- Modify: `src/services/applicationService.js:65-80`
- Modify: `src/controllers/trackingController.js:1-25`
- Modify: `src/controllers/realtimeController.js`
- Modify: `src/routes/trackingRoutes.js:20-35`
- Modify: `views/tracking/show.twig`
- Test: `test/lot-m.cjs`

**Interfaces:**
- Consumes: `req.session.realtimeApplicationIds: number[]`, `applicationService.findByIdForTracking(id)`.
- Produces: `bindRealtimeApplication(req, id): Promise<void>`, `candidateStream`, `candidateFragment`, partial racine `[data-tracking-status]`.

- [x] **Step 1: Écrire les assertions RED candidat**

Ajouter après la section SSE école :

```js
    // --- 3. Autorisation candidat liée à la session ---
    const applications = [];
    for (let i = 0; i < 6; i += 1) {
      applications.push(await prisma.application.create({
        data: {
          listingId: listing.id,
          applicantName: `Candidat M ${i}`,
          applicantEmail: `m.candidat.${STAMP}.${i}@example.test`,
          message: 'Candidature de test temps reel',
          trackingToken: `${String(i)}${String(STAMP).padStart(63, 'a')}`.slice(0, 64),
        },
      }));
    }

    const candidateJar = makeJar();
    r = await req(candidateJar, 'GET', `/suivi/${applications[0].trackingToken}`);
    ok(r.status === 200
      && r.text.includes(`/suivi/temps-reel/${applications[0].id}`)
      && r.text.includes(`/suivi/fragment/${applications[0].id}`)
      && !r.text.includes(`/suivi/temps-reel/${applications[0].trackingToken}`),
    'candidat : page lie la session avec des URLs temps reel sans jeton');

    r = await req(candidateJar, 'GET', `/suivi/fragment/${applications[0].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 200 && r.text.includes('En attente'),
      'candidat : fragment autorise rendu depuis la base');

    r = await req(makeJar(), 'GET', `/suivi/fragment/${applications[0].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 401, 'candidat : fragment sans liaison de session -> 401');

    r = await req(makeJar(), 'GET', `/suivi/temps-reel/${applications[0].id}`, {
      headers: { accept: 'text/event-stream' },
    });
    ok(r.status === 204, 'candidat : flux sans liaison de session -> 204');

    for (const application of applications.slice(1)) {
      r = await req(candidateJar, 'GET', `/suivi/${application.trackingToken}`);
      ok(r.status === 200, `candidat : ouverture du suivi ${application.id}`);
    }
    r = await req(candidateJar, 'GET', `/suivi/fragment/${applications[0].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 401, 'candidat : la sixieme liaison evince la plus ancienne');
    r = await req(candidateJar, 'GET', `/suivi/fragment/${applications[5].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 200, 'candidat : la liaison la plus recente reste autorisee');
```

Ajouter le helper de suppression précise de session :

```js
function sidFromJar(jar) {
  const encoded = String(jar.cookie || '').split('=')[1] || '';
  const signed = decodeURIComponent(encoded);
  return signed.startsWith('s:') ? signed.slice(2).split('.')[0] : null;
}
```

Puis tester l'expiration :

```js
    const expiredSid = sidFromJar(candidateJar);
    ok(Boolean(expiredSid), 'candidat : identifiant de session de test extrait');
    await prisma.session.deleteMany({ where: { sid: expiredSid } });
    r = await req(candidateJar, 'GET', `/suivi/fragment/${applications[5].id}`, {
      headers: { 'x-realtime-fragment': '1' },
    });
    ok(r.status === 401, 'candidat : session expiree -> fragment 401');
    r = await req(candidateJar, 'GET', `/suivi/temps-reel/${applications[5].id}`, {
      headers: { accept: 'text/event-stream' },
    });
    ok(r.status === 204, 'candidat : session expiree -> flux terminal 204');
```

- [x] **Step 2: Exécuter et observer l'échec**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: FAIL, la page de suivi ne contient pas les URLs temps réel ou les nouvelles routes renvoient 404.

- [x] **Step 3: Ajouter la lecture Prisma autorisée par identifiant**

Dans `applicationService.js`, ajouter sans toucher à `ensureTrackingToken` déjà présent :

```js
function findByIdForTracking(applicationId) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: { listing: { include: { school: true } }, contract: true },
  });
}
```

Exporter la fonction sans retirer le correctif `ensureTrackingToken` :

```js
module.exports = {
  createForListing,
  findForOwnedListing,
  findOwnedById,
  updateStatus,
  ensureTrackingToken,
  findByTrackingToken,
  findByIdForTracking,
};
```

- [x] **Step 4: Lier et sauvegarder les cinq identifiants récents**

Remplacer `trackingController.js` par :

```js
// Page de suivi publique accessible par jeton. Après validation, seul l'identifiant
// est conservé en session pour les lectures temps réel suivantes.
const applicationService = require('../services/applicationService');
const { notFound } = require('../utils/http');

const MAX_REALTIME_APPLICATIONS = 5;

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

async function bindRealtimeApplication(req, applicationId) {
  const previous = Array.isArray(req.session.realtimeApplicationIds)
    ? req.session.realtimeApplicationIds.filter((id) => Number.isInteger(id) && id > 0 && id !== applicationId)
    : [];
  previous.push(applicationId);
  req.session.realtimeApplicationIds = previous.slice(-MAX_REALTIME_APPLICATIONS);
  await saveSession(req);
}

async function show(req, res, next) {
  try {
    const token = req.params.token;
    if (!token) return notFound(res);
    const application = await applicationService.findByTrackingToken(token);
    if (!application) return notFound(res);
    await bindRealtimeApplication(req, application.id);
    res.render('tracking/show', { title: 'Suivi de candidature', application });
  } catch (err) {
    next(err);
  }
}

module.exports = { show, bindRealtimeApplication };
```

- [x] **Step 5: Extraire le partial candidat**

Créer `views/tracking/_status.twig` en déplaçant sans reformuler le bloc de statut actuel :

```twig
<section data-tracking-status>
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
    {% if application.contract and application.contract.applicantSignedAt %}
      <p><span class="badge badge-available">✍️ Contrat signé le {{ application.contract.applicantSignedAt|date('d/m/Y à H:i') }}</span></p>
      <p><a class="btn btn-primary" href="/suivi/{{ application.trackingToken }}/contrat">Télécharger le contrat signé (PDF)</a></p>
      {% if application.contract.signedPdfHash %}
        <p class="fine-print">Empreinte SHA-256 du document final : {{ application.contract.signedPdfHash }}</p>
      {% endif %}
    {% elseif application.contract and application.contract.sentToApplicantAt %}
      <p>Votre candidature a été acceptée : votre contrat est prêt et n'attend plus que votre signature.</p>
      <p>
        <a class="btn" href="/suivi/{{ application.trackingToken }}/contrat">Lire le contrat (PDF)</a>
        <a class="btn btn-primary" href="/suivi/{{ application.trackingToken }}/signer">Signer le contrat</a>
      </p>
      <p class="muted">Contrat transmis le {{ application.contract.sentToApplicantAt|date('d/m/Y à H:i') }}.</p>
    {% else %}
      <p>Votre candidature a été acceptée. L'auto-école prépare votre contrat.</p>
    {% endif %}
  {% elseif application.status == 'rejected' %}
    <p>Votre candidature n'a pas été retenue cette fois-ci. Merci de l'intérêt porté à cette auto-école.</p>
  {% else %}
    <p>Votre candidature est en cours d'examen par l'auto-école.</p>
  {% endif %}
</section>
```

Réduire `views/tracking/show.twig` au contenu fixe et aux données de connexion ; le partial d'indicateur sera créé à la Tâche 4 :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <div class="page-header"><h1>Suivi de votre candidature</h1></div>
  <p class="muted">
    Annonce : <strong>{{ application.listing.title }}</strong>
    — {{ application.listing.school.businessName }}
  </p>
  <p class="muted">Candidature déposée le {{ application.createdAt|date('d/m/Y') }}</p>

  <div data-realtime-context
       data-realtime-mode="candidate"
       data-realtime-stream-url="/suivi/temps-reel/{{ application.id }}"
       data-realtime-snapshot-url="/suivi/fragment/{{ application.id }}">
    {% include 'tracking/_status.twig' %}
  </div>
{% endblock %}
```

- [x] **Step 6: Ajouter les endpoints candidat avant `/:token`**

Étendre `realtimeController.js` :

```js
const applicationService = require('../services/applicationService');

function candidateIsAuthorized(req, applicationId) {
  return Boolean(req.session && Array.isArray(req.session.realtimeApplicationIds)
    && req.session.realtimeApplicationIds.includes(applicationId));
}

async function candidateStream(req, res, next) {
  try {
    const applicationId = parseId(req.params.applicationId);
    if (!applicationId || !candidateIsAuthorized(req, applicationId)) return res.status(204).end();
    const application = await applicationService.findByIdForTracking(applicationId);
    if (!application) return notFound(res);
    openStream(req, res, realtimeService.applicationChannel(applicationId));
  } catch (err) {
    next(err);
  }
}

async function candidateFragment(req, res, next) {
  try {
    const applicationId = parseId(req.params.applicationId);
    if (!applicationId || !candidateIsAuthorized(req, applicationId)) return res.status(401).end();
    const application = await applicationService.findByIdForTracking(applicationId);
    if (!application) return notFound(res);
    res.render('tracking/_status', { application });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  openStream,
  schoolStream,
  candidateStream,
  candidateFragment,
};
```

Dans `trackingRoutes.js`, importer le contrôleur puis déclarer les routes avant `router.get('/:token', trackingController.show)` :

```js
const realtimeController = require('../controllers/realtimeController');

router.get('/temps-reel/:applicationId', realtimeController.candidateStream);
router.get('/fragment/:applicationId', realtimeController.candidateFragment);
router.get('/:token', trackingController.show);
```

- [x] **Step 7: Rejouer les tests Lot M et Lot B/G**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
& "C:\nvm4w\nodejs\node.exe" test/lot-b.cjs
& "C:\nvm4w\nodejs\node.exe" test/lot-g.cjs
```

Expected: trois sorties 0 ; le suivi opaque et la signature existante ne régressent pas.

- [x] **Step 8: Commit ciblé**

```powershell
git add -- src/services/applicationService.js src/controllers/trackingController.js src/controllers/realtimeController.js src/routes/trackingRoutes.js views/tracking/show.twig views/tracking/_status.twig test/lot-m.cjs
git commit -m "M: autoriser le suivi candidat temps reel par session"
```

---

### Task 4: Partials école et indicateur accessible commun

**Files:**
- Create: `views/partials/realtime-status.twig`
- Create: `views/dashboard/_application-card.twig`
- Modify: `views/dashboard/applications.twig`
- Modify: `views/tracking/show.twig`
- Modify: `src/controllers/realtimeController.js`
- Modify: `src/routes/manageRoutes.js`
- Test: `test/lot-m.cjs`

**Interfaces:**
- Consumes: `applicationService.findOwnedById(schoolId, applicationId)` et `pagination.page` du contrôleur existant.
- Produces: `schoolCard(req, res, next)`, racines `[data-application-card]`, `[data-application-region]`, `[data-realtime-status]`, contexte école avec `data-realtime-snapshot-url` et `data-realtime-card-url-template`.

- [x] **Step 1: Écrire les assertions RED de rendu et d'isolation**

Ajouter dans `test/lot-m.cjs` :

```js
    // --- 4. Partials et contexte école ---
    r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(r.status === 200
      && r.text.includes('data-realtime-context')
      && r.text.includes(`data-realtime-stream-url="/mes-annonces/${listing.id}/candidatures/temps-reel"`)
      && r.text.includes(`data-realtime-snapshot-url="/mes-annonces/${listing.id}/candidatures?page=1"`)
      && r.text.includes('role="status"')
      && r.text.includes('aria-live="polite"'),
    'vues : page ecole expose le contexte et l indicateur accessible');

    const displayedApplication = applications[5];
    r = await req(schoolJar, 'GET',
      `/mes-annonces/${listing.id}/candidatures/${displayedApplication.id}/carte`,
      { headers: { 'x-realtime-fragment': '1' } });
    ok(r.status === 200
      && r.text.includes(`data-application-card="${displayedApplication.id}"`)
      && r.text.includes(displayedApplication.applicantName),
    'vues : fragment carte rendu pour l ecole proprietaire');

    const otherSchool = await prisma.school.create({
      data: {
        email: `m.other.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'M Autre Ecole',
        siret: `5${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(otherSchool.id);
    const otherJar = makeJar();
    r = await req(otherJar, 'GET', '/connexion');
    r = await req(otherJar, 'POST', '/connexion', form({
      _csrf: csrfFrom(r.text), email: otherSchool.email, password: 'motdepasse123',
    }));
    r = await req(otherJar, 'GET',
      `/mes-annonces/${listing.id}/candidatures/${displayedApplication.id}/carte`,
      { headers: { 'x-realtime-fragment': '1' } });
    ok(r.status === 404, 'vues : fragment carte d une autre ecole -> 404');
    r = await req(otherJar, 'GET',
      `/mes-annonces/${listing.id}/candidatures/temps-reel`,
      { headers: { accept: 'text/event-stream' } });
    ok(r.status === 404, 'sse : flux d une annonce appartenant a une autre ecole -> 404');

    const secondListing = await prisma.listing.create({
      data: {
        title: `Lot M autre annonce ${STAMP}`,
        description: 'Autre annonce de la meme ecole',
        city: 'Marseille', department: '13', schoolId: school.id,
        titleLower: `lot m autre annonce ${STAMP}`,
        descriptionLower: 'autre annonce de la meme ecole', cityLower: 'marseille',
      },
    });
    r = await req(schoolJar, 'GET',
      `/mes-annonces/${secondListing.id}/candidatures/${displayedApplication.id}/carte`,
      { headers: { 'x-realtime-fragment': '1' } });
    ok(r.status === 404, 'vues : candidature et annonce incoherentes -> 404');

    r = await req(makeJar(), 'GET', `/suivi/${displayedApplication.trackingToken}`);
    ok(r.text.includes('data-realtime-status')
      && r.text.includes('Reconnexion en cours')
      && r.text.includes('/js/realtime.js') === false,
    'vues : suivi contient l indicateur mais le script sera branche en Tache 6');
```

- [x] **Step 2: Exécuter et observer l'échec**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: FAIL, absence de `data-realtime-context`, de l'indicateur ou route carte en 404.

- [x] **Step 3: Créer le partial d'état accessible**

Créer `views/partials/realtime-status.twig` :

```twig
<div class="realtime-status" data-realtime-status data-state="connecting"
     role="status" aria-live="polite" aria-atomic="true" hidden>
  <span class="realtime-status-dot" aria-hidden="true"></span>
  <span data-realtime-status-text>Reconnexion en cours</span>
</div>
<p class="visually-hidden" data-realtime-announcement
   aria-live="polite" aria-atomic="true"></p>
<p class="realtime-update" data-realtime-update hidden>
  Une mise à jour est disponible.
  <a href="{{ realtimeReloadUrl }}">Actualiser la page</a>
</p>
```

Le texte « Actualisation en direct » sera posé par JavaScript à l'ouverture ; l'assertion comportementale correspondante sera ajoutée à la Tâche 6.

- [x] **Step 4: Extraire la carte école sans duplication**

Créer `views/dashboard/_application-card.twig` :

```twig
{% set base = '/mes-annonces/' ~ listing.id ~ '/candidatures/' ~ application.id %}
<li id="application-{{ application.id }}" class="application-card"
    data-application-card="{{ application.id }}">
  <div class="application-head">
    <h2>{{ application.applicantName }}</h2>
    {% if application.status == 'accepted' %}
      <span class="badge badge-available">Acceptée</span>
    {% elseif application.status == 'rejected' %}
      <span class="badge badge-rejected">Refusée</span>
    {% else %}
      <span class="badge badge-pending">En attente</span>
    {% endif %}
  </div>

  <p class="muted">
    {{ application.applicantEmail }}
    {% if application.applicantPhone %} · {{ application.applicantPhone }}{% endif %}
    · reçue le {{ application.createdAt|date('d/m/Y à H:i') }}
  </p>
  <div class="application-message">{{ application.message }}</div>

  <div class="application-actions">
    <a href="{{ base }}/cv" class="btn btn-small">CV</a>
    <a href="{{ base }}/piece-identite" class="btn btn-small">Pièce d'identité</a>
    <a href="{{ base }}/permis" class="btn btn-small">Permis</a>
    <a href="{{ base }}/carte-enseignant" class="btn btn-small">Carte d'enseignant</a>
    {% if application.status != 'accepted' %}
      <a href="{{ base }}/accepter" class="btn btn-small btn-primary">Accepter</a>
    {% endif %}
    {% if application.status == 'pending' %}
      <form action="{{ base }}/refuser" method="post" class="inline-form"
            data-confirm="Refuser cette candidature ?">
        <input type="hidden" name="_csrf" value="{{ csrfToken }}">
        <button type="submit" class="btn btn-small btn-danger">Refuser</button>
      </form>
    {% endif %}
  </div>

  {% if application.status == 'accepted' and application.contract %}
    <div class="application-actions section">
      {% if application.contract.applicantSignedAt %}
        <span class="badge badge-available">✍️ Contrat signé le {{ application.contract.applicantSignedAt|date('d/m/Y à H:i') }}</span>
        <a href="{{ base }}/contrat/telecharger-signe" class="btn btn-small btn-primary">Télécharger le contrat signé</a>
      {% else %}
        <a href="{{ base }}/contrat/telecharger" class="btn btn-small btn-primary">Télécharger le contrat</a>
        <a href="{{ base }}/accepter" class="btn btn-small">Modifier le contrat</a>
        <form action="{{ base }}/contrat/envoyer" method="post" class="inline-form">
          <input type="hidden" name="_csrf" value="{{ csrfToken }}">
          <button type="submit" class="btn btn-small">Envoyer pour signature</button>
        </form>
        {% if application.contract.sentToApplicantAt %}
          <span class="muted">Invitation envoyée le {{ application.contract.sentToApplicantAt|date('d/m/Y à H:i') }} — en attente de signature du candidat</span>
        {% endif %}
      {% endif %}
    </div>
  {% endif %}
</li>
```

- [x] **Step 5: Réécrire la vue liste autour d'une région remplaçable**

Remplacer le corps de `views/dashboard/applications.twig` par :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <div class="page-header">
    <h1>Candidatures{% if listing %} — {{ listing.title }}{% endif %}</h1>
    <a href="/mes-annonces" class="btn">Retour</a>
  </div>

  <section data-realtime-context
           data-realtime-mode="school"
           data-realtime-page="{{ pagination.page }}"
           data-realtime-stream-url="/mes-annonces/{{ listing.id }}/candidatures/temps-reel"
           data-realtime-snapshot-url="/mes-annonces/{{ listing.id }}/candidatures?page={{ pagination.page }}"
           data-realtime-card-url-template="/mes-annonces/{{ listing.id }}/candidatures/__APPLICATION_ID__/carte">
    {% include 'partials/realtime-status.twig' with {
      realtimeReloadUrl: '/mes-annonces/' ~ listing.id ~ '/candidatures?page=' ~ pagination.page
    } %}

    <div data-application-region>
      {% if applications|length == 0 %}
        <p class="muted" data-application-empty>Aucune candidature pour cette annonce.</p>
      {% endif %}
      <ul class="application-list" data-application-list>
        {% for application in applications %}
          {% include 'dashboard/_application-card.twig' with {
            application: application,
            listing: listing
          } %}
        {% endfor %}
      </ul>
      {% include 'partials/pagination.twig' %}
    </div>
  </section>
{% endblock %}
```

Dans `views/tracking/show.twig`, inclure le même indicateur juste avant `_status.twig` :

```twig
    {% include 'partials/realtime-status.twig' with {
      realtimeReloadUrl: '/suivi/' ~ application.trackingToken
    } %}
    {% include 'tracking/_status.twig' %}
```

- [x] **Step 6: Ajouter le fragment carte et sa route `:id`**

Dans `realtimeController.js` :

```js
async function schoolCard(req, res, next) {
  try {
    const listingId = parseId(req.params.id);
    const applicationId = parseId(req.params.applicationId);
    if (!listingId || !applicationId) return notFound(res);
    const application = await applicationService.findOwnedById(req.school.id, applicationId);
    if (!application || application.listingId !== listingId) return notFound(res);
    res.render('dashboard/_application-card', {
      application,
      listing: application.listing,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  openStream,
  schoolStream,
  candidateStream,
  candidateFragment,
  schoolCard,
};
```

Dans `manageRoutes.js`, placer cette route avant les routes de fichiers :

```js
router.get('/:id/candidatures/:applicationId/carte', realtimeController.schoolCard);
router.get('/:id/candidatures/:appId/cv', applicationController.downloadCv);
```

- [x] **Step 7: Rejouer Lot M et les vues historiques**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
& "C:\nvm4w\nodejs\node.exe" test/smoke.cjs
& "C:\nvm4w\nodejs\node.exe" test/lot-g.cjs
```

Expected: trois sorties 0 ; cartes, contrats et formulaires CSRF restent présents.

- [x] **Step 8: Commit ciblé**

```powershell
git add -- views/partials/realtime-status.twig views/dashboard/_application-card.twig views/dashboard/applications.twig views/tracking/show.twig src/controllers/realtimeController.js src/routes/manageRoutes.js test/lot-m.cjs
git commit -m "M: extraire les fragments candidat et ecole"
```

---

### Task 5: Publications après les transitions métier

**Files:**
- Modify: `src/controllers/applicationController.js:65-90`
- Modify: `src/controllers/contractController.js:35-65,145-210,236-270`
- Modify: `src/controllers/signatureController.js:70-125`
- Test: `test/lot-m.cjs`

**Interfaces:**
- Consumes: `realtimeService.publishApplicationUpdate(application, realtimeService.EVENT_TYPES.*)`.
- Produces: événements `application-created`, `application-accepted`, `application-rejected`, `contract-sent`, `contract-signed`, toujours après la mutation Prisma correspondante.

- [x] **Step 1: Ajouter les fixtures binaires et formulaires au test**

Ajouter avant `main()` :

```js
const PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF\n');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SIGNATURE_PNG = `data:image/png;base64,${PNG_B64}`;

function applicationForm(csrf, suffix) {
  const data = new FormData();
  data.append('_csrf', csrf);
  data.append('applicantName', `Direct M ${suffix}`);
  data.append('applicantEmail', `direct.m.${STAMP}.${suffix}@example.test`);
  data.append('applicantPhone', '0611223344');
  data.append('message', 'Candidature envoyee pendant le test temps reel.');
  data.append('cv', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'cv.pdf');
  data.append('idCard', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'identite.pdf');
  data.append('license', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'permis.pdf');
  data.append('teachingCard', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'carte.pdf');
  return data;
}

function contractValues(csrf) {
  return {
    _csrf: csrf,
    type: 'cdi',
    startDate: '2026-11-02',
    grossSalary: '2300 € brut/mois',
    weeklyHours: '35',
    workplace: 'Marseille',
    schoolAddress: '45 avenue du Prado, Marseille',
    applicantAddress: '18 rue Paradis, Marseille',
    signatureData: SIGNATURE_PNG,
  };
}
```

Ajouter un helper d'attente sur le corps SSE :

```js
async function waitForSse(stream, type) {
  return eventually(() => stream.body().includes(`"type":"${type}"`), 80, 10);
}
```

- [x] **Step 2: Écrire le scénario RED de bout en bout**

Ajouter dans `main()` en conservant `schoolJar` et `listing` :

```js
    // --- 5. Publications après les écritures métier ---
    const schoolEvents = await openSse(schoolJar, `/mes-annonces/${listing.id}/candidatures/temps-reel`);
    const publicJar = makeJar();
    r = await req(publicJar, 'GET', `/annonces/${listing.id}`);
    const beforeCreate = await prisma.application.count({
      where: { listingId: listing.id, applicantEmail: { contains: `direct.m.${STAMP}` } },
    });
    r = await req(publicJar, 'POST', `/annonces/${listing.id}/postuler`, {
      body: applicationForm(csrfFrom(r.text), 'workflow'),
    });
    ok(r.status === 302 && await waitForSse(schoolEvents, 'application-created'),
      'evenements : depot persiste puis notifie l ecole');
    const liveApplication = await prisma.application.findFirst({
      where: { listingId: listing.id, applicantEmail: `direct.m.${STAMP}.workflow@example.test` },
      include: { contract: true },
    });
    ok(beforeCreate === 0 && liveApplication && liveApplication.trackingToken,
      'evenements : candidature existe avec son jeton avant consommation du signal');

    const liveCandidateJar = makeJar();
    r = await req(liveCandidateJar, 'GET', `/suivi/${liveApplication.trackingToken}`);
    const candidateEvents = await openSse(liveCandidateJar, `/suivi/temps-reel/${liveApplication.id}`);

    r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures/${liveApplication.id}/accepter`);
    r = await req(schoolJar, 'POST', `/mes-annonces/${listing.id}/candidatures/${liveApplication.id}/accepter`,
      form(contractValues(csrfFrom(r.text))));
    ok(r.status === 302 && await waitForSse(candidateEvents, 'application-accepted'),
      'evenements : acceptation et contrat persistes puis candidat notifie');
    let liveContract = await prisma.contract.findUnique({ where: { applicationId: liveApplication.id } });
    ok(liveContract && liveContract.schoolSignedAt,
      'evenements : signal accepte correspond a un contrat en base');

    const originalInvitation = mailer.sendSignatureInvitation;
    mailer.sendSignatureInvitation = async () => true;
    try {
      r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
      r = await req(schoolJar, 'POST',
        `/mes-annonces/${listing.id}/candidatures/${liveApplication.id}/contrat/envoyer`,
        form({ _csrf: csrfFrom(r.text) }));
      ok(r.status === 302 && await waitForSse(candidateEvents, 'contract-sent'),
        'evenements : invitation reussie notifie le candidat');
      liveContract = await prisma.contract.findUnique({ where: { applicationId: liveApplication.id } });
      ok(liveContract.sentToApplicantAt instanceof Date,
        'evenements : contract-sent est publie apres markSent');

      const sentEventsBeforeFailure = (candidateEvents.body().match(/"type":"contract-sent"/g) || []).length;
      mailer.sendSignatureInvitation = async () => false;
      r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
      r = await req(schoolJar, 'POST',
        `/mes-annonces/${listing.id}/candidatures/${liveApplication.id}/contrat/envoyer`,
        form({ _csrf: csrfFrom(r.text) }));
      await wait(80);
      const sentEventsAfterFailure = (candidateEvents.body().match(/"type":"contract-sent"/g) || []).length;
      ok(r.status === 302 && sentEventsAfterFailure === sentEventsBeforeFailure,
        'evenements : echec email ne publie pas contract-sent');
    } finally {
      mailer.sendSignatureInvitation = originalInvitation;
    }

    r = await req(liveCandidateJar, 'GET', `/suivi/${liveApplication.trackingToken}/signer`);
    r = await req(liveCandidateJar, 'POST', `/suivi/${liveApplication.trackingToken}/signer`, form({
      _csrf: csrfFrom(r.text), accept: '1', signatureData: SIGNATURE_PNG,
    }));
    ok(r.status === 302 && await waitForSse(schoolEvents, 'contract-signed'),
      'evenements : contreseing persiste puis notifie l ecole');
    liveContract = await prisma.contract.findUnique({ where: { applicationId: liveApplication.id } });
    ok(liveContract.applicantSignedAt instanceof Date && Boolean(liveContract.signedPdfPath),
      'evenements : signal signe correspond au PDF final en base');

    const rejectedApplication = await prisma.application.create({
      data: {
        listingId: listing.id,
        applicantName: 'Refus M',
        applicantEmail: `refus.m.${STAMP}@example.test`,
        message: 'Candidature a refuser',
        trackingToken: `f${String(STAMP).padStart(63, 'f')}`.slice(0, 64),
      },
    });
    const rejectedJar = makeJar();
    await req(rejectedJar, 'GET', `/suivi/${rejectedApplication.trackingToken}`);
    const rejectedEvents = await openSse(rejectedJar, `/suivi/temps-reel/${rejectedApplication.id}`);
    r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    r = await req(schoolJar, 'POST',
      `/mes-annonces/${listing.id}/candidatures/${rejectedApplication.id}/refuser`,
      form({ _csrf: csrfFrom(r.text) }));
    ok(r.status === 302 && await waitForSse(rejectedEvents, 'application-rejected'),
      'evenements : refus persiste puis notifie le candidat');
    const rejectedRow = await prisma.application.findUnique({ where: { id: rejectedApplication.id } });
    ok(rejectedRow.status === 'rejected' && rejectedRow.rejectedAt instanceof Date,
      'evenements : signal refuse correspond a l etat RGPD en base');

    schoolEvents.request.destroy();
    candidateEvents.request.destroy();
    rejectedEvents.request.destroy();
```

- [x] **Step 3: Exécuter et vérifier l'absence d'événements**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: FAIL sur `depot persiste puis notifie`, car aucun contrôleur ne publie encore.

- [x] **Step 4: Publier la création après `createForListing`**

Dans `applicationController.js`, importer l'objet puis conserver le résultat créé :

```js
const realtimeService = require('../services/realtimeService');

const application = await applicationService.createForListing(id, {
  ...value,
  cvPath: relPathOf(cvFile),
  idCardPath: relPathOf(idFile),
  licensePath: relPathOf(licenseFile),
  teachingCardPath: relPathOf(teachingFile),
  trackingToken,
});
realtimeService.publishApplicationUpdate(
  application,
  realtimeService.EVENT_TYPES.APPLICATION_CREATED
);
```

Garder ensuite les emails et la redirection actuels.

- [x] **Step 5: Publier acceptation, refus et invitation**

Dans `contractController.js`, importer l'objet et ajouter exactement après les écritures réussies :

```js
const realtimeService = require('../services/realtimeService');

// Dans reject, juste après updateStatus :
realtimeService.publishApplicationUpdate(
  application,
  realtimeService.EVENT_TYPES.APPLICATION_REJECTED
);

// Dans accept, après upsertForApplication ET updateStatus :
realtimeService.publishApplicationUpdate(
  application,
  realtimeService.EVENT_TYPES.APPLICATION_ACCEPTED
);

// Dans sendContract, uniquement dans if (ok), après markSent :
realtimeService.publishApplicationUpdate(
  application,
  realtimeService.EVENT_TYPES.CONTRACT_SENT
);
```

Ne pas déplacer ni supprimer le correctif `ensureTrackingToken` déjà présent dans `sendContract`.

- [x] **Step 6: Publier le contreseing avant les emails best-effort**

Dans `signatureController.js`, importer l'objet et ajouter après `contractService.signByApplicant` :

```js
realtimeService.publishApplicationUpdate(
  application,
  realtimeService.EVENT_TYPES.CONTRACT_SIGNED
);
```

Les deux emails restent ensuite dans leur `Promise.all` actuel : leur latence n'empêche pas l'écran école de recevoir le signal.

- [x] **Step 7: Rejouer le workflow et les lots métier concernés**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
& "C:\nvm4w\nodejs\node.exe" test/lot-b.cjs
& "C:\nvm4w\nodejs\node.exe" test/lot-g.cjs
& "C:\nvm4w\nodejs\node.exe" test/lot-j.cjs
```

Expected: quatre sorties 0 ; statuts, signatures, emails et `rejectedAt` restent verts.

- [x] **Step 8: Commit ciblé**

```powershell
git add -- src/controllers/applicationController.js src/controllers/contractController.js src/controllers/signatureController.js test/lot-m.cjs
git commit -m "M: publier les transitions de candidature et contrat"
```

---

### Task 6: Client EventSource, rattrapage et accessibilité

**Files:**
- Create: `public/js/realtime.js`
- Modify: `views/tracking/show.twig`
- Modify: `views/dashboard/applications.twig`
- Modify: `public/css/style.css`
- Test: `test/lot-m.cjs`

**Interfaces:**
- Consumes: attributs `data-realtime-*`, événements SSE `invalidate`, fragments `[data-tracking-status]`, `[data-application-region]`, `[data-application-card]`.
- Produces: `initRealtime(doc, win, fetchImpl, EventSourceCtor, ParserCtor)`, `startRealtime(context, doc, win, fetchImpl, EventSourceCtor, ParserCtor)`, états `live|connecting|unavailable`, fetch avec `X-Realtime-Fragment: 1`, aucun timer de reconnexion applicatif.

- [x] **Step 1: Ajouter un faux navigateur et les assertions RED**

Ajouter avant `main()` dans `test/lot-m.cjs` :

```js
function makeRealtimeDom({ mode = 'candidate', focused = false, page = '1' } = {}) {
  const statusText = { textContent: '' };
  const status = {
    hidden: true,
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    querySelector(selector) { return selector === '[data-realtime-status-text]' ? statusText : null; },
  };
  const announcement = { textContent: '' };
  const update = { hidden: true };
  const current = {
    replacements: 0,
    contains() { return focused; },
    replaceWith() { this.replacements += 1; },
  };
  const list = {
    prepended: 0,
    prepend() { this.prepended += 1; },
  };
  const empty = { removed: false, remove() { this.removed = true; } };
  const attrs = {
    'data-realtime-mode': mode,
    'data-realtime-page': page,
    'data-realtime-stream-url': '/flux-sans-jeton',
    'data-realtime-snapshot-url': '/fragment-sans-jeton',
    'data-realtime-card-url-template': '/cartes/__APPLICATION_ID__',
  };
  const context = {
    getAttribute(name) { return attrs[name] || null; },
    querySelector(selector) {
      if (selector === '[data-realtime-status]') return status;
      if (selector === '[data-realtime-announcement]') return announcement;
      if (selector === '[data-realtime-update]') return update;
      if (selector === '[data-tracking-status]' && mode === 'candidate') return current;
      if (selector === '[data-application-region]' && mode === 'school') return current;
      if (selector === '[data-application-list]') return list;
      if (selector === '[data-application-empty]') return empty;
      return null;
    },
  };
  const document = {
    activeElement: focused ? {} : null,
    body: {},
    querySelectorAll(selector) { return selector === '[data-realtime-context]' ? [context] : []; },
    importNode(node) { return node; },
  };
  return { document, context, status, statusText, announcement, update, current, list, empty };
}

function loadRealtimeScript(dom, fetchImpl) {
  const sources = [];
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = {};
      this.closed = false;
      sources.push(this);
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    close() { this.closed = true; this.readyState = 2; }
    open() { this.readyState = 1; if (this.onopen) this.onopen(); }
    error(state) { this.readyState = state; if (this.onerror) this.onerror(); }
    invalidate(payload) {
      if (this.listeners.invalidate) this.listeners.invalidate({ data: JSON.stringify(payload) });
    }
  }
  class FakeDOMParser {
    parseFromString() {
      const node = { querySelector() { return null; } };
      return { querySelector() { return node; } };
    }
  }
  const module = { exports: {} };
  const win = {
    addEventListener() {},
    AbortController,
  };
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'realtime.js'), 'utf8');
  vm.runInNewContext(script, { module, document: undefined, window: undefined, console });
  module.exports.initRealtime(dom.document, win, fetchImpl, FakeEventSource, FakeDOMParser);
  return { api: module.exports, sources };
}
```

Ajouter la section suivante dans `main()` :

```js
    // --- 6. Simulation Node du client, sans prétendre couvrir un vrai navigateur ---
    const browserCalls = [];
    const candidateDom = makeRealtimeDom();
    const candidateBrowser = loadRealtimeScript(candidateDom, async (url, options) => {
      browserCalls.push({ url, options });
      return { ok: true, status: 200, redirected: false, text: async () => '<section></section>' };
    });
    ok(candidateBrowser.sources.length === 1
      && candidateBrowser.sources[0].url === '/flux-sans-jeton',
    'js vm : un seul EventSource ouvert sur l URL sans jeton');

    candidateBrowser.sources[0].open();
    ok(await eventually(() => browserCalls.length === 1)
      && browserCalls[0].options.headers['X-Realtime-Fragment'] === '1'
      && candidateDom.statusText.textContent === 'Actualisation en direct',
    'js vm : open actualise le fragment et l indicateur');
    candidateBrowser.sources[0].open();
    ok(await eventually(() => browserCalls.length === 2),
      'js vm : chaque reconnexion rattrape l etat courant');

    candidateBrowser.sources[0].error(0);
    ok(candidateDom.statusText.textContent === 'Reconnexion en cours',
      'js vm : coupure recuperable annonce la reconnexion');
    candidateBrowser.sources[0].error(2);
    ok(candidateDom.statusText.textContent.includes('Temps réel indisponible')
      && candidateBrowser.sources[0].closed,
    'js vm : etat terminal ferme la source sans boucle maison');

    let unauthorizedCalls = 0;
    const unauthorizedDom = makeRealtimeDom();
    const unauthorizedBrowser = loadRealtimeScript(unauthorizedDom, async () => {
      unauthorizedCalls += 1;
      return { ok: false, status: 401, redirected: false, text: async () => '' };
    });
    unauthorizedBrowser.sources[0].open();
    ok(await eventually(() => unauthorizedBrowser.sources[0].closed)
      && unauthorizedCalls === 1
      && unauthorizedDom.statusText.textContent.includes('Temps réel indisponible'),
    'js vm : fragment 401 provoque un arret unique et explicite');

    const focusDom = makeRealtimeDom({ focused: true });
    const focusBrowser = loadRealtimeScript(focusDom, async () => ({
      ok: true, status: 200, redirected: false, text: async () => '<section></section>',
    }));
    focusBrowser.sources[0].open();
    ok(await eventually(() => focusDom.update.hidden === false)
      && focusDom.current.replacements === 0,
    'js vm : cible focalisee non remplacee, bandeau d actualisation affiche');

    const schoolDom = makeRealtimeDom({ mode: 'school' });
    const schoolBrowser = loadRealtimeScript(schoolDom, async () => ({
      ok: true, status: 200, redirected: false, text: async () => '<li></li>',
    }));
    schoolBrowser.sources[0].open();
    await eventually(() => schoolDom.current.replacements === 1);
    schoolBrowser.sources[0].invalidate({ type: 'application-created', applicationId: 987 });
    ok(await eventually(() => schoolDom.list.prepended === 1)
      && schoolDom.update.hidden === false,
    'js vm : nouvelle candidature inseree en page 1 avec invitation a rafraichir');

    const secondPageDom = makeRealtimeDom({ mode: 'school', page: '2' });
    const secondPageBrowser = loadRealtimeScript(secondPageDom, async () => ({
      ok: true, status: 200, redirected: false, text: async () => '<li></li>',
    }));
    secondPageBrowser.sources[0].open();
    await eventually(() => secondPageDom.current.replacements === 1);
    secondPageBrowser.sources[0].invalidate({ type: 'application-created', applicationId: 988 });
    ok(await eventually(() => secondPageDom.update.hidden === false)
      && secondPageDom.list.prepended === 0,
    'js vm : page ulterieure conserve sa pagination et affiche le bandeau');

    r = await req(makeJar(), 'GET', `/suivi/${displayedApplication.trackingToken}`);
    ok(r.text.includes('/js/realtime.js')
      && r.text.includes('role="status"')
      && r.text.includes('aria-live="polite"'),
    'structure : suivi charge le script externe et les regions accessibles');
    r = await req(schoolJar, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(r.text.includes('/js/realtime.js') && !r.text.includes('<script>'),
      'structure : page ecole respecte la CSP sans script inline');
```

- [x] **Step 2: Exécuter et voir l'échec de fichier**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
```

Expected: FAIL avec le code `ENOENT` et un chemin se terminant par `public/js/realtime.js`.

- [x] **Step 3: Implémenter le client navigateur complet**

Créer `public/js/realtime.js` :

```js
'use strict';

(function () {
  var TEXTS = {
    live: 'Actualisation en direct',
    connecting: 'Reconnexion en cours',
    unavailable: 'Temps réel indisponible — actualisez la page si nécessaire',
  };

  function setState(context, state) {
    var status = context.querySelector('[data-realtime-status]');
    if (!status) return;
    status.hidden = false;
    status.setAttribute('data-state', state);
    var text = status.querySelector('[data-realtime-status-text]');
    if (text) text.textContent = TEXTS[state] || TEXTS.unavailable;
  }

  function announce(context, message) {
    var region = context.querySelector('[data-realtime-announcement]');
    if (region) region.textContent = message || '';
  }

  function showUpdate(context) {
    var update = context.querySelector('[data-realtime-update]');
    if (update) update.hidden = false;
    announce(context, 'Une mise à jour est disponible. Actualisez la page.');
  }

  function messageFor(type) {
    var messages = {
      'application-created': 'Une nouvelle candidature a été reçue.',
      'application-accepted': 'La candidature a été acceptée.',
      'application-rejected': 'La candidature a été refusée.',
      'contract-sent': 'Le contrat est maintenant prêt à signer.',
      'contract-signed': 'Le contrat a été signé par le candidat.',
    };
    return messages[type] || 'La candidature a été mise à jour.';
  }

  function startRealtime(context, doc, win, fetchImpl, EventSourceCtor, ParserCtor) {
    var mode = context.getAttribute('data-realtime-mode');
    var streamUrl = context.getAttribute('data-realtime-stream-url');
    var snapshotUrl = context.getAttribute('data-realtime-snapshot-url');
    var cardTemplate = context.getAttribute('data-realtime-card-url-template');
    var page = context.getAttribute('data-realtime-page') || '1';
    if (!streamUrl || !snapshotUrl || !EventSourceCtor || !fetchImpl || !ParserCtor) return null;

    setState(context, 'connecting');
    var source = new EventSourceCtor(streamUrl);
    var requestNumber = 0;
    var controller = null;

    function stopAsUnavailable() {
      source.close();
      setState(context, 'unavailable');
    }

    function parsedNode(html, selector) {
      var parsed = new ParserCtor().parseFromString(html, 'text/html');
      var node = parsed.querySelector(selector);
      if (!node || (node.querySelector && node.querySelector('script'))) {
        throw new Error('Fragment temps reel invalide.');
      }
      return doc.importNode ? doc.importNode(node, true) : node;
    }

    function fetchNode(url, selector) {
      requestNumber += 1;
      var currentRequest = requestNumber;
      if (controller) controller.abort();
      controller = win.AbortController ? new win.AbortController() : null;
      return fetchImpl(url, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html', 'X-Realtime-Fragment': '1' },
        signal: controller ? controller.signal : undefined,
      }).then(function (response) {
        if (response.status === 401) {
          var unauthorized = new Error('Session temps reel expiree.');
          unauthorized.code = 'UNAUTHORIZED';
          throw unauthorized;
        }
        if (!response.ok || response.redirected) throw new Error('Fragment temps reel indisponible.');
        return response.text();
      }).then(function (html) {
        if (currentRequest !== requestNumber) return null;
        return parsedNode(html, selector);
      });
    }

    function replaceWithoutStealingFocus(current, next) {
      var active = doc.activeElement;
      if (active && active !== doc.body && current.contains && current.contains(active)) {
        showUpdate(context);
        return false;
      }
      current.replaceWith(next);
      return true;
    }

    function handleFetchError(err) {
      if (err && err.name === 'AbortError') return;
      if (err && err.code === 'UNAUTHORIZED') return stopAsUnavailable();
      setState(context, 'unavailable');
    }

    function refreshSnapshot(message) {
      var selector = mode === 'school' ? '[data-application-region]' : '[data-tracking-status]';
      var current = context.querySelector(selector);
      if (!current) return Promise.resolve();
      return fetchNode(snapshotUrl, selector).then(function (next) {
        if (!next) return;
        if (replaceWithoutStealingFocus(current, next)) {
          setState(context, 'live');
          if (message) announce(context, message);
        }
      }).catch(handleFetchError);
    }

    function refreshSchoolCard(event) {
      if (!cardTemplate || !event.applicationId) return refreshSnapshot(messageFor(event.type));
      var url = cardTemplate.replace('__APPLICATION_ID__', String(event.applicationId));
      return fetchNode(url, '[data-application-card]').then(function (next) {
        if (!next) return;
        var current = context.querySelector(`[data-application-card="${event.applicationId}"]`);
        if (current) {
          if (replaceWithoutStealingFocus(current, next)) announce(context, messageFor(event.type));
          return;
        }
        if (page !== '1' || event.type !== 'application-created') return showUpdate(context);
        var list = context.querySelector('[data-application-list]');
        if (!list) return showUpdate(context);
        list.prepend(next);
        var empty = context.querySelector('[data-application-empty]');
        if (empty) empty.remove();
        var update = context.querySelector('[data-realtime-update]');
        if (update) update.hidden = false;
        announce(context, messageFor(event.type));
      }).then(function () {
        setState(context, 'live');
      }).catch(handleFetchError);
    }

    source.onopen = function () {
      setState(context, 'live');
      refreshSnapshot('');
    };
    source.onerror = function () {
      if (source.readyState === 2) stopAsUnavailable();
      else setState(context, 'connecting');
    };
    source.addEventListener('invalidate', function (rawEvent) {
      var event;
      try {
        event = JSON.parse(rawEvent.data);
      } catch {
        return;
      }
      if (mode === 'school') refreshSchoolCard(event);
      else refreshSnapshot(messageFor(event.type));
    });
    win.addEventListener('pagehide', function () { source.close(); });
    return source;
  }

  function initRealtime(doc, win, fetchImpl, EventSourceCtor, ParserCtor) {
    if (!doc || !win || !EventSourceCtor) return [];
    var contexts = doc.querySelectorAll('[data-realtime-context]');
    var sources = [];
    Array.prototype.forEach.call(contexts, function (context) {
      var source = startRealtime(context, doc, win, fetchImpl, EventSourceCtor, ParserCtor);
      if (source) sources.push(source);
    });
    return sources;
  }

  var api = { initRealtime: initRealtime, startRealtime: startRealtime, setState: setState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    initRealtime(document, window, window.fetch.bind(window), window.EventSource, window.DOMParser);
  }
})();
```

- [x] **Step 4: Brancher uniquement le script externe**

Ajouter à la fin de `views/tracking/show.twig` et `views/dashboard/applications.twig` :

```twig
{% block scripts %}
  <script src="/js/realtime.js" defer></script>
{% endblock %}
```

Mettre à jour l'assertion temporaire de la Tâche 4 : le suivi doit maintenant contenir `/js/realtime.js`.

- [x] **Step 5: Ajouter les styles visibles et accessibles**

Ajouter près des styles de candidatures dans `public/css/style.css` :

```css
/* --- Lot M : actualisation en direct des candidatures --- */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.realtime-status {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 1rem;
  color: var(--color-muted);
  font-size: 0.9rem;
}
.realtime-status-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: #d97706;
}
.realtime-status[data-state="live"] .realtime-status-dot { background: #15803d; }
.realtime-status[data-state="unavailable"] .realtime-status-dot { background: #b91c1c; }
.realtime-update {
  padding: 0.75rem 1rem;
  border: 1px solid #f59e0b;
  border-radius: var(--radius);
  background: #fffbeb;
  color: #78350f;
}
```

- [x] **Step 6: Exécuter les tests Node et le contrôle CSP**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
& "C:\nvm4w\nodejs\node.exe" test/smoke.cjs
& "C:\nvm4w\nodejs\node.exe" test/lot-l.cjs
```

Expected: trois sorties 0. Le test `vm` prouve la machine d'état simulée ; il ne doit pas être présenté comme un test de focus ou d'EventSource dans un vrai navigateur.

- [x] **Step 7: Commit ciblé**

```powershell
git add -- public/js/realtime.js public/css/style.css views/tracking/show.twig views/dashboard/applications.twig test/lot-m.cjs
git commit -m "M: actualiser les candidatures dans le navigateur"
```

---

### Task 7: Donnée et URL de démonstration téléphone

**Files:**
- Modify: `scripts/seed-demo.js:290-400`
- Modify: `test/lot-k.cjs:80-140`
- Test: `test/lot-k.cjs`

**Interfaces:**
- Consumes: première candidature vitrine `v === 0`, déjà `pending` et située sur une annonce ouverte.
- Produces: `realtimeTrackingToken`, `realtimeApplicationId`, `realtimeListingId` dans le résultat du seed, `DEMO_BASE_URL` optionnelle pour imprimer une URL LAN.

- [x] **Step 1: Écrire le test RED du dossier temps réel**

Dans `test/lot-k.cjs`, après le contrôle du contrat signé :

```js
    const realtimeApplication = await prisma.application.findUnique({
      where: { id: r2.realtimeApplicationId },
      include: { listing: true },
    });
    ok(Boolean(realtimeApplication)
      && realtimeApplication.status === 'pending'
      && realtimeApplication.trackingToken === r2.realtimeTrackingToken
      && realtimeApplication.listingId === r2.realtimeListingId
      && realtimeApplication.listing.schoolId === vitrine.id,
    'seed : candidature vitrine en attente dediee a la scene temps reel');

    const rr = await get(`/suivi/${r2.realtimeTrackingToken}`);
    ok(rr.status === 200 && rr.text.includes('En attente'),
      'seed : suivi temps reel pret a ouvrir sur le telephone');
```

- [x] **Step 2: Exécuter et constater l'échec**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-k.cjs
```

Expected: FAIL car `realtimeApplicationId` et `realtimeTrackingToken` sont absents.

- [x] **Step 3: Exposer la candidature pending existante**

Dans `scripts/seed-demo.js`, initialiser et capturer la première candidature vitrine :

```js
  let candidatureSignee = null;
  let candidatureTempsReel = null;
```

Dans la boucle existante, juste après l'appel à `creeCandidature`, utiliser ces deux affectations :

```js
    const candidature = await creeCandidature(annonce, v, STATUTS_VITRINE[v], (v * 6) % 80, extra);
    if (v === 0) candidatureTempsReel = candidature; // Julien Martin — en attente
    if (v === 1) candidatureSignee = candidature; // Sophie Bernard — dossier signé
```

Étendre la valeur retournée :

```js
  return {
    ...compteurs,
    trackingToken: candidatureSignee.trackingToken,
    realtimeTrackingToken: candidatureTempsReel.trackingToken,
    realtimeApplicationId: candidatureTempsReel.id,
    realtimeListingId: candidatureTempsReel.listingId,
    credentials: {
      school: { email: vitrine.email, password: MDP_ECOLE },
      admin: { email: admin.email, password: MDP_ADMIN },
    },
  };
```

- [x] **Step 4: Imprimer des URLs utilisables sur le LAN**

Dans `runCli()`, remplacer les URLs en dur par une base nettoyée :

```js
    const baseUrl = String(process.env.DEMO_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    console.log('\nURLs clés :');
    console.log(`  Carte des annonces : ${baseUrl}/annonces?vue=carte`);
    console.log(`  Tableau de bord    : ${baseUrl}/tableau-de-bord`);
    console.log(`  Administration     : ${baseUrl}/admin`);
    console.log(`  Suivi candidat (temps réel, en attente) : ${baseUrl}/suivi/${r.realtimeTrackingToken}`);
    console.log(`  Suivi candidat (contrat signé)          : ${baseUrl}/suivi/${r.trackingToken}`);
    console.log(`  Alertes email      : ${baseUrl}/alertes`);
```

`DEMO_BASE_URL` ne change aucune donnée ; il formate seulement les liens affichés.

- [x] **Step 5: Rejouer le seed deux fois**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-k.cjs
```

Expected: sortie 0 ; relance idempotente, volumes inchangés, dossier signé et dossier temps réel accessibles.

- [x] **Step 6: Commit ciblé**

```powershell
git add -- scripts/seed-demo.js test/lot-k.cjs
git commit -m "M: preparer la candidature temps reel de demonstration"
```

---

### Task 8: Suite complète, contrôle navigateur et passation jury

**Files:**
- Modify: `package.json:8-25`
- Modify: `AGENTS.md`
- Modify: `docs/jury/README.md`
- Modify: `docs/jury/soutenance/demo-11-minutes.md`
- Modify: `docs/superpowers/plans/2026-07-16-lot-m-temps-reel.md` — cocher les étapes réellement exécutées.

**Interfaces:**
- Consumes: suite Lot M verte, seed retournant `realtimeTrackingToken`, serveur redémarré après vues Twig.
- Produces: Lot M dans `npm test`, scénario école/téléphone reproductible, limites mono-instance et HTTP/1.1 documentées.

- [x] **Step 1: Ajouter le test au script npm sans altérer les dépendances**

Dans `package.json`, ajouter `node test/lot-m.cjs` après le Lot L et avant le seed Lot K, afin que le seed persistant reste le dernier test. La fin exacte du script devient :

```json
"test": "node test/smoke.cjs && node test/lot-a.cjs && node test/lot-b.cjs && node test/lot-c.cjs && node test/correctifs.cjs && node test/ameliorations.cjs && node test/ameliorations-v2.cjs && node test/lot-e.cjs && node test/lot-f.cjs && node test/lot-g.cjs && node test/lot-h.cjs && node test/lot-i.cjs && node test/lot-j.cjs && node test/lot-l.cjs && node test/lot-m.cjs && node test/lot-k.cjs"
```

Ne pas modifier `package-lock.json` : le Lot M n'ajoute aucune dépendance.

- [x] **Step 2: Lancer les vérifications automatisées fraîches**

Run:

```powershell
& "C:\nvm4w\nodejs\node.exe" test/lot-m.cjs
& "C:\nvm4w\nodejs\npm.cmd" test
& "C:\nvm4w\nodejs\npx.cmd" prisma validate
git diff --check
```

Expected:

- `test/lot-m.cjs` : sortie 0 ;
- `npm test` : **16 fichiers** exécutés, aucune assertion en échec, Lot K dernier ;
- Prisma : `The schema at prisma\schema is valid` ;
- `git diff --check` : aucune ligne d'erreur.

- [x] **Step 3: Mettre à jour la passation sans inventer le total d'assertions**

Ajouter dans `AGENTS.md` :

```markdown
- **Lot M (suivi des candidatures en temps réel) : LIVRÉ** — SSE natifs, canaux
  isolés par annonce/candidature, rattrapage après reconnexion, session candidat
  sans jeton dans les URLs du flux, arrêt 204 à expiration, fragments Twig et
  repli sans JavaScript. Tests : `test/lot-m.cjs` (port 4072).
```

Dans `docs/jury/README.md`, remplacer « plus aucun chantier jury planifié côté agent » par une formulation datée indiquant que le Lot M a été ajouté après la préparation initiale. Mettre le nombre d'assertions au total exact imprimé par la commande fraîche de la Step 2 ; ne pas réutiliser l'ancien total de 448 et ne pas l'estimer.

Ajouter aussi ces limites de production, sans les présenter comme des défauts de la démonstration locale :

```markdown
- Temps réel Lot M : adaptateur mémoire mono-processus ; une production
  multi-instance devra utiliser PostgreSQL `LISTEN/NOTIFY` ou Redis.
- Sous HTTP/1.1, plusieurs onglets peuvent atteindre la limite de connexions SSE
  par origine ; HTTP/2 ou une mutualisation inter-onglets est l'évolution prévue.
- Le reverse proxy de production doit masquer le segment secret des accès
  initiaux `/suivi/:token` dans ses journaux. Les URLs SSE et fragment ne
  contiennent pas ce jeton.
```

- [x] **Step 4: Intégrer la scène sans allonger les 11 minutes**

Dans `docs/jury/soutenance/demo-11-minutes.md` :

```markdown
### Préparation temps réel

- démarrer le serveur, puis exécuter le seed avec
  `DEMO_BASE_URL` réglée sur l'adresse IPv4 LAN du PC et le port 3000 ;
- ouvrir sur le téléphone l'URL « Suivi candidat (temps réel, en attente) » ;
- ouvrir sur le PC la liste des candidatures de l'annonce correspondante ;
- conserver deux onglets PC comme scénario de secours si le réseau local refuse
  le téléphone.
```

Dans le déroulé, à l'acceptation côté école, ajouter la phrase : « Le téléphone candidat vient de passer à Acceptée sans actualisation ; le serveur n'a envoyé qu'un signal, puis la page a relu l'état autorisé en base. » À la signature candidat, montrer le badge signé apparaître côté école avant de poursuivre. Ne pas ajouter une minute : remplacer une partie de l'explication email existante.

- [ ] **Step 5: Exécuter le contrôle dans un vrai navigateur**

Redémarrer le serveur après les modifications Twig, puis lancer le seed après le serveur :

```powershell
& "C:\nvm4w\nodejs\npm.cmd" run dev
```

Dans un autre terminal :

```powershell
$lanIp = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress
$env:DEMO_BASE_URL = "http://${lanIp}:3000"
& "C:\nvm4w\nodejs\npm.cmd" run seed:demo
```

Contrôler et consigner dans le checkpoint de `docs/jury/README.md` :

1. page école et suivi candidat ouverts simultanément ;
2. acceptation, refus, invitation, contreseing et nouvelle candidature visibles sans actualisation ;
3. coupure réseau : « Reconnexion en cours », puis rattrapage à la reconnexion ;
4. suppression de la session de test : état terminal et aucune rafale dans l'onglet Réseau ;
5. focus clavier posé sur un bouton de carte : aucun déplacement, bandeau affiché ;
6. région `aria-live` inspectée dans l'arbre d'accessibilité ;
7. téléphone et PC sur le même réseau local, puis scénario de secours à deux onglets.

Ce contrôle est manuel : ne pas le comptabiliser comme assertion Node. Si le téléphone ne peut pas joindre le PC, vérifier l'écoute réseau et demander l'autorisation avant toute modification du pare-feu Windows.

- [x] **Step 6: Demander une revue de code séquentielle**

Invoquer `superpowers:requesting-code-review` après les sorties vertes. Le relecteur vérifie au minimum : fuite d'abonnés, token dans les URLs SSE/fragment, réponse 204 terminale, publication avant écriture Prisma, remplacement DOM sous focus et modifications utilisateur absorbées par erreur.

Expected: aucun point bloquant. Corriger toute remarque avec `superpowers:receiving-code-review`, une par une, et relancer les commandes concernées.

- [x] **Step 7: Commit de passation ciblé**

Vérifier d'abord le staging :

```powershell
git diff --cached --name-only
```

Puis :

```powershell
git add -- package.json AGENTS.md docs/jury/README.md docs/jury/soutenance/demo-11-minutes.md docs/superpowers/plans/2026-07-16-lot-m-temps-reel.md
git commit -m "M: integrer le temps reel a la demonstration jury"
```

- [x] **Step 8: Vérification finale post-commit**

Run:

```powershell
& "C:\nvm4w\nodejs\npm.cmd" test
& "C:\nvm4w\nodejs\npx.cmd" prisma validate
git status --short
git log -8 --oneline
```

Expected: suite complète et Prisma verts ; aucun changement Lot M non commité ; historique montrant les commits `M:` séparés. Tout fichier personnel ou changement utilisateur restant est signalé, jamais supprimé.

---

## Definition of Done

- Les cinq transitions métier se reflètent entre deux pages ouvertes sans rechargement manuel.
- Chaque `open` relit un instantané frais ; un événement perdu est rattrapé.
- La session est revalidée au plus tard après cinq minutes et le 204 arrête la reconnexion.
- `close` libère callback, heartbeat et minuteur ; aucun canal vide ne subsiste.
- Les écoles restent isolées par `schoolId` et le candidat par les cinq identifiants liés à sa session.
- Aucun jeton candidat ne figure dans les URLs SSE/fragment ou leur charge utile.
- Le parcours est complet sans JavaScript et le script respecte la CSP stricte.
- Les preuves Node, les contrôles structurels et le contrôle manuel navigateur sont présentés séparément.
- `npm test`, `prisma validate` et `git diff --check` sont fraîchement verts.
- La scène téléphone possède un repli immédiat à deux onglets.
