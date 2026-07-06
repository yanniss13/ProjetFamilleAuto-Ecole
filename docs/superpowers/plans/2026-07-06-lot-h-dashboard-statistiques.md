# Lot H — Dashboard statistiques : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Exécutant : lire `AGENTS.md` à la racine du dépôt AVANT de commencer** (conventions, pièges, recette de migration).

**Objectif :** transformer le tableau de bord école et le dashboard admin en vrais tableaux de bord chiffrés — tuiles KPI, candidatures par semaine, entonnoir de recrutement, top annonces — avec un compteur de vues par annonce.

**Architecture :** une colonne `Listing.viewsCount` incrémentée en fire-and-forget ; un service `statsService` (bucketing hebdo en JS, requêtes bornées à 84 jours) ; les données passent aux vues via un bloc `<script type="application/json" id="stats-data">` (même pattern que la carte du Lot E) ; un JS statique `public/js/dashboard-charts.js` construit les SVG en DOM.

**Stack :** Express 5, Twig (autoescape), Prisma/SQLite, SVG natif (aucune bibliothèque de graphiques).

**Spec :** `docs/superpowers/specs/2026-07-06-lot-h-dashboard-statistiques-design.md`

## Contraintes globales

- **Tout en français**, y compris les commentaires (le *pourquoi*) et les messages de commit (préfixe `H: `).
- **Typographie française dans tout texte utilisateur** : apostrophe `’`, tirets cadratins `—`, points de suspension `…`, guillemets `« »`. JAMAIS d'ASCII de substitution (`'`, `-`, `...`) dans les vues. (Deux corrections ont déjà été nécessaires sur les lots E et F.)
- **TDD strict** : test écrit, vu échouer (RED), implémentation minimale, vu passer (GREEN), commit.
- Tests : `test/lot-h.cjs`, **port 4064**, harnais maison (`ok(cond, label)`), données suffixées `STAMP`, nettoyage en `finally`. Labels de test sans accents (convention des fichiers existants).
- **Migrations Prisma : ne JAMAIS utiliser `prisma migrate dev`** (bloque en shell non interactif). Suivre la recette de la Tâche 1.
- CSP stricte : aucun JS inline. Le JSON du bloc `#stats-data` est échappé côté serveur (« < » remplacé par sa séquence unicode) et rendu avec `|raw` — seul usage autorisé, comme `#map-data`.
- **Règles dataviz (spec, section « Règles visuelles »)** : une seule teinte par graphique (`#2563eb`) ; tout texte en encre neutre (jamais la couleur des barres) ; axes/grille discrets ; barres nulles non étiquetées ; jamais de double axe ; entonnoir en une teinte, pas de dégradé.
- Ne pas committer les fichiers personnels non suivis à la racine (`contexte.md`, `*.xlsx`) : toujours `git add` explicite, et vérifier `git status` avant chaque commit (un seul agent à la fois sur le dépôt).
- Attention : `test/lot-c.cjs` vérifie que `/admin` contient « Auto-écoles » et `stat-value` — la nouvelle vue admin doit conserver ces éléments (c'est le cas dans la Tâche 6).

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` + migration | colonne `Listing.viewsCount` |
| `src/services/listingService.js` | `incrementViews(id)` |
| `src/controllers/listingController.js` | appel fire-and-forget dans `show` |
| `src/services/statsService.js` (nouveau) | `weeklyBuckets`, `rate`, `forSchool`, `forPlatform` |
| `src/controllers/dashboardController.js` | stats école + `statsJson` |
| `src/controllers/adminController.js` | stats plateforme + `statsJson` |
| `views/dashboard/index.twig`, `views/admin/dashboard.twig` | tuiles, conteneurs, bloc JSON |
| `public/js/dashboard-charts.js` (nouveau) | SVG barres + entonnoir |
| `public/css/style.css` | cartes de graphiques |
| `src/app.js` | commentaire `|raw` (2 blocs documentés) |
| `test/lot-h.cjs` (nouveau), `package.json`, `AGENTS.md` | tests + intégration + passation |

---

### Tâche 1 : colonne `viewsCount` + incrément fire-and-forget

**Fichiers :**
- Créer : `test/lot-h.cjs`
- Modifier : `prisma/schema.prisma` (modèle `Listing`)
- Créer : `prisma/migrations/<horodatage>_lot_h_views_count/migration.sql`
- Modifier : `src/services/listingService.js`
- Modifier : `src/controllers/listingController.js` (fonction `show`)
- Modifier : `package.json` (script `test`)

**Interfaces :**
- Produit : `listingService.incrementViews(id: number): Promise<void>` — n'échoue jamais (catch interne). `Listing.viewsCount: Int @default(0)`.

- [x] **Étape 1 : écrire le fichier de test avec le harnais et la section 1**

Créer `test/lot-h.cjs` avec exactement ce contenu :

```js
/**
 * Tests du Lot H — dashboard statistiques.
 * Spec : docs/superpowers/specs/2026-07-06-lot-h-dashboard-statistiques-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'loth-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const passwordUtil = require('../src/utils/password');

const PORT = 4064;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
// L'incrément de vues est fire-and-forget : on attend (borné) que la base le reflète.
async function eventually(fn, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
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

    // --- 1. compteur de vues (colonne + increment fire-and-forget) ---
    const schoolA = await prisma.school.create({
      data: {
        email: `h.ecole.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: `Auto-ecole Lot H ${STAMP}`,
        siret: `5${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(schoolA.id);
    const l1 = await prisma.listing.create({
      data: {
        title: `Lot H annonce vedette ${STAMP}`, description: 'd', city: 'Marseille', department: '13',
        schoolId: schoolA.id, titleLower: `lot h annonce vedette ${STAMP}`, descriptionLower: 'd', cityLower: 'marseille',
      },
    });
    ok(l1.viewsCount === 0, 'schema : viewsCount vaut 0 par defaut');

    await get(`/annonces/${l1.id}`);
    await get(`/annonces/${l1.id}`);
    ok(await eventually(async () => (await prisma.listing.findUnique({ where: { id: l1.id } })).viewsCount === 2),
      'vues : 2 affichages publics -> viewsCount 2');

    const listingService = require('../src/services/listingService');
    await listingService.incrementViews(0); // id inexistant : ne doit pas lever
    ok(true, 'vues : increment sur id inexistant absorbe sans erreur');

    console.log(`\n✅ Lot H tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    // Les suppressions d'ecoles cascadent (annonces -> candidatures -> contrats).
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    if (createdAdminIds.length) await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
```

- [x] **Étape 2 : vérifier que le test échoue (RED)**

Lancer : `node test/lot-h.cjs`
Attendu : `❌ ECHEC : schema : viewsCount vaut 0 par defaut` (la colonne n'existe pas encore, `l1.viewsCount` vaut `undefined`).

- [x] **Étape 3 : ajouter la colonne au schéma**

Dans `prisma/schema.prisma`, modèle `Listing`, juste APRÈS la ligne `status       String  @default("open") // "open" | "closed"`, ajouter :

```prisma

  // Nombre d'affichages de la page détail publique (Lot H). Compteur brut, incrémenté
  // en fire-and-forget — jamais bloquant pour l'affichage, pas de dé-duplication.
  viewsCount Int @default(0)
```

- [x] **Étape 4 : générer et appliquer la migration (recette diff + deploy — PAS `migrate dev`)**

```powershell
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script
```

Attendu : un SQL contenant `ALTER TABLE "Listing" ADD COLUMN "viewsCount" INTEGER NOT NULL DEFAULT 0;`.

Créer le dossier `prisma/migrations/<horodatage>_lot_h_views_count/` (horodatage = date courante au format `yyyyMMddHHmmss`, ex. `20260706153000_lot_h_views_count`) et y écrire `migration.sql` avec le SQL produit :

```sql
-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "viewsCount" INTEGER NOT NULL DEFAULT 0;
```

Puis :

```powershell
npx prisma migrate deploy
npx prisma generate
```

Attendu : migration appliquée, client régénéré, sans erreur.

- [x] **Étape 5 : implémenter `incrementViews` dans le service**

Dans `src/services/listingService.js`, juste APRÈS la fonction `findPublicById`, ajouter :

```js
// Incrément du compteur de vues (Lot H). Fire-and-forget : l'appelant n'attend pas,
// et toute erreur est avalée — un compteur ne doit jamais casser l'affichage public.
function incrementViews(id) {
  return prisma.listing.updateMany({ where: { id }, data: { viewsCount: { increment: 1 } } }).catch(() => {});
}
```

Et ajouter `incrementViews` à l'objet `module.exports` (après `findPublicById`... l'ordre exact n'importe pas, mais il doit y figurer).

- [x] **Étape 6 : appeler l'incrément dans le contrôleur public**

Dans `src/controllers/listingController.js`, fonction `show`, juste APRÈS la ligne `if (!listing) return notFound(res);`, ajouter :

```js
    listingService.incrementViews(id); // fire-and-forget : le rendu n'attend pas le compteur
```

(PAS de `await` — c'est le point de la spec.)

- [x] **Étape 7 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-h.cjs`
Attendu : `✅ Lot H tests reussis - 3 assertions.`

- [x] **Étape 8 : brancher le fichier dans `npm test`**

Dans `package.json`, remplacer la valeur du script `"test"` par :

```json
"test": "node test/smoke.cjs && node test/lot-a.cjs && node test/lot-c.cjs && node test/correctifs.cjs && node test/ameliorations.cjs && node test/lot-e.cjs && node test/lot-f.cjs && node test/lot-g.cjs && node test/lot-h.cjs"
```

- [ ] **Étape 9 : lancer la suite complète puis committer**

Lancer : `npm test` — tout doit être vert.

```powershell
git add prisma/schema.prisma prisma/migrations test/lot-h.cjs src/services/listingService.js src/controllers/listingController.js package.json
git commit -m "H: compteur de vues des annonces (increment fire-and-forget)"
```

---

### Tâche 2 : `statsService` — `weeklyBuckets` et `rate` (unitaires)

**Fichiers :**
- Créer : `src/services/statsService.js`
- Modifier : `test/lot-h.cjs`

**Interfaces :**
- Produit : `statsService.weeklyBuckets(dates: Date[], weeks: number): Array<{ label: string, count: number }>` — exactement `weeks` entrées, de la plus ancienne à la semaine courante, lundi comme début de semaine, `label` au format `JJ/MM` (le lundi de la semaine), dates hors fenêtre ignorées.
- Produit : `statsService.rate(part: number, total: number): number` — pourcentage entier arrondi, `0` si `total` est nul.

- [x] **Étape 1 : ajouter les tests unitaires (RED)**

Dans `test/lot-h.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot H tests reussis - ${passed} assertions.`);`` :

```js
    // --- 2. unitaires : weeklyBuckets et rate ---
    const statsService = require('../src/services/statsService');
    const buckets = statsService.weeklyBuckets([], 12);
    ok(buckets.length === 12, 'weeklyBuckets : exactement 12 entrees');
    ok(buckets.every((b) => b.count === 0), 'weeklyBuckets : semaines vides a 0');
    ok(buckets.every((b) => /^\d{2}\/\d{2}$/.test(b.label)), 'weeklyBuckets : labels JJ/MM');
    const b2 = statsService.weeklyBuckets([new Date(), new Date(), new Date(Date.now() - 8 * 24 * 3600 * 1000)], 12);
    ok(b2[11].count === 2, 'weeklyBuckets : dates du jour dans la derniere semaine');
    ok(b2[10].count + b2[9].count === 1, 'weeklyBuckets : date d il y a 8 jours dans une semaine precedente');
    const b3 = statsService.weeklyBuckets([new Date(Date.now() - 100 * 24 * 3600 * 1000)], 12);
    ok(b3.reduce((s, b) => s + b.count, 0) === 0, 'weeklyBuckets : date hors fenetre ignoree');
    ok(statsService.rate(1, 4) === 25, 'rate : 1/4 -> 25');
    ok(statsService.rate(0, 0) === 0, 'rate : total nul -> 0 (jamais NaN)');
    ok(statsService.rate(3, 3) === 100, 'rate : 3/3 -> 100');
```

- [x] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-h.cjs`
Attendu : `❌ Cannot find module '../src/services/statsService'`.

- [x] **Étape 3 : créer le service avec les deux fonctions pures**

Créer `src/services/statsService.js` :

```js
// Statistiques des tableaux de bord (Lot H) : agrégats et séries hebdomadaires.
// Le bucketing par semaine se fait en JS (portable SQLite/PostgreSQL — pas de
// fonctions de date SQL), et toutes les requêtes de séries sont bornées à 84 jours.
const prisma = require('../config/prisma');

const WEEKS = 12; // fenêtre des séries hebdomadaires
const SERIES_DAYS = WEEKS * 7; // 84 jours — borne toutes les requêtes de séries

// Lundi 00:00 (heure locale) de la semaine contenant `d`.
function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // getDay() : 0 = dimanche
  return x;
}

// Regroupe des dates par semaine (lundi comme début). Renvoie exactement `weeks`
// entrées ordonnées de la plus ancienne à la semaine courante, semaines vides à 0,
// label = lundi de la semaine au format JJ/MM. Dates hors fenêtre : ignorées.
function weeklyBuckets(dates, weeks) {
  const currentMonday = mondayOf(new Date());
  const buckets = [];
  const indexByMonday = new Map();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const monday = new Date(currentMonday);
    monday.setDate(monday.getDate() - i * 7);
    const label = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`;
    indexByMonday.set(monday.getTime(), buckets.length);
    buckets.push({ label, count: 0 });
  }
  for (const date of dates) {
    const idx = indexByMonday.get(mondayOf(date).getTime());
    if (idx !== undefined) buckets[idx].count += 1;
  }
  return buckets;
}

// Pourcentage entier arrondi, 0 si le total est nul (jamais NaN — compte tout neuf).
function rate(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

module.exports = { weeklyBuckets, rate };
```

- [x] **Étape 4 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-h.cjs`
Attendu : `✅ Lot H tests reussis - 12 assertions.`

- [ ] **Étape 5 : committer**

```powershell
git add src/services/statsService.js test/lot-h.cjs
git commit -m "H: service de statistiques (buckets hebdomadaires et pourcentages)"
```

---

### Tâche 3 : `statsService.forSchool`

**Fichiers :**
- Modifier : `src/services/statsService.js`
- Modifier : `test/lot-h.cjs`

**Interfaces :**
- Consomme : `weeklyBuckets`, `rate` (Tâche 2), `Listing.viewsCount` (Tâche 1).
- Produit : `statsService.forSchool(schoolId: number): Promise<{ tiles, weekly, funnel, topListings }>` avec :
  - `tiles = { openListings, totalViews, applications, acceptRate, signedContracts }` (nombres) ;
  - `weekly` : 12 buckets `{ label, count }` des candidatures ;
  - `funnel` : 4 étapes `{ label, count, rateFromPrevious }` — labels exacts `'Vues'`, `'Candidatures'`, `'Acceptées'`, `'Contrats signés'`, `rateFromPrevious: null` pour la première ;
  - `topListings` : 5 max, `{ id, title, views, applications, conversionRate }`, tri candidatures desc puis vues desc.

- [x] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-h.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot H tests reussis - ${passed} assertions.`);`` :

```js
    // --- 3. statsService.forSchool ---
    await prisma.listing.update({ where: { id: l1.id }, data: { viewsCount: 10 } });
    const l2 = await prisma.listing.create({
      data: {
        title: `Lot H seconde ${STAMP}`, description: 'd', city: 'Aix-en-Provence', department: '13',
        viewsCount: 4, schoolId: schoolA.id,
        titleLower: `lot h seconde ${STAMP}`, descriptionLower: 'd', cityLower: 'aix-en-provence',
      },
    });
    await prisma.listing.create({
      data: {
        title: `Lot H cloturee ${STAMP}`, description: 'd', city: 'Aubagne', department: '13',
        status: 'closed', schoolId: schoolA.id,
        titleLower: `lot h cloturee ${STAMP}`, descriptionLower: 'd', cityLower: 'aubagne',
      },
    });
    const mkApp = (listingId, status) => prisma.application.create({
      data: { applicantName: 'Moniteur Test', applicantEmail: `h.cand.${STAMP}@example.test`, message: 'm', status, listingId },
    });
    const a1 = await mkApp(l1.id, 'accepted');
    await mkApp(l1.id, 'pending');
    await mkApp(l1.id, 'pending');
    await mkApp(l2.id, 'pending');
    // Contrat signé (posé directement en base : l'entonnoir compte applicantSignedAt non nul).
    await prisma.contract.create({
      data: {
        type: 'cdi', startDate: new Date(), grossSalary: '2200€ brut/mois', workplace: 'Marseille',
        pdfPath: 'contracts/lot-h-test.pdf', applicantSignedAt: new Date(), applicationId: a1.id,
      },
    });

    // Autre ecole : ses donnees ne doivent JAMAIS apparaitre dans les stats de A.
    const schoolB = await prisma.school.create({
      data: {
        email: `h.autre.${STAMP}@example.test`, passwordHash: 'x',
        businessName: `Autre ecole ${STAMP}`, siret: `6${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(schoolB.id);
    const lB = await prisma.listing.create({
      data: {
        title: `Lot H autre ${STAMP}`, description: 'd', city: 'Lyon', department: '69', schoolId: schoolB.id,
        titleLower: `lot h autre ${STAMP}`, descriptionLower: 'd', cityLower: 'lyon',
      },
    });
    await mkApp(lB.id, 'pending');

    const sStats = await statsService.forSchool(schoolA.id);
    ok(sStats.tiles.openListings === 2, 'forSchool : annonces ouvertes (la cloturee est exclue)');
    ok(sStats.tiles.totalViews === 14, 'forSchool : total des vues (10 + 4)');
    ok(sStats.tiles.applications === 4, 'forSchool : candidatures - isolation (celle de l autre ecole exclue)');
    ok(sStats.tiles.acceptRate === 25, 'forSchool : taux d acceptation 1/4 -> 25');
    ok(sStats.tiles.signedContracts === 1, 'forSchool : contrats signes');
    ok(sStats.weekly.length === 12 && sStats.weekly[11].count === 4, 'forSchool : serie hebdo - 12 entrees, 4 candidatures cette semaine');
    ok(JSON.stringify(sStats.funnel.map((s) => s.count)) === '[14,4,1,1]' && sStats.funnel[0].label === 'Vues',
      'forSchool : entonnoir 14 -> 4 -> 1 -> 1');
    ok(JSON.stringify(sStats.funnel.map((s) => s.rateFromPrevious)) === '[null,29,25,100]',
      'forSchool : taux de conversion entre etapes');
    ok(sStats.topListings.length === 3 && sStats.topListings[0].id === l1.id && sStats.topListings[1].id === l2.id
      && sStats.topListings[0].conversionRate === 30,
      'forSchool : top annonces triees (candidatures puis vues), conversion 3/10 -> 30');

    const schoolNeuf = await prisma.school.create({
      data: {
        email: `h.neuf.${STAMP}@example.test`, passwordHash: 'x',
        businessName: `Neuf ${STAMP}`, siret: `7${String(STAMP).slice(-13).padStart(13, '0')}`,
      },
    });
    createdSchoolIds.push(schoolNeuf.id);
    const vide = await statsService.forSchool(schoolNeuf.id);
    ok(vide.tiles.openListings === 0 && vide.tiles.totalViews === 0 && vide.tiles.applications === 0
      && vide.tiles.acceptRate === 0 && vide.tiles.signedContracts === 0,
      'forSchool : compte neuf - toutes les tuiles a 0 (pas de NaN)');
    ok(vide.weekly.length === 12 && vide.weekly.every((b) => b.count === 0)
      && vide.funnel.every((s) => s.count === 0) && vide.topListings.length === 0,
      'forSchool : compte neuf - series vides mais completes');
```

- [x] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-h.cjs`
Attendu : `❌ statsService.forSchool is not a function`.

- [x] **Étape 3 : implémenter `forSchool`**

Dans `src/services/statsService.js`, juste AVANT la ligne `module.exports`, ajouter :

```js
// Statistiques du tableau de bord d'une école : tuiles, série hebdo des candidatures,
// entonnoir de recrutement et top annonces. Toutes les requêtes sont scopées schoolId.
async function forSchool(schoolId) {
  const since = new Date(Date.now() - SERIES_DAYS * 24 * 60 * 60 * 1000);
  const [openListings, viewsAgg, applications, accepted, signedContracts, recentApplications, listings] = await Promise.all([
    prisma.listing.count({ where: { schoolId, status: 'open' } }),
    prisma.listing.aggregate({ where: { schoolId }, _sum: { viewsCount: true } }),
    prisma.application.count({ where: { listing: { schoolId } } }),
    prisma.application.count({ where: { listing: { schoolId }, status: 'accepted' } }),
    prisma.contract.count({ where: { applicantSignedAt: { not: null }, application: { listing: { schoolId } } } }),
    prisma.application.findMany({ where: { listing: { schoolId }, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.listing.findMany({
      where: { schoolId },
      select: { id: true, title: true, viewsCount: true, _count: { select: { applications: true } } },
    }),
  ]);

  const totalViews = viewsAgg._sum.viewsCount || 0;
  const topListings = listings
    .map((l) => ({
      id: l.id,
      title: l.title,
      views: l.viewsCount,
      applications: l._count.applications,
      conversionRate: rate(l._count.applications, l.viewsCount),
    }))
    .sort((a, b) => b.applications - a.applications || b.views - a.views)
    .slice(0, 5);

  return {
    tiles: { openListings, totalViews, applications, acceptRate: rate(accepted, applications), signedContracts },
    weekly: weeklyBuckets(recentApplications.map((a) => a.createdAt), WEEKS),
    funnel: [
      { label: 'Vues', count: totalViews, rateFromPrevious: null },
      { label: 'Candidatures', count: applications, rateFromPrevious: rate(applications, totalViews) },
      { label: 'Acceptées', count: accepted, rateFromPrevious: rate(accepted, applications) },
      { label: 'Contrats signés', count: signedContracts, rateFromPrevious: rate(signedContracts, accepted) },
    ],
    topListings,
  };
}
```

Et remplacer la ligne d'export par :

```js
module.exports = { weeklyBuckets, rate, forSchool };
```

- [x] **Étape 4 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-h.cjs`
Attendu : `✅ Lot H tests reussis - 23 assertions.`

- [ ] **Étape 5 : committer**

```powershell
git add src/services/statsService.js test/lot-h.cjs
git commit -m "H: statistiques d une ecole (tuiles, serie hebdo, entonnoir, top annonces)"
```

---

### Tâche 4 : `statsService.forPlatform`

**Fichiers :**
- Modifier : `src/services/statsService.js`
- Modifier : `test/lot-h.cjs`

**Interfaces :**
- Produit : `statsService.forPlatform(): Promise<{ tiles, schoolsWeekly, applicationsWeekly }>` avec `tiles = { schools, listings, applications, signedContracts }` et deux séries de 12 buckets `{ label, count }` (inscriptions d'écoles, candidatures).

- [x] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-h.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot H tests reussis - ${passed} assertions.`);`` :

```js
    // --- 4. statsService.forPlatform ---
    // Comptes globaux : la base peut contenir d'autres donnees, on teste en >=.
    const plat = await statsService.forPlatform();
    ok(plat.tiles.schools >= 3 && plat.tiles.listings >= 4 && plat.tiles.applications >= 5 && plat.tiles.signedContracts >= 1,
      'forPlatform : tuiles >= donnees semees');
    ok(plat.schoolsWeekly.length === 12 && plat.applicationsWeekly.length === 12, 'forPlatform : deux series de 12 semaines');
    ok(plat.schoolsWeekly[11].count >= 3 && plat.applicationsWeekly[11].count >= 5, 'forPlatform : creations de la semaine comptees');
```

- [x] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-h.cjs`
Attendu : `❌ statsService.forPlatform is not a function`.

- [x] **Étape 3 : implémenter `forPlatform`**

Dans `src/services/statsService.js`, juste AVANT la ligne `module.exports`, ajouter :

```js
// Statistiques plateforme (dashboard admin) : totaux globaux + inscriptions d'écoles
// et candidatures par semaine.
async function forPlatform() {
  const since = new Date(Date.now() - SERIES_DAYS * 24 * 60 * 60 * 1000);
  const [schools, listings, applications, signedContracts, recentSchools, recentApplications] = await Promise.all([
    prisma.school.count(),
    prisma.listing.count(),
    prisma.application.count(),
    prisma.contract.count({ where: { applicantSignedAt: { not: null } } }),
    prisma.school.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.application.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  return {
    tiles: { schools, listings, applications, signedContracts },
    schoolsWeekly: weeklyBuckets(recentSchools.map((s) => s.createdAt), WEEKS),
    applicationsWeekly: weeklyBuckets(recentApplications.map((a) => a.createdAt), WEEKS),
  };
}
```

Et remplacer la ligne d'export par :

```js
module.exports = { weeklyBuckets, rate, forSchool, forPlatform };
```

- [x] **Étape 4 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-h.cjs`
Attendu : `✅ Lot H tests reussis - 26 assertions.`

- [ ] **Étape 5 : committer**

```powershell
git add src/services/statsService.js test/lot-h.cjs
git commit -m "H: statistiques plateforme (totaux + inscriptions et candidatures par semaine)"
```

---

### Tâche 5 : tableau de bord école (contrôleur + vue)

**Fichiers :**
- Modifier : `src/controllers/dashboardController.js` (réécriture complète)
- Modifier : `views/dashboard/index.twig` (réécriture complète)
- Modifier : `src/services/listingService.js` et `src/services/applicationService.js` (suppression du code mort)
- Modifier : `test/lot-h.cjs`

**Interfaces :**
- Consomme : `statsService.forSchool` (Tâche 3).
- Produit : la vue expose le bloc `<script type="application/json" id="stats-data">` et les conteneurs `#chart-weekly` et `#chart-funnel` que `public/js/dashboard-charts.js` (Tâche 7) lira.

- [x] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-h.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot H tests reussis - ${passed} assertions.`);`` :

```js
    // --- 5. tableau de bord ecole ---
    const jar = makeJar();
    let r5 = await req(jar, 'GET', '/connexion');
    r5 = await req(jar, 'POST', '/connexion', form({ _csrf: csrfFrom(r5.text), email: schoolA.email, password: 'motdepasse123' }));
    r5 = await req(jar, 'GET', '/tableau-de-bord');
    ok(r5.status === 200 && r5.text.includes('id="stats-data"'), 'ecole : bloc de donnees #stats-data present');
    ok(r5.text.includes('/js/dashboard-charts.js'), 'ecole : script des graphiques reference');
    const m5 = r5.text.match(/<script type="application\/json" id="stats-data">([\s\S]*?)<\/script>/);
    const dash = JSON.parse(m5[1]);
    ok(dash.tiles.applications === 4 && dash.tiles.totalViews === 14 && dash.tiles.acceptRate === 25,
      'ecole : JSON - tuiles exactes');
    ok(dash.funnel.length === 4 && dash.funnel[0].label === 'Vues', 'ecole : JSON - entonnoir de 4 etapes');
    ok(!m5[1].includes('Lot H annonce vedette'), 'ecole : les titres d annonces ne transitent pas par le JSON');
    ok(r5.text.includes('Top annonces') && r5.text.includes(`Lot H annonce vedette ${STAMP}`),
      'ecole : tableau top annonces avec le titre (via Twig)');
    ok(r5.text.includes('id="chart-weekly"') && r5.text.includes('id="chart-funnel"'),
      'ecole : conteneurs des graphiques presents');
    ok(r5.text.includes('Taux d’acceptation') && r5.text.includes('Contrats signés'),
      'ecole : libelles des nouvelles tuiles');
```

- [x] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-h.cjs`
Attendu : `❌ ECHEC : ecole : bloc de donnees #stats-data present`.

- [x] **Étape 3 : réécrire le contrôleur**

Remplacer TOUT le contenu de `src/controllers/dashboardController.js` par :

```js
// Tableau de bord de l'auto-école (protégé par requireAuth + loadSchool).
const statsService = require('../services/statsService');

// GET /tableau-de-bord
async function index(req, res, next) {
  try {
    const stats = await statsService.forSchool(req.school.id);
    res.render('dashboard/index', {
      title: 'Tableau de bord',
      stats,
      // Bloc <script type="application/json"> : « < » échappé pour qu'aucune donnée ne
      // puisse fermer le bloc. Rendu avec |raw — voir le commentaire autoescape de app.js.
      // Les titres d'annonces (topListings) ne transitent PAS par le JSON : ils sont
      // rendus par le tableau Twig (autoescape). Seuls chiffres et libellés de
      // graphiques passent ici.
      statsJson: JSON.stringify({ tiles: stats.tiles, weekly: stats.weekly, funnel: stats.funnel }).replace(/</g, '\\u003c'),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
```

⚠️ La chaîne de remplacement contient un antislash échappé (DEUX antislashs dans le source, comme dans `listingController.browse` pour `mapJson`) : le JSON émis contient la séquence unicode, jamais un vrai `<`.

- [x] **Étape 4 : réécrire la vue**

Remplacer TOUT le contenu de `views/dashboard/index.twig` par :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <section class="hero">
    <h1>Tableau de bord</h1>
    <p>Bienvenue, <strong>{{ currentSchool.businessName }}</strong>.</p>
  </section>

  <section class="stats-grid">
    <div class="stat-card"><span class="stat-value">{{ stats.tiles.openListings }}</span><span class="stat-label">Annonces ouvertes</span></div>
    <div class="stat-card"><span class="stat-value">{{ stats.tiles.totalViews }}</span><span class="stat-label">Vues</span></div>
    <div class="stat-card"><span class="stat-value">{{ stats.tiles.applications }}</span><span class="stat-label">Candidatures</span></div>
    <div class="stat-card"><span class="stat-value">{{ stats.tiles.acceptRate }} %</span><span class="stat-label">Taux d’acceptation</span></div>
    <div class="stat-card"><span class="stat-value">{{ stats.tiles.signedContracts }}</span><span class="stat-label">Contrats signés</span></div>
  </section>

  <section class="charts-grid">
    <div class="chart-card">
      <h2>Candidatures par semaine</h2>
      <div id="chart-weekly" class="chart"></div>
    </div>
    <div class="chart-card">
      <h2>Entonnoir de recrutement</h2>
      <div id="chart-funnel" class="chart"></div>
    </div>
  </section>

  {% if stats.topListings|length > 0 %}
    <section class="top-listings">
      <h2>Top annonces</h2>
      <table class="data-table">
        <thead><tr><th>Annonce</th><th>Vues</th><th>Candidatures</th><th>Conversion</th></tr></thead>
        <tbody>
          {% for l in stats.topListings %}
            <tr>
              <td><a href="/annonces/{{ l.id }}">{{ l.title }}</a></td>
              <td>{{ l.views }}</td>
              <td>{{ l.applications }}</td>
              <td>{{ l.conversionRate }} %</td>
            </tr>
          {% endfor %}
        </tbody>
      </table>
    </section>
  {% endif %}

  <div class="dashboard-actions">
    <a href="/mes-annonces" class="btn btn-primary">Gérer mes annonces</a>
    <a href="/mes-annonces/nouvelle" class="btn">Publier une annonce</a>
  </div>

  {# Bloc de DONNÉES (non exécutable, hors CSP script-src). JSON échappé côté
     serveur (« < » -> séquence unicode) : usage documenté de |raw, cf. app.js. #}
  <script type="application/json" id="stats-data">{{ statsJson|raw }}</script>
{% endblock %}

{% block scripts %}
  <script src="/js/dashboard-charts.js" defer></script>
{% endblock %}
```

- [x] **Étape 5 : supprimer le code mort des services**

Les anciens compteurs du tableau de bord ne sont plus appelés nulle part :
- Dans `src/services/listingService.js` : supprimer la fonction `countBySchool` ET retirer `countBySchool` de `module.exports`.
- Dans `src/services/applicationService.js` : supprimer la fonction `countBySchool` (avec son commentaire « Total des candidatures reçues... ») ET retirer `countBySchool` de `module.exports`.

- [x] **Étape 6 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-h.cjs`
Attendu : `✅ Lot H tests reussis - 34 assertions.`

- [ ] **Étape 7 : lancer la suite complète puis committer**

Lancer : `npm test` — tout doit rester vert (le smoke test ne vérifie que la redirection vers `/tableau-de-bord`, pas son contenu).

```powershell
git add src/controllers/dashboardController.js views/dashboard/index.twig src/services/listingService.js src/services/applicationService.js test/lot-h.cjs
git commit -m "H: tableau de bord ecole (tuiles, serie hebdo, entonnoir, top annonces)"
```

---

### Tâche 6 : dashboard admin (contrôleur + vue)

**Fichiers :**
- Modifier : `src/controllers/adminController.js` (fonction `dashboard` + requires)
- Modifier : `views/admin/dashboard.twig` (réécriture complète)
- Modifier : `src/services/listingService.js`, `src/services/schoolService.js`, `src/services/applicationService.js` (suppression du code mort)
- Modifier : `test/lot-h.cjs`

**Interfaces :**
- Consomme : `statsService.forPlatform` (Tâche 4).
- Produit : la vue expose `#stats-data` et les conteneurs `#chart-schools-weekly` et `#chart-applications-weekly` (lus par la Tâche 7).
- ⚠️ Contrainte héritée : `test/lot-c.cjs` exige que `/admin` contienne « Auto-écoles » et `stat-value` — la vue ci-dessous les conserve.

- [ ] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-h.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot H tests reussis - ${passed} assertions.`);`` :

```js
    // --- 6. dashboard admin ---
    const adminService = require('../src/services/adminService');
    const admin = await adminService.create({ email: `h.admin.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('adminpass123') });
    createdAdminIds.push(admin.id);
    const adminJar = makeJar();
    let r6 = await req(adminJar, 'GET', '/admin/connexion');
    r6 = await req(adminJar, 'POST', '/admin/connexion', form({ _csrf: csrfFrom(r6.text), email: admin.email, password: 'adminpass123' }));
    r6 = await req(adminJar, 'GET', '/admin');
    ok(r6.status === 200 && r6.text.includes('id="stats-data"') && r6.text.includes('/js/dashboard-charts.js'),
      'admin : bloc de donnees + script presents');
    const m6 = r6.text.match(/<script type="application\/json" id="stats-data">([\s\S]*?)<\/script>/);
    const padm = JSON.parse(m6[1]);
    ok(padm.tiles.schools >= 3 && padm.tiles.signedContracts >= 1, 'admin : JSON - tuiles plateforme');
    ok(padm.schoolsWeekly.length === 12 && padm.applicationsWeekly.length === 12, 'admin : JSON - deux series de 12 semaines');
    ok(r6.text.includes('Contrats signés') && r6.text.includes('id="chart-schools-weekly"') && r6.text.includes('id="chart-applications-weekly"'),
      'admin : tuile contrats signes + conteneurs des deux graphiques');
```

- [ ] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-h.cjs`
Attendu : `❌ ECHEC : admin : bloc de donnees + script presents`.

- [ ] **Étape 3 : mettre à jour le contrôleur admin**

Dans `src/controllers/adminController.js` :

1. Ajouter le require en tête (avec les autres requires) :

```js
const statsService = require('../services/statsService');
```

2. Remplacer TOUTE la fonction `dashboard` par :

```js
// GET /admin
async function dashboard(req, res, next) {
  try {
    const stats = await statsService.forPlatform();
    res.render('admin/dashboard', {
      title: 'Administration',
      stats,
      // Même échappement de « < » que le tableau de bord école (bloc #stats-data + |raw).
      statsJson: JSON.stringify(stats).replace(/</g, '\\u003c'),
    });
  } catch (err) {
    next(err);
  }
}
```

⚠️ Même remarque que la Tâche 5 : DEUX antislashs dans le source.

3. Le require de `applicationService` en tête de fichier ne sert plus à rien après ce changement (seul `countAllGlobal` l'utilisait) : supprimer la ligne `const applicationService = require('../services/applicationService');`. Les requires de `listingService` et `schoolService` restent (utilisés par les listes et la modération).

- [ ] **Étape 4 : réécrire la vue admin**

Remplacer TOUT le contenu de `views/admin/dashboard.twig` par :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <section class="hero">
    <h1>Administration</h1>
    <p>Supervision et modération de la plateforme.</p>
  </section>

  {% if stats %}
    <section class="stats-grid">
      <div class="stat-card"><span class="stat-value">{{ stats.tiles.schools }}</span><span class="stat-label">Auto-écoles</span></div>
      <div class="stat-card"><span class="stat-value">{{ stats.tiles.listings }}</span><span class="stat-label">Annonces</span></div>
      <div class="stat-card"><span class="stat-value">{{ stats.tiles.applications }}</span><span class="stat-label">Candidatures</span></div>
      <div class="stat-card"><span class="stat-value">{{ stats.tiles.signedContracts }}</span><span class="stat-label">Contrats signés</span></div>
    </section>

    <section class="charts-grid">
      <div class="chart-card">
        <h2>Inscriptions d’auto-écoles par semaine</h2>
        <div id="chart-schools-weekly" class="chart"></div>
      </div>
      <div class="chart-card">
        <h2>Candidatures par semaine</h2>
        <div id="chart-applications-weekly" class="chart"></div>
      </div>
    </section>

    {# Bloc de DONNÉES (non exécutable, hors CSP script-src). JSON échappé côté
       serveur (« < » -> séquence unicode) : usage documenté de |raw, cf. app.js. #}
    <script type="application/json" id="stats-data">{{ statsJson|raw }}</script>
  {% endif %}

  <div class="dashboard-actions">
    <a href="/admin/ecoles" class="btn btn-primary">Auto-écoles</a>
    <a href="/admin/annonces" class="btn">Annonces</a>
  </div>
{% endblock %}

{% block scripts %}
  <script src="/js/dashboard-charts.js" defer></script>
{% endblock %}
```

- [ ] **Étape 5 : supprimer le code mort des services**

Plus aucun appelant après ce changement :
- Dans `src/services/listingService.js` : supprimer la fonction `countAll` ET la retirer de `module.exports`.
- Dans `src/services/schoolService.js` : supprimer la fonction `countAll` ET la retirer de `module.exports`.
- Dans `src/services/applicationService.js` : supprimer la fonction `countAllGlobal` (avec son commentaire) ET la retirer de `module.exports`.

- [ ] **Étape 6 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-h.cjs`
Attendu : `✅ Lot H tests reussis - 38 assertions.`

- [ ] **Étape 7 : lancer la suite complète puis committer**

Lancer : `npm test` — en particulier `test/lot-c.cjs` doit rester vert (« dashboard affiche des compteurs »).

```powershell
git add src/controllers/adminController.js views/admin/dashboard.twig src/services/listingService.js src/services/schoolService.js src/services/applicationService.js test/lot-h.cjs
git commit -m "H: dashboard admin (tuiles plateforme + inscriptions et candidatures par semaine)"
```

---

### Tâche 7 : graphiques SVG, CSS, documentation et passation

**Fichiers :**
- Créer : `public/js/dashboard-charts.js`
- Modifier : `public/css/style.css` (ajout en fin de section dashboard)
- Modifier : `src/app.js` (commentaire autoescape)
- Modifier : `AGENTS.md` (passation)
- Modifier : `test/lot-h.cjs`

**Interfaces :**
- Consomme : le bloc `#stats-data` et les conteneurs `#chart-weekly`, `#chart-funnel` (Tâche 5), `#chart-schools-weekly`, `#chart-applications-weekly` (Tâche 6). Formes des données : `weekly`/`schoolsWeekly`/`applicationsWeekly` = `[{ label, count }]`, `funnel` = `[{ label, count, rateFromPrevious }]`.

- [ ] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-h.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot H tests reussis - ${passed} assertions.`);`` :

```js
    // --- 7. script statique des graphiques ---
    const r7 = await get('/js/dashboard-charts.js');
    ok(r7.status === 200 && r7.text.includes('createElementNS'), 'charts : script servi, SVG construit en DOM');
    ok(!r7.text.includes('innerHTML'), 'charts : aucune insertion HTML (CSP + anti-XSS)');
```

- [ ] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-h.cjs`
Attendu : `❌ ECHEC : charts : script servi, SVG construit en DOM` (le fichier n'existe pas, 404).

- [ ] **Étape 3 : créer `public/js/dashboard-charts.js`**

Contenu exact (règles dataviz : une teinte, texte en encre neutre, barres nulles non étiquetées, sommets arrondis 2 px côté valeur, base plate, `<title>` natif au survol) :

```js
// Graphiques des tableaux de bord (école + admin) : lit le bloc JSON #stats-data et
// construit des SVG en DOM (createElementNS + textContent — jamais d'HTML assemblé
// avec des données). Une seule teinte par graphique ; le texte reste en encre neutre.
(function () {
  var dataEl = document.getElementById('stats-data');
  if (!dataEl) return;

  var stats;
  try {
    stats = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var BAR = '#2563eb'; // teinte unique validée (contraste + daltonisme, surface claire)
  var INK = '#374151'; // encre neutre : le texte ne porte jamais la couleur des barres
  var MUTED = '#6b7280';
  var GRID = '#e5e7eb';

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    for (var k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  function textEl(x, y, content, fill, size, anchor) {
    var t = svgEl('text', { x: x, y: y, fill: fill, 'font-size': size, 'text-anchor': anchor || 'start' });
    t.textContent = content;
    return t;
  }

  // Barre verticale à sommet arrondi (2 px), base plate ancrée sur l'axe.
  function roundedBar(x, y, w, h) {
    var r = Math.min(2, h, w / 2);
    var d = 'M' + x + ' ' + (y + h) +
      ' L' + x + ' ' + (y + r) +
      ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
      ' L' + (x + w - r) + ' ' + y +
      ' Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) +
      ' L' + (x + w) + ' ' + (y + h) + ' Z';
    return svgEl('path', { d: d, fill: BAR });
  }

  // Barres hebdomadaires : serie = [{ label: 'JJ/MM', count }]. Valeur au-dessus des
  // barres non nulles seulement, libellés d'axe une semaine sur deux (12 = serré).
  function renderBarChart(el, serie) {
    if (!el || !Array.isArray(serie) || serie.length === 0) return;
    var W = 560;
    var H = 220;
    var pad = { top: 22, right: 6, bottom: 22, left: 6 };
    var innerW = W - pad.left - pad.right;
    var innerH = H - pad.top - pad.bottom;
    var max = 1;
    serie.forEach(function (b) { if (b.count > max) max = b.count; });

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    var step = innerW / serie.length;
    var barW = Math.min(26, Math.max(6, step * 0.55));
    var baseline = pad.top + innerH;

    svg.appendChild(svgEl('line', { x1: pad.left, y1: baseline, x2: W - pad.right, y2: baseline, stroke: GRID, 'stroke-width': 1 }));

    serie.forEach(function (b, i) {
      var x = pad.left + i * step + (step - barW) / 2;
      var h = Math.round((b.count / max) * (innerH - 4));
      if (b.count > 0) {
        var bar = roundedBar(x, baseline - h, barW, h);
        var title = svgEl('title', {});
        title.textContent = 'Semaine du ' + b.label + ' : ' + b.count;
        bar.appendChild(title);
        svg.appendChild(bar);
        svg.appendChild(textEl(x + barW / 2, baseline - h - 5, String(b.count), INK, 11, 'middle'));
      }
      if (serie.length <= 8 || i % 2 === 1) {
        svg.appendChild(textEl(x + barW / 2, baseline + 14, b.label, MUTED, 10, 'middle'));
      }
    });

    el.appendChild(svg);
  }

  // Entonnoir horizontal : steps = [{ label, count, rateFromPrevious }]. Barres
  // proportionnelles à la plus grande étape, une seule teinte, % de conversion
  // affiché entre les étapes en encre atténuée.
  function renderFunnel(el, steps) {
    if (!el || !Array.isArray(steps) || steps.length === 0) return;
    var W = 560;
    var rowH = 34;
    var gap = 18;
    var labelW = 150;
    var valueW = 56;
    var H = steps.length * (rowH + gap) - gap;
    var barMax = W - labelW - valueW;
    var max = 1;
    steps.forEach(function (s) { if (s.count > max) max = s.count; });

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    steps.forEach(function (s, i) {
      var y = i * (rowH + gap);
      var w = Math.round((s.count / max) * barMax);
      if (s.count > 0 && w < 3) w = 3; // barre visible même pour de petits comptes
      svg.appendChild(textEl(labelW - 10, y + rowH / 2 + 4, s.label, INK, 12, 'end'));
      if (w > 0) {
        var bar = svgEl('rect', { x: labelW, y: y, width: w, height: rowH, rx: 2, fill: BAR });
        var title = svgEl('title', {});
        title.textContent = s.label + ' : ' + s.count;
        bar.appendChild(title);
        svg.appendChild(bar);
      }
      svg.appendChild(textEl(labelW + w + 8, y + rowH / 2 + 4, String(s.count), INK, 12, 'start'));
      if (i > 0 && s.rateFromPrevious !== null && s.rateFromPrevious !== undefined) {
        svg.appendChild(textEl(labelW, y - 5, '↓ ' + s.rateFromPrevious + ' % de l’étape précédente', MUTED, 10, 'start'));
      }
    });

    el.appendChild(svg);
  }

  renderBarChart(document.getElementById('chart-weekly'), stats.weekly);
  renderFunnel(document.getElementById('chart-funnel'), stats.funnel);
  renderBarChart(document.getElementById('chart-schools-weekly'), stats.schoolsWeekly);
  renderBarChart(document.getElementById('chart-applications-weekly'), stats.applicationsWeekly);
})();
```

- [ ] **Étape 4 : ajouter le CSS**

Dans `public/css/style.css`, juste APRÈS le bloc « Grille de statistiques (dashboard) » (après la ligne `.stat-label { ... }`), ajouter :

```css

/* --- Graphiques des tableaux de bord (Lot H) --- */
.charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
.chart-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
}
.chart-card h2 { font-size: 1rem; margin: 0 0 0.75rem; }
.chart svg { width: 100%; height: auto; display: block; }
.top-listings { margin: 1.5rem 0; }
.top-listings h2 { font-size: 1.1rem; }
```

- [ ] **Étape 5 : mettre à jour le commentaire autoescape de `app.js`**

Dans `src/app.js`, remplacer :

```js
// Moteur de vues Twig. autoescape activé : toute {{ variable }} est échappée
// (anti-XSS stocké). Unique usage de |raw : le bloc de données JSON #map-data de
// listings/index.twig (JSON.stringify avec "<" échappé côté serveur, jamais du HTML).
```

par :

```js
// Moteur de vues Twig. autoescape activé : toute {{ variable }} est échappée
// (anti-XSS stocké). Usages de |raw limités aux blocs de DONNÉES JSON — #map-data
// (listings/index.twig) et #stats-data (tableaux de bord école/admin) : toujours du
// JSON.stringify avec « < » échappé côté serveur, jamais du HTML.
```

- [ ] **Étape 6 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-h.cjs`
Attendu : `✅ Lot H tests reussis - 40 assertions.`

- [ ] **Étape 7 : vérification visuelle**

Lancer `npm run dev`, se connecter avec un compte école ayant des données, et vérifier `/tableau-de-bord` puis `/admin` : tuiles alignées, barres bleues avec valeurs au-dessus, entonnoir lisible avec les % entre les étapes, aucun chevauchement de libellés. Corriger le CSS si besoin (rien d'autre).

- [ ] **Étape 8 : mettre à jour `AGENTS.md` (passation)**

1. Remplacer la ligne d'état commençant par `- **Prochain travail : Lot H` par :

```markdown
- **Lot H (dashboard statistiques) : LIVRÉ** — compteur de vues par annonce (fire-and-forget),
  `statsService` (séries hebdo 12 semaines bornées à 84 jours, bucketing JS), tableau de bord
  école (5 tuiles, barres, entonnoir, top annonces) et admin (4 tuiles, 2 barres), SVG en DOM
  via le bloc `#stats-data`. Tests : `test/lot-h.cjs`.
- **Prochain travail : Lot I (alertes email moniteurs)** — spec et plan à écrire.
```

2. Dans la section Conventions, remplacer `(4057-4061 déjà pris)` par `(4057-4064 déjà pris)`.

3. Dans « Stack & commandes », remplacer `suite complète (8 fichiers .cjs, ~235 assertions)` par `suite complète (9 fichiers .cjs, ~275 assertions)`.

4. Dans le piège « CSP stricte », remplacer `(JSON échappé côté serveur — seul usage autorisé de |raw, cf. commentaire dans src/app.js)` par `(JSON échappé côté serveur — seuls usages autorisés de |raw : #map-data et #stats-data, cf. commentaire dans src/app.js)`.

- [ ] **Étape 9 : suite complète puis commit final**

Lancer : `npm test` — les 9 fichiers doivent être verts.

```powershell
git add public/js/dashboard-charts.js public/css/style.css src/app.js AGENTS.md test/lot-h.cjs
git commit -m "H: graphiques SVG des tableaux de bord (barres hebdo + entonnoir) et passation"
```

---

## Récapitulatif des assertions attendues

| Après la tâche | `node test/lot-h.cjs` affiche |
|---|---|
| 1 | `✅ Lot H tests reussis - 3 assertions.` |
| 2 | `✅ ... 12 assertions.` |
| 3 | `✅ ... 23 assertions.` |
| 4 | `✅ ... 26 assertions.` |
| 5 | `✅ ... 34 assertions.` |
| 6 | `✅ ... 38 assertions.` |
| 7 | `✅ ... 40 assertions.` |
