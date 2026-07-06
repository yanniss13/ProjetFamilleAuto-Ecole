# Lot J — Purge RGPD automatique : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Exécutant : lire `AGENTS.md` à la racine du dépôt AVANT de commencer** (conventions, pièges, recette de migration).

**Objectif :** purger automatiquement les données personnelles périmées (alertes jamais confirmées, candidatures refusées anciennes avec leurs fichiers, jetons expirés), avec journal `PurgeRun`, tuile + bouton sur le dashboard admin, planification 24 h et CLI `npm run purge`.

**Architecture :** un service `purgeService` (`runPurge`, `findLatestRun`, `schedulePurge`) ; la planification vit dans `server.js` (JAMAIS `app.js` — les tests importent `app`) ; les fichiers sont supprimés AVANT les lignes via le `deleteStored` best-effort existant.

**Stack :** Express 5, Twig, Prisma/SQLite.

**Spec :** `docs/superpowers/specs/2026-07-07-lot-j-purge-rgpd-design.md`

## Contraintes globales

- **Tout en français**, commentaires (le *pourquoi*), messages de commit (préfixe `J: `).
- **Typographie française dans tout texte utilisateur** : `’`, `—`, `…`, `« »`. JAMAIS d'ASCII de substitution.
- **TDD strict** : test écrit, vu échouer (RED), implémentation minimale, vu passer (GREEN), commit.
- Tests : `test/lot-j.cjs`, **port 4066**, harnais maison, données suffixées `STAMP`, nettoyage en `finally`, labels sans accents.
- **Migrations Prisma : recette diff+deploy** (jamais `migrate dev`) — voir Tâche 1.
- Les candidatures **acceptées** et les **contrats** ne sont JAMAIS purgés (valeur légale) — les tests le vérifient.
- `git add` explicite, `git status` avant chaque commit, ne jamais committer `contexte.md` / `*.xlsx` (un seul agent à la fois sur le dépôt).

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` + migration | `Application.rejectedAt` + modèle `PurgeRun` |
| `src/services/applicationService.js` | `updateStatus` pose/efface `rejectedAt` |
| `src/services/purgeService.js` (nouveau) | `runPurge`, `findLatestRun`, `schedulePurge` |
| `src/controllers/adminController.js` + `src/routes/adminRoutes.js` | tuile + `POST /admin/purge` |
| `views/admin/dashboard.twig`, `public/css/style.css` | bloc « Purge RGPD » |
| `src/server.js`, `scripts/purge.js`, `package.json` | planification + CLI |
| `test/lot-j.cjs` (nouveau), `package.json`, `AGENTS.md` | tests + intégration + passation |

---

### Tâche 1 : `rejectedAt` + modèle `PurgeRun`

**Fichiers :**
- Créer : `test/lot-j.cjs`
- Modifier : `prisma/schema.prisma`
- Créer : `prisma/migrations/<horodatage>_lot_j_purge/migration.sql`
- Modifier : `src/services/applicationService.js` (fonction `updateStatus`)
- Modifier : `package.json` (script `test`)

**Interfaces :**
- Produit : `Application.rejectedAt: DateTime?` — posé par `updateStatus(id, 'rejected')`, remis à null par tout autre statut. `PurgeRun { id, ranAt, unconfirmedAlerts, rejectedApplications, expiredTokens }`.

- [x] **Étape 1 : écrire le fichier de test avec le harnais et la section 1**

Créer `test/lot-j.cjs` avec exactement ce contenu :

```js
/**
 * Tests du Lot J — purge RGPD automatique.
 * Spec : docs/superpowers/specs/2026-07-07-lot-j-purge-rgpd-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotj-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const passwordUtil = require('../src/utils/password');
const { STORAGE_DIR } = require('../src/config/storage');

const PORT = 4066;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
function daysAgo(n) { return new Date(Date.now() - n * 24 * 60 * 60 * 1000); }
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
const createdPurgeRunIds = [];

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

    // --- 1. rejectedAt + modeles ---
    const schoolJ = await prisma.school.create({
      data: {
        email: `j.ecole.${STAMP}@example.test`, passwordHash: 'x',
        businessName: `Ecole Lot J ${STAMP}`, siret: `9${String(STAMP).slice(-13).padStart(13, '0')}`,
      },
    });
    createdSchoolIds.push(schoolJ.id);
    const listJ = await prisma.listing.create({
      data: {
        title: `Lot J annonce ${STAMP}`, description: 'd', city: 'Nantes', department: '44',
        schoolId: schoolJ.id, titleLower: `lot j annonce ${STAMP}`, descriptionLower: 'd', cityLower: 'nantes',
      },
    });

    const appService = require('../src/services/applicationService');
    const aPend = await prisma.application.create({
      data: { applicantName: 'M', applicantEmail: `j.cand.${STAMP}@example.test`, message: 'm', listingId: listJ.id },
    });
    await appService.updateStatus(aPend.id, 'rejected');
    let row = await prisma.application.findUnique({ where: { id: aPend.id } });
    ok(row.status === 'rejected' && row.rejectedAt instanceof Date, 'updateStatus : refus -> rejectedAt pose');
    await appService.updateStatus(aPend.id, 'accepted');
    row = await prisma.application.findUnique({ where: { id: aPend.id } });
    ok(row.status === 'accepted' && row.rejectedAt === null, 'updateStatus : autre statut -> rejectedAt efface');

    const run0 = await prisma.purgeRun.create({ data: { unconfirmedAlerts: 0, rejectedApplications: 0, expiredTokens: 0 } });
    createdPurgeRunIds.push(run0.id);
    ok(run0.ranAt instanceof Date, 'schema : PurgeRun avec date automatique');

    console.log(`\n✅ Lot J tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (prisma.alert) await prisma.alert.deleteMany({ where: { email: { contains: String(STAMP) } } });
    if (prisma.purgeRun && createdPurgeRunIds.length) await prisma.purgeRun.deleteMany({ where: { id: { in: createdPurgeRunIds } } });
    // Les suppressions d'ecoles cascadent (annonces -> candidatures -> contrats).
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    if (createdAdminIds.length) await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
```

- [x] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-j.cjs`
Attendu : `❌ ECHEC : updateStatus : refus -> rejectedAt pose` (la colonne n'existe pas encore, `row.rejectedAt` vaut `undefined`).

- [x] **Étape 3 : modifier le schéma**

Dans `prisma/schema.prisma` :

1. Modèle `Application`, juste APRÈS la ligne `status           String  @default("pending") // "pending" | "accepted" | "rejected"`, ajouter :

```prisma

  // Date du refus (Lot J) : point de départ du délai de purge RGPD des candidatures
  // refusées. Null pour les lignes refusées avant ce lot (repli sur createdAt).
  rejectedAt DateTime?
```

2. À la FIN du fichier (après le modèle `Alert`), ajouter :

```prisma

// Journal des purges RGPD (Lot J) : une ligne par exécution, avec les compteurs
// par catégorie — trace de conformité affichée sur le dashboard admin.
model PurgeRun {
  id                   Int      @id @default(autoincrement())
  ranAt                DateTime @default(now())
  unconfirmedAlerts    Int
  rejectedApplications Int
  expiredTokens        Int
}
```

- [x] **Étape 4 : générer et appliquer la migration (recette diff + deploy)**

```powershell
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script
```

Attendu : `ALTER TABLE "Application" ADD COLUMN "rejectedAt" DATETIME;` + `CREATE TABLE "PurgeRun" ...`.

Créer `prisma/migrations/<horodatage>_lot_j_purge/migration.sql` (horodatage `yyyyMMddHHmmss`) avec le SQL produit, puis :

```powershell
npx prisma migrate deploy
npx prisma generate
```

- [x] **Étape 5 : `updateStatus` pose/efface `rejectedAt`**

Dans `src/services/applicationService.js`, remplacer la fonction `updateStatus` par :

```js
// Change le statut d'une candidature. rejectedAt trace la date du refus (point de
// départ de la purge RGPD — Lot J) et s'efface si la candidature change encore de
// statut : une refusée puis repêchée ne doit jamais partir à la purge.
function updateStatus(applicationId, status) {
  return prisma.application.update({
    where: { id: applicationId },
    data: { status, rejectedAt: status === 'rejected' ? new Date() : null },
  });
}
```

- [x] **Étape 6 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-j.cjs`
Attendu : `✅ Lot J tests reussis - 3 assertions.`

- [x] **Étape 7 : brancher dans `npm test`**

Dans `package.json`, remplacer la valeur du script `"test"` par :

```json
"test": "node test/smoke.cjs && node test/lot-a.cjs && node test/lot-c.cjs && node test/correctifs.cjs && node test/ameliorations.cjs && node test/lot-e.cjs && node test/lot-f.cjs && node test/lot-g.cjs && node test/lot-h.cjs && node test/lot-i.cjs && node test/lot-j.cjs"
```

- [x] **Étape 8 : suite complète puis commit**

Lancer : `npm test` — tout doit être vert.

```powershell
git add prisma/schema.prisma prisma/migrations test/lot-j.cjs src/services/applicationService.js package.json
git commit -m "J: colonne rejectedAt et journal PurgeRun"
```

---

### Tâche 2 : `purgeService.runPurge` (les trois catégories)

**Fichiers :**
- Créer : `src/services/purgeService.js`
- Modifier : `test/lot-j.cjs`

**Interfaces :**
- Produit : `purgeService.runPurge(): Promise<{ unconfirmedAlerts, rejectedApplications, expiredTokens }>` — supprime, journalise dans `PurgeRun`, renvoie les compteurs, PEUT lever (l'appelant décide). `purgeService.findLatestRun(): Promise<PurgeRun | null>`.

- [x] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-j.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot J tests reussis - ${passed} assertions.`);`` :

```js
    // --- 2. runPurge : les trois categories ---
    const mkAlert = (email, confirmedAt, createdAt) => prisma.alert.create({
      data: { email, department: '44', keywordLower: '', confirmedAt, createdAt, unsubscribeToken: crypto.randomBytes(32).toString('hex') },
    });
    const alOld = await mkAlert(`j.al.old.${STAMP}@example.test`, null, daysAgo(10));
    const alRecent = await mkAlert(`j.al.recent.${STAMP}@example.test`, null, daysAgo(2));
    const alConf = await mkAlert(`j.al.conf.${STAMP}@example.test`, daysAgo(29), daysAgo(30));

    const mkFile = (rel) => { fs.writeFileSync(path.join(STORAGE_DIR, rel), 'contenu de test'); return rel; };
    const cvRel = mkFile(`cv/lot-j-${STAMP}.pdf`);
    const idRel = mkFile(`id/lot-j-${STAMP}.pdf`);
    const mkAppJ = (data) => prisma.application.create({
      data: { applicantName: 'M', applicantEmail: `j.cand.${STAMP}@example.test`, message: 'm', listingId: listJ.id, ...data },
    });
    const appOldRej = await mkAppJ({ status: 'rejected', cvPath: cvRel, idCardPath: idRel });
    await prisma.application.update({ where: { id: appOldRej.id }, data: { rejectedAt: daysAgo(200), createdAt: daysAgo(210) } });
    const appLegacy = await mkAppJ({ status: 'rejected' }); // rejectedAt null : refus anterieur au Lot J
    await prisma.application.update({ where: { id: appLegacy.id }, data: { createdAt: daysAgo(200) } });
    const appRecentRej = await mkAppJ({ status: 'rejected' });
    await prisma.application.update({ where: { id: appRecentRej.id }, data: { rejectedAt: daysAgo(10), createdAt: daysAgo(15) } });
    const appOldAcc = await mkAppJ({ status: 'accepted' });
    await prisma.application.update({ where: { id: appOldAcc.id }, data: { createdAt: daysAgo(300) } });
    const appOldPend = await mkAppJ({ status: 'pending' });
    await prisma.application.update({ where: { id: appOldPend.id }, data: { createdAt: daysAgo(300) } });

    const schoolTok = await prisma.school.create({
      data: {
        email: `j.tok.${STAMP}@example.test`, passwordHash: 'x', businessName: `Jetons ${STAMP}`,
        siret: `0${String(STAMP).slice(-13).padStart(13, '0')}`,
        verifyTokenHash: `vh${STAMP}`, verifyTokenExpiry: daysAgo(1),
        resetTokenHash: `rh${STAMP}`, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    createdSchoolIds.push(schoolTok.id);

    const purgeService = require('../src/services/purgeService');
    const res2 = await purgeService.runPurge();
    ok((await prisma.alert.findUnique({ where: { id: alOld.id } })) === null, 'purge : vieille alerte non confirmee supprimee');
    ok(Boolean(await prisma.alert.findUnique({ where: { id: alRecent.id } }))
      && Boolean(await prisma.alert.findUnique({ where: { id: alConf.id } })),
      'purge : alerte recente et alerte confirmee conservees');
    ok((await prisma.application.findUnique({ where: { id: appOldRej.id } })) === null, 'purge : vieille candidature refusee supprimee');
    ok(!fs.existsSync(path.join(STORAGE_DIR, cvRel)) && !fs.existsSync(path.join(STORAGE_DIR, idRel)),
      'purge : fichiers de la candidature purges du disque');
    ok((await prisma.application.findUnique({ where: { id: appLegacy.id } })) === null,
      'purge : refusee sans rejectedAt (repli createdAt) supprimee');
    ok(Boolean(await prisma.application.findUnique({ where: { id: appRecentRej.id } })), 'purge : refusee recente conservee');
    ok(Boolean(await prisma.application.findUnique({ where: { id: appOldAcc.id } }))
      && Boolean(await prisma.application.findUnique({ where: { id: appOldPend.id } })),
      'purge : acceptee et en attente conservees meme anciennes');
    const tokRow = await prisma.school.findUnique({ where: { id: schoolTok.id } });
    ok(tokRow.verifyTokenHash === null && tokRow.verifyTokenExpiry === null, 'purge : jeton de verification expire nettoye');
    ok(tokRow.resetTokenHash === `rh${STAMP}` && tokRow.resetTokenExpiry instanceof Date, 'purge : jeton de reset encore valide conserve');
    ok(res2.unconfirmedAlerts >= 1 && res2.rejectedApplications >= 2 && res2.expiredTokens >= 1, 'purge : compteurs renvoyes');
    const latest = await purgeService.findLatestRun();
    ok(latest && latest.unconfirmedAlerts === res2.unconfirmedAlerts
      && latest.rejectedApplications === res2.rejectedApplications && latest.expiredTokens === res2.expiredTokens,
      'purge : PurgeRun ecrite et findLatestRun coherente');
    createdPurgeRunIds.push(latest.id);
```

- [x] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-j.cjs`
Attendu : `❌ Cannot find module '../src/services/purgeService'`.

- [x] **Étape 3 : créer le service**

Créer `src/services/purgeService.js` :

```js
// Purge RGPD (Lot J) : supprime les données personnelles qui n'ont plus de raison
// d'être conservées. Trois catégories, chacune bornée par un délai :
//  - alertes email jamais confirmées ;
//  - candidatures refusées (lignes ET fichiers téléversés) ;
//  - jetons de vérification/réinitialisation expirés (mis à null, comptes intacts).
// Les candidatures acceptées et les contrats ne sont JAMAIS purgés (valeur légale).
const prisma = require('../config/prisma');
const { deleteStored } = require('../config/storage');

const DAY_MS = 24 * 60 * 60 * 1000;

// Délais lus à l'exécution (surchargables par variable d'environnement).
function alertDays() {
  const n = parseInt(process.env.PURGE_ALERTES_JOURS, 10);
  return Number.isInteger(n) && n > 0 ? n : 7;
}
function rejectedDays() {
  const n = parseInt(process.env.PURGE_CANDIDATURES_REFUSEES_JOURS, 10);
  return Number.isInteger(n) && n > 0 ? n : 180;
}

// Exécute une purge complète et la journalise dans PurgeRun. Peut lever :
// l'appelant (CLI, route admin, boucle planifiée) décide quoi faire de l'erreur.
async function runPurge() {
  const now = Date.now();

  // 1. Alertes jamais confirmées.
  const alertCutoff = new Date(now - alertDays() * DAY_MS);
  const { count: unconfirmedAlerts } = await prisma.alert.deleteMany({
    where: { confirmedAt: null, createdAt: { lt: alertCutoff } },
  });

  // 2. Candidatures refusées : fichiers d'abord (leurs chemins disparaissent avec
  // les lignes), puis suppression en base. rejectedAt null = refus antérieur au
  // Lot J, repli sur createdAt.
  const rejectedCutoff = new Date(now - rejectedDays() * DAY_MS);
  const rejected = await prisma.application.findMany({
    where: {
      status: 'rejected',
      OR: [
        { rejectedAt: { lt: rejectedCutoff } },
        { rejectedAt: null, createdAt: { lt: rejectedCutoff } },
      ],
    },
    include: { contract: true }, // par sécurité — un refus nettoie déjà son contrat
  });
  for (const a of rejected) {
    for (const rel of [a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath]) deleteStored(rel);
    if (a.contract) {
      for (const rel of [a.contract.pdfPath, a.contract.schoolSignaturePath, a.contract.applicantSignaturePath, a.contract.signedPdfPath]) {
        deleteStored(rel);
      }
    }
  }
  const { count: rejectedApplications } = await prisma.application.deleteMany({
    where: { id: { in: rejected.map((a) => a.id) } },
  });

  // 3. Jetons expirés : minimisation — on nettoie les jetons, jamais les comptes.
  const nowDate = new Date(now);
  const { count: expiredVerify } = await prisma.school.updateMany({
    where: { verifyTokenExpiry: { lt: nowDate } },
    data: { verifyTokenHash: null, verifyTokenExpiry: null },
  });
  const { count: expiredReset } = await prisma.school.updateMany({
    where: { resetTokenExpiry: { lt: nowDate } },
    data: { resetTokenHash: null, resetTokenExpiry: null },
  });
  const expiredTokens = expiredVerify + expiredReset;

  const counts = { unconfirmedAlerts, rejectedApplications, expiredTokens };
  await prisma.purgeRun.create({ data: counts });
  return counts;
}

// Dernière purge (affichée sur le dashboard admin).
function findLatestRun() {
  return prisma.purgeRun.findFirst({ orderBy: { id: 'desc' } });
}

module.exports = { runPurge, findLatestRun };
```

- [x] **Étape 4 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-j.cjs`
Attendu : `✅ Lot J tests reussis - 14 assertions.`

- [x] **Étape 5 : committer**

```powershell
git add src/services/purgeService.js test/lot-j.cjs
git commit -m "J: service de purge (alertes, candidatures refusees + fichiers, jetons)"
```

---

### Tâche 3 : dashboard admin — tuile + purge manuelle

**Fichiers :**
- Modifier : `src/controllers/adminController.js`
- Modifier : `src/routes/adminRoutes.js`
- Modifier : `views/admin/dashboard.twig`
- Modifier : `public/css/style.css`
- Modifier : `test/lot-j.cjs`

**Interfaces :**
- Consomme : `purgeService.runPurge`, `purgeService.findLatestRun` (Tâche 2).
- Produit : `POST /admin/purge` (protégé par `requireAdmin` + `loadAdmin`, comme les autres actions admin), variable `lastPurge` dans la vue dashboard.

- [ ] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-j.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot J tests reussis - ${passed} assertions.`);`` :

```js
    // --- 3. dashboard admin : tuile + purge manuelle ---
    const adminService = require('../src/services/adminService');
    const admin = await adminService.create({ email: `j.admin.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('adminpass123') });
    createdAdminIds.push(admin.id);
    const adminJar = makeJar();
    let ra = await req(adminJar, 'GET', '/admin/connexion');
    ra = await req(adminJar, 'POST', '/admin/connexion', form({ _csrf: csrfFrom(ra.text), email: admin.email, password: 'adminpass123' }));
    ra = await req(adminJar, 'GET', '/admin');
    ok(ra.status === 200 && ra.text.includes('Purge RGPD') && ra.text.includes('Lancer une purge maintenant'),
      'admin : bloc purge + bouton presents');
    ok(ra.text.includes('Dernière purge'), 'admin : derniere purge affichee');

    const alOld2 = await mkAlert(`j.al.old2.${STAMP}@example.test`, null, daysAgo(10));
    ra = await req(adminJar, 'GET', '/admin');
    ra = await req(adminJar, 'POST', '/admin/purge', form({ _csrf: csrfFrom(ra.text) }));
    ok(ra.status === 302 && ra.location === '/admin', 'admin : POST purge -> redirection dashboard');
    ok((await prisma.alert.findUnique({ where: { id: alOld2.id } })) === null, 'admin : la purge manuelle a bien purge');
    ra = await req(adminJar, 'GET', '/admin');
    ok(ra.text.includes('Purge effectuée'), 'admin : flash avec les compteurs affiche');
    createdPurgeRunIds.push((await purgeService.findLatestRun()).id);

    const anonJar = makeJar();
    let rAnon = await req(anonJar, 'GET', '/admin/connexion');
    rAnon = await req(anonJar, 'POST', '/admin/purge', form({ _csrf: csrfFrom(rAnon.text) }));
    ok(rAnon.status === 302 && rAnon.location === '/admin/connexion', 'admin : purge refusee sans session admin');
```

- [ ] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-j.cjs`
Attendu : `❌ ECHEC : admin : bloc purge + bouton presents`.

- [ ] **Étape 3 : contrôleur admin**

Dans `src/controllers/adminController.js` :

1. Ajouter le require avec les autres : `const purgeService = require('../services/purgeService');`

2. Remplacer la fonction `dashboard` par :

```js
// GET /admin
async function dashboard(req, res, next) {
  try {
    const [stats, lastPurge] = await Promise.all([statsService.forPlatform(), purgeService.findLatestRun()]);
    res.render('admin/dashboard', {
      title: 'Administration',
      stats,
      lastPurge,
      // Même échappement de « < » que le tableau de bord école (bloc #stats-data + |raw).
      statsJson: JSON.stringify(stats).replace(/</g, '\\u003c'),
    });
  } catch (err) {
    next(err);
  }
}
```

3. Juste AVANT `module.exports`, ajouter :

```js
// POST /admin/purge — purge manuelle (démo ou besoin ponctuel), mêmes règles que
// la purge planifiée.
async function purge(req, res, next) {
  try {
    const c = await purgeService.runPurge();
    req.flash('success', `Purge effectuée : ${c.unconfirmedAlerts} alerte(s), ${c.rejectedApplications} candidature(s), ${c.expiredTokens} jeton(s).`);
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
}
```

4. Ajouter `purge` à l'objet `module.exports`.

- [ ] **Étape 4 : route + vue + CSS**

Dans `src/routes/adminRoutes.js`, dans la section protégée (après `router.get('/', adminController.dashboard);`), ajouter :

```js
router.post('/purge', adminController.purge);
```

Dans `views/admin/dashboard.twig`, juste APRÈS le `{% endif %}` qui ferme `{% if stats %}` et AVANT `<div class="dashboard-actions">`, ajouter :

```twig
  <section class="purge-card">
    <h2>Purge RGPD</h2>
    {% if lastPurge %}
      <p>Dernière purge : {{ lastPurge.ranAt|date('d/m/Y H:i') }} —
        {{ lastPurge.unconfirmedAlerts }} alerte(s) non confirmée(s),
        {{ lastPurge.rejectedApplications }} candidature(s) refusée(s),
        {{ lastPurge.expiredTokens }} jeton(s) expiré(s).</p>
    {% else %}
      <p class="muted">Aucune purge pour l’instant.</p>
    {% endif %}
    <form action="/admin/purge" method="post">
      <input type="hidden" name="_csrf" value="{{ csrfToken }}">
      <button type="submit" class="btn">Lancer une purge maintenant</button>
    </form>
    <p class="muted">Automatique au démarrage puis toutes les 24 h — alertes non confirmées
      après 7 jours, candidatures refusées après 180 jours, jetons expirés.
      Les candidatures acceptées et les contrats sont conservés.</p>
  </section>
```

Dans `public/css/style.css`, juste APRÈS le bloc « Graphiques des tableaux de bord (Lot H) », ajouter :

```css

/* --- Purge RGPD (Lot J) --- */
.purge-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  margin: 1.5rem 0;
}
.purge-card h2 { font-size: 1rem; margin: 0 0 0.75rem; }
.purge-card form { margin: 0.5rem 0; }
```

- [ ] **Étape 5 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-j.cjs`
Attendu : `✅ Lot J tests reussis - 20 assertions.`

- [ ] **Étape 6 : suite complète puis commit**

Lancer : `npm test` — en particulier `test/lot-c.cjs` et `test/lot-h.cjs` (dashboard admin) doivent rester verts.

```powershell
git add src/controllers/adminController.js src/routes/adminRoutes.js views/admin/dashboard.twig public/css/style.css test/lot-j.cjs
git commit -m "J: purge visible et declenchable depuis le dashboard admin"
```

---

### Tâche 4 : planification, CLI et passation

**Fichiers :**
- Modifier : `src/services/purgeService.js`
- Modifier : `src/server.js`
- Créer : `scripts/purge.js`
- Modifier : `package.json` (script `purge`)
- Modifier : `AGENTS.md`
- Modifier : `test/lot-j.cjs`

**Interfaces :**
- Produit : `purgeService.schedulePurge()` — premier run différé (30 s) puis toutes les 24 h, timers `unref()`, runs isolés par try/catch. CLI `npm run purge`.

- [ ] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-j.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot J tests reussis - ${passed} assertions.`);`` :

```js
    // --- 4. planification et CLI ---
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    ok(pkg.scripts.purge === 'node scripts/purge.js' && fs.existsSync(path.join(__dirname, '..', 'scripts', 'purge.js')),
      'cli : npm run purge branche sur scripts/purge.js');
    const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
    ok(serverSrc.includes('schedulePurge'), 'serveur : planification appelee au demarrage');
    ok(typeof purgeService.schedulePurge === 'function', 'service : schedulePurge exposee');
    purgeService.schedulePurge(); // timers unref() : n'empechent pas le process de finir
    ok(true, 'service : schedulePurge demarre sans erreur');
```

- [ ] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-j.cjs`
Attendu : `❌ ECHEC : cli : npm run purge branche sur scripts/purge.js`.

- [ ] **Étape 3 : ajouter `schedulePurge` au service**

Dans `src/services/purgeService.js`, juste AVANT `module.exports`, ajouter :

```js
// Planification en processus : premier run différé (laisse le serveur finir de
// démarrer), puis toutes les 24 h. Timers unref() : ils n'empêchent jamais le
// process de se terminer. Chaque run est isolé par try/catch — une purge qui
// échoue ne tue pas le serveur, le run suivant retentera.
const FIRST_RUN_DELAY_MS = 30 * 1000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

async function safeRun() {
  try {
    const c = await runPurge();
    console.log(`[purge] OK — ${c.unconfirmedAlerts} alerte(s), ${c.rejectedApplications} candidature(s), ${c.expiredTokens} jeton(s).`);
  } catch (err) {
    console.error(`[purge] échec : ${err.message}`);
  }
}

function schedulePurge() {
  setTimeout(safeRun, FIRST_RUN_DELAY_MS).unref();
  setInterval(safeRun, INTERVAL_MS).unref();
}
```

Et remplacer l'export par :
`module.exports = { runPurge, findLatestRun, schedulePurge };`

- [ ] **Étape 4 : brancher au démarrage + CLI**

Dans `src/server.js` :
1. après la ligne `const prisma = require('./config/prisma');`, ajouter :

```js
const purgeService = require('./services/purgeService');
```

2. juste APRÈS le bloc `const server = app.listen(...)`, ajouter :

```js
// Purge RGPD : premier run différé puis toutes les 24 h (timers unref — voir
// services/purgeService.js). Ici et PAS dans app.js : les tests importent app
// et ne doivent déclencher aucun timer de purge.
purgeService.schedulePurge();
```

Créer `scripts/purge.js` :

```js
// Purge RGPD à la demande. Usage : npm run purge
// Supprime les alertes jamais confirmées, les candidatures refusées anciennes
// (fichiers compris) et les jetons expirés, puis journalise dans PurgeRun
// (règles et délais : src/services/purgeService.js).
require('dotenv').config({ quiet: true });
const prisma = require('../src/config/prisma');
const purgeService = require('../src/services/purgeService');

async function runCli() {
  try {
    const c = await purgeService.runPurge();
    console.log(`Purge effectuée : ${c.unconfirmedAlerts} alerte(s) non confirmée(s), ${c.rejectedApplications} candidature(s) refusée(s), ${c.expiredTokens} jeton(s) expiré(s).`);
    await prisma.$disconnect();
  } catch (err) {
    console.error(`Échec de la purge : ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) runCli();
```

Dans `package.json`, après la ligne `"admin:create": "node scripts/create-admin.js",`, ajouter :

```json
    "purge": "node scripts/purge.js",
```

- [ ] **Étape 5 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-j.cjs`
Attendu : `✅ Lot J tests reussis - 24 assertions.`

Puis vérifier le CLI à la main : `npm run purge`
Attendu : `Purge effectuée : 0 alerte(s) non confirmée(s), ...` (ou plus si la base de dev contient des données périmées).

- [ ] **Étape 6 : mettre à jour `AGENTS.md` (passation)**

1. Remplacer les lignes `- **Prochain travail : Lot J (purge RGPD automatique)** — spec et plan à écrire.` et `  À prévoir : purger aussi les alertes jamais confirmées (décision de la spec du Lot I).` (ou leur variante pointant vers le plan) par :

```markdown
- **Lot J (purge RGPD automatique) : LIVRÉ** — purge des alertes jamais confirmées
  (7 j), des candidatures refusées avec leurs fichiers (180 j, `rejectedAt` posé au
  refus), des jetons expirés ; journal `PurgeRun` + tuile et bouton sur `/admin` ;
  planifiée dans `server.js` (30 s puis 24 h, unref) + CLI `npm run purge`.
  Tests : `test/lot-j.cjs`. **La feuille de route démo E→J est complète.**
- **Prochain travail : rien d'engagé.** Candidats, au choix de l'utilisateur :
  restes de revue ci-dessous, tests dédiés Lot B, ou Lot D (qualité & prod :
  PostgreSQL, logs, sauvegardes) — et préparation de la démo jury.
```

2. Dans Conventions, remplacer `(4057-4065 déjà pris)` par `(4057-4066 déjà pris)`.

3. Dans « Stack & commandes », remplacer `suite complète (10 fichiers .cjs, ~310 assertions)` par `suite complète (11 fichiers .cjs, ~334 assertions)` et ajouter après la ligne `admin:create` :

```markdown
- `npm run purge` — purge RGPD à la demande (sinon : automatique, 30 s après le
  démarrage puis toutes les 24 h).
```

4. Dans « Pièges connus », ajouter à la fin :

```markdown
- **Purge RGPD** (Lot J) : délais surchargables par `PURGE_ALERTES_JOURS` /
  `PURGE_CANDIDATURES_REFUSEES_JOURS` ; `schedulePurge()` s'appelle UNIQUEMENT
  dans `src/server.js` (jamais `app.js` — les tests importent `app` et ne doivent
  déclencher aucun timer) ; jamais de purge des candidatures acceptées/contrats.
```

- [ ] **Étape 7 : suite complète puis commit final**

Lancer : `npm test` — les 11 fichiers doivent être verts.

```powershell
git add src/services/purgeService.js src/server.js scripts/purge.js package.json AGENTS.md test/lot-j.cjs
git commit -m "J: purge planifiee au demarrage + CLI npm run purge, feuille de route complete"
```

---

## Récapitulatif des assertions attendues

| Après la tâche | `node test/lot-j.cjs` affiche |
|---|---|
| 1 | `✅ Lot J tests reussis - 3 assertions.` |
| 2 | `✅ ... 14 assertions.` |
| 3 | `✅ ... 20 assertions.` |
| 4 | `✅ ... 24 assertions.` |
