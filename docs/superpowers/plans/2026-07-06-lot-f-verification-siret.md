# Lot F — Vérification SIRET : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vérifier le SIRET des auto-écoles auprès du répertoire Sirene (API publique « Recherche d'entreprises »), en direct à l'inscription (pré-remplissage + badge) et re-vérifié côté serveur, avec badge « École vérifiée » public et colonne admin — sans jamais bloquer une inscription.

**Architecture:** Service `siret.js` (fetch + cache mémoire, ne lève jamais) → endpoint interne `GET /api/siret/:siret` (la CSP interdit d'appeler l'API externe depuis le navigateur) consommé par un JS statique sur `/inscription` → statut stocké sur `School` au submit → badges dans les vues publiques et admin.

**Tech Stack:** Node.js (CommonJS), Express 5, Twig, Prisma (SQLite dev / Postgres prod), API `https://recherche-entreprises.api.gouv.fr` (publique, sans clé), tests maison `.cjs`.

## Global Constraints

- Spec de référence : `docs/superpowers/specs/2026-07-06-lot-f-verification-siret-design.md`.
- **PRÉREQUIS : Lot E terminé et commité** (ce lot modifie `views/listings/index.twig`).
- Français partout (commentaires, messages, commits préfixe `F:` +
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
- La vérification n'est JAMAIS bloquante : panne/timeout → statut `unverified` en base,
  endpoint → `{ status: 'error' }`, inscription toujours possible.
- Statuts : `verified` | `not_found` | `closed` | `unverified` (défaut). `error` n'existe
  qu'en mémoire (service/endpoint), jamais en base.
- CSP stricte inchangée : aucun JS inline ; le JS d'inscription est statique
  (`public/js/siret-check.js`) et n'appelle QUE `/api/siret/...` (même origine).
- Cache service : TTL 1 h (500 entrées max), sauf `error` : TTL 1 min.
  `SIRET_LOOKUP_DISABLED=1` court-circuite tout réseau (tests) → `{ status: 'error' }`.
- Migration Prisma : recette non-interactive (diff → fichier → `migrate deploy` →
  `generate`), JAMAIS `migrate dev`.
- Tests : `test/lot-f.cjs`, port **4062**, motif des lots précédents. Après chaque
  tâche : `node test/lot-f.cjs` vert ; en fin de lot : `npm test` complet.
- Les contrôleurs importent le service par ESPACE DE NOMS (`const siretService =
  require(...)` puis `siretService.lookupSiret(...)`) pour rester monkeypatchable en test.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` + `prisma/migrations/<ts>_siret_verification/` | 3 colonnes School |
| `src/services/siret.js` (nouveau) | lookup Sirene + cache, ne lève jamais |
| `src/controllers/siretController.js` (nouveau) | relais JSON minimal |
| `src/routes/index.js` | route `/api/siret/:siret` + rate-limit |
| `src/controllers/authController.js` | stockage du statut à l'inscription |
| `views/auth/register.twig` | zone d'état + script |
| `public/js/siret-check.js` (nouveau) | vérification en direct + pré-remplissage |
| `views/listings/index.twig`, `views/listings/show.twig`, `views/admin/schools.twig` | badges |
| `public/css/style.css` | `.badge-verified`, `.field-hint*` |
| `test/lot-f.cjs` (nouveau) + `package.json` + `AGENTS.md` | tests + intégration |

---

### Task 1 : colonnes `School.siretStatus` / `siretVerifiedName` / `siretCheckedAt`

**Files:**
- Modify: `prisma/schema.prisma` (modèle `School`)
- Create: `prisma/migrations/<YYYYMMDDHHMMSS>_siret_verification/migration.sql`
- Create: `test/lot-f.cjs`

**Interfaces:**
- Produces: colonnes `siretStatus String @default("unverified")`, `siretVerifiedName String?`, `siretCheckedAt DateTime?` — consommées par les Tasks 4 et 5.

- [x] **Step 1 : test qui échoue** — créer `test/lot-f.cjs` (harnais complet du projet, utilisé par toutes les tâches) :

```js
/**
 * Tests du Lot F — vérification SIRET (Sirene).
 * Spec : docs/superpowers/specs/2026-07-06-lot-f-verification-siret-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotf-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const prisma = require('../src/config/prisma');
const app = require('../src/app');

const PORT = 4062;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ÉCHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
function makeJar() { return { cookie: '' }; }
function storeCookies(jar, res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of sc) jar.cookie = c.split(';')[0];
}
async function req(jar, method, urlPath, { body, headers = {} } = {}) {
  const res = await fetch(BASE + urlPath, {
    method, redirect: 'manual',
    headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...headers }, body,
  });
  storeCookies(jar, res);
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), text };
}
async function get(urlPath) {
  const res = await fetch(BASE + urlPath, { redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}
function csrfFrom(html) {
  const m = html.match(/name="csrf-token" content="([^"]+)"/);
  if (!m) throw new Error('Jeton CSRF introuvable.');
  return m[1];
}
function form(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) p.append(k, v);
  return { body: p.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } };
}

const createdSchoolIds = [];
const createdAdminIds = [];

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

    // --- 1. colonnes Sirene sur School (défaut unverified) ---
    const s0 = await prisma.school.create({
      data: {
        email: `f.cols.${STAMP}@example.test`, passwordHash: 'x',
        businessName: 'F Cols', siret: `9${String(STAMP).slice(-13).padStart(13, '0')}`,
      },
    });
    createdSchoolIds.push(s0.id);
    ok(s0.siretStatus === 'unverified', 'schema : siretStatus par défaut "unverified"');
    ok(s0.siretVerifiedName === null && s0.siretCheckedAt === null, 'schema : nom officiel et date null par défaut');

    console.log(`\n✅ Lot F tests réussis — ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    if (createdAdminIds.length) await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
```

- [x] **Step 2 : vérifier l'échec**

Run : `node test/lot-f.cjs`
Attendu : `❌ ÉCHEC : schema : siretStatus par défaut "unverified"` (colonne inexistante → `undefined`)

- [x] **Step 3 : schéma** — dans `prisma/schema.prisma`, modèle `School`, insérer après le bloc `resetTokenHash`/`resetTokenExpiry` :

```prisma
  // Vérification Sirene (Lot F) : statut du SIRET au répertoire, nom officiel et date
  // du dernier contrôle. Jamais bloquant : « unverified » par défaut (comptes existants
  // inclus) ; une panne de l'API est stockée comme « unverified ».
  siretStatus       String    @default("unverified") // "verified" | "not_found" | "closed" | "unverified"
  siretVerifiedName String?
  siretCheckedAt    DateTime?
```

- [x] **Step 4 : migration (recette non-interactive)**

```bash
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script
```

Copier la sortie EXACTE (attendu : 3 `ALTER TABLE "School" ADD COLUMN ...`) dans
`prisma/migrations/<YYYYMMDDHHMMSS>_siret_verification/migration.sql` (horodater au
format `20260706HHMMSS`), puis :

```bash
npx prisma migrate deploy
npx prisma generate
```

- [x] **Step 5 : vérifier le succès**

Run : `node test/lot-f.cjs`
Attendu : 2 ✓.

- [x] **Step 6 : commit**

```bash
git add prisma/schema.prisma prisma/migrations test/lot-f.cjs
git commit -m "F: colonnes de verification Sirene sur School (statut, nom officiel, date)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : service `src/services/siret.js`

**Files:**
- Create: `src/services/siret.js`
- Modify: `test/lot-f.cjs`

**Interfaces:**
- Produces: `lookupSiret(siret) -> Promise<{ status: 'verified'|'closed'|'not_found'|'error', name: string|null, address: string|null }>` — ne lève JAMAIS. Consommé par les Tasks 3 et 4.

- [ ] **Step 1 : test qui échoue** — dans `test/lot-f.cjs`, insérer avant le `console.log` final :

```js
    // --- 2. service siret (fetch simulé) ---
    {
      const siretService = require('../src/services/siret');
      const origFetch = global.fetch;
      const origDisabled = process.env.SIRET_LOOKUP_DISABLED;
      const origNow = Date.now;
      let calls = 0;
      const okResponse = (results) => ({ ok: true, json: async () => ({ results }) });
      try {
        process.env.SIRET_LOOKUP_DISABLED = '0';

        global.fetch = async () => { calls += 1; return okResponse([{ nom_complet: 'AUTO-ECOLE TEST', matching_etablissements: [{ etat_administratif: 'A', adresse: '1 RUE X 13001 MARSEILLE' }] }]); };
        const r1 = await siretService.lookupSiret('11111111100001');
        ok(r1.status === 'verified' && r1.name === 'AUTO-ECOLE TEST' && r1.address === '1 RUE X 13001 MARSEILLE',
          'siret : établissement actif -> verified + nom + adresse');
        await siretService.lookupSiret('11111111100001');
        ok(calls === 1, 'siret : 2e appel servi par le cache');

        global.fetch = async () => { calls += 1; return okResponse([{ nom_complet: 'FERMEE SARL', matching_etablissements: [{ etat_administratif: 'F', adresse: 'X' }] }]); };
        ok((await siretService.lookupSiret('22222222200002')).status === 'closed', 'siret : établissement fermé -> closed');

        global.fetch = async () => { calls += 1; return okResponse([]); };
        ok((await siretService.lookupSiret('33333333300003')).status === 'not_found', 'siret : aucun résultat -> not_found');

        global.fetch = async () => { calls += 1; return { ok: false }; };
        ok((await siretService.lookupSiret('44444444400004')).status === 'error', 'siret : réponse API non-ok -> error');
        const callsBefore = calls;
        Date.now = () => origNow() + 2 * 60 * 1000; // TTL erreur (1 min) expiré
        global.fetch = async () => { calls += 1; return okResponse([{ nom_complet: 'REVENUE', matching_etablissements: [{ etat_administratif: 'A', adresse: 'Y' }] }]); };
        ok((await siretService.lookupSiret('44444444400004')).status === 'verified' && calls === callsBefore + 1,
          'siret : une erreur n’est pas mise en cache longtemps (re-vérifiée après 2 min)');
        Date.now = origNow;

        global.fetch = async () => { throw new Error('reseau'); };
        ok((await siretService.lookupSiret('55555555500005')).status === 'error', 'siret : exception réseau -> error');

        ok((await siretService.lookupSiret('123')).status === 'not_found', 'siret : format invalide -> not_found sans réseau');

        process.env.SIRET_LOOKUP_DISABLED = '1';
        const before = calls;
        global.fetch = async () => { calls += 1; return okResponse([]); };
        ok((await siretService.lookupSiret('66666666600006')).status === 'error' && calls === before,
          'siret : SIRET_LOOKUP_DISABLED court-circuite sans réseau');
      } finally {
        global.fetch = origFetch;
        process.env.SIRET_LOOKUP_DISABLED = origDisabled;
        Date.now = origNow;
      }
    }
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-f.cjs`
Attendu : `Cannot find module '../src/services/siret'`

- [ ] **Step 3 : implémentation** — créer `src/services/siret.js` :

```js
// Vérification d'un SIRET au répertoire Sirene via l'API publique « Recherche
// d'entreprises » (https://recherche-entreprises.api.gouv.fr — gratuite, sans clé).
// Ne lève JAMAIS : tout problème réseau/API renvoie { status: 'error' } ; l'appelant
// traite cet état comme « non vérifié » (la vérification n'est jamais bloquante).
// Désactivable via SIRET_LOOKUP_DISABLED=1 (tests, hors-ligne).
const API_URL = 'https://recherche-entreprises.api.gouv.fr/search';
const USER_AGENT = 'MoniteurConnect/1.0 (+https://moniteur-connect.local)';

// Cache mémoire (même motif que le géocodeur) : un SIRET donné n'est interrogé
// qu'une fois par heure. Les erreurs expirent vite : une panne passagère ne doit
// pas coller au SIRET pendant une heure.
const CACHE_MAX = 500;
const CACHE_TTL_OK_MS = 60 * 60 * 1000; // 1 h
const CACHE_TTL_ERR_MS = 60 * 1000; // 1 min
const cache = new Map();

const ERROR_RESULT = { status: 'error', name: null, address: null };

async function fetchLookup(siret) {
  if (process.env.SIRET_LOOKUP_DISABLED === '1') return { ...ERROR_RESULT };
  try {
    const url = `${API_URL}?q=${encodeURIComponent(siret)}&page=1&per_page=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ...ERROR_RESULT };

    const data = await res.json();
    const result = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!result) return { status: 'not_found', name: null, address: null };

    const etab = Array.isArray(result.matching_etablissements) ? result.matching_etablissements[0] : null;
    const name = result.nom_complet || result.nom_raison_sociale || null;
    const address = (etab && etab.adresse) || null;
    const closed = Boolean(etab && etab.etat_administratif === 'F'); // 'A' = actif, 'F' = fermé
    return { status: closed ? 'closed' : 'verified', name, address };
  } catch {
    return { ...ERROR_RESULT };
  }
}

async function lookupSiret(siret) {
  const key = String(siret || '').replace(/\D/g, '');
  if (key.length !== 14) return { status: 'not_found', name: null, address: null };

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await fetchLookup(key);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + (value.status === 'error' ? CACHE_TTL_ERR_MS : CACHE_TTL_OK_MS) });
  return value;
}

module.exports = { lookupSiret };
```

- [ ] **Step 4 : vérifier le succès**

Run : `node test/lot-f.cjs`
Attendu : 11 ✓.

- [ ] **Step 5 : commit**

```bash
git add src/services/siret.js test/lot-f.cjs
git commit -m "F: service de verification Sirene (lookup + cache, jamais bloquant)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : endpoint interne `GET /api/siret/:siret`

**Files:**
- Create: `src/controllers/siretController.js`
- Modify: `src/routes/index.js`
- Modify: `test/lot-f.cjs`

**Interfaces:**
- Consumes: `siretService.lookupSiret` (Task 2), `normalizeSiret` (`src/validators/schoolValidator.js`, existant).
- Produces: `GET /api/siret/:siret` → JSON `{ status, name, address }` (`400 { status: 'invalid' }` si ≠ 14 chiffres ; `429 { status: 'rate_limited' }` au-delà de 30 req/15 min/IP). Consommé par `public/js/siret-check.js` (Task 4).

- [ ] **Step 1 : test qui échoue** — dans `test/lot-f.cjs`, insérer avant le `console.log` final :

```js
    // --- 3. endpoint interne /api/siret ---
    let r = await get('/api/siret/abc');
    ok(r.status === 400 && JSON.parse(r.text).status === 'invalid', 'api : format invalide -> 400 invalid');

    r = await get('/api/siret/12345678901234'); // SIRET_LOOKUP_DISABLED=1 -> error
    ok(r.status === 200 && JSON.parse(r.text).status === 'error', 'api : service court-circuité -> error (jamais 500)');

    {
      const siretService = require('../src/services/siret');
      const orig = siretService.lookupSiret;
      try {
        siretService.lookupSiret = async () => ({ status: 'verified', name: 'AUTO-ECOLE DEMO', address: '2 RUE Y 13002 MARSEILLE' });
        r = await get('/api/siret/12345678901234');
        const body = JSON.parse(r.text);
        ok(body.status === 'verified' && body.name === 'AUTO-ECOLE DEMO' && body.address === '2 RUE Y 13002 MARSEILLE',
          'api : relaie status/nom/adresse du service, rien d’autre');
      } finally {
        siretService.lookupSiret = orig;
      }
    }
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-f.cjs`
Attendu : `❌ ÉCHEC : api : format invalide -> 400 invalid` (la route n'existe pas → 404 HTML)

- [ ] **Step 3 : contrôleur** — créer `src/controllers/siretController.js` :

```js
// Relais interne de la vérification SIRET : la CSP (connect-src 'self') interdit au
// navigateur d'appeler l'API externe, il passe donc par cette route même-origine.
// Surface volontairement minimale : { status, name, address }, jamais la réponse brute.
const siretService = require('../services/siret');
const { normalizeSiret } = require('../validators/schoolValidator');

// GET /api/siret/:siret
async function check(req, res, next) {
  try {
    const siret = normalizeSiret(req.params.siret);
    if (siret.length !== 14) {
      return res.status(400).json({ status: 'invalid', name: null, address: null });
    }
    const { status, name, address } = await siretService.lookupSiret(siret);
    res.json({ status, name, address });
  } catch (err) {
    next(err);
  }
}

module.exports = { check };
```

- [ ] **Step 4 : route** — dans `src/routes/index.js` :

(a) compléter les requires :

```js
const rateLimit = require('express-rate-limit');
const siretController = require('../controllers/siretController');
```

(b) insérer après `router.get('/', pageController.home);` :

```js
// Vérification SIRET en direct (formulaire d'inscription). Rate-limité : l'endpoint
// relaie une API publique, on borne l'usage par IP.
const siretLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ status: 'rate_limited', name: null, address: null }),
});
router.get('/api/siret/:siret', siretLimiter, siretController.check);
```

- [ ] **Step 5 : vérifier le succès**

Run : `node test/lot-f.cjs`
Attendu : 14 ✓.

- [ ] **Step 6 : commit**

```bash
git add src/controllers/siretController.js src/routes/index.js test/lot-f.cjs
git commit -m "F: endpoint interne /api/siret/:siret (relais rate-limite pour le navigateur)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : inscription — stockage du statut + vérification en direct

**Files:**
- Modify: `src/controllers/authController.js`
- Modify: `views/auth/register.twig`
- Create: `public/js/siret-check.js`
- Modify: `public/css/style.css`
- Modify: `test/lot-f.cjs`

**Interfaces:**
- Consumes: `siretService.lookupSiret` (Task 2), colonnes Sirene (Task 1), endpoint (Task 3).
- Produces: `School.siretStatus/siretVerifiedName/siretCheckedAt` renseignés à l'inscription (`error` → `unverified`) ; classes CSS `.field-hint`, `.field-hint-ok`, `.field-hint-warn`.

- [ ] **Step 1 : test qui échoue** — dans `test/lot-f.cjs`, insérer avant le `console.log` final :

```js
    // --- 4. inscription : statut Sirene stocké + page équipée ---
    {
      const siretService = require('../src/services/siret');
      const origLookup = siretService.lookupSiret;
      try {
        siretService.lookupSiret = async () => ({ status: 'verified', name: 'AUTO-ECOLE OFFICIELLE', address: null });
        const jar = makeJar();
        let rr = await req(jar, 'GET', '/inscription');
        const email1 = `f.ok.${STAMP}@example.test`;
        await req(jar, 'POST', '/inscription', form({
          _csrf: csrfFrom(rr.text), businessName: 'F Ok', email: email1,
          siret: `1${String(STAMP).slice(-13).padStart(13, '0')}`,
          password: 'motdepasse123', passwordConfirm: 'motdepasse123',
        }));
        const s1 = await prisma.school.findUnique({ where: { email: email1 } });
        createdSchoolIds.push(s1.id);
        ok(s1.siretStatus === 'verified' && s1.siretVerifiedName === 'AUTO-ECOLE OFFICIELLE' && s1.siretCheckedAt instanceof Date,
          'inscription : statut verified + nom officiel + date stockés');

        siretService.lookupSiret = async () => ({ status: 'error', name: null, address: null });
        const jar2 = makeJar();
        rr = await req(jar2, 'GET', '/inscription');
        const email2 = `f.err.${STAMP}@example.test`;
        await req(jar2, 'POST', '/inscription', form({
          _csrf: csrfFrom(rr.text), businessName: 'F Err', email: email2,
          siret: `2${String(STAMP).slice(-13).padStart(13, '0')}`,
          password: 'motdepasse123', passwordConfirm: 'motdepasse123',
        }));
        const s2 = await prisma.school.findUnique({ where: { email: email2 } });
        createdSchoolIds.push(s2.id);
        ok(s2 && s2.siretStatus === 'unverified', 'inscription : API en panne -> compte créé, statut unverified');
      } finally {
        siretService.lookupSiret = origLookup;
      }

      r = await get('/inscription');
      ok(r.text.includes('id="siret-status"') && r.text.includes('/js/siret-check.js'),
        'inscription : zone d’état + script de vérification présents');
    }
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-f.cjs`
Attendu : `❌ ÉCHEC : inscription : statut verified...` (colonnes non renseignées)

- [ ] **Step 3 : contrôleur** — dans `src/controllers/authController.js` :

(a) compléter les requires (sous `const geocoder = ...`) :

```js
const siretService = require('../services/siret');
```

(b) dans `register`, insérer juste AVANT `let school;` :

```js
    // Vérification Sirene (jamais bloquante) : statut + nom officiel stockés avec le
    // compte. Une panne (« error ») est stockée comme « unverified ».
    const sirene = await siretService.lookupSiret(value.siret);
```

(c) dans l'objet passé à `schoolService.create({ ... })`, ajouter après `address: value.address,` :

```js
        siretStatus: sirene.status === 'error' ? 'unverified' : sirene.status,
        siretVerifiedName: sirene.name,
        siretCheckedAt: new Date(),
```

- [ ] **Step 4 : vue** — dans `views/auth/register.twig` :

(a) remplacer le groupe SIRET par :

```twig
      <div class="form-group">
        <label for="siret">SIRET</label>
        <input id="siret" name="siret" type="text" inputmode="numeric"
               value="{{ values.siret|default('') }}" required>
        {# État de la vérification Sirene en direct (rempli par siret-check.js). #}
        <p id="siret-status" class="field-hint" aria-live="polite" hidden></p>
        {% if errors.siret %}<p class="field-error">{{ errors.siret }}</p>{% endif %}
      </div>
```

(b) ajouter en fin de fichier (après le `{% endblock %}` du content) :

```twig

{% block scripts %}
  <script src="/js/siret-check.js" defer></script>
{% endblock %}
```

- [ ] **Step 5 : JS** — créer `public/js/siret-check.js` :

```js
// Vérification SIRET en direct sur le formulaire d'inscription : à 14 chiffres saisis
// (debounce 400 ms), interroge le relais interne /api/siret/ puis pré-remplit raison
// sociale et adresse UNIQUEMENT si les champs sont vides (on n'écrase jamais une
// saisie). Jamais bloquant : le serveur re-vérifie de toute façon au submit.
(function () {
  var siret = document.getElementById('siret');
  var status = document.getElementById('siret-status');
  var businessName = document.getElementById('businessName');
  var address = document.getElementById('address');
  if (!siret || !status) return;

  var timer = null;
  var lastChecked = '';

  function show(text, okState) {
    status.hidden = false;
    status.textContent = text;
    status.className = okState ? 'field-hint field-hint-ok' : 'field-hint field-hint-warn';
  }

  function check() {
    var digits = siret.value.replace(/\D/g, '');
    if (digits.length !== 14 || digits === lastChecked) return;
    lastChecked = digits;
    fetch('/api/siret/' + digits)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.status === 'verified') {
          show('✓ Établissement vérifié' + (data.name ? ' : ' + data.name : ''), true);
          if (businessName && !businessName.value && data.name) businessName.value = data.name;
          if (address && !address.value && data.address) address.value = data.address;
        } else if (data.status === 'closed') {
          show('Établissement fermé administrativement — vous pouvez tout de même vous inscrire.', false);
        } else if (data.status === 'not_found') {
          show('SIRET introuvable au répertoire Sirene — vérifiez la saisie.', false);
        } else {
          status.hidden = true; // panne / rate-limit : silencieux, jamais bloquant
        }
      })
      .catch(function () { status.hidden = true; });
  }

  siret.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(check, 400);
  });
})();
```

- [ ] **Step 6 : styles** — ajouter en fin de `public/css/style.css` :

```css
/* ---------- Lot F : vérification SIRET ---------- */
.field-hint { font-size: 0.9rem; margin: 0.25rem 0 0; }
.field-hint-ok { color: #15803d; }
.field-hint-warn { color: #b45309; }
```

- [ ] **Step 7 : couper le réseau Sirene dans les AUTRES fichiers de test** — les
inscriptions de `test/smoke.cjs`, `test/lot-c.cjs`, `test/correctifs.cjs` et
`test/ameliorations.cjs` passeraient désormais par `lookupSiret` (appel réseau réel,
jusqu'à 4 s de timeout chacun). Dans CHACUN de ces 4 fichiers, ajouter à la suite des
autres `process.env.*` d'en-tête :

```js
process.env.SIRET_LOOKUP_DISABLED = '1';
```

- [ ] **Step 8 : vérifier le succès**

Run : `node test/lot-f.cjs`
Attendu : 17 ✓.
Run : `npm test`
Attendu : suite complète verte, sans ralentissement des inscriptions.

- [ ] **Step 9 : commit**

```bash
git add src/controllers/authController.js views/auth/register.twig public/js/siret-check.js public/css/style.css test/lot-f.cjs test/smoke.cjs test/lot-c.cjs test/correctifs.cjs test/ameliorations.cjs
git commit -m "F: verification SIRET en direct a l'inscription + statut stocke au submit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 : badges « École vérifiée » (public + admin) + intégration `npm test`

**Files:**
- Modify: `views/listings/index.twig`, `views/listings/show.twig`, `views/admin/schools.twig`
- Modify: `public/css/style.css`
- Modify: `package.json`, `AGENTS.md`
- Modify: `test/lot-f.cjs`

**Interfaces:**
- Consumes: `School.siretStatus`/`siretVerifiedName` (Task 1) — déjà inclus dans les requêtes publiques (`include: { school: true }`) et admin (`findAllWithCounts`).
- Produces: classe CSS `.badge-verified`.

- [ ] **Step 1 : test qui échoue** — dans `test/lot-f.cjs`, insérer avant le `console.log` final :

```js
    // --- 5. badges « École vérifiée » ---
    const KW = `lotf${STAMP}`;
    const schoolV = await prisma.school.create({
      data: {
        email: `f.badge.ok.${STAMP}@example.test`, passwordHash: 'x', businessName: 'F Badge Ok',
        siret: `3${String(STAMP).slice(-13).padStart(13, '0')}`, emailVerified: true,
        siretStatus: 'verified', siretVerifiedName: 'NOM OFFICIEL SIRENE', siretCheckedAt: new Date(),
      },
    });
    const schoolU = await prisma.school.create({
      data: {
        email: `f.badge.ko.${STAMP}@example.test`, passwordHash: 'x', businessName: 'F Badge Ko',
        siret: `4${String(STAMP).slice(-13).padStart(13, '0')}`, emailVerified: true,
      },
    });
    createdSchoolIds.push(schoolV.id, schoolU.id);
    const lV = await prisma.listing.create({
      data: { title: `${KW} verifiee`, description: 'd', city: 'Pau', department: '64', schoolId: schoolV.id,
        titleLower: `${KW} verifiee`, descriptionLower: 'd', cityLower: 'pau' },
    });
    const lU = await prisma.listing.create({
      data: { title: `${KW} non verifiee`, description: 'd', city: 'Pau', department: '64', schoolId: schoolU.id,
        titleLower: `${KW} non verifiee`, descriptionLower: 'd', cityLower: 'pau' },
    });

    r = await get(`/annonces?q=${KW}`);
    ok((r.text.match(/École vérifiée/g) || []).length === 1,
      'badge : présent une seule fois sur la liste (école vérifiée uniquement)');
    r = await get(`/annonces/${lV.id}`);
    ok(r.text.includes('École vérifiée'), 'badge : présent sur la page détail (école vérifiée)');
    r = await get(`/annonces/${lU.id}`);
    ok(!r.text.includes('École vérifiée'), 'badge : absent sur la page détail (école non vérifiée)');

    // Colonne Sirene côté admin.
    const adminService = require('../src/services/adminService');
    const passwordUtil = require('../src/utils/password');
    const admin = await adminService.create({ email: `f.admin.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('adminpass123') });
    createdAdminIds.push(admin.id);
    const adminJar = makeJar();
    let ra = await req(adminJar, 'GET', '/admin/connexion');
    ra = await req(adminJar, 'POST', '/admin/connexion', form({ _csrf: csrfFrom(ra.text), email: admin.email, password: 'adminpass123' }));
    ra = await req(adminJar, 'GET', '/admin/ecoles');
    ok(ra.status === 200 && ra.text.includes('NOM OFFICIEL SIRENE') && ra.text.includes('Vérifiée'),
      'admin : colonne Sirene avec statut et nom officiel');
```

(Nettoyage : `schoolV`/`schoolU` sont dans `createdSchoolIds`, les annonces partent en cascade ; l'admin dans `createdAdminIds`.)

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-f.cjs`
Attendu : `❌ ÉCHEC : badge : présent une seule fois...`

- [ ] **Step 3 : badges publics** :

(a) dans `views/listings/index.twig`, carte d'annonce, remplacer :

```twig
            <p class="muted">
              {{ l.city }} ({{ l.department }})
              {% if l.contractType %} · {{ l.contractType }}{% endif %}
              {% if l.hoursPerWeek %} · {{ l.hoursPerWeek }} h/sem{% endif %}
              {% if l.distanceKm %} <span class="badge-distance">à {{ l.distanceKm }} km</span>{% endif %}
            </p>
```

par :

```twig
            <p class="muted">
              {{ l.city }} ({{ l.department }})
              {% if l.contractType %} · {{ l.contractType }}{% endif %}
              {% if l.hoursPerWeek %} · {{ l.hoursPerWeek }} h/sem{% endif %}
              {% if l.distanceKm %} <span class="badge-distance">à {{ l.distanceKm }} km</span>{% endif %}
              {% if l.school.siretStatus == 'verified' %} <span class="badge-verified">✓ École vérifiée</span>{% endif %}
            </p>
```

(b) dans `views/listings/show.twig`, remplacer :

```twig
    <p class="muted">Publiée par {{ listing.school.businessName }}</p>
```

par :

```twig
    <p class="muted">
      Publiée par {{ listing.school.businessName }}
      {% if listing.school.siretStatus == 'verified' %} <span class="badge-verified">✓ École vérifiée</span>{% endif %}
    </p>
```

- [ ] **Step 4 : colonne admin** — dans `views/admin/schools.twig` :

(a) remplacer la ligne d'en-têtes par :

```twig
      <thead><tr><th>Nom</th><th>Email</th><th>SIRET</th><th>Sirene</th><th>Annonces</th><th>Statut</th><th>Actions</th></tr></thead>
```

(b) insérer après la cellule `<td>{{ s.siret }}</td>` :

```twig
            <td>
              {% if s.siretStatus == 'verified' %}
                <span class="badge badge-available">Vérifiée</span>
                {% if s.siretVerifiedName %}<br><span class="muted">{{ s.siretVerifiedName }}</span>{% endif %}
              {% elseif s.siretStatus == 'closed' %}
                <span class="badge badge-rejected">Fermée</span>
              {% elseif s.siretStatus == 'not_found' %}
                <span class="badge badge-rejected">Introuvable</span>
              {% else %}
                <span class="muted">Non vérifiée</span>
              {% endif %}
            </td>
```

- [ ] **Step 5 : style du badge** — ajouter à la suite du bloc Lot F de `public/css/style.css` :

```css
.badge-verified {
  background: #dcfce7;
  color: #166534;
  border-radius: 999px;
  padding: 0 0.5rem;
  font-size: 0.85em;
  white-space: nowrap;
}
```

- [ ] **Step 6 : vérifier le succès**

Run : `node test/lot-f.cjs`
Attendu : 21 ✓, `✅ Lot F tests réussis — 21 assertions.`

- [ ] **Step 7 : intégration suite + AGENTS.md** :

(a) dans `package.json`, ajouter ` && node test/lot-f.cjs` à la fin du script `"test"`.

(b) dans `AGENTS.md`, section « Pièges connus », ajouter la puce :

```markdown
- **API Sirene** (vérification SIRET) : relais interne `/api/siret/:siret` uniquement
  (CSP) ; `SIRET_LOOKUP_DISABLED=1` dans les tests ; cache 1 h dans `src/services/siret.js`.
```

(c) Run : `npm test` — attendu : les 7 fichiers verts (65 + 9 + 25 + 15 + 21 + 33 + 21).

- [ ] **Step 8 : commit**

```bash
git add views/listings/index.twig views/listings/show.twig views/admin/schools.twig public/css/style.css package.json AGENTS.md test/lot-f.cjs
git commit -m "F: badge Ecole verifiee (liste, detail, admin) + lot-f.cjs dans npm test

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
