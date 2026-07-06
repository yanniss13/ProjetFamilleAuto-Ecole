# Lot E — Carte des annonces & recherche par rayon : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter sur `/annonces` une bascule Liste/Carte (un marqueur Leaflet par auto-école) et une recherche par rayon autour d'une ville saisie, avec tri par distance en vue liste.

**Architecture:** App Express 5 + Twig rendue serveur. Les données de la carte sont embarquées dans un bloc `<script type="application/json">` (compatible CSP stricte, pas de nouvel endpoint). Distance : pré-filtre SQL par boîte englobante sur `School.latitude/longitude`, affinage haversine en JS. Géocodage de la ville via le service Nominatim existant + cache mémoire.

**Tech Stack:** Node.js (CommonJS), Express 5, Twig, Prisma (SQLite dev / Postgres prod), Leaflet auto-hébergé (`public/vendor/leaflet/`), tests maison en `.cjs` (fetch natif, assertions `ok()`).

## Global Constraints

- Spec de référence : `docs/superpowers/specs/2026-07-06-lot-e-carte-annonces-design.md`.
- Commentaires de code et messages utilisateur **en français**, style des fichiers existants.
- CSP stricte inchangée (`script-src 'self'`) : aucun JS inline ; seul un bloc de DONNÉES `type="application/json"` est ajouté, avec `<` échappé en `<` côté serveur.
- `|raw` Twig interdit partout SAUF l'exception documentée du bloc `#map-data` (JSON, jamais du HTML) — le commentaire de `src/app.js` doit être mis à jour en conséquence.
- Politique Nominatim : jamais de géocodage à l'affichage sans cache ; TTL 24 h (succès) / 5 min (échec), ~200 entrées max.
- Rayons autorisés : `10, 25, 50, 100` km, défaut `25`. Paramètres d'URL : `vue` (`liste`|`carte`), `ville`, `rayon`.
- Tests : `test/lot-e.cjs`, port **4061**, motif des lots précédents (serveur dédié, données à suffixe `STAMP`, nettoyage en `finally`). `GEOCODING_DISABLED=1` par défaut ; le géocodeur est monkeypatché dans les tests HTTP.
- Commits : préfixe `E:`, se terminant par `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Après chaque tâche : `node test/lot-e.cjs` doit passer ; en fin de lot : `npm test` complet.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/utils/geo.js` (nouveau) | haversine + boîte englobante, sans dépendance |
| `src/services/geocoder.js` | + `geocodeCached` (cache mémoire) |
| `src/services/listingService.js` | `findPublic` avec `center`/`radiusKm` ; + `findPublicForMap` |
| `src/controllers/listingController.js` | `browse` : params `vue`/`ville`/`rayon`, données carte |
| `views/listings/index.twig` | formulaire enrichi, bascule, badges, conteneur carte + bloc JSON |
| `public/js/listings-map.js` (nouveau) | init Leaflet de la vue carte (l'existant `listing-map.js` ne change pas) |
| `public/css/style.css` | styles carte/badges/bascule (ajout en fin de fichier) |
| `test/lot-e.cjs` (nouveau) + `package.json` | tests du lot + intégration `npm test` |

---

### Task 1 : `src/utils/geo.js` (haversine + boîte englobante)

**Files:**
- Create: `src/utils/geo.js`
- Create: `test/lot-e.cjs`

**Interfaces:**
- Produces: `haversineKm(lat1, lng1, lat2, lng2) -> number` (km, flottant) ; `bboxAround(lat, lng, radiusKm) -> { minLat, maxLat, minLng, maxLng }`. Consommés par la Task 3.

- [x] **Step 1 : écrire le test qui échoue** — créer `test/lot-e.cjs` :

```js
/**
 * Tests du Lot E — carte des annonces & recherche par rayon.
 * Spec : docs/superpowers/specs/2026-07-06-lot-e-carte-annonces-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lote-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';

const { haversineKm, bboxAround } = require('../src/utils/geo');

const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ÉCHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function main() {
  // --- 1. utils/geo ---
  const dMA = haversineKm(43.2965, 5.3698, 43.5297, 5.4474); // Marseille -> Aix
  ok(dMA > 22 && dMA < 30, 'geo : Marseille—Aix ≈ 26 km');
  ok(haversineKm(43.3, 5.37, 43.3, 5.37) === 0, 'geo : distance nulle à soi-même');

  const box = bboxAround(43.3, 5.37, 50);
  ok(box.minLat < 43.3 - 0.4 && box.maxLat > 43.3 + 0.4, 'geo : point à ~44 km contenu dans la boîte de 50 km');
  ok(box.maxLat < 43.3 + 0.6, 'geo : point à ~67 km hors de la boîte de 50 km');
  ok(box.minLng < 5.37 && box.maxLng > 5.37, 'geo : la boîte encadre la longitude du centre');

  console.log(`\n✅ Lot E tests réussis — ${passed} assertions.`);
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
```

- [x] **Step 2 : vérifier l'échec**

Run : `node test/lot-e.cjs`
Attendu : `Cannot find module '../src/utils/geo'`

- [x] **Step 3 : implémentation minimale** — créer `src/utils/geo.js` :

```js
// Petites fonctions géographiques partagées (recherche par rayon du Lot E).
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Distance en kilomètres entre deux points (formule de haversine).
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Boîte englobante autour d'un point : pré-filtre SQL grossier (la boîte contient
// toujours le cercle du rayon ; l'affinage exact se fait ensuite par haversine).
function bboxAround(lat, lng, radiusKm) {
  const dLat = radiusKm / 111.32; // 1° de latitude ≈ 111,32 km
  const cosLat = Math.max(0.01, Math.cos(toRad(lat))); // évite une division par ~0 aux pôles
  const dLng = radiusKm / (111.32 * cosLat);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

module.exports = { haversineKm, bboxAround };
```

- [x] **Step 4 : vérifier le succès**

Run : `node test/lot-e.cjs`
Attendu : 5 ✓, `✅ Lot E tests réussis — 5 assertions.`

- [x] **Step 5 : commit**

```bash
git add src/utils/geo.js test/lot-e.cjs
git commit -m "E: utilitaires geo (haversine + boite englobante)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : cache mémoire du géocodage (`geocodeCached`)

**Files:**
- Modify: `src/services/geocoder.js`
- Modify: `test/lot-e.cjs`

**Interfaces:**
- Consumes: `geocode(address)` existant (renvoie `{ lat, lng }` ou `null`).
- Produces: `geocodeCached(ville) -> Promise<{ lat, lng } | null>` — clé normalisée `trim().toLowerCase()`, TTL 24 h (succès) / 5 min (échec), 200 entrées max, éviction la plus ancienne. Consommé par la Task 4.

- [ ] **Step 1 : test qui échoue** — dans `test/lot-e.cjs`, insérer AVANT la ligne `console.log(\`\n✅ Lot E tests réussis...\`)` :

```js
  // --- 2. cache de géocodage ---
  {
    const geocoder = require('../src/services/geocoder');
    const origFetch = global.fetch;
    const origDisabled = process.env.GEOCODING_DISABLED;
    const origNow = Date.now;
    let calls = 0;
    try {
      process.env.GEOCODING_DISABLED = '0';
      global.fetch = async () => { calls += 1; return { ok: true, json: async () => [{ lat: '43.3', lon: '5.37' }] }; };

      const c1 = await geocoder.geocodeCached(`Marseille-${STAMP}`);
      const c2 = await geocoder.geocodeCached(`  MARSEILLE-${STAMP} `);
      ok(c1 && c1.lat === 43.3 && calls === 1, 'cache : 1er appel géocode via le réseau');
      ok(c2 && c2.lat === 43.3 && calls === 1, 'cache : 2e appel (casse/espaces) servi par le cache');

      Date.now = () => origNow() + 25 * 60 * 60 * 1000; // +25 h : entrée expirée
      await geocoder.geocodeCached(`Marseille-${STAMP}`);
      ok(calls === 2, 'cache : entrée expirée re-géocodée');
      Date.now = origNow;

      global.fetch = async () => { calls += 1; return { ok: false }; };
      ok((await geocoder.geocodeCached(`Nulleville-${STAMP}`)) === null, 'cache : ville introuvable -> null');
      await geocoder.geocodeCached(`Nulleville-${STAMP}`);
      ok(calls === 3, 'cache : un échec est aussi mis en cache (pas de 2e appel réseau)');
    } finally {
      global.fetch = origFetch;
      process.env.GEOCODING_DISABLED = origDisabled;
      Date.now = origNow;
    }
  }
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-e.cjs`
Attendu : `❌ ÉCHEC` ou `geocoder.geocodeCached is not a function`

- [ ] **Step 3 : implémentation** — dans `src/services/geocoder.js`, insérer avant `module.exports` :

```js
// Cache mémoire du géocodage des RECHERCHES utilisateur (« autour de : ville »).
// Politique d'usage Nominatim : une même ville n'est géocodée qu'une fois par TTL.
// Les échecs sont aussi mis en cache, plus brièvement (une faute de frappe répétée
// ne doit pas marteler l'API). Taille bornée, éviction de l'entrée la plus ancienne.
const CACHE_MAX = 200;
const CACHE_TTL_OK_MS = 24 * 60 * 60 * 1000; // 24 h
const CACHE_TTL_FAIL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map();

async function geocodeCached(ville) {
  const key = (ville || '').trim().toLowerCase();
  if (!key) return null;

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.coords;

  const coords = await geocode(key);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { coords, expiresAt: Date.now() + (coords ? CACHE_TTL_OK_MS : CACHE_TTL_FAIL_MS) });
  return coords;
}
```

puis remplacer la ligne d'export par :

```js
module.exports = { geocode, coordsFor, geocodeCached };
```

- [ ] **Step 4 : vérifier le succès**

Run : `node test/lot-e.cjs`
Attendu : 10 ✓.

- [ ] **Step 5 : commit**

```bash
git add src/services/geocoder.js test/lot-e.cjs
git commit -m "E: cache memoire du geocodage des recherches (geocodeCached)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : `listingService` — rayon dans `findPublic` + `findPublicForMap`

**Files:**
- Modify: `src/services/listingService.js`
- Modify: `test/lot-e.cjs`

**Interfaces:**
- Consumes: `haversineKm`, `bboxAround` (Task 1).
- Produces:
  - `findPublic({ department, q, page, center, radiusKm })` : `center = { lat, lng } | null`. Avec centre+rayon : items filtrés au rayon, triés par distance croissante, chacun portant `distanceKm` (entier, plancher 1) ; pagination en mémoire ; sans centre : comportement actuel inchangé.
  - `findPublicForMap({ department, q, center, radiusKm }) -> { schools, unlocatedCount }` où `schools = [{ schoolName, latitude, longitude, listings: [{ id, title, city }] }]` (annonces ouvertes d'écoles non suspendues et géolocalisées, groupées par école) et `unlocatedCount` = nb d'annonces filtrées sans coordonnées.

- [ ] **Step 1 : test qui échoue** — dans `test/lot-e.cjs` :

(a) compléter les requires en tête de fichier (sous le require de geo) :

```js
const prisma = require('../src/config/prisma');
const listingService = require('../src/services/listingService');
```

(b) au-dessus de `async function main()` :

```js
const createdSchoolIds = [];
const KW = `lote${STAMP}`;

// Une école + une annonce portant le mot-clé du lot (isolation des données de test).
async function seedSchool(name, siretPrefix, latitude, longitude) {
  const school = await prisma.school.create({
    data: {
      email: `${name.toLowerCase().replace(/\s/g, '')}.${STAMP}@example.test`, passwordHash: 'x',
      businessName: name, siret: `${siretPrefix}${String(STAMP).slice(-13).padStart(13, '0')}`,
      emailVerified: true, latitude, longitude,
    },
  });
  createdSchoolIds.push(school.id);
  return school;
}
async function seedListing(school, title) {
  return prisma.listing.create({
    data: {
      title, description: 'desc', city: 'Ville', department: '13', schoolId: school.id,
      titleLower: title.toLowerCase(), descriptionLower: 'desc', cityLower: 'ville',
    },
  });
}
```

(c) dans `main()`, insérer avant le `console.log` final la section 3, et **envelopper la fin de `main()` d'un `try/finally`** de nettoyage. Concrètement, `main()` devient :

```js
async function main() {
  try {
    // ... sections 1 et 2 existantes inchangées ...

    // --- 3. listingService : rayon + données carte ---
    const MRS = { lat: 43.2965, lng: 5.3698 }; // Marseille
    const schoolNear = await seedSchool('LotE Near', '2', 43.2965, 5.3698); // Marseille
    const schoolFar = await seedSchool('LotE Far', '3', 50.6329, 3.0573); // Lille (~834 km)
    const schoolNoGeo = await seedSchool('LotE NoGeo', '4', null, null);
    const lNear1 = await seedListing(schoolNear, `${KW} proche un`);
    const lNear2 = await seedListing(schoolNear, `${KW} proche deux`);
    const lFar = await seedListing(schoolFar, `${KW} lointaine`);
    await seedListing(schoolNoGeo, `${KW} sans geo`);

    let res = await listingService.findPublic({ q: KW, center: MRS, radiusKm: 50 });
    ok(res.total === 2 && res.items.every((l) => l.schoolId === schoolNear.id),
      'service : rayon 50 km garde Marseille, exclut Lille et la non-localisée');
    ok(res.items[0].distanceKm === 1, 'service : distanceKm entier avec plancher 1 km');

    res = await listingService.findPublic({ q: KW, center: MRS, radiusKm: 1000 });
    ok(res.total === 3, 'service : rayon 1000 km inclut Lille (pas la non-localisée)');
    const far = res.items.find((l) => l.id === lFar.id);
    ok(res.items[res.items.length - 1].id === lFar.id && far.distanceKm > 700 && far.distanceKm < 1000,
      'service : tri par distance croissante, Lille en dernier (~834 km)');

    res = await listingService.findPublic({ q: KW });
    ok(res.total === 4 && res.items.every((l) => l.distanceKm === undefined),
      'service : sans rayon, comportement inchangé (4 annonces, pas de distanceKm)');

    let m = await listingService.findPublicForMap({ q: KW });
    ok(m.schools.length === 2, 'service : carte = 2 écoles géolocalisées');
    const near = m.schools.find((s) => s.schoolName === 'LotE Near');
    ok(near && near.listings.length === 2 && near.listings.some((l) => l.id === lNear1.id) && near.listings.some((l) => l.id === lNear2.id),
      'service : annonces groupées par école');
    ok(m.unlocatedCount === 1, 'service : 1 annonce sans localisation comptée');

    m = await listingService.findPublicForMap({ q: KW, center: MRS, radiusKm: 50 });
    ok(m.schools.length === 1 && m.schools[0].schoolName === 'LotE Near', 'service : carte filtrée par rayon');

    console.log(`\n✅ Lot E tests réussis — ${passed} assertions.`);
  } finally {
    if (createdSchoolIds.length) {
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    await prisma.$disconnect();
  }
}
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-e.cjs`
Attendu : `❌ ÉCHEC : service : rayon 50 km...` (distanceKm/filtre absents) ou `findPublicForMap is not a function`

- [ ] **Step 3 : implémentation** — dans `src/services/listingService.js` :

(a) en tête, sous le require de pagination :

```js
const { haversineKm, bboxAround } = require('../utils/geo');
```

(b) remplacer intégralement `findPublic` par :

```js
// Annonces ouvertes, filtrables par département, recherche texte et rayon autour d'un
// point, paginées. Recherche insensible à la casse via les colonnes `*Lower`.
// Rayon : pré-filtre SQL par boîte englobante (portable SQLite/PostgreSQL), affinage
// haversine en JS, tri par distance croissante, pagination en mémoire (volume borné
// par la boîte). Chaque item reçoit alors `distanceKm` (entier, plancher 1 km).
async function findPublic({ department, q, page = 1, center = null, radiusKm = null } = {}) {
  const where = { status: 'open', school: { suspended: false } };
  if (department) where.department = department;
  if (q) {
    const term = q.toLowerCase();
    where.OR = [
      { titleLower: { contains: term } },
      { descriptionLower: { contains: term } },
      { cityLower: { contains: term } },
    ];
  }

  if (center && radiusKm) {
    const box = bboxAround(center.lat, center.lng, radiusKm);
    where.school = {
      ...where.school,
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
    };
    const rows = await prisma.listing.findMany({ where, include: { school: true } });
    const items = rows
      .map((l) => ({ l, d: haversineKm(center.lat, center.lng, l.school.latitude, l.school.longitude) }))
      .filter(({ d }) => d <= radiusKm)
      .sort((a, b) => a.d - b.d || b.l.createdAt - a.l.createdAt)
      .map(({ l, d }) => ({ ...l, distanceKm: Math.max(1, Math.round(d)) }));
    const total = items.length;
    const { skip, take } = paginate(page, total);
    return { items: items.slice(skip, skip + take), total };
  }

  const total = await prisma.listing.count({ where });
  const { skip, take } = paginate(page, total);
  const items = await prisma.listing.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { school: true },
    skip,
    take,
  });
  return { items, total };
}
```

(c) après `findPublicById`, ajouter :

```js
// Données de la vue carte : annonces ouvertes filtrées, SANS pagination, groupées par
// école géolocalisée (un marqueur par école). Renvoie aussi le nombre d'annonces dont
// l'école n'a pas de coordonnées (mention « sans localisation » dans la vue).
async function findPublicForMap({ department, q, center = null, radiusKm = null } = {}) {
  const where = { status: 'open', school: { suspended: false } };
  if (department) where.department = department;
  if (q) {
    const term = q.toLowerCase();
    where.OR = [
      { titleLower: { contains: term } },
      { descriptionLower: { contains: term } },
      { cityLower: { contains: term } },
    ];
  }
  const rows = await prisma.listing.findMany({ where, orderBy: { createdAt: 'desc' }, include: { school: true } });

  const located = rows.filter((l) => l.school.latitude != null && l.school.longitude != null);
  const kept = center && radiusKm
    ? located.filter((l) => haversineKm(center.lat, center.lng, l.school.latitude, l.school.longitude) <= radiusKm)
    : located;

  const bySchool = new Map();
  for (const l of kept) {
    let group = bySchool.get(l.schoolId);
    if (!group) {
      group = { schoolName: l.school.businessName, latitude: l.school.latitude, longitude: l.school.longitude, listings: [] };
      bySchool.set(l.schoolId, group);
    }
    group.listings.push({ id: l.id, title: l.title, city: l.city });
  }
  return { schools: [...bySchool.values()], unlocatedCount: rows.length - located.length };
}
```

(d) ajouter `findPublicForMap` à la ligne `module.exports` existante.

- [ ] **Step 4 : vérifier le succès**

Run : `node test/lot-e.cjs`
Attendu : 19 ✓.

- [ ] **Step 5 : commit**

```bash
git add src/services/listingService.js test/lot-e.cjs
git commit -m "E: recherche par rayon (findPublic) + donnees carte groupees par ecole

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : contrôleur + vues (bascule, filtres rayon, badges, carte) + JS/CSS

**Files:**
- Modify: `src/controllers/listingController.js` (fonction `browse`)
- Modify: `views/listings/index.twig` (réécriture complète)
- Modify: `src/app.js` (commentaire autoescape, lignes 34-35)
- Create: `public/js/listings-map.js`
- Modify: `public/css/style.css` (ajout en fin de fichier)
- Modify: `test/lot-e.cjs`

**Interfaces:**
- Consumes: `geocoder.geocodeCached` (Task 2), `listingService.findPublic` / `findPublicForMap` (Task 3), `parsePage`/`paginate`/`pageUrl` (`src/utils/pagination.js`, existants).
- Produces: variables de vue `vue`, `filters { departement, q, ville, rayon }`, `rayons`, `villeIntrouvable`, `listeUrl`, `carteUrl`, `unlocatedCount`, `mapJson` ; bloc HTML `#map-data` + conteneur `#listings-map`.

- [ ] **Step 1 : tests HTTP qui échouent** — dans `test/lot-e.cjs` :

(a) compléter les requires en tête (sous listingService) :

```js
const app = require('../src/app');
const geocoder2 = require('../src/services/geocoder');

const PORT = 4061;
const BASE = `http://127.0.0.1:${PORT}`;

async function get(urlPath) {
  const res = await fetch(BASE + urlPath, { redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}
function mapDataFrom(html) {
  const m = html.match(/<script type="application\/json" id="map-data">(.*?)<\/script>/s);
  if (!m) return null;
  return JSON.parse(m[1]);
}
```

(b) au début de `main()` (première ligne du `try`) :

```js
    const server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));
```

et dans le `finally`, AVANT `prisma.$disconnect()` :

```js
    await new Promise((r) => server.close(r));
```

(attention à l'ordre final du `finally` : fermeture serveur → suppression écoles → `$disconnect`).

(c) insérer la section 4 avant le `console.log` final (elle réutilise les écoles/annonces de la section 3) :

```js
    // --- 4. HTTP : liste avec rayon, bascule, vue carte ---
    const origGeocodeCached = geocoder2.geocodeCached;
    try {
      // Géocodeur simulé : « Marseille » connu, tout le reste introuvable. Pas de réseau.
      geocoder2.geocodeCached = async (v) => (String(v).toLowerCase().includes('marseille') ? { lat: 43.2965, lng: 5.3698 } : null);

      let r = await get(`/annonces?q=${KW}&ville=Marseille&rayon=50`);
      ok(r.status === 200 && r.text.includes(`${KW} proche un`) && !r.text.includes(`${KW} lointaine`),
        'HTTP : rayon 50 km filtre la liste (Marseille gardée, Lille exclue)');
      ok(/à \d+ km/.test(r.text), 'HTTP : badge « à X km » affiché avec rayon actif');

      r = await get(`/annonces?q=${KW}&ville=Marseille&rayon=100`);
      ok(!r.text.includes(`${KW} sans geo`), 'HTTP : annonce sans localisation exclue de la liste avec rayon');

      r = await get(`/annonces?q=${KW}&ville=Nulleville&rayon=50`);
      ok(r.text.includes('Ville introuvable') && r.text.includes(`${KW} lointaine`),
        'HTTP : ville introuvable -> message + rayon ignoré (liste complète)');

      r = await get(`/annonces?q=${KW}`);
      ok(r.text.includes('vue=carte'), 'HTTP : lien de bascule vers la vue carte présent');

      r = await get(`/annonces?q=${KW}&vue=carte`);
      const data = mapDataFrom(r.text);
      ok(Boolean(data), 'HTTP : bloc JSON #map-data présent en vue carte');
      ok(data.schools.length === 2 && data.schools.some((s) => s.schoolName === 'LotE Near') && data.schools.some((s) => s.schoolName === 'LotE Far'),
        'HTTP : les 2 écoles géolocalisées sont sur la carte');
      ok(data.center === null, 'HTTP : pas de centre sans recherche de ville');
      ok(r.text.includes('1 annonce(s) sans localisation'), 'HTTP : mention des annonces non localisées');
      ok(r.text.includes('id="listings-map"') && r.text.includes('/js/listings-map.js'),
        'HTTP : conteneur carte + script statique référencés');

      r = await get(`/annonces?q=${KW}&vue=carte&ville=Marseille&rayon=50`);
      const data50 = mapDataFrom(r.text);
      ok(data50.schools.length === 1 && data50.schools[0].schoolName === 'LotE Near',
        'HTTP : carte filtrée par rayon');
      ok(data50.center && data50.center.radiusKm === 50, 'HTTP : centre + rayon transmis à la carte');

      // Département invalide toléré (chaîne libre) mais filtre appliqué en vue carte.
      r = await get(`/annonces?q=${KW}&vue=carte&departement=99`);
      ok(mapDataFrom(r.text).schools.length === 0, 'HTTP : filtre département actif en vue carte');

      // École suspendue : disparaît de la carte.
      await prisma.school.update({ where: { id: schoolFar.id }, data: { suspended: true } });
      r = await get(`/annonces?q=${KW}&vue=carte`);
      ok(mapDataFrom(r.text).schools.every((s) => s.schoolName !== 'LotE Far'),
        'HTTP : école suspendue absente de la carte');
      await prisma.school.update({ where: { id: schoolFar.id }, data: { suspended: false } });
    } finally {
      geocoder2.geocodeCached = origGeocodeCached;
    }
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-e.cjs`
Attendu : `❌ ÉCHEC : HTTP : rayon 50 km filtre la liste...`

- [ ] **Step 3 : implémentation contrôleur** — dans `src/controllers/listingController.js` :

(a) en tête, sous le require de pagination :

```js
const geocoder = require('../services/geocoder');

// Rayons de recherche proposés (km). Défaut : 25.
const RAYONS = [10, 25, 50, 100];
```

(b) remplacer intégralement la fonction `browse` par :

```js
// GET /annonces  (?departement=, ?q=, ?ville=, ?rayon=, ?vue=, ?page=)
async function browse(req, res, next) {
  try {
    const { departement, q } = req.query;
    const ville = (typeof req.query.ville === 'string' ? req.query.ville : '').trim();
    const rayonParsed = parseInt(req.query.rayon, 10);
    const rayon = RAYONS.includes(rayonParsed) ? rayonParsed : 25;
    const vue = req.query.vue === 'carte' ? 'carte' : 'liste';
    const page = parsePage(req.query.page);

    // Rayon actif seulement si la ville saisie est localisable (cache Nominatim).
    let center = null;
    let villeIntrouvable = false;
    if (ville) {
      center = await geocoder.geocodeCached(ville);
      if (!center) villeIntrouvable = true;
    }

    const query = { departement: departement || '', q: q || '', ville, rayon: ville ? String(rayon) : '' };
    const common = {
      title: 'Annonces',
      filters: { departement: query.departement, q: query.q, ville, rayon },
      rayons: RAYONS,
      vue,
      villeIntrouvable,
      listeUrl: pageUrl('/annonces', query, 1),
      carteUrl: pageUrl('/annonces', { ...query, vue: 'carte' }, 1),
    };

    if (vue === 'carte') {
      const { schools, unlocatedCount } = await listingService.findPublicForMap({
        department: departement, q, center, radiusKm: center ? rayon : null,
      });
      const mapData = { schools, center: center ? { lat: center.lat, lng: center.lng, radiusKm: rayon } : null };
      return res.render('listings/index', {
        ...common,
        listings: [],
        unlocatedCount,
        // Bloc <script type="application/json"> : « < » échappé pour qu'aucune donnée
        // (titre d'annonce...) ne puisse fermer le bloc. Rendu avec |raw : voir le
        // commentaire autoescape de app.js (unique exception, JSON jamais HTML).
        mapJson: JSON.stringify(mapData).replace(/</g, '\\u003c'),
      });
    }

    const { items, total } = await listingService.findPublic({
      department: departement, q, page, center, radiusKm: center ? rayon : null,
    });
    const { page: current, pageCount } = paginate(page, total);
    res.render('listings/index', {
      ...common,
      listings: items,
      pagination: {
        page: current,
        pageCount,
        prevUrl: current > 1 ? pageUrl('/annonces', query, current - 1) : null,
        nextUrl: current < pageCount ? pageUrl('/annonces', query, current + 1) : null,
      },
    });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 4 : implémentation vue** — remplacer intégralement `views/listings/index.twig` par :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <div class="page-header"><h1>Annonces</h1></div>

  <form action="/annonces" method="get" class="filter-bar">
    {% if vue == 'carte' %}<input type="hidden" name="vue" value="carte">{% endif %}
    <input type="text" name="q" value="{{ filters.q }}" placeholder="Mot-clé (poste, ville…)">
    <input type="text" name="departement" value="{{ filters.departement }}" placeholder="Département (ex. 13)">
    <input type="text" name="ville" value="{{ filters.ville }}" placeholder="Autour de… (ville)">
    <select name="rayon" aria-label="Rayon de recherche">
      {% for r in rayons %}
        <option value="{{ r }}" {% if filters.rayon == r %}selected{% endif %}>{{ r }} km</option>
      {% endfor %}
    </select>
    <button type="submit" class="btn">Filtrer</button>
  </form>

  <div class="view-toggle">
    <a href="{{ listeUrl }}" class="btn btn-small {% if vue == 'liste' %}btn-primary{% endif %}">Liste</a>
    <a href="{{ carteUrl }}" class="btn btn-small {% if vue == 'carte' %}btn-primary{% endif %}">Carte</a>
  </div>

  {% if villeIntrouvable %}
    <div class="flash flash-error" role="alert">Ville introuvable — le filtre de rayon a été ignoré.</div>
  {% endif %}

  {% if vue == 'carte' %}
    <div id="listings-map"></div>
    {% if unlocatedCount > 0 %}
      <p class="muted">{{ unlocatedCount }} annonce(s) sans localisation — consultez la vue liste.</p>
    {% endif %}
    {# Bloc de DONNÉES (non exécutable, hors CSP script-src). JSON échappé côté
       serveur (« < » -> séquence unicode) : unique usage documenté de |raw. #}
    <script type="application/json" id="map-data">{{ mapJson|raw }}</script>
  {% else %}
    {% if listings|length == 0 %}
      <p class="muted">Aucune annonce ne correspond à votre recherche.</p>
    {% else %}
      <ul class="listing-list">
        {% for l in listings %}
          <li class="listing-card">
            <a href="/annonces/{{ l.id }}"><h2>{{ l.title }}</h2></a>
            <p class="muted">
              {{ l.city }} ({{ l.department }})
              {% if l.contractType %} · {{ l.contractType }}{% endif %}
              {% if l.hoursPerWeek %} · {{ l.hoursPerWeek }} h/sem{% endif %}
              {% if l.distanceKm %} <span class="badge-distance">à {{ l.distanceKm }} km</span>{% endif %}
            </p>
            <p>{{ l.description }}</p>
            <p><a href="/annonces/{{ l.id }}" class="btn btn-small">Voir &amp; postuler</a></p>
          </li>
        {% endfor %}
      </ul>
      {% include 'partials/pagination.twig' %}
    {% endif %}
  {% endif %}
{% endblock %}

{# Assets carto chargés uniquement en vue carte. #}
{% block head %}
  {% if vue == 'carte' %}
    <link rel="stylesheet" href="/vendor/leaflet/leaflet.css">
  {% endif %}
{% endblock %}

{% block scripts %}
  {% if vue == 'carte' %}
    <script src="/vendor/leaflet/leaflet.js"></script>
    <script src="/js/listings-map.js"></script>
  {% endif %}
{% endblock %}
```

- [ ] **Step 5 : commentaire autoescape** — dans `src/app.js`, remplacer :

```js
// Moteur de vues Twig. autoescape activé : toute {{ variable }} est échappée
// (anti-XSS stocké). Aucune vue n'utilise |raw.
```

par :

```js
// Moteur de vues Twig. autoescape activé : toute {{ variable }} est échappée
// (anti-XSS stocké). Unique usage de |raw : le bloc de données JSON #map-data de
// listings/index.twig (JSON.stringify avec « < » échappé côté serveur, jamais du HTML).
```

- [ ] **Step 6 : JS de la carte** — créer `public/js/listings-map.js` :

```js
// Carte des annonces (/annonces?vue=carte) : lit le bloc JSON #map-data et affiche un
// marqueur par auto-école (popup = ses annonces ouvertes), plus le cercle du rayon si
// une ville est recherchée. Aucune donnée n'est insérée en HTML : DOM + textContent.
(function () {
  var el = document.getElementById('listings-map');
  var dataEl = document.getElementById('map-data');
  if (!el || !dataEl || typeof L === 'undefined') return;

  var data;
  try {
    data = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }

  // Icône explicite : sinon Leaflet ne résout pas le chemin des images (marqueur
  // cassé) quand les assets sont servis depuis /vendor/leaflet/.
  var icon = L.icon({
    iconUrl: '/vendor/leaflet/images/marker-icon.png',
    iconRetinaUrl: '/vendor/leaflet/images/marker-icon-2x.png',
    shadowUrl: '/vendor/leaflet/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  var map = L.map(el);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  var bounds = [];
  (data.schools || []).forEach(function (s) {
    var marker = L.marker([s.latitude, s.longitude], { icon: icon }).addTo(map);
    bounds.push([s.latitude, s.longitude]);

    var div = document.createElement('div');
    var name = document.createElement('strong');
    name.textContent = s.schoolName;
    div.appendChild(name);
    var ul = document.createElement('ul');
    ul.className = 'map-popup-listings';
    (s.listings || []).forEach(function (l) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '/annonces/' + encodeURIComponent(l.id);
      a.textContent = l.title + ' — ' + l.city;
      li.appendChild(a);
      ul.appendChild(li);
    });
    div.appendChild(ul);
    marker.bindPopup(div);
  });

  if (data.center) {
    var circle = L.circle([data.center.lat, data.center.lng], {
      radius: data.center.radiusKm * 1000,
      color: '#1d4ed8',
      fillColor: '#1d4ed8',
      fillOpacity: 0.08,
      weight: 1.5,
    }).addTo(map);
    map.fitBounds(circle.getBounds(), { padding: [20, 20] });
  } else if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40] });
  } else {
    map.setView([46.6, 2.4], 6); // vue France par défaut
  }
})();
```

- [ ] **Step 7 : styles** — ajouter en FIN de `public/css/style.css` :

```css
/* ---------- Lot E : vue carte des annonces & rayon ---------- */
#listings-map {
  height: 480px;
  border-radius: 8px;
  margin-bottom: 1rem;
}
.view-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.badge-distance {
  background: #eef2ff;
  color: #3730a3;
  border-radius: 999px;
  padding: 0 0.5rem;
  font-size: 0.85em;
  white-space: nowrap;
}
.map-popup-listings {
  margin: 0.25rem 0 0;
  padding-left: 1rem;
}
```

- [ ] **Step 8 : vérifier le succès**

Run : `node test/lot-e.cjs`
Attendu : 33 ✓, `✅ Lot E tests réussis — 33 assertions.`

- [ ] **Step 9 : commit**

```bash
git add src/controllers/listingController.js views/listings/index.twig src/app.js public/js/listings-map.js public/css/style.css test/lot-e.cjs
git commit -m "E: bascule liste/carte, recherche par rayon et badges distance sur /annonces

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 : intégration `npm test` + non-régression complète

**Files:**
- Modify: `package.json` (ligne `"test"`)

**Interfaces:**
- Consumes: `test/lot-e.cjs` complet (Tasks 1-4).

- [ ] **Step 1 : brancher le test dans la suite** — dans `package.json`, remplacer :

```json
"test": "node test/smoke.cjs && node test/lot-a.cjs && node test/lot-c.cjs && node test/correctifs.cjs && node test/ameliorations.cjs"
```

par :

```json
"test": "node test/smoke.cjs && node test/lot-a.cjs && node test/lot-c.cjs && node test/correctifs.cjs && node test/ameliorations.cjs && node test/lot-e.cjs"
```

- [ ] **Step 2 : suite complète**

Run : `npm test`
Attendu : les 6 fichiers verts (65 + 9 + 25 + 15 + 21 + 33 assertions), aucun ÉCHEC.

- [ ] **Step 3 : vérification visuelle (recommandée)** — `npm run dev`, ouvrir `http://localhost:3000/annonces?vue=carte` : carte France avec marqueurs, popup au clic, puis une recherche « Marseille / 50 km » (nécessite une école géocodée en base ; sinon vérifier l'état vide + cercle).

- [ ] **Step 4 : commit**

```bash
git add package.json
git commit -m "E: lot-e.cjs integre a npm test

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
