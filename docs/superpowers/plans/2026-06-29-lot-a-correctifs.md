# Lot A — Correctifs : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 4 défauts du MVP : fichiers sensibles orphelins à la suppression d'une annonce, recherche sensible à la casse, absence de pagination, et CSP désactivée.

**Architecture:** App Express 5 + Twig (twig.js) + Prisma 6 (SQLite en dev). On ajoute un helper de suppression de fichiers best-effort, une pagination via un utilitaire partagé et un partial Twig, des colonnes `*Lower` pour une recherche insensible à la casse portable, et on active une CSP stricte après avoir retiré les éléments inline des vues.

**Tech Stack:** Node.js, Express 5, Twig, Prisma 6, helmet 8, tests en Node natif (pas de framework) via `node test/*.cjs`.

## Global Constraints

- **Taille de page : 20** (constante unique `PAGE_SIZE` dans `src/utils/pagination.js`).
- **Suppression de fichiers best-effort** : une erreur disque ne doit jamais propager / faire échouer la suppression logique ; on log, on continue.
- **Portabilité SQLite (dev) + PostgreSQL (prod)** : tout SQL custom (backfill) doit fonctionner sur les deux. `lower()` est commun aux deux.
- **CSP sans `unsafe-inline`** : aucun `onclick`/`onsubmit`/`style="..."`/`<script>` inline ne doit subsister dans les vues.
- **Tri inchangé** : `createdAt desc` partout. Pas de tri configurable.
- Tests lancés par `npm test`. Chaque tâche se termine par `npm test` au vert + un commit.

---

### Task 1 : A1 — Nettoyage des fichiers à la suppression d'une annonce

**Files:**
- Modify: `src/config/storage.js` (ajout `deleteStored`)
- Modify: `src/services/listingService.js` (ajout `findFilePathsForListing`)
- Modify: `src/controllers/listingController.js:119-132` (`destroy`)
- Test: `test/smoke.cjs` (ajout d'assertions de suppression + capture des en-têtes)

**Interfaces:**
- Produces:
  - `storage.deleteStored(relPath: string|null|undefined): void` — supprime le fichier (best-effort, ne lève jamais).
  - `listingService.findFilePathsForListing(schoolId: number, id: number): Promise<string[]>` — chemins relatifs stockés (CV/CNI/permis/carte de chaque candidature + PDF de contrat), pour une annonce possédée par `schoolId`.

- [ ] **Step 1 : Écrire l'assertion qui échoue (smoke.cjs)**

Dans `test/smoke.cjs`, modifier la fonction `req` pour exposer les en-têtes (ajouter `headers`) :

```javascript
  storeCookies(jar, res);
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), headers: res.headers, text };
```

Puis, juste **avant** la ligne `console.log(`\n✅ Smoke test réussi`...)` (après la section cloisonnement, ~ligne 267), ajouter :

```javascript
    // A1) Suppression de l'annonce : les fichiers sensibles doivent disparaître du disque.
    const marieCv = path.join(STORAGE_DIR, marie.cvPath);
    const marieId = path.join(STORAGE_DIR, marie.idCardPath);
    r = await req(jarA, 'POST', `/mes-annonces/${listing.id}/supprimer`, form({ _csrf: csrfA }));
    ok(r.status === 302, 'Suppression de l’annonce -> redirection');
    ok(!fs.existsSync(cvAbs) && !fs.existsSync(idAbs) && !fs.existsSync(licAbs) && !fs.existsSync(teachAbs),
      'A1 : pièces de Jean (CV/CNI/permis/carte) supprimées du stockage');
    ok(!fs.existsSync(pdfAbs), 'A1 : PDF de contrat supprimé du stockage');
    ok(!fs.existsSync(marieCv) && !fs.existsSync(marieId), 'A1 : pièces de Marie supprimées du stockage');
    const goneListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    ok(!goneListing, 'A1 : annonce supprimée en base');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC sur `A1 : pièces de Jean ... supprimées du stockage` (les fichiers existent encore car `destroy` ne nettoie pas le disque).

- [ ] **Step 3 : Ajouter `deleteStored` à `src/config/storage.js`**

Remplacer le bloc `module.exports` par :

```javascript
// Supprime un fichier du stockage privé en best-effort : tolère l'absence et ne lève
// jamais (une erreur disque ne doit pas empêcher une suppression logique en base).
function deleteStored(relPath) {
  if (!relPath) return;
  const abs = resolveStored(relPath);
  if (!abs) return;
  try {
    fs.rmSync(abs, { force: true });
  } catch (err) {
    console.warn(`deleteStored: échec suppression ${relPath}:`, err.message);
  }
}

module.exports = { STORAGE_DIR, SUBDIRS, resolveStored, deleteStored };
```

- [ ] **Step 4 : Ajouter `findFilePathsForListing` à `src/services/listingService.js`**

Ajouter cette fonction (avant `module.exports`) et l'exporter :

```javascript
// Tous les chemins de fichiers privés rattachés à une annonce possédée par l'école :
// pièces des candidatures + PDF de contrat. Sert au nettoyage disque avant suppression.
async function findFilePathsForListing(schoolId, id) {
  const apps = await prisma.application.findMany({
    where: { listingId: id, listing: { schoolId } },
    include: { contract: true },
  });
  const paths = [];
  for (const a of apps) {
    paths.push(a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath);
    if (a.contract) paths.push(a.contract.pdfPath);
  }
  return paths.filter(Boolean);
}
```

Et l'ajouter à l'objet exporté :

```javascript
module.exports = {
  findPublic,
  findPublicById,
  findAllBySchool,
  findOwnedById,
  createForSchool,
  updateOwned,
  deleteOwned,
  deleteStored: undefined, // (placeholder retiré ci-dessous)
  countBySchool,
  findFilePathsForListing,
};
```

> Note : ne pas laisser la ligne `deleteStored: undefined`. Le bloc final correct est :
> `module.exports = { findPublic, findPublicById, findAllBySchool, findOwnedById, createForSchool, updateOwned, deleteOwned, countBySchool, findFilePathsForListing };`

- [ ] **Step 5 : Brancher le nettoyage dans `destroy` (`src/controllers/listingController.js`)**

Remplacer la fonction `destroy` par :

```javascript
// POST /mes-annonces/:id/supprimer
async function destroy(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    // On collecte les chemins AVANT la suppression (la cascade DB efface les candidatures).
    const filePaths = await listingService.findFilePathsForListing(req.school.id, id);
    // deleteOwned est scopé par schoolId : count 0 => annonce inexistante ou non possédée.
    const { count } = await listingService.deleteOwned(req.school.id, id);
    if (count === 0) return notFound(res);
    for (const rel of filePaths) deleteStored(rel); // best-effort, ne bloque jamais
    req.flash('success', 'Annonce supprimée (ainsi que ses candidatures).');
    res.redirect('/mes-annonces');
  } catch (err) {
    next(err);
  }
}
```

Et en haut du fichier, ajouter l'import :

```javascript
const { deleteStored } = require('../config/storage');
```

- [ ] **Step 6 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont les 4 nouvelles assertions `A1 : ...`.

- [ ] **Step 7 : Commit**

```bash
git add src/config/storage.js src/services/listingService.js src/controllers/listingController.js test/smoke.cjs
git commit -m "$(printf 'A1: supprime les fichiers sensibles a la suppression d une annonce\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2 : A3 (1/2) — Pagination : utilitaire, partial, et annonces publiques

**Files:**
- Create: `src/utils/pagination.js`
- Create: `views/partials/pagination.twig`
- Modify: `src/services/listingService.js` (`findPublic` paginé)
- Modify: `src/controllers/listingController.js` (`browse`)
- Modify: `views/listings/index.twig` (inclusion du partial)
- Modify: `public/css/style.css` (styles `.pagination`)
- Create: `test/lot-a.cjs`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `pagination.PAGE_SIZE: number` (= 20)
  - `pagination.parsePage(raw: any): number` — entier ≥ 1, défaut 1.
  - `pagination.paginate(page: number, total: number): { page, pageCount, skip, take }` — `page` clampé dans `[1, pageCount]`, `pageCount ≥ 1`.
  - `pagination.pageUrl(basePath: string, query: object, page: number): string` — URL conservant les paramètres non vides + `page`.
  - `listingService.findPublic({ department, q, page }): Promise<{ items: Listing[], total: number }>`
  - Objet `pagination` passé aux vues : `{ page, pageCount, prevUrl: string|null, nextUrl: string|null }`.

- [ ] **Step 1 : Écrire le test qui échoue (`test/lot-a.cjs`)**

Créer `test/lot-a.cjs` :

```javascript
/**
 * Tests ciblés du Lot A (pagination). Crée ses propres données et les nettoie.
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lota-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const listingService = require('../src/services/listingService');
const { PAGE_SIZE } = require('../src/utils/pagination');

const PORT = 4056;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ÉCHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));
  const tag = `PG${STAMP}`;
  const school = await prisma.school.create({
    data: {
      email: `pg.${STAMP}@example.test`, passwordHash: 'x',
      businessName: 'Pagination', siret: `9${String(STAMP).slice(-13).padStart(13, '0')}`,
    },
  });
  try {
    for (let i = 0; i < PAGE_SIZE + 1; i++) {
      await listingService.createForSchool(school.id, {
        title: `${tag} Annonce ${i}`, description: 'Poste', city: 'Lyon', department: '69',
      });
    }

    // A3 — pagination publique au niveau service
    const p1 = await listingService.findPublic({ q: tag, page: 1 });
    ok(p1.items.length === PAGE_SIZE && p1.total === PAGE_SIZE + 1, 'A3 findPublic page 1 = 20 / total 21');
    const p2 = await listingService.findPublic({ q: tag, page: 2 });
    ok(p2.items.length === 1, 'A3 findPublic page 2 = 1');

    // A3 — rendu du partial sur la page publique (route publique, sans auth)
    const res = await fetch(`${BASE}/annonces?q=${tag}&page=1`, { redirect: 'manual' });
    const html = await res.text();
    ok(/page\s*1\s*\/\s*2/.test(html), 'A3 partial affiche « page 1 / 2 »');
    ok(html.includes(`/annonces?q=${tag}&page=2`), 'A3 lien « Suivant » conserve le filtre q');

    console.log(`\n✅ Lot A tests réussis — ${passed} assertions.`);
  } finally {
    await prisma.listing.deleteMany({ where: { schoolId: school.id } });
    await prisma.school.delete({ where: { id: school.id } });
    await prisma.$disconnect();
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
```

Mettre à jour `package.json` (script `test`) :

```json
    "test": "node test/smoke.cjs && node test/lot-a.cjs",
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC — `Cannot find module '../src/utils/pagination'` (l'utilitaire n'existe pas encore).

- [ ] **Step 3 : Créer `src/utils/pagination.js`**

```javascript
// Pagination partagée : taille de page, calcul des bornes, et construction d'URL
// conservant les paramètres de requête courants.
const PAGE_SIZE = 20;

function parsePage(raw) {
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function paginate(page, total) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  return { page: current, pageCount, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

function pageUrl(basePath, query, page) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') params.append(k, v);
  }
  params.set('page', String(page));
  return `${basePath}?${params.toString()}`;
}

module.exports = { PAGE_SIZE, parsePage, paginate, pageUrl };
```

- [ ] **Step 4 : Rendre `findPublic` paginé (`src/services/listingService.js`)**

Remplacer la fonction `findPublic` par :

```javascript
async function findPublic({ department, q, page = 1 } = {}) {
  const where = { status: 'open' };
  if (department) where.department = department;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { city: { contains: q } },
    ];
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

Et en haut du fichier, importer `paginate` :

```javascript
const { paginate } = require('../utils/pagination');
```

> Note : la casse de la recherche sera corrigée en Task 4 (colonnes `*Lower`). Ici on conserve l'ancien comportement, on ajoute seulement la pagination.

- [ ] **Step 5 : Mettre à jour `browse` (`src/controllers/listingController.js`)**

Remplacer la fonction `browse` par :

```javascript
// GET /annonces  (?departement=, ?q=, ?page=)
async function browse(req, res, next) {
  try {
    const { departement, q } = req.query;
    const page = parsePage(req.query.page);
    const { items, total } = await listingService.findPublic({ department: departement, q, page });
    const { page: current, pageCount } = paginate(page, total);
    const query = { departement: departement || '', q: q || '' };
    res.render('listings/index', {
      title: 'Annonces',
      listings: items,
      filters: query,
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

Et en haut du fichier, ajouter l'import :

```javascript
const { parsePage, paginate, pageUrl } = require('../utils/pagination');
```

- [ ] **Step 6 : Créer le partial `views/partials/pagination.twig`**

```twig
{% if pagination and pagination.pageCount > 1 %}
  <nav class="pagination" aria-label="Pagination">
    {% if pagination.prevUrl %}
      <a class="btn btn-small" href="{{ pagination.prevUrl }}">← Précédent</a>
    {% else %}
      <span class="btn btn-small btn-disabled" aria-disabled="true">← Précédent</span>
    {% endif %}
    <span class="pagination-status">page {{ pagination.page }} / {{ pagination.pageCount }}</span>
    {% if pagination.nextUrl %}
      <a class="btn btn-small" href="{{ pagination.nextUrl }}">Suivant →</a>
    {% else %}
      <span class="btn btn-small btn-disabled" aria-disabled="true">Suivant →</span>
    {% endif %}
  </nav>
{% endif %}
```

- [ ] **Step 7 : Inclure le partial dans `views/listings/index.twig`**

Remplacer la fin du bloc (à partir de `{% if listings|length == 0 %}`) par :

```twig
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
          </p>
          <p>{{ l.description }}</p>
          <p><a href="/annonces/{{ l.id }}" class="btn btn-small">Voir &amp; postuler</a></p>
        </li>
      {% endfor %}
    </ul>
    {% include 'partials/pagination.twig' %}
  {% endif %}
```

- [ ] **Step 8 : Ajouter les styles de pagination à `public/css/style.css`**

Ajouter à la fin du fichier :

```css
.pagination { display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin: 1.5rem 0; }
.pagination-status { color: var(--color-muted); font-size: 0.9rem; }
.btn-disabled { opacity: 0.5; pointer-events: none; }
```

- [ ] **Step 9 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS (smoke + Lot A), dont les 4 assertions `A3 ...`.

- [ ] **Step 10 : Commit**

```bash
git add src/utils/pagination.js views/partials/pagination.twig src/services/listingService.js src/controllers/listingController.js views/listings/index.twig public/css/style.css test/lot-a.cjs package.json
git commit -m "$(printf 'A3: pagination de la liste publique des annonces\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3 : A3 (2/2) — Pagination du dashboard et des candidatures

**Files:**
- Modify: `src/services/listingService.js` (`findAllBySchool` paginé)
- Modify: `src/services/applicationService.js` (`findForOwnedListing` paginé)
- Modify: `src/controllers/listingController.js` (`mine`)
- Modify: `src/controllers/applicationController.js` (`forListing`)
- Modify: `views/dashboard/listings.twig` (inclusion du partial)
- Modify: `views/dashboard/applications.twig` (inclusion du partial)
- Test: `test/lot-a.cjs` (ajout d'assertions)

**Interfaces:**
- Consumes: `pagination.{PAGE_SIZE,parsePage,paginate,pageUrl}` (Task 2).
- Produces:
  - `listingService.findAllBySchool(schoolId, page): Promise<{ items, total }>`
  - `applicationService.findForOwnedListing(schoolId, listingId, page): Promise<{ items, total }>`

- [ ] **Step 1 : Écrire les tests qui échouent (`test/lot-a.cjs`)**

Dans `test/lot-a.cjs`, juste avant la ligne `console.log(`\n✅ Lot A tests réussis`...)`, ajouter :

```javascript
    // A3 — pagination "mes annonces" (école)
    const m1 = await listingService.findAllBySchool(school.id, 1);
    ok(m1.items.length === PAGE_SIZE && m1.total === PAGE_SIZE + 1, 'A3 findAllBySchool page 1 = 20 / total 21');
    const m2 = await listingService.findAllBySchool(school.id, 2);
    ok(m2.items.length === 1, 'A3 findAllBySchool page 2 = 1');

    // A3 — pagination des candidatures d'une annonce
    const target = m1.items[0];
    for (let i = 0; i < PAGE_SIZE + 1; i++) {
      await prisma.application.create({
        data: {
          listingId: target.id, applicantName: `Cand ${i}`,
          applicantEmail: `cand${i}.${STAMP}@example.test`, message: 'Bonjour',
        },
      });
    }
    const a1 = await applicationService.findForOwnedListing(school.id, target.id, 1);
    ok(a1.items.length === PAGE_SIZE && a1.total === PAGE_SIZE + 1, 'A3 findForOwnedListing page 1 = 20 / total 21');
    const a2 = await applicationService.findForOwnedListing(school.id, target.id, 2);
    ok(a2.items.length === 1, 'A3 findForOwnedListing page 2 = 1');
```

Et ajouter l'import en haut du fichier (sous les autres `require`) :

```javascript
const applicationService = require('../src/services/applicationService');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC — `A3 findAllBySchool page 1 = 20 / total 21` (la fonction renvoie encore un tableau de 21, donc `.items` est `undefined`).

- [ ] **Step 3 : Paginer `findAllBySchool` (`src/services/listingService.js`)**

Remplacer la fonction `findAllBySchool` par :

```javascript
async function findAllBySchool(schoolId, page = 1) {
  const where = { schoolId };
  const total = await prisma.listing.count({ where });
  const { skip, take } = paginate(page, total);
  const items = await prisma.listing.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take });
  return { items, total };
}
```

- [ ] **Step 4 : Paginer `findForOwnedListing` (`src/services/applicationService.js`)**

Remplacer la fonction `findForOwnedListing` par :

```javascript
async function findForOwnedListing(schoolId, listingId, page = 1) {
  const where = { listingId, listing: { schoolId } };
  const total = await prisma.application.count({ where });
  const { skip, take } = paginate(page, total);
  const items = await prisma.application.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { contract: true },
    skip,
    take,
  });
  return { items, total };
}
```

Et en haut du fichier, importer `paginate` :

```javascript
const { paginate } = require('../utils/pagination');
```

- [ ] **Step 5 : Mettre à jour `mine` (`src/controllers/listingController.js`)**

Remplacer la fonction `mine` par :

```javascript
// GET /mes-annonces  (?page=)
async function mine(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const { items, total } = await listingService.findAllBySchool(req.school.id, page);
    const { page: current, pageCount } = paginate(page, total);
    res.render('dashboard/listings', {
      title: 'Mes annonces',
      listings: items,
      pagination: {
        page: current,
        pageCount,
        prevUrl: current > 1 ? pageUrl('/mes-annonces', {}, current - 1) : null,
        nextUrl: current < pageCount ? pageUrl('/mes-annonces', {}, current + 1) : null,
      },
    });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 6 : Mettre à jour `forListing` (`src/controllers/applicationController.js`)**

Remplacer la fonction `forListing` par :

```javascript
// GET /mes-annonces/:id/candidatures  (?page=)  (auto-école propriétaire)
async function forListing(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);

    const listing = await listingService.findOwnedById(req.school.id, id);
    if (!listing) return notFound(res);

    const page = parsePage(req.query.page);
    const { items, total } = await applicationService.findForOwnedListing(req.school.id, id, page);
    const { page: current, pageCount } = paginate(page, total);
    res.render('dashboard/applications', {
      title: 'Candidatures',
      applications: items,
      listing,
      pagination: {
        page: current,
        pageCount,
        prevUrl: current > 1 ? pageUrl(`/mes-annonces/${id}/candidatures`, {}, current - 1) : null,
        nextUrl: current < pageCount ? pageUrl(`/mes-annonces/${id}/candidatures`, {}, current + 1) : null,
      },
    });
  } catch (err) {
    next(err);
  }
}
```

Et en haut du fichier, ajouter l'import :

```javascript
const { parsePage, paginate, pageUrl } = require('../utils/pagination');
```

- [ ] **Step 7 : Inclure le partial dans `views/dashboard/listings.twig`**

Ajouter `{% include 'partials/pagination.twig' %}` juste après `</table>` et avant `{% endif %}` :

```twig
      </tbody>
    </table>
    {% include 'partials/pagination.twig' %}
  {% endif %}
{% endblock %}
```

- [ ] **Step 8 : Inclure le partial dans `views/dashboard/applications.twig`**

Ajouter `{% include 'partials/pagination.twig' %}` juste après `</ul>` (fin de `application-list`) et avant `{% endif %}` :

```twig
      {% endfor %}
    </ul>
    {% include 'partials/pagination.twig' %}
  {% endif %}
{% endblock %}
```

- [ ] **Step 9 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont les assertions `A3 findAllBySchool ...` et `A3 findForOwnedListing ...`.

- [ ] **Step 10 : Commit**

```bash
git add src/services/listingService.js src/services/applicationService.js src/controllers/listingController.js src/controllers/applicationController.js views/dashboard/listings.twig views/dashboard/applications.twig test/lot-a.cjs
git commit -m "$(printf 'A3: pagination du dashboard et des candidatures\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4 : A2 — Recherche insensible à la casse (colonnes normalisées)

**Files:**
- Modify: `prisma/schema.prisma` (3 colonnes `*Lower`)
- Create: `prisma/migrations/<timestamp>_listing_search_lower/migration.sql` (générée puis éditée)
- Modify: `src/services/listingService.js` (`withLower`, `createForSchool`, `updateOwned`, `findPublic`)
- Test: `test/smoke.cjs` (assertions de casse) + `test/lot-a.cjs` (déjà couvert par `q` minuscule, on renforce)

**Interfaces:**
- Consumes: `listingService.findPublic` (Task 2).
- Produces: colonnes `Listing.titleLower`, `Listing.descriptionLower`, `Listing.cityLower` maintenues à jour ; recherche `findPublic` insensible à la casse.

- [ ] **Step 1 : Écrire les assertions qui échouent (`test/smoke.cjs`)**

Dans `test/smoke.cjs`, juste après le bloc de recherche existant (après `ok(r.text.includes(keyword), 'Annonce trouvée par recherche');`, ~ligne 141), ajouter :

```javascript
    r = await req(pub, 'GET', `/annonces?q=${keyword.toLowerCase()}`);
    ok(r.text.includes(keyword), 'A2 : recherche par mot-clé en minuscules trouve l’annonce');
    r = await req(pub, 'GET', '/annonces?q=MARSEILLE');
    ok(r.text.includes(keyword), 'A2 : recherche ville « MARSEILLE » insensible à la casse');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC sur `A2 : recherche par mot-clé en minuscules ...` (la colonne `title` contient la casse d'origine, `contains` ne matche pas la version minuscule sous SQLite).

- [ ] **Step 3 : Ajouter les colonnes au schéma (`prisma/schema.prisma`)**

Dans le `model Listing`, après le champ `status`, ajouter :

```prisma
  // Copies en minuscules pour une recherche insensible à la casse, identique sous
  // SQLite (dev) et PostgreSQL (prod). Maintenues par le service à la création/édition.
  titleLower       String?
  descriptionLower String?
  cityLower        String?
```

- [ ] **Step 4 : Générer la migration sans l'appliquer**

Run: `npx prisma migrate dev --name listing_search_lower --create-only`
Expected: création d'un dossier `prisma/migrations/<timestamp>_listing_search_lower/migration.sql` contenant des `ALTER TABLE "Listing" ADD COLUMN ...`.

- [ ] **Step 5 : Ajouter le backfill à la migration générée**

À la fin du fichier `prisma/migrations/<timestamp>_listing_search_lower/migration.sql`, ajouter :

```sql
-- Backfill des lignes existantes (portable SQLite/PostgreSQL).
UPDATE "Listing" SET "titleLower" = lower("title"), "descriptionLower" = lower("description"), "cityLower" = lower("city");
```

- [ ] **Step 6 : Appliquer la migration**

Run: `npx prisma migrate dev`
Expected: « Already in sync » puis application de la migration `listing_search_lower` ; le client Prisma est régénéré.

- [ ] **Step 7 : Maintenir et utiliser les colonnes (`src/services/listingService.js`)**

Ajouter le helper (avant les fonctions de gestion) :

```javascript
// Ajoute les copies minuscules des champs recherchables présents dans `data`.
function withLower(data) {
  const out = { ...data };
  if (typeof data.title === 'string') out.titleLower = data.title.toLowerCase();
  if (typeof data.description === 'string') out.descriptionLower = data.description.toLowerCase();
  if (typeof data.city === 'string') out.cityLower = data.city.toLowerCase();
  return out;
}
```

Remplacer `createForSchool` et `updateOwned` par :

```javascript
function createForSchool(schoolId, data) {
  return prisma.listing.create({ data: { ...withLower(data), schoolId } });
}
function updateOwned(schoolId, id, data) {
  return prisma.listing.updateMany({ where: { id, schoolId }, data: withLower(data) });
}
```

Dans `findPublic`, remplacer le bloc `if (q) { where.OR = [...] }` par :

```javascript
  if (q) {
    const term = q.toLowerCase();
    where.OR = [
      { titleLower: { contains: term } },
      { descriptionLower: { contains: term } },
      { cityLower: { contains: term } },
    ];
  }
```

- [ ] **Step 8 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont les deux assertions `A2 : ...`. (Le test `lot-a.cjs`, qui cherche `q=${tag}` avec `tag` contenant des majuscules, valide aussi le maintien des colonnes via `createForSchool`.)

- [ ] **Step 9 : Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/services/listingService.js test/smoke.cjs
git commit -m "$(printf 'A2: recherche d annonces insensible a la casse via colonnes normalisees\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5 : A4 — Activer la Content-Security-Policy

**Files:**
- Create: `public/js/confirm.js`
- Modify: `src/app.js:19-21` (CSP)
- Modify: `views/layouts/base.twig` (chargement de `confirm.js`)
- Modify: `views/dashboard/listings.twig` (form suppression → `data-confirm`)
- Modify: `views/dashboard/applications.twig` (form refus → `data-confirm`)
- Modify: `views/dashboard/contract_form.twig` (retrait des `style=` inline)
- Modify: `public/css/style.css` (classes utilitaires)
- Test: `test/smoke.cjs` (assertion en-tête CSP)

**Interfaces:**
- Consumes: champ `headers` exposé par `req` dans `test/smoke.cjs` (ajouté en Task 1).
- Produces: en-tête `Content-Security-Policy` sur les réponses ; confirmation de soumission via `form[data-confirm]` + `public/js/confirm.js`.

- [ ] **Step 1 : Écrire l'assertion qui échoue (`test/smoke.cjs`)**

Dans `test/smoke.cjs`, juste après le premier `GET /annonces?departement=13` (après `ok(r.text.includes(keyword), 'Annonce visible (filtre département)');`, ~ligne 139), ajouter :

```javascript
    ok(/default-src 'self'/.test(r.headers.get('content-security-policy') || ''),
      'A4 : en-tête Content-Security-Policy présent et strict');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC sur `A4 : en-tête Content-Security-Policy ...` (CSP désactivée → en-tête absent).

- [ ] **Step 3 : Activer la CSP (`src/app.js`)**

Remplacer la ligne `app.use(helmet({ contentSecurityPolicy: false }));` (et son commentaire) par :

```javascript
// En-têtes HTTP de sécurité, dont une Content-Security-Policy stricte (defaults helmet :
// default-src/script-src/style-src 'self', pas d'inline). On autorise en plus les tuiles
// OpenStreetMap chargées par Leaflet sur la page détail d'une annonce.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
      },
    },
  })
);
```

- [ ] **Step 4 : Créer `public/js/confirm.js`**

```javascript
// Confirmation de soumission sans handler inline (compatible CSP). Tout <form data-confirm="...">
// demande confirmation avant envoi.
document.addEventListener(
  'submit',
  function (e) {
    var form = e.target;
    if (form && form.matches && form.matches('form[data-confirm]')) {
      if (!window.confirm(form.getAttribute('data-confirm'))) {
        e.preventDefault();
      }
    }
  },
  true
);
```

- [ ] **Step 5 : Charger `confirm.js` globalement (`views/layouts/base.twig`)**

Juste avant la ligne `{% block scripts %}{% endblock %}`, ajouter :

```twig
  <script src="/js/confirm.js" defer></script>
```

- [ ] **Step 6 : Retirer l'inline de `views/dashboard/listings.twig`**

Remplacer le `<form ... onsubmit=...>` de suppression par :

```twig
              <form action="/mes-annonces/{{ l.id }}/supprimer" method="post" class="inline-form"
                    data-confirm="Supprimer cette annonce et ses candidatures ?">
```

- [ ] **Step 7 : Retirer l'inline de `views/dashboard/applications.twig`**

Remplacer le `<form ... onsubmit=...>` de refus par :

```twig
              <form action="{{ base }}/refuser" method="post" class="inline-form"
                    data-confirm="Refuser cette candidature ?">
```

- [ ] **Step 8 : Retirer les `style=` de `views/dashboard/contract_form.twig`**

Remplacer la ligne du `<h2>Identité du candidat ...` par :

```twig
      <h2>Identité du candidat <span class="muted label-note">(optionnel, repris dans le contrat)</span></h2>
```

Et remplacer le `<p class="muted" style="font-size:0.8rem">` par :

```twig
    <p class="muted fine-print">
```

- [ ] **Step 9 : Ajouter les classes utilitaires (`public/css/style.css`)**

Ajouter à la fin du fichier :

```css
.label-note { font-weight: 400; font-size: 0.9rem; }
.fine-print { font-size: 0.8rem; }
```

- [ ] **Step 10 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont `A4 : en-tête Content-Security-Policy ...`.

- [ ] **Step 11 : Vérification visuelle de la carte (CSP + Leaflet)**

Run: `npm run dev` puis ouvrir une annonce dont l'école a des coordonnées.
Expected: la carte Leaflet s'affiche (tuiles OSM chargées) ; la console du navigateur ne montre **aucune** violation CSP. Boutons « Supprimer »/« Refuser » : la confirmation s'affiche toujours.

- [ ] **Step 12 : Commit**

```bash
git add src/app.js public/js/confirm.js views/layouts/base.twig views/dashboard/listings.twig views/dashboard/applications.twig views/dashboard/contract_form.twig public/css/style.css test/smoke.cjs
git commit -m "$(printf 'A4: active une Content-Security-Policy stricte et retire les inline\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage :**
- A1 (fichiers orphelins) → Task 1. ✔ (`deleteStored`, `findFilePathsForListing`, `destroy`, test smoke).
- A2 (recherche insensible à la casse, colonnes normalisées) → Task 4. ✔ (migration + backfill + `withLower` + `findPublic`).
- A3 (pagination annonces publiques / mes annonces / candidatures) → Tasks 2 & 3. ✔ (util + partial + 3 écrans).
- A4 (CSP + retrait inline) → Task 5. ✔ (helmet + `confirm.js` + classes CSS + 4 inline retirés).
- Tests A1/A2/A3/A4 → couverts (smoke.cjs + lot-a.cjs).

**Placeholder scan :** la seule occurrence du mot « placeholder » est la note explicite du Step 4 de Task 1 indiquant de **ne pas** laisser de ligne `deleteStored: undefined` dans l'export — le bloc final exact y est donné. Aucun TODO/TBD réel.

**Type consistency :**
- `findPublic`, `findAllBySchool`, `findForOwnedListing` retournent toutes `{ items, total }` ; les contrôleurs lisent `items`/`total` et passent `listings`/`applications` aux vues — cohérent.
- `pagination.paginate` renvoie `{ page, pageCount, skip, take }` ; les contrôleurs utilisent `page`/`pageCount`, les services `skip`/`take` — cohérent.
- L'objet `pagination` passé aux vues (`{ page, pageCount, prevUrl, nextUrl }`) correspond aux champs lus par `views/partials/pagination.twig` — cohérent.
- `req(...)` expose `headers` (Task 1) avant son usage en Task 5 — ordre respecté.

## Risques / points d'attention

- **Migration sur dev.db** : `npx prisma migrate dev` modifie la base de dev existante ; le backfill remplit les colonnes des annonces déjà présentes.
- **Ordre des tâches** : Task 2 fige la signature `{ items, total }` de `findPublic` avant que Task 4 n'en modifie le `where` — éviter de faire Task 4 avant Task 2.
- **CSP** : si une ressource externe est ajoutée plus tard (police, CDN), penser à étendre les directives. Vérification visuelle obligatoire (Task 5, Step 11).
