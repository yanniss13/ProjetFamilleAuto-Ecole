# Lot C — Admin & modération : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un administrateur (modèle + auth isolés) qui supervise la plateforme et modère de façon réactive : retirer une annonce, suspendre/réactiver une auto-école.

**Architecture:** Un modèle `Admin` séparé avec son login `/admin/connexion` (session `adminId`), un espace `/admin/*` protégé par `requireAdmin`+`loadAdmin`, et des actions de modération non scopées. La suspension bloque la connexion de l'école, masque ses annonces et coupe sa session. Le premier admin est créé par un script CLI.

**Tech Stack:** Node.js, Express 5, Twig, Prisma 6, bcrypt, express-session, tests Node natifs (`node test/*.cjs`).

## Global Constraints

- **Auth admin isolée** : session `adminId` (distincte de `schoolId`). `requireAdmin` teste `adminId`, `requireAuth` teste `schoolId`. Aucun cumul.
- **Anti-énumération au login admin** : hash bcrypt « leurre » + message générique « Email ou mot de passe incorrect. » (comme l'école).
- **Actions admin non scopées** : exposées UNIQUEMENT sous `/admin/*` derrière `requireAdmin`. Ne jamais exposer `deleteAny`/`setSuspended` ailleurs.
- **Bornes mot de passe** : min 8 caractères, max 72 octets (identiques aux écoles).
- **Migration avec contrainte `@unique`** : l'environnement non interactif fait échouer `prisma migrate dev`. Générer le SQL via `prisma migrate diff` puis appliquer avec `prisma migrate deploy` + `prisma generate`.
- **CSP (Lot A)** : aucune balise inline dans les vues admin ; confirmations via `data-confirm` + `public/js/confirm.js` existant.
- **Nettoyage fichiers** : le retrait d'annonce doit supprimer exactement les mêmes fichiers que le Lot A (CV, CNI, permis, carte, PDF de contrat).
- Tests via `npm test`. Chaque tâche finit par `npm test` au vert + un commit.

---

### Task 1 : Modèle Admin + School.suspended + adminService + harness de test

**Files:**
- Modify: `prisma/schema.prisma` (modèle `Admin`, `School.suspended`)
- Create: `prisma/migrations/20260629120000_admin_and_suspended/migration.sql` (généré)
- Create: `src/services/adminService.js`
- Create: `test/lot-c.cjs`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `adminService.findByEmail(email): Promise<Admin|null>`
  - `adminService.findById(id): Promise<Admin|null>`
  - `adminService.create({ email, passwordHash }): Promise<Admin>`
  - `Admin { id, email, passwordHash, createdAt, updatedAt }`, `School.suspended: boolean` (défaut false).
  - `test/lot-c.cjs` : harness (serveur port 4058 + helpers `ok`, `makeJar`, `req`, `csrfFrom`, `form`) réutilisé par les tâches suivantes.

- [ ] **Step 1 : Créer le harness de test + assertions data-layer (`test/lot-c.cjs`)**

```javascript
/**
 * Tests ciblés du Lot C (admin & modération). Serveur dédié, données nettoyées.
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotc-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';

const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const adminService = require('../src/services/adminService');
const passwordUtil = require('../src/utils/password');
const { STORAGE_DIR } = require('../src/config/storage');

const PORT = 4058;
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

const adminEmail = `admin.${STAMP}@example.test`;
const ADMIN_PWD = 'adminpass123';
const createdAdminIds = [];
const createdSchoolIds = [];

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));
  try {
    // C (Task 1) : data layer
    const admin = await adminService.create({ email: adminEmail, passwordHash: await passwordUtil.hash(ADMIN_PWD) });
    createdAdminIds.push(admin.id);
    ok(admin.id && admin.email === adminEmail, 'C : adminService.create insère un admin');
    ok((await adminService.findByEmail(adminEmail)).id === admin.id, 'C : findByEmail retrouve l’admin');
    ok((await adminService.findById(admin.id)).email === adminEmail, 'C : findById retrouve l’admin');

    const school = await prisma.school.create({
      data: { email: `c.school.${STAMP}@example.test`, passwordHash: 'x', businessName: 'C School', siret: `7${String(STAMP).slice(-13).padStart(13, '0')}` },
    });
    createdSchoolIds.push(school.id);
    ok(school.suspended === false, 'C : School.suspended défaut false');

    console.log(`\n✅ Lot C tests réussis — ${passed} assertions.`);
  } finally {
    // Nettoyage : fichiers des candidatures + écoles + admins de test.
    if (createdSchoolIds.length) {
      const apps = await prisma.application.findMany({
        where: { listing: { schoolId: { in: createdSchoolIds } } }, include: { contract: true },
      });
      for (const a of apps) {
        for (const rel of [a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath, a.contract && a.contract.pdfPath]) {
          if (rel) { try { const abs = path.join(STORAGE_DIR, rel); if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch {} }
        }
      }
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    if (createdAdminIds.length) await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await prisma.$disconnect();
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
```

Mettre à jour `package.json` (script `test`) :

```json
    "test": "node test/smoke.cjs && node test/lot-a.cjs && node test/lot-c.cjs",
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC — `Cannot find module '../src/services/adminService'`.

- [ ] **Step 3 : Ajouter le schéma (`prisma/schema.prisma`)**

À la fin du fichier, ajouter le modèle `Admin` :

```prisma
// Administrateur de la plateforme (modération). Créé par script CLI, pas en self-service.
model Admin {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Dans `model School`, après le champ `status` (ou tout autre champ scalaire), ajouter :

```prisma
  // Suspension par un administrateur : bloque la connexion et masque les annonces du public.
  suspended Boolean @default(false)
```

- [ ] **Step 4 : Générer la migration (recette non interactive)**

```bash
mkdir -p prisma/migrations/20260629120000_admin_and_suspended
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script > prisma/migrations/20260629120000_admin_and_suspended/migration.sql
cat prisma/migrations/20260629120000_admin_and_suspended/migration.sql
```
Expected: le fichier contient `CREATE TABLE "Admin" (...)`, `ALTER TABLE "School" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;` et `CREATE UNIQUE INDEX "Admin_email_key" ...`.

- [ ] **Step 5 : Appliquer la migration**

```bash
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
```
Expected: la migration `20260629120000_admin_and_suspended` est appliquée ; « Database schema is up to date ».

- [ ] **Step 6 : Créer le service (`src/services/adminService.js`)**

```javascript
// Accès aux données de l'entité Admin via Prisma.
const prisma = require('../config/prisma');

function findById(id) {
  return prisma.admin.findUnique({ where: { id } });
}
function findByEmail(email) {
  return prisma.admin.findUnique({ where: { email } });
}
function create(data) {
  return prisma.admin.create({ data });
}

module.exports = { findById, findByEmail, create };
```

- [ ] **Step 7 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont les 4 assertions `C : ...`.

- [ ] **Step 8 : Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/services/adminService.js test/lot-c.cjs package.json
git commit -m "$(printf 'C: modele Admin + School.suspended + adminService\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2 : Script CLI de création d'admin

**Files:**
- Create: `scripts/create-admin.js`
- Modify: `package.json` (script `admin:create`)
- Test: `test/lot-c.cjs`

**Interfaces:**
- Consumes: `adminService` (Task 1), `utils/password`.
- Produces: `createOrUpdateAdmin({ email, password }): Promise<Admin>` (upsert par email, mot de passe haché bcrypt).

- [ ] **Step 1 : Écrire les assertions qui échouent (`test/lot-c.cjs`)**

En haut du fichier, après `const adminService = require('../src/services/adminService');`, ajouter :

```javascript
const { createOrUpdateAdmin } = require('../scripts/create-admin');
```

Dans `main()`, juste après le bloc data-layer de la Task 1 (avant le `console.log` de succès), ajouter :

```javascript
    // C (Task 2) : CLI createOrUpdateAdmin (upsert + bcrypt)
    const cliEmail = `cli.${STAMP}@example.test`;
    const a1 = await createOrUpdateAdmin({ email: cliEmail, password: 'firstpass1' });
    createdAdminIds.push(a1.id);
    ok(a1.email === cliEmail && (await passwordUtil.compare('firstpass1', a1.passwordHash)), 'C : createOrUpdateAdmin crée + hache le mot de passe');
    const a2 = await createOrUpdateAdmin({ email: cliEmail, password: 'secondpass2' });
    ok(a2.id === a1.id && (await passwordUtil.compare('secondpass2', a2.passwordHash)), 'C : re-créer le même email met à jour le mot de passe (upsert)');
    let rejected = false;
    try { await createOrUpdateAdmin({ email: cliEmail, password: 'court' }); } catch { rejected = true; }
    ok(rejected, 'C : createOrUpdateAdmin rejette un mot de passe trop court');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC — `Cannot find module '../scripts/create-admin'`.

- [ ] **Step 3 : Créer le script (`scripts/create-admin.js`)**

```javascript
// Création/MAJ d'un compte administrateur. Usage :
//   npm run admin:create -- <email> <motdepasse>
// Upsert par email : relancer avec le même email met à jour le mot de passe.
const prisma = require('../src/config/prisma');
const password = require('../src/utils/password');

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // octets (limite bcrypt)

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Logique réutilisable (testable sans argv). Valide, hache, upsert par email.
async function createOrUpdateAdmin({ email, password: plain }) {
  const normEmail = (email || '').trim().toLowerCase();
  if (!normEmail || !isValidEmail(normEmail)) throw new Error('Email invalide.');
  if (!plain || plain.length < PASSWORD_MIN) throw new Error(`Mot de passe : au moins ${PASSWORD_MIN} caractères.`);
  if (Buffer.byteLength(plain, 'utf8') > PASSWORD_MAX) throw new Error(`Mot de passe : ${PASSWORD_MAX} octets maximum.`);
  const passwordHash = await password.hash(plain);
  return prisma.admin.upsert({
    where: { email: normEmail },
    update: { passwordHash },
    create: { email: normEmail, passwordHash },
  });
}

// Runner CLI (exécuté seulement si lancé directement, pas au require).
async function runCli() {
  const [email, plain] = process.argv.slice(2);
  if (!email || !plain) {
    console.error('Usage : npm run admin:create -- <email> <motdepasse>');
    process.exit(1);
  }
  try {
    const admin = await createOrUpdateAdmin({ email, password: plain });
    console.log(`Admin prêt : ${admin.email} (id ${admin.id}).`);
    await prisma.$disconnect();
  } catch (err) {
    console.error(`Échec : ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) runCli();

module.exports = { createOrUpdateAdmin };
```

- [ ] **Step 4 : Ajouter le script npm (`package.json`)**

Dans `"scripts"`, ajouter :

```json
    "admin:create": "node scripts/create-admin.js",
```

- [ ] **Step 5 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont les assertions `C : createOrUpdateAdmin ...`.

- [ ] **Step 6 : Commit**

```bash
git add scripts/create-admin.js package.json test/lot-c.cjs
git commit -m "$(printf 'C: script CLI de creation d admin (npm run admin:create)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3 : Authentification admin + tableau de bord (squelette) + nav

**Files:**
- Create: `src/validators/adminValidator.js`
- Create: `src/controllers/adminAuthController.js`
- Create: `src/controllers/adminController.js` (méthode `dashboard` seulement ; la modération vient en Task 4)
- Create: `src/middlewares/requireAdmin.js`, `src/middlewares/loadAdmin.js`
- Create: `src/routes/adminRoutes.js`
- Modify: `src/routes/index.js` (montage `/admin`)
- Create: `views/admin/login.twig`, `views/admin/dashboard.twig`
- Modify: `views/partials/nav.twig` (branche `currentAdmin`)
- Test: `test/lot-c.cjs`

**Interfaces:**
- Consumes: `adminService` (Task 1), `utils/password`, `utils/http`.
- Produces: routes `/admin/connexion` (GET/POST), `/admin/deconnexion` (POST), `/admin` (GET, protégé) ; `req.session.adminId` ; `res.locals.currentAdmin`.

- [ ] **Step 1 : Écrire les assertions qui échouent (`test/lot-c.cjs`)**

Dans `main()`, avant le `console.log` de succès, ajouter :

```javascript
    // C (Task 3) : auth admin + cloisonnement
    const adminJar = makeJar();
    let rc = await req(adminJar, 'GET', '/admin'); // non connecté
    ok(rc.status === 302 && rc.location === '/admin/connexion', 'C : /admin sans session -> redirection login');
    rc = await req(adminJar, 'GET', '/admin/connexion');
    let csrfC = csrfFrom(rc.text);
    rc = await req(adminJar, 'POST', '/admin/connexion', form({ _csrf: csrfC, email: adminEmail, password: 'mauvais' }));
    ok(rc.status === 401, 'C : mauvais mot de passe admin -> 401');
    rc = await req(adminJar, 'GET', '/admin/connexion');
    csrfC = csrfFrom(rc.text);
    rc = await req(adminJar, 'POST', '/admin/connexion', form({ _csrf: csrfC, email: adminEmail, password: ADMIN_PWD }));
    ok(rc.status === 302 && rc.location === '/admin', 'C : login admin OK -> /admin');
    rc = await req(adminJar, 'GET', '/admin');
    ok(rc.status === 200 && /administration/i.test(rc.text), 'C : tableau de bord admin accessible');

    // Cloisonnement : une session école n'accède pas à /admin.
    const schoolJar = makeJar();
    rc = await req(schoolJar, 'GET', '/inscription');
    let csrfS = csrfFrom(rc.text);
    const sEmail = `c.iso.${STAMP}@example.test`;
    await req(schoolJar, 'POST', '/inscription', form({ _csrf: csrfS, businessName: 'Iso', email: sEmail, siret: `8${String(STAMP).slice(-13).padStart(13, '0')}`, password: 'motdepasse123', passwordConfirm: 'motdepasse123' }));
    const sRow = await prisma.school.findUnique({ where: { email: sEmail } });
    createdSchoolIds.push(sRow.id);
    await prisma.school.update({ where: { id: sRow.id }, data: { emailVerified: true } });
    rc = await req(schoolJar, 'GET', '/connexion');
    csrfS = csrfFrom(rc.text);
    await req(schoolJar, 'POST', '/connexion', form({ _csrf: csrfS, email: sEmail, password: 'motdepasse123' }));
    rc = await req(schoolJar, 'GET', '/admin');
    ok(rc.status === 302 && rc.location === '/admin/connexion', 'C : session école ne peut pas atteindre /admin');
    rc = await req(adminJar, 'GET', '/tableau-de-bord');
    ok(rc.status === 302 && rc.location === '/connexion', 'C : session admin ne peut pas atteindre /tableau-de-bord');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC sur `C : /admin sans session -> redirection login` (la route `/admin` n'existe pas → 404).

- [ ] **Step 3 : Créer le validateur (`src/validators/adminValidator.js`)**

```javascript
// Validation serveur — connexion admin.
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateAdminLogin(body) {
  const errors = {};
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email) errors.email = "L'email est obligatoire.";
  else if (!isValidEmail(email)) errors.email = "L'email n'est pas valide.";
  if (!password) errors.password = 'Le mot de passe est obligatoire.';
  return { isValid: Object.keys(errors).length === 0, errors, value: { email, password } };
}

module.exports = { validateAdminLogin };
```

- [ ] **Step 4 : Créer le contrôleur d'auth (`src/controllers/adminAuthController.js`)**

```javascript
// Authentification administrateur (login isolé, session adminId, anti-énumération).
const { validateAdminLogin } = require('../validators/adminValidator');
const password = require('../utils/password');
const adminService = require('../services/adminService');

let dummyHashPromise = null;
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = password.hash('moniteur-connect-admin-dummy');
  return dummyHashPromise;
}

function showLogin(req, res) {
  res.render('admin/login', { title: 'Connexion admin', errors: {}, values: {} });
}

async function login(req, res, next) {
  try {
    const { isValid, errors, value } = validateAdminLogin(req.body);
    const values = { email: value.email };
    if (!isValid) {
      return res.status(400).render('admin/login', { title: 'Connexion admin', errors, values });
    }
    const admin = await adminService.findByEmail(value.email);
    const good = await password.compare(value.password, admin ? admin.passwordHash : await getDummyHash());
    if (!admin || !good) {
      return res.status(401).render('admin/login', {
        title: 'Connexion admin', errors: { global: 'Email ou mot de passe incorrect.' }, values,
      });
    }
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.adminId = admin.id;
      req.flash('success', 'Connecté à l’espace administration.');
      res.redirect('/admin');
    });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/admin/connexion'));
}

module.exports = { showLogin, login, logout };
```

- [ ] **Step 5 : Créer le contrôleur admin (squelette) (`src/controllers/adminController.js`)**

```javascript
// Espace d'administration : supervision et modération (protégé par requireAdmin + loadAdmin).
// La modération (listes + actions) est ajoutée en Task 4.

// GET /admin
async function dashboard(req, res, next) {
  try {
    res.render('admin/dashboard', { title: 'Administration', stats: null });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard };
```

- [ ] **Step 6 : Créer les middlewares (`src/middlewares/requireAdmin.js`, `loadAdmin.js`)**

`src/middlewares/requireAdmin.js` :

```javascript
// Protège l'espace admin : redirige vers /admin/connexion sans session admin.
module.exports = function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    req.flash('error', 'Veuillez vous connecter en tant qu’administrateur.');
    return res.redirect('/admin/connexion');
  }
  next();
};
```

`src/middlewares/loadAdmin.js` :

```javascript
// Charge l'admin courant depuis la session ; détruit la session si l'admin n'existe plus.
const adminService = require('../services/adminService');

module.exports = async function loadAdmin(req, res, next) {
  try {
    const admin = await adminService.findById(req.session.adminId);
    if (!admin) {
      return req.session.destroy(() => res.redirect('/admin/connexion'));
    }
    req.admin = admin;
    res.locals.currentAdmin = admin;
    next();
  } catch (err) {
    next(err);
  }
};
```

- [ ] **Step 7 : Créer le routeur (`src/routes/adminRoutes.js`)**

```javascript
// Espace administration (monté sous /admin). Le login est public ; tout le reste est
// protégé par requireAdmin + loadAdmin.
const express = require('express');
const rateLimit = require('express-rate-limit');
const adminAuthController = require('../controllers/adminAuthController');
const adminController = require('../controllers/adminController');
const requireAdmin = require('../middlewares/requireAdmin');
const loadAdmin = require('../middlewares/loadAdmin');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('admin/login', {
      title: 'Connexion admin', errors: { global: 'Trop de tentatives. Réessayez plus tard.' }, values: {},
    }),
});

// Public.
router.get('/connexion', adminAuthController.showLogin);
router.post('/connexion', loginLimiter, adminAuthController.login);
router.post('/deconnexion', adminAuthController.logout);

// Protégé (tout ce qui suit).
router.use(requireAdmin, loadAdmin);
router.get('/', adminController.dashboard);

module.exports = router;
```

- [ ] **Step 8 : Monter le routeur (`src/routes/index.js`)**

Après `const trackingRoutes = require('./trackingRoutes');`, ajouter :

```javascript
const adminRoutes = require('./adminRoutes');
```

Après la ligne `router.use('/suivi', trackingRoutes);`, ajouter (le sous-routeur gère sa propre protection) :

```javascript
router.use('/admin', adminRoutes);
```

- [ ] **Step 9 : Créer les vues admin**

`views/admin/login.twig` :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <section class="form-card">
    <h1>Connexion administration</h1>
    {% if errors.global %}<div class="flash flash-error" role="alert">{{ errors.global }}</div>{% endif %}

    <form action="/admin/connexion" method="post" novalidate>
      <input type="hidden" name="_csrf" value="{{ csrfToken }}">

      <div class="form-group">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="username" value="{{ values.email|default('') }}" required>
        {% if errors.email %}<p class="field-error">{{ errors.email }}</p>{% endif %}
      </div>

      <div class="form-group">
        <label for="password">Mot de passe</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        {% if errors.password %}<p class="field-error">{{ errors.password }}</p>{% endif %}
      </div>

      <button type="submit" class="btn btn-primary">Se connecter</button>
    </form>
  </section>
{% endblock %}
```

`views/admin/dashboard.twig` :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <section class="hero">
    <h1>Administration</h1>
    <p>Supervision et modération de la plateforme.</p>
  </section>

  {% if stats %}
    <section class="stats-grid">
      <div class="stat-card"><span class="stat-value">{{ stats.schools }}</span><span class="stat-label">Auto-écoles</span></div>
      <div class="stat-card"><span class="stat-value">{{ stats.listings }}</span><span class="stat-label">Annonces</span></div>
      <div class="stat-card"><span class="stat-value">{{ stats.applications }}</span><span class="stat-label">Candidatures</span></div>
    </section>
  {% endif %}

  <div class="dashboard-actions">
    <a href="/admin/ecoles" class="btn btn-primary">Auto-écoles</a>
    <a href="/admin/annonces" class="btn">Annonces</a>
  </div>
{% endblock %}
```

- [ ] **Step 10 : Ajouter la branche admin à la nav (`views/partials/nav.twig`)**

Remplacer le bloc `{% if currentSchool %} ... {% else %} ... {% endif %}` par une version à trois branches (ajout du `{% elseif currentAdmin %}`) :

```twig
    {% if currentSchool %}
      <a href="/tableau-de-bord">Tableau de bord</a>
      <a href="/mes-annonces">Mes annonces</a>
      <a href="/mon-compte">Mon compte</a>
      <form action="/deconnexion" method="post" class="inline-form">
        <input type="hidden" name="_csrf" value="{{ csrfToken }}">
        <button type="submit" class="link-button">Déconnexion</button>
      </form>
    {% elseif currentAdmin %}
      <a href="/admin">Administration</a>
      <form action="/admin/deconnexion" method="post" class="inline-form">
        <input type="hidden" name="_csrf" value="{{ csrfToken }}">
        <button type="submit" class="link-button">Déconnexion</button>
      </form>
    {% else %}
      <a href="/connexion">Connexion</a>
      <a href="/inscription">Inscription auto-école</a>
    {% endif %}
```

- [ ] **Step 11 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont les assertions `C : /admin sans session`, `mauvais mot de passe -> 401`, `login OK -> /admin`, `tableau de bord accessible`, et les deux assertions de cloisonnement.

- [ ] **Step 12 : Commit**

```bash
git add src/validators/adminValidator.js src/controllers/adminAuthController.js src/controllers/adminController.js src/middlewares/requireAdmin.js src/middlewares/loadAdmin.js src/routes/adminRoutes.js src/routes/index.js views/admin/login.twig views/admin/dashboard.twig views/partials/nav.twig test/lot-c.cjs
git commit -m "$(printf 'C: auth admin isolee + tableau de bord + nav\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4 : Modération — listes, compteurs, retrait d'annonce, suspension

**Files:**
- Modify: `src/services/listingService.js` (`findAnyFilePathsForListing`, `deleteAny`, `findAllWithSchool`, `countAll`)
- Modify: `src/services/schoolService.js` (`findAllWithCounts`, `countAll`, `setSuspended`)
- Modify: `src/services/applicationService.js` (`countAllGlobal`)
- Modify: `src/controllers/adminController.js` (`dashboard` enrichi + `schools`, `listings`, `removeListing`, `suspendSchool`, `reactivateSchool`)
- Modify: `src/routes/adminRoutes.js` (routes de modération)
- Create: `views/admin/schools.twig`, `views/admin/listings.twig`
- Test: `test/lot-c.cjs`

**Interfaces:**
- Consumes: `storage.deleteStored` (Lot A), `utils/http.parseId/notFound`.
- Produces:
  - `listingService.findAnyFilePathsForListing(id): Promise<string[]>`, `deleteAny(id): Promise<Listing>`, `findAllWithSchool(): Promise<Listing[]>`, `countAll(): Promise<number>`.
  - `schoolService.findAllWithCounts(): Promise<School[]>` (chaque école a `_count.listings`), `countAll(): Promise<number>`, `setSuspended(id, value): Promise<School>`.
  - `applicationService.countAllGlobal(): Promise<number>`.
  - routes : `GET /admin/ecoles`, `GET /admin/annonces`, `POST /admin/annonces/:id/supprimer`, `POST /admin/ecoles/:id/suspendre`, `POST /admin/ecoles/:id/reactiver`.

- [ ] **Step 1 : Écrire les assertions qui échouent (`test/lot-c.cjs`)**

Le test réutilise l'école d'isolation (`sRow`) créée en Task 3 et l'`adminJar` connecté. Avant le `console.log` de succès, ajouter :

```javascript
    // C (Task 4) : modération — retrait d'une annonce (avec nettoyage des fichiers)
    const modListing = await prisma.listing.create({
      data: { title: `ModAnnonce ${STAMP}`, description: 'à modérer', city: 'Lyon', department: '69', schoolId: sRow.id, titleLower: `modannonce ${STAMP}`, descriptionLower: 'à modérer', cityLower: 'lyon' },
    });
    // une candidature avec un fichier sur disque pour vérifier le nettoyage
    const relCv = `cv/lotc-${STAMP}.pdf`;
    fs.writeFileSync(path.join(STORAGE_DIR, relCv), '%PDF-1.4\n%%EOF\n');
    await prisma.application.create({ data: { listingId: modListing.id, applicantName: 'X', applicantEmail: `x.${STAMP}@e.test`, message: 'm', cvPath: relCv } });

    rc = await req(adminJar, 'GET', '/admin/annonces');
    ok(rc.status === 200 && rc.text.includes(`ModAnnonce ${STAMP}`), 'C : liste admin des annonces');
    rc = await req(adminJar, 'POST', `/admin/annonces/${modListing.id}/supprimer`, form({ _csrf: await adminCsrf(adminJar) }));
    ok(rc.status === 302, 'C : retrait d’annonce -> redirection');
    ok(!(await prisma.listing.findUnique({ where: { id: modListing.id } })), 'C : annonce retirée de la base');
    ok(!fs.existsSync(path.join(STORAGE_DIR, relCv)), 'C : fichier de la candidature nettoyé');

    // C (Task 4) : compteurs du dashboard
    rc = await req(adminJar, 'GET', '/admin');
    ok(/Auto-écoles/.test(rc.text) && /stat-value/.test(rc.text), 'C : dashboard affiche des compteurs');
```

Ajouter en haut du fichier, après `function form(obj) { ... }`, un petit utilitaire pour récupérer un jeton CSRF frais depuis une page admin :

```javascript
async function adminCsrf(jar) {
  const r = await req(jar, 'GET', '/admin/ecoles');
  return csrfFrom(r.text);
}
```

> Note : `adminCsrf` lit le jeton sur `/admin/ecoles` (page protégée rendant `csrfToken` dans `<meta>`). Cette page existe après l'implémentation de cette tâche.

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC sur `C : liste admin des annonces` (route `/admin/annonces` inexistante → redirection/404).

- [ ] **Step 3 : Étendre `listingService` (`src/services/listingService.js`)**

Ajouter ces fonctions (avant `module.exports`) :

```javascript
// --- Admin (non scopé par école) ---

// Mêmes champs de fichiers que findFilePathsForListing, mais SANS filtre schoolId.
async function findAnyFilePathsForListing(id) {
  const apps = await prisma.application.findMany({ where: { listingId: id }, include: { contract: true } });
  const paths = [];
  for (const a of apps) {
    paths.push(a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath);
    if (a.contract) paths.push(a.contract.pdfPath);
  }
  return paths.filter(Boolean);
}
function deleteAny(id) {
  return prisma.listing.delete({ where: { id } });
}
function findAllWithSchool() {
  return prisma.listing.findMany({ orderBy: { createdAt: 'desc' }, include: { school: true } });
}
function countAll() {
  return prisma.listing.count();
}
```

Et les ajouter à l'objet exporté (à la suite des exports existants) :
`findAnyFilePathsForListing, deleteAny, findAllWithSchool, countAll`.

- [ ] **Step 4 : Étendre `schoolService` (`src/services/schoolService.js`)**

Ajouter (avant `module.exports`) :

```javascript
// --- Admin ---
function findAllWithCounts() {
  return prisma.school.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { listings: true } } } });
}
function countAll() {
  return prisma.school.count();
}
function setSuspended(id, value) {
  return prisma.school.update({ where: { id }, data: { suspended: value } });
}
```

Et les ajouter à l'objet exporté : `findAllWithCounts, countAll, setSuspended`.

- [ ] **Step 5 : Étendre `applicationService` (`src/services/applicationService.js`)**

Ajouter (avant `module.exports`) :

```javascript
// Total des candidatures, toutes écoles confondues (dashboard admin).
function countAllGlobal() {
  return prisma.application.count();
}
```

Et l'ajouter à l'objet exporté : `countAllGlobal`.

- [ ] **Step 6 : Compléter le contrôleur admin (`src/controllers/adminController.js`)**

Remplacer entièrement le fichier par :

```javascript
// Espace d'administration : supervision et modération (protégé par requireAdmin + loadAdmin).
const listingService = require('../services/listingService');
const schoolService = require('../services/schoolService');
const applicationService = require('../services/applicationService');
const { deleteStored } = require('../config/storage');
const { parseId, notFound } = require('../utils/http');

// GET /admin
async function dashboard(req, res, next) {
  try {
    const [schools, listings, applications] = await Promise.all([
      schoolService.countAll(),
      listingService.countAll(),
      applicationService.countAllGlobal(),
    ]);
    res.render('admin/dashboard', { title: 'Administration', stats: { schools, listings, applications } });
  } catch (err) {
    next(err);
  }
}

// GET /admin/ecoles
async function schools(req, res, next) {
  try {
    const all = await schoolService.findAllWithCounts();
    res.render('admin/schools', { title: 'Auto-écoles', schools: all });
  } catch (err) {
    next(err);
  }
}

// GET /admin/annonces
async function listings(req, res, next) {
  try {
    const all = await listingService.findAllWithSchool();
    res.render('admin/listings', { title: 'Annonces', listings: all });
  } catch (err) {
    next(err);
  }
}

// POST /admin/annonces/:id/supprimer
async function removeListing(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const filePaths = await listingService.findAnyFilePathsForListing(id);
    try {
      await listingService.deleteAny(id);
    } catch {
      return notFound(res); // annonce inexistante
    }
    for (const rel of filePaths) deleteStored(rel);
    req.flash('success', 'Annonce retirée.');
    res.redirect('/admin/annonces');
  } catch (err) {
    next(err);
  }
}

// POST /admin/ecoles/:id/suspendre
async function suspendSchool(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    try {
      await schoolService.setSuspended(id, true);
    } catch {
      return notFound(res);
    }
    req.flash('success', 'Auto-école suspendue.');
    res.redirect('/admin/ecoles');
  } catch (err) {
    next(err);
  }
}

// POST /admin/ecoles/:id/reactiver
async function reactivateSchool(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    try {
      await schoolService.setSuspended(id, false);
    } catch {
      return notFound(res);
    }
    req.flash('success', 'Auto-école réactivée.');
    res.redirect('/admin/ecoles');
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard, schools, listings, removeListing, suspendSchool, reactivateSchool };
```

- [ ] **Step 7 : Ajouter les routes de modération (`src/routes/adminRoutes.js`)**

Après la ligne `router.get('/', adminController.dashboard);`, ajouter :

```javascript
router.get('/ecoles', adminController.schools);
router.get('/annonces', adminController.listings);
router.post('/annonces/:id/supprimer', adminController.removeListing);
router.post('/ecoles/:id/suspendre', adminController.suspendSchool);
router.post('/ecoles/:id/reactiver', adminController.reactivateSchool);
```

- [ ] **Step 8 : Créer les vues de modération**

`views/admin/schools.twig` :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <div class="page-header"><h1>Auto-écoles</h1><a href="/admin" class="btn">Retour</a></div>

  {% if schools|length == 0 %}
    <p class="muted">Aucune auto-école.</p>
  {% else %}
    <table class="data-table">
      <thead><tr><th>Nom</th><th>Email</th><th>SIRET</th><th>Annonces</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>
        {% for s in schools %}
          <tr>
            <td>{{ s.businessName }}</td>
            <td>{{ s.email }}</td>
            <td>{{ s.siret }}</td>
            <td>{{ s._count.listings }}</td>
            <td>
              {% if s.suspended %}<span class="badge badge-rejected">Suspendue</span>
              {% else %}<span class="badge badge-available">Active</span>{% endif %}
            </td>
            <td class="actions">
              {% if s.suspended %}
                <form action="/admin/ecoles/{{ s.id }}/reactiver" method="post" class="inline-form">
                  <input type="hidden" name="_csrf" value="{{ csrfToken }}">
                  <button type="submit" class="btn btn-small">Réactiver</button>
                </form>
              {% else %}
                <form action="/admin/ecoles/{{ s.id }}/suspendre" method="post" class="inline-form"
                      data-confirm="Suspendre cette auto-école ? Ses annonces seront masquées et sa connexion bloquée.">
                  <input type="hidden" name="_csrf" value="{{ csrfToken }}">
                  <button type="submit" class="btn btn-small btn-danger">Suspendre</button>
                </form>
              {% endif %}
            </td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% endif %}
{% endblock %}
```

`views/admin/listings.twig` :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <div class="page-header"><h1>Annonces</h1><a href="/admin" class="btn">Retour</a></div>

  {% if listings|length == 0 %}
    <p class="muted">Aucune annonce.</p>
  {% else %}
    <table class="data-table">
      <thead><tr><th>Titre</th><th>Auto-école</th><th>Lieu</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>
        {% for l in listings %}
          <tr>
            <td>{{ l.title }}</td>
            <td>{{ l.school.businessName }}</td>
            <td>{{ l.city }} ({{ l.department }})</td>
            <td>{{ l.status }}</td>
            <td class="actions">
              <form action="/admin/annonces/{{ l.id }}/supprimer" method="post" class="inline-form"
                    data-confirm="Retirer définitivement cette annonce et ses candidatures ?">
                <input type="hidden" name="_csrf" value="{{ csrfToken }}">
                <button type="submit" class="btn btn-small btn-danger">Retirer</button>
              </form>
            </td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% endif %}
{% endblock %}
```

- [ ] **Step 9 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS, dont `C : liste admin des annonces`, `retrait d’annonce`, `annonce retirée`, `fichier nettoyé`, `dashboard compteurs`.

- [ ] **Step 10 : Commit**

```bash
git add src/services/listingService.js src/services/schoolService.js src/services/applicationService.js src/controllers/adminController.js src/routes/adminRoutes.js views/admin/schools.twig views/admin/listings.twig test/lot-c.cjs
git commit -m "$(printf 'C: moderation admin (listes, compteurs, retrait annonce, suspension)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5 : Effets de la suspension (login bloqué, annonces masquées, session coupée)

**Files:**
- Modify: `src/controllers/authController.js` (`login` refuse une école suspendue)
- Modify: `src/middlewares/loadSchool.js` (coupe la session d'une école suspendue)
- Modify: `src/services/listingService.js` (`findPublic` / `findPublicById` excluent les écoles suspendues)
- Test: `test/lot-c.cjs`

**Interfaces:**
- Consumes: `schoolService.setSuspended` (Task 4), `req.session.adminId`/`adminJar` (Task 3).
- Produces: comportement de suspension de bout en bout.

- [ ] **Step 1 : Écrire les assertions qui échouent (`test/lot-c.cjs`)**

Le test crée une annonce publique pour `sRow`, suspend l'école via l'admin, vérifie l'occultation + le blocage de connexion, puis réactive. Avant le `console.log` de succès, ajouter :

```javascript
    // C (Task 5) : effets de la suspension
    const pubKeyword = `SuspKw${STAMP}`;
    const suspListing = await prisma.listing.create({
      data: { title: `${pubKeyword} annonce`, description: 'visible', city: 'Nice', department: '06', schoolId: sRow.id, titleLower: `${pubKeyword} annonce`.toLowerCase(), descriptionLower: 'visible', cityLower: 'nice' },
    });
    const anon = makeJar();
    let rs = await req(anon, 'GET', `/annonces?q=${pubKeyword}`);
    ok(rs.text.includes(pubKeyword), 'C : annonce visible avant suspension');

    rs = await req(adminJar, 'POST', `/admin/ecoles/${sRow.id}/suspendre`, form({ _csrf: await adminCsrf(adminJar) }));
    ok(rs.status === 302, 'C : suspension -> redirection');

    rs = await req(anon, 'GET', `/annonces?q=${pubKeyword}`);
    ok(!rs.text.includes(pubKeyword), 'C : annonce masquée du public après suspension');
    rs = await req(anon, 'GET', `/annonces/${suspListing.id}`);
    ok(rs.status === 404, 'C : détail d’annonce d’école suspendue -> 404');

    // connexion bloquée (école déjà emailVerified en Task 3)
    const blocked = makeJar();
    rs = await req(blocked, 'GET', '/connexion');
    let csrfB = csrfFrom(rs.text);
    rs = await req(blocked, 'POST', '/connexion', form({ _csrf: csrfB, email: sEmail, password: 'motdepasse123' }));
    ok(rs.status === 403 && /suspendu/i.test(rs.text), 'C : connexion d’une école suspendue refusée (403)');

    // réactivation
    rs = await req(adminJar, 'POST', `/admin/ecoles/${sRow.id}/reactiver`, form({ _csrf: await adminCsrf(adminJar) }));
    rs = await req(anon, 'GET', `/annonces?q=${pubKeyword}`);
    ok(rs.text.includes(pubKeyword), 'C : annonce de nouveau visible après réactivation');
    rs = await req(blocked, 'GET', '/connexion');
    csrfB = csrfFrom(rs.text);
    rs = await req(blocked, 'POST', '/connexion', form({ _csrf: csrfB, email: sEmail, password: 'motdepasse123' }));
    ok(rs.status === 302 && rs.location === '/tableau-de-bord', 'C : connexion de nouveau possible après réactivation');
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm test`
Expected: ÉCHEC sur `C : annonce masquée du public après suspension` (findPublic ne filtre pas encore les écoles suspendues → l'annonce reste visible).

- [ ] **Step 3 : Exclure les écoles suspendues du public (`src/services/listingService.js`)**

Dans `findPublic`, modifier l'objet `where` initial pour ajouter la condition d'école active :

```javascript
  const where = { status: 'open', school: { suspended: false } };
```

Dans `findPublicById`, modifier le `where` :

```javascript
function findPublicById(id) {
  return prisma.listing.findFirst({
    where: { id, status: 'open', school: { suspended: false } },
    include: { school: true },
  });
}
```

- [ ] **Step 4 : Bloquer la connexion d'une école suspendue (`src/controllers/authController.js`)**

Dans `login`, juste après le bloc qui vérifie `if (!school.emailVerified) { ... }`, ajouter :

```javascript
    if (school.suspended) {
      return res.status(403).render('auth/login', {
        title: 'Connexion',
        errors: { global: 'Votre compte a été suspendu. Contactez l’administrateur.' },
        values,
      });
    }
```

- [ ] **Step 5 : Couper la session d'une école suspendue (`src/middlewares/loadSchool.js`)**

Remplacer le corps de la fonction par :

```javascript
module.exports = async function loadSchool(req, res, next) {
  try {
    const school = await schoolService.findById(req.session.schoolId);
    if (!school) {
      return req.session.destroy(() => res.redirect('/connexion'));
    }
    if (school.suspended) {
      return req.session.destroy(() => {
        // Pas de flash ici (session détruite) : la page de connexion suffit.
        res.redirect('/connexion');
      });
    }
    req.school = school;
    res.locals.currentSchool = school;
    next();
  } catch (err) {
    next(err);
  }
};
```

- [ ] **Step 6 : Lancer le test pour le voir passer**

Run: `npm test`
Expected: PASS — l'ensemble du Lot C (toutes les assertions `C : ...`) plus les suites smoke et lot-a inchangées.

- [ ] **Step 7 : Commit**

```bash
git add src/controllers/authController.js src/middlewares/loadSchool.js src/services/listingService.js test/lot-c.cjs
git commit -m "$(printf 'C: effets de la suspension (login bloque, annonces masquees, session coupee)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage :**
- Modèle `Admin` + `School.suspended` + migration → Task 1. ✔
- Auth admin isolée (validator, controller, middlewares, routes, login view, nav) → Task 3. ✔
- Création admin CLI → Task 2. ✔
- Modération (dashboard counts, listes écoles/annonces, retrait annonce + nettoyage fichiers, suspendre/réactiver) → Task 4. ✔
- Effets suspension (login bloqué, annonces masquées, session coupée) → Task 5. ✔
- Tests (auth, cloisonnement, retrait+fichiers, suspension de bout en bout) → répartis Task 1-5. ✔

**Placeholder scan :** aucun TODO/TBD. Le marqueur `ok(true, '… non couverts ici')` en Task 2 est intentionnel et explicite (la validation d'arguments du runner est hors test automatisé) — pas un placeholder de code manquant. Les `<timestamp>` de migration sont fixés (`20260629120000_admin_and_suspended`).

**Type consistency :**
- `adminService.{findById,findByEmail,create}` définis en Task 1, consommés en Task 2 (CLI via `prisma.admin.upsert`) et Task 3 (auth) — cohérent.
- `createOrUpdateAdmin({ email, password })` défini en Task 2, consommé par le test ; le runner CLI lit argv.
- Services admin (`findAnyFilePathsForListing`, `deleteAny`, `findAllWithSchool`, `countAll`, `findAllWithCounts`, `setSuspended`, `countAllGlobal`) définis en Task 4, consommés par `adminController` (même tâche). Noms identiques entre définition, contrôleur et vues.
- `res.locals.currentAdmin` posé en Task 3 (`loadAdmin`), lu par `nav.twig` (Task 3) — cohérent.
- `school.suspended` : champ unique, utilisé par Task 4 (setSuspended), Task 5 (login/loadSchool/findPublic) — cohérent.

## Risques / points d'attention

- **Migration `@unique`** : recette `migrate diff` + `migrate deploy` (Task 1, Steps 4-5) — ne pas tenter `migrate dev`.
- **`adminCsrf` (Task 4)** lit le jeton sur `/admin/ecoles` : cette page doit exister avant l'usage (elle est créée dans la même tâche, avant les assertions qui l'utilisent).
- **Ordre des tâches** : Task 3 doit précéder Task 4 (routes/contrôleur) et Task 5 (utilise `adminJar` connecté + `setSuspended`).
- **Non-régression smoke** : `findPublic`/`findPublicById` ajoutent `school: { suspended: false }` ; les écoles du smoke ne sont jamais suspendues, donc le smoke reste vert.
