# Lot I — Alertes email moniteurs : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Exécutant : lire `AGENTS.md` à la racine du dépôt AVANT de commencer** (conventions, pièges, recette de migration).

**Objectif :** un moniteur s'abonne (sans compte) à une alerte email — département + mot-clé optionnel, double opt-in — et reçoit un email dès qu'une annonce correspondante est publiée, avec lien de désabonnement (suppression réelle).

**Architecture :** modèle `Alert` (jeton de confirmation haché + jeton de désabonnement opaque, via `services/tokens`) ; routes publiques `/alertes` ; `alertService.notifyNewListing` appelé en fire-and-forget depuis `listingController.create` (matching en JS sur les colonnes `*Lower`, envois `Promise.allSettled`).

**Stack :** Express 5, Twig, Prisma/SQLite, nodemailer (mode dev sans SMTP).

**Spec :** `docs/superpowers/specs/2026-07-06-lot-i-alertes-email-design.md`

## Contraintes globales

- **Tout en français**, commentaires (le *pourquoi*) et messages de commit (préfixe `I: `).
- **Typographie française dans tout texte utilisateur** (vues ET emails) : apostrophe `’`, tirets `—`, points de suspension `…`, guillemets `« »`. JAMAIS d'ASCII de substitution. (Corrections déjà nécessaires sur les lots E et F.)
- **TDD strict** : test écrit, vu échouer (RED), implémentation minimale, vu passer (GREEN), commit.
- Tests : `test/lot-i.cjs`, **port 4065**, harnais maison, données suffixées `STAMP`, nettoyage en `finally`, labels sans accents.
- **Migrations Prisma : ne JAMAIS utiliser `prisma migrate dev`** (le modèle a des contraintes uniques → confirmation interactive). Recette diff+deploy de la Tâche 1.
- Le mailer est toujours appelé **via l'objet** (`mailer.sendListingAlert(...)`, jamais destructuré) : les tests interceptent en réassignant les propriétés de l'objet exporté.
- `git add` explicite, `git status` avant chaque commit, ne jamais committer `contexte.md` / `*.xlsx` (un seul agent à la fois sur le dépôt).

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` + migration | modèle `Alert` |
| `src/services/alertService.js` (nouveau) | subscribe, confirm, unsubscribe, notify |
| `src/validators/alertValidator.js` (nouveau) | validation du formulaire |
| `src/controllers/alertController.js` (nouveau) | 5 actions publiques |
| `src/routes/alertRoutes.js` (nouveau) + `src/routes/index.js` | montage sous `/alertes` |
| `src/services/mailer.js` | `sendAlertConfirmation`, `sendListingAlert` |
| `src/controllers/listingController.js` | déclenchement dans `create` + `alerteUrl` |
| `views/alerts/{new,confirmed,unsubscribe,unsubscribed}.twig` | vues publiques |
| `views/listings/index.twig`, `views/partials/nav.twig` | points d'entrée |
| `test/lot-i.cjs` (nouveau), `package.json`, `AGENTS.md` | tests + intégration + passation |

---

### Tâche 1 : modèle `Alert` + `alertService.subscribe`

**Fichiers :**
- Créer : `test/lot-i.cjs`
- Modifier : `prisma/schema.prisma` (nouveau modèle à la fin du fichier)
- Créer : `prisma/migrations/<horodatage>_lot_i_alertes/migration.sql`
- Créer : `src/services/alertService.js`
- Modifier : `package.json` (script `test`)

**Interfaces :**
- Produit : `alertService.subscribe(email, department, keyword): Promise<{ alert, rawConfirmToken: string | null }>` — crée l'alerte non confirmée avec jetons ; doublon `(email, department, keywordLower)` non confirmé → régénère le jeton ; doublon confirmé → `rawConfirmToken: null` sans modification. `keyword` vide → `keyword: null`, `keywordLower: ''`.

- [x] **Étape 1 : écrire le fichier de test avec le harnais et la section 1**

Créer `test/lot-i.cjs` avec exactement ce contenu :

```js
/**
 * Tests du Lot I — alertes email moniteurs.
 * Spec : docs/superpowers/specs/2026-07-06-lot-i-alertes-email-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'loti-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const passwordUtil = require('../src/utils/password');

const PORT = 4065;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
// Les envois d'alertes sont fire-and-forget : on attend (borné) qu'ils soient partis.
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

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

    // --- 1. modele Alert + subscribe (jetons, doublons) ---
    const alertService = require('../src/services/alertService');
    const s1 = await alertService.subscribe(`i.moniteur.${STAMP}@example.test`, '13', 'Moto');
    ok(s1.alert.id > 0 && s1.alert.confirmedAt === null, 'subscribe : alerte creee non confirmee');
    ok(typeof s1.rawConfirmToken === 'string' && s1.rawConfirmToken.length >= 32, 'subscribe : jeton de confirmation genere');
    ok(s1.alert.keyword === 'Moto' && s1.alert.keywordLower === 'moto', 'subscribe : mot-cle conserve + copie minuscule');
    ok(typeof s1.alert.unsubscribeToken === 'string' && s1.alert.unsubscribeToken.length >= 32, 'subscribe : jeton de desabonnement opaque');

    const s2 = await alertService.subscribe(`i.moniteur.${STAMP}@example.test`, '13', 'moto');
    ok(s2.alert.id === s1.alert.id, 'subscribe : doublon (meme triplet, casse differente) -> pas de seconde ligne');
    ok(typeof s2.rawConfirmToken === 'string' && s2.rawConfirmToken !== s1.rawConfirmToken, 'subscribe : doublon non confirme -> jeton regenere');

    const s3 = await alertService.subscribe(`i.moniteur2.${STAMP}@example.test`, '75', '');
    ok(s3.alert.keyword === null && s3.alert.keywordLower === '', 'subscribe : sans mot-cle -> keyword null, keywordLower vide');

    console.log(`\n✅ Lot I tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    // Garde : le modele n'existe pas encore pendant le premier RED.
    if (prisma.alert) await prisma.alert.deleteMany({ where: { email: { contains: String(STAMP) } } });
    // Les suppressions d'ecoles cascadent (annonces -> candidatures -> contrats).
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
```

- [x] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-i.cjs`
Attendu : `❌ Cannot find module '../src/services/alertService'`.

- [x] **Étape 3 : ajouter le modèle au schéma**

À la FIN de `prisma/schema.prisma` (après le modèle `Admin`), ajouter :

```prisma

// Alerte email d'un moniteur (Lot I) : créée sans compte, active seulement après
// confirmation par email (double opt-in). Le jeton de confirmation est HASHÉ
// (comme verifyTokenHash de School) ; le jeton de désabonnement est opaque en
// clair (comme trackingToken) pour reconstruire le lien dans chaque email.
model Alert {
  id           Int     @id @default(autoincrement())
  email        String
  department   String
  keyword      String? // affiché tel que saisi
  keywordLower String  @default("") // matching + unicité ("" = pas de mot-clé)

  confirmTokenHash String?   @unique
  confirmedAt      DateTime?

  unsubscribeToken String @unique

  createdAt DateTime @default(now())

  @@unique([email, department, keywordLower])
  @@index([department])
}
```

- [x] **Étape 4 : générer et appliquer la migration (recette diff + deploy — PAS `migrate dev`)**

```powershell
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script
```

Attendu : un `CREATE TABLE "Alert" ...` suivi des index (`Alert_confirmTokenHash_key`, `Alert_unsubscribeToken_key`, `Alert_department_idx`, `Alert_email_department_keywordLower_key`).

Créer le dossier `prisma/migrations/<horodatage>_lot_i_alertes/` (horodatage au format `yyyyMMddHHmmss`) et y écrire `migration.sql` avec le SQL produit par la commande (le copier tel quel). Puis :

```powershell
npx prisma migrate deploy
npx prisma generate
```

- [x] **Étape 5 : créer le service avec `subscribe`**

Créer `src/services/alertService.js` :

```js
// Alertes email des moniteurs (Lot I) : abonnement double opt-in, désabonnement,
// et notification à la publication d'une annonce.
const prisma = require('../config/prisma');
const { generateToken, hashToken, generateOpaqueToken } = require('./tokens');
const mailer = require('./mailer');

// Crée ou réutilise l'alerte (unicité email + département + mot-clé normalisé).
// Renvoie { alert, rawConfirmToken } : null si l'alerte est déjà confirmée (rien à
// renvoyer), régénéré si elle attend encore sa confirmation (le dernier email gagne).
async function subscribe(email, department, keyword) {
  const cleanKeyword = (keyword || '').trim();
  const keywordLower = cleanKeyword.toLowerCase();
  const existing = await prisma.alert.findUnique({
    where: { email_department_keywordLower: { email, department, keywordLower } },
  });
  if (existing && existing.confirmedAt) return { alert: existing, rawConfirmToken: null };

  const { raw, hash } = generateToken();
  if (existing) {
    const alert = await prisma.alert.update({ where: { id: existing.id }, data: { confirmTokenHash: hash } });
    return { alert, rawConfirmToken: raw };
  }
  try {
    const alert = await prisma.alert.create({
      data: {
        email,
        department,
        keyword: cleanKeyword || null,
        keywordLower,
        confirmTokenHash: hash,
        unsubscribeToken: generateOpaqueToken(),
      },
    });
    return { alert, rawConfirmToken: raw };
  } catch (err) {
    // P2002 : deux POST identiques simultanés — on repart sur la ligne gagnante.
    if (err.code === 'P2002') return subscribe(email, department, keyword);
    throw err;
  }
}

module.exports = { subscribe };
```

- [x] **Étape 6 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-i.cjs`
Attendu : `✅ Lot I tests reussis - 7 assertions.`

- [x] **Étape 7 : brancher le fichier dans `npm test`**

Dans `package.json`, remplacer la valeur du script `"test"` par :

```json
"test": "node test/smoke.cjs && node test/lot-a.cjs && node test/lot-c.cjs && node test/correctifs.cjs && node test/ameliorations.cjs && node test/lot-e.cjs && node test/lot-f.cjs && node test/lot-g.cjs && node test/lot-h.cjs && node test/lot-i.cjs"
```

- [x] **Étape 8 : suite complète puis commit**

Lancer : `npm test` — tout doit être vert.

```powershell
git add prisma/schema.prisma prisma/migrations test/lot-i.cjs src/services/alertService.js package.json
git commit -m "I: modele Alert et abonnement double opt-in (jetons, doublons)"
```

---

### Tâche 2 : formulaire public + email de confirmation

**Fichiers :**
- Créer : `src/validators/alertValidator.js`
- Créer : `src/controllers/alertController.js`
- Créer : `src/routes/alertRoutes.js`
- Créer : `views/alerts/new.twig`
- Modifier : `src/routes/index.js`
- Modifier : `src/services/mailer.js`
- Modifier : `test/lot-i.cjs`

**Interfaces :**
- Consomme : `alertService.subscribe` (Tâche 1).
- Produit : `GET /alertes` (form, pré-rempli par `?departement=` et `?q=`), `POST /alertes` (PRG, message neutre), `mailer.sendAlertConfirmation(email, department, keyword, rawToken)`, `validateAlert(body): { isValid, errors, value: { email, department, keyword } }`.

- [x] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-i.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot I tests reussis - ${passed} assertions.`);`` :

```js
    // --- 2. inscription publique (formulaire + email de confirmation) ---
    const mailer = require('../src/services/mailer');
    const confirmCalls = [];
    mailer.sendAlertConfirmation = async (email, department, keyword, rawToken) => {
      confirmCalls.push({ email, department, keyword, rawToken });
      return true;
    };

    let r = await get('/alertes');
    ok(r.status === 200 && r.text.includes('name="email"') && r.text.includes('name="department"') && r.text.includes('name="keyword"'),
      'alertes : formulaire public avec les trois champs');
    r = await get('/alertes?departement=13&q=moto');
    ok(r.text.includes('value="13"') && r.text.includes('value="moto"'), 'alertes : formulaire pre-rempli depuis la query string');

    const jarI = makeJar();
    let rf = await req(jarI, 'GET', '/alertes');
    rf = await req(jarI, 'POST', '/alertes', form({ _csrf: csrfFrom(rf.text), email: `i.form.${STAMP}@example.test`, department: '13', keyword: 'CDI' }));
    ok(rf.status === 302 && rf.location === '/alertes', 'alertes : POST -> redirection (PRG)');
    rf = await req(jarI, 'GET', '/alertes');
    ok(rf.text.includes('Si votre adresse est valide'), 'alertes : message neutre affiche');
    ok(confirmCalls.length === 1 && confirmCalls[0].email === `i.form.${STAMP}@example.test`
      && typeof confirmCalls[0].rawToken === 'string',
      'alertes : email de confirmation envoye avec le jeton');
    const created = await prisma.alert.findFirst({ where: { email: `i.form.${STAMP}@example.test` } });
    ok(created && created.confirmedAt === null && created.confirmTokenHash !== confirmCalls[0].rawToken,
      'alertes : jeton stocke hache (jamais en clair)');

    rf = await req(jarI, 'GET', '/alertes');
    rf = await req(jarI, 'POST', '/alertes', form({ _csrf: csrfFrom(rf.text), email: 'pas-un-email', department: '13', keyword: '' }));
    ok(rf.status === 400 && rf.text.includes('email n’est pas valide'), 'alertes : email invalide -> 400 + formulaire');
    rf = await req(jarI, 'GET', '/alertes');
    rf = await req(jarI, 'POST', '/alertes', form({ _csrf: csrfFrom(rf.text), email: `i.form.${STAMP}@example.test`, department: 'ZZ', keyword: '' }));
    ok(rf.status === 400, 'alertes : departement invalide -> 400');
```

⚠️ Le libellé attendu `email n’est pas valide` contient l'apostrophe typographique `’` — le validateur doit l'utiliser (typographie française).

- [x] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-i.cjs`
Attendu : `❌ ECHEC : alertes : formulaire public avec les trois champs` (la route n'existe pas → 404).

- [x] **Étape 3 : créer le validateur**

Créer `src/validators/alertValidator.js` :

```js
// Validation serveur — alerte email moniteur.
const MAX = { email: 254, keyword: 100 };
// Même règle département que les annonces : 2-3 chiffres ou Corse 2A/2B.
const DEPARTMENT_RX = /^(\d{2,3}|2A|2B)$/;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateAlert(body) {
  const errors = {};
  const email = (body.email || '').trim().toLowerCase();
  const department = (body.department || '').trim().toUpperCase();
  const keyword = (body.keyword || '').trim();

  if (!email) errors.email = 'L’email est obligatoire.';
  else if (email.length > MAX.email || !isValidEmail(email)) errors.email = 'L’email n’est pas valide.';
  if (!department) errors.department = 'Le département est obligatoire.';
  else if (!DEPARTMENT_RX.test(department)) errors.department = 'Département invalide (ex. 13, 75, 2A, 971).';
  if (keyword.length > MAX.keyword) errors.keyword = `Le mot-clé ne doit pas dépasser ${MAX.keyword} caractères.`;

  return { isValid: Object.keys(errors).length === 0, errors, value: { email, department, keyword } };
}

module.exports = { validateAlert };
```

- [x] **Étape 4 : ajouter l'email de confirmation au mailer**

Dans `src/services/mailer.js`, juste AVANT la ligne `module.exports = {`, ajouter :

```js
// Confirme l'abonnement à une alerte (double opt-in) : l'alerte n'est active
// qu'après le clic. Le jeton part en clair dans le lien, seul son hash est en base.
function sendAlertConfirmation(email, department, keyword, rawToken) {
  const link = `${APP_URL}/alertes/confirmer/${rawToken}`;
  return send(
    email,
    'Confirmez votre alerte MoniteurConnect',
    `<p>Vous avez demandé une alerte email pour les annonces du département
     <strong>${esc(department)}</strong>${keyword ? ` (mot-clé « ${esc(keyword)} »)` : ''}.</p>
     <p>Confirmez pour l’activer :</p>
     <p><a href="${link}">Activer mon alerte</a></p>
     <p>Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet email.</p>`,
    { link }
  );
}
```

Et ajouter `sendAlertConfirmation,` dans l'objet `module.exports`.

- [x] **Étape 5 : créer le contrôleur (deux premières actions)**

Créer `src/controllers/alertController.js` :

```js
// Alertes email des moniteurs : inscription publique (double opt-in), confirmation
// et désabonnement. Aucune session : tout passe par les jetons des liens email.
const alertService = require('../services/alertService');
const mailer = require('../services/mailer');
const { validateAlert } = require('../validators/alertValidator');

// GET /alertes (?departement=, ?q= — pré-remplissage depuis la recherche d'annonces)
function newForm(req, res) {
  res.render('alerts/new', {
    title: 'Créer une alerte',
    errors: {},
    values: {
      email: '',
      department: typeof req.query.departement === 'string' ? req.query.departement : '',
      keyword: typeof req.query.q === 'string' ? req.query.q : '',
    },
  });
}

// POST /alertes — message neutre identique dans tous les cas (anti-énumération) :
// la réponse ne révèle jamais si l'email est déjà abonné.
async function create(req, res, next) {
  try {
    const { isValid, errors, value } = validateAlert(req.body);
    if (!isValid) {
      return res.status(400).render('alerts/new', { title: 'Créer une alerte', errors, values: req.body });
    }
    const { rawConfirmToken } = await alertService.subscribe(value.email, value.department, value.keyword);
    // Best-effort : alerte déjà confirmée => rien à envoyer ; échec d'envoi => même message.
    if (rawConfirmToken) {
      await mailer.sendAlertConfirmation(value.email, value.department, value.keyword || null, rawConfirmToken);
    }
    req.flash('success', 'Si votre adresse est valide, un email de confirmation vient de vous être envoyé.');
    res.redirect('/alertes');
  } catch (err) {
    next(err);
  }
}

module.exports = { newForm, create };
```

- [x] **Étape 6 : créer la vue du formulaire**

Créer `views/alerts/new.twig` :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <section class="form-card">
    <h1>Créer une alerte email</h1>
    <p class="muted">Recevez un email dès qu’une nouvelle annonce correspond à vos critères.
      Un lien de confirmation vous sera envoyé — l’alerte n’est active qu’après votre clic.</p>

    <form action="/alertes" method="post" novalidate>
      <input type="hidden" name="_csrf" value="{{ csrfToken }}">
      <div class="form-group">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" value="{{ values.email }}" required>
        {% if errors.email %}<p class="field-error">{{ errors.email }}</p>{% endif %}
      </div>
      <div class="form-group">
        <label for="department">Département</label>
        <input id="department" name="department" type="text" value="{{ values.department }}" placeholder="ex. 13, 75, 2A" required>
        {% if errors.department %}<p class="field-error">{{ errors.department }}</p>{% endif %}
      </div>
      <div class="form-group">
        <label for="keyword">Mot-clé (optionnel)</label>
        <input id="keyword" name="keyword" type="text" value="{{ values.keyword }}" placeholder="ex. CDI, moto…">
        {% if errors.keyword %}<p class="field-error">{{ errors.keyword }}</p>{% endif %}
      </div>
      <button type="submit" class="btn btn-primary">Créer l’alerte</button>
    </form>

    <p class="form-footer"><a href="/annonces">Retour aux annonces</a></p>
  </section>
{% endblock %}
```

- [x] **Étape 7 : créer le routeur et le monter**

Créer `src/routes/alertRoutes.js` :

```js
// Routes publiques des alertes email moniteurs (montées sous /alertes).
const express = require('express');
const rateLimit = require('express-rate-limit');
const alertController = require('../controllers/alertController');

const router = express.Router();

// Anti-abus : chaque POST peut déclencher un email de confirmation.
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Trop de demandes. Veuillez réessayer plus tard.');
    res.status(429).redirect('/alertes');
  },
});

router.get('/', alertController.newForm);
router.post('/', subscribeLimiter, alertController.create);

module.exports = router;
```

Dans `src/routes/index.js` :
1. ajouter le require avec les autres routeurs : `const alertRoutes = require('./alertRoutes');`
2. juste APRÈS la ligne `router.use('/annonces', listingRoutes);`, ajouter :

```js
router.use('/alertes', alertRoutes);
```

- [x] **Étape 8 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-i.cjs`
Attendu : `✅ Lot I tests reussis - 15 assertions.`

- [x] **Étape 9 : committer**

```powershell
git add src/validators/alertValidator.js src/controllers/alertController.js src/routes/alertRoutes.js src/routes/index.js src/services/mailer.js views/alerts/new.twig test/lot-i.cjs
git commit -m "I: formulaire public d alerte + email de confirmation (message neutre)"
```

---

### Tâche 3 : confirmation (double opt-in, idempotente)

**Fichiers :**
- Modifier : `src/services/alertService.js`
- Modifier : `src/controllers/alertController.js`
- Modifier : `src/routes/alertRoutes.js`
- Créer : `views/alerts/confirmed.twig`
- Modifier : `test/lot-i.cjs`

**Interfaces :**
- Produit : `alertService.confirmByToken(rawToken): Promise<Alert | null>` — hashe le jeton, pose `confirmedAt` si absent, renvoie l'alerte (re-clic = même succès), `null` si inconnu. Route `GET /alertes/confirmer/:token`.

- [ ] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-i.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot I tests reussis - ${passed} assertions.`);`` :

```js
    // --- 3. confirmation (double opt-in, idempotente) ---
    const rawToken = confirmCalls[0].rawToken;
    r = await get(`/alertes/confirmer/${rawToken}`);
    ok(r.status === 200 && r.text.includes('activée'), 'confirmation : alerte activee');
    const confirmed = await prisma.alert.findFirst({ where: { email: `i.form.${STAMP}@example.test` } });
    ok(confirmed.confirmedAt instanceof Date, 'confirmation : confirmedAt pose');
    r = await get(`/alertes/confirmer/${rawToken}`);
    ok(r.status === 200 && r.text.includes('activée'), 'confirmation : re-clic idempotent (toujours succes)');
    r = await get(`/alertes/confirmer/jetoninconnu${STAMP}`);
    ok(r.status === 404, 'confirmation : jeton inconnu -> 404');

    const sDup = await alertService.subscribe(`i.form.${STAMP}@example.test`, '13', 'cdi');
    ok(sDup.rawConfirmToken === null, 'subscribe : doublon deja confirme -> aucun nouveau jeton');
```

- [ ] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-i.cjs`
Attendu : `❌ ECHEC : confirmation : alerte activee` (route inconnue → 404).

- [ ] **Étape 3 : ajouter `confirmByToken` au service**

Dans `src/services/alertService.js`, juste AVANT `module.exports`, ajouter :

```js
// Active l'alerte du jeton (reçu en clair, hashé pour le lookup). Idempotent : le
// jeton est conservé après confirmation, un re-clic renvoie la même alerte active.
async function confirmByToken(rawToken) {
  const alert = await prisma.alert.findUnique({ where: { confirmTokenHash: hashToken(rawToken) } });
  if (!alert) return null;
  if (alert.confirmedAt) return alert;
  return prisma.alert.update({ where: { id: alert.id }, data: { confirmedAt: new Date() } });
}
```

Et remplacer l'export par : `module.exports = { subscribe, confirmByToken };`

- [ ] **Étape 4 : contrôleur + route + vue**

Dans `src/controllers/alertController.js` :
1. ajouter en tête, avec les autres requires : `const { notFound } = require('../utils/http');`
2. juste AVANT `module.exports`, ajouter :

```js
// GET /alertes/confirmer/:token — idempotent (re-clic = succès).
async function confirm(req, res, next) {
  try {
    const alert = await alertService.confirmByToken(req.params.token);
    if (!alert) return notFound(res);
    res.render('alerts/confirmed', { title: 'Alerte activée', alert });
  } catch (err) {
    next(err);
  }
}
```

3. remplacer l'export par : `module.exports = { newForm, create, confirm };`

Dans `src/routes/alertRoutes.js`, après `router.post('/', ...)`, ajouter :

```js
router.get('/confirmer/:token', alertController.confirm);
```

Créer `views/alerts/confirmed.twig` :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <section class="form-card">
    <h1>Alerte activée</h1>
    <p>Votre alerte pour le département <strong>{{ alert.department }}</strong>{% if alert.keyword %}
      (mot-clé « {{ alert.keyword }} »){% endif %} est active : vous recevrez un email
      à chaque nouvelle annonce correspondante.</p>
    <p class="muted">Chaque email contient un lien pour vous désabonner à tout moment.</p>
    <p><a href="/annonces" class="btn btn-primary">Voir les annonces</a></p>
  </section>
{% endblock %}
```

- [ ] **Étape 5 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-i.cjs`
Attendu : `✅ Lot I tests reussis - 20 assertions.`

- [ ] **Étape 6 : committer**

```powershell
git add src/services/alertService.js src/controllers/alertController.js src/routes/alertRoutes.js views/alerts/confirmed.twig test/lot-i.cjs
git commit -m "I: confirmation d alerte par jeton hache (idempotente)"
```

---

### Tâche 4 : désabonnement (page + bouton, suppression réelle)

**Fichiers :**
- Modifier : `src/services/alertService.js`
- Modifier : `src/controllers/alertController.js`
- Modifier : `src/routes/alertRoutes.js`
- Créer : `views/alerts/unsubscribe.twig`, `views/alerts/unsubscribed.twig`
- Modifier : `test/lot-i.cjs`

**Interfaces :**
- Produit : `alertService.findByUnsubscribeToken(token)`, `alertService.deleteByUnsubscribeToken(token): Promise<boolean>`. Routes `GET` + `POST /alertes/desabonner/:token`.

- [ ] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-i.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot I tests reussis - ${passed} assertions.`);`` :

```js
    // --- 4. desabonnement (page + bouton, suppression reelle) ---
    const unsubToken = confirmed.unsubscribeToken;
    r = await get(`/alertes/desabonner/${unsubToken}`);
    ok(r.status === 200 && r.text.includes('<form') && r.text.includes('Se désabonner'),
      'desabonnement : page avec bouton (pas de suppression au GET)');
    ok(Boolean(await prisma.alert.findUnique({ where: { unsubscribeToken: unsubToken } })),
      'desabonnement : le GET ne supprime rien');
    let ru = await req(jarI, 'GET', `/alertes/desabonner/${unsubToken}`);
    ru = await req(jarI, 'POST', `/alertes/desabonner/${unsubToken}`, form({ _csrf: csrfFrom(ru.text) }));
    ok(ru.status === 200 && ru.text.includes('supprimée'), 'desabonnement : confirmation affichee');
    ok((await prisma.alert.findUnique({ where: { unsubscribeToken: unsubToken } })) === null,
      'desabonnement : ligne supprimee (RGPD)');
    r = await get(`/alertes/desabonner/${unsubToken}`);
    ok(r.status === 404, 'desabonnement : jeton deja consomme -> 404');
```

- [ ] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-i.cjs`
Attendu : `❌ ECHEC : desabonnement : page avec bouton (pas de suppression au GET)` (404).

- [ ] **Étape 3 : ajouter les fonctions au service**

Dans `src/services/alertService.js`, juste AVANT `module.exports`, ajouter :

```js
function findByUnsubscribeToken(token) {
  return prisma.alert.findUnique({ where: { unsubscribeToken: token } });
}

// Suppression réelle de la ligne (RGPD) — pas de corbeille, pas de soft delete.
async function deleteByUnsubscribeToken(token) {
  const { count } = await prisma.alert.deleteMany({ where: { unsubscribeToken: token } });
  return count > 0;
}
```

Et remplacer l'export par :
`module.exports = { subscribe, confirmByToken, findByUnsubscribeToken, deleteByUnsubscribeToken };`

- [ ] **Étape 4 : contrôleur + routes + vues**

Dans `src/controllers/alertController.js`, juste AVANT `module.exports`, ajouter :

```js
// GET /alertes/desabonner/:token — page avec bouton : les webmails/antivirus
// préchargent les liens, on ne supprime JAMAIS au simple GET.
async function unsubscribeForm(req, res, next) {
  try {
    const alert = await alertService.findByUnsubscribeToken(req.params.token);
    if (!alert) return notFound(res);
    res.render('alerts/unsubscribe', { title: 'Se désabonner', alert, token: req.params.token });
  } catch (err) {
    next(err);
  }
}

// POST /alertes/desabonner/:token — suppression réelle (RGPD).
async function unsubscribe(req, res, next) {
  try {
    const deleted = await alertService.deleteByUnsubscribeToken(req.params.token);
    if (!deleted) return notFound(res);
    res.render('alerts/unsubscribed', { title: 'Alerte supprimée' });
  } catch (err) {
    next(err);
  }
}
```

Remplacer l'export par :
`module.exports = { newForm, create, confirm, unsubscribeForm, unsubscribe };`

Dans `src/routes/alertRoutes.js`, après la route `confirmer`, ajouter :

```js
router.get('/desabonner/:token', alertController.unsubscribeForm);
router.post('/desabonner/:token', alertController.unsubscribe);
```

Créer `views/alerts/unsubscribe.twig` :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <section class="form-card">
    <h1>Se désabonner</h1>
    <p>Supprimer l’alerte de <strong>{{ alert.email }}</strong> pour le département
      <strong>{{ alert.department }}</strong>{% if alert.keyword %} (mot-clé « {{ alert.keyword }} »){% endif %} ?</p>
    <form action="/alertes/desabonner/{{ token }}" method="post">
      <input type="hidden" name="_csrf" value="{{ csrfToken }}">
      <button type="submit" class="btn btn-primary">Se désabonner</button>
    </form>
  </section>
{% endblock %}
```

Créer `views/alerts/unsubscribed.twig` :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <section class="form-card">
    <h1>Alerte supprimée</h1>
    <p>Votre alerte a été supprimée — vous ne recevrez plus d’emails.
      Vous pouvez en recréer une à tout moment.</p>
    <p><a href="/alertes" class="btn">Créer une nouvelle alerte</a></p>
  </section>
{% endblock %}
```

- [ ] **Étape 5 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-i.cjs`
Attendu : `✅ Lot I tests reussis - 25 assertions.`

- [ ] **Étape 6 : committer**

```powershell
git add src/services/alertService.js src/controllers/alertController.js src/routes/alertRoutes.js views/alerts/unsubscribe.twig views/alerts/unsubscribed.twig test/lot-i.cjs
git commit -m "I: desabonnement en deux temps avec suppression reelle"
```

---

### Tâche 5 : notification à la publication d'une annonce

**Fichiers :**
- Modifier : `src/services/mailer.js`
- Modifier : `src/services/alertService.js`
- Modifier : `src/controllers/listingController.js`
- Modifier : `test/lot-i.cjs`

**Interfaces :**
- Consomme : les alertes confirmées (Tâches 1-3), `listingService.createForSchool` (existant — renvoie l'annonce créée avec ses colonnes `*Lower`).
- Produit : `mailer.sendListingAlert(email, listing, unsubscribeToken)`, `alertService.notifyNewListing(listing): Promise<void>` — **ne lève jamais**, appelée SANS `await` depuis `listingController.create`.

- [ ] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-i.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot I tests reussis - ${passed} assertions.`);`` :

```js
    // --- 5. notification a la publication ---
    const aA = (await alertService.subscribe(`i.a.${STAMP}@example.test`, '13', '')).alert;
    const aB = (await alertService.subscribe(`i.b.${STAMP}@example.test`, '13', 'moto')).alert;
    const aC = (await alertService.subscribe(`i.c.${STAMP}@example.test`, '13', '')).alert; // restera non confirmee
    const aD = (await alertService.subscribe(`i.d.${STAMP}@example.test`, '75', '')).alert;
    await prisma.alert.updateMany({ where: { id: { in: [aA.id, aB.id, aD.id] } }, data: { confirmedAt: new Date() } });

    const alertMails = [];
    mailer.sendListingAlert = async (email, listing, unsubscribeToken) => {
      alertMails.push({ email, listingId: listing.id, unsubscribeToken });
      return true;
    };

    const schoolI = await prisma.school.create({
      data: {
        email: `i.ecole.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: `Ecole Lot I ${STAMP}`,
        siret: `8${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(schoolI.id);
    const schoolJar = makeJar();
    let rs = await req(schoolJar, 'GET', '/connexion');
    rs = await req(schoolJar, 'POST', '/connexion', form({ _csrf: csrfFrom(rs.text), email: schoolI.email, password: 'motdepasse123' }));

    let rc = await req(schoolJar, 'GET', '/mes-annonces/nouvelle');
    rc = await req(schoolJar, 'POST', '/mes-annonces', form({
      _csrf: csrfFrom(rc.text), title: `Moniteur Moto ${STAMP}`, description: 'poste complet', city: 'Marseille', department: '13',
    }));
    ok(rc.status === 302 && rc.location === '/mes-annonces', 'publication : annonce creee');
    ok(await eventually(() => alertMails.length >= 2), 'alerte : emails partis apres la publication');
    await new Promise((r2) => setTimeout(r2, 150)); // laisse retomber d'eventuels envois en trop
    ok(alertMails.length === 2, 'alerte : exactement 2 destinataires');
    const dests = alertMails.map((m) => m.email);
    ok(dests.includes(aA.email) && dests.includes(aB.email), 'alerte : sans mot-cle + mot-cle « moto » notifies');
    ok(!dests.includes(aC.email) && !dests.includes(aD.email), 'alerte : non confirmee et autre departement exclues');
    ok(alertMails.every((m) => typeof m.unsubscribeToken === 'string' && m.unsubscribeToken.length >= 32),
      'alerte : chaque email porte son jeton de desabonnement');

    alertMails.length = 0;
    rc = await req(schoolJar, 'GET', '/mes-annonces/nouvelle');
    rc = await req(schoolJar, 'POST', '/mes-annonces', form({
      _csrf: csrfFrom(rc.text), title: `Moniteur voiture ${STAMP}`, description: 'poste', city: 'Marseille', department: '13',
    }));
    ok(await eventually(() => alertMails.length === 1) && alertMails[0].email === aA.email,
      'alerte : mot-cle non matche -> seule l alerte sans mot-cle est notifiee');

    mailer.sendListingAlert = async () => { throw new Error('panne smtp simulee'); };
    rc = await req(schoolJar, 'GET', '/mes-annonces/nouvelle');
    rc = await req(schoolJar, 'POST', '/mes-annonces', form({
      _csrf: csrfFrom(rc.text), title: `Moniteur secours ${STAMP}`, description: 'poste', city: 'Marseille', department: '13',
    }));
    ok(rc.status === 302 && rc.location === '/mes-annonces', 'alerte : une panne d envoi ne bloque jamais la publication');
```

- [ ] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-i.cjs`
Attendu : `❌ ECHEC : alerte : emails partis apres la publication` (la publication passe, mais rien n'est envoyé).

- [ ] **Étape 3 : ajouter l'email d'alerte au mailer**

Dans `src/services/mailer.js`, juste APRÈS la fonction `sendAlertConfirmation`, ajouter :

```js
// Alerte : une nouvelle annonce correspond aux critères de l'abonné. Le lien de
// désabonnement figure dans CHAQUE email (obligation d'opt-out).
function sendListingAlert(email, listing, unsubscribeToken) {
  const link = `${APP_URL}/annonces/${listing.id}`;
  const unsubscribeLink = `${APP_URL}/alertes/desabonner/${unsubscribeToken}`;
  return send(
    email,
    `Nouvelle annonce — ${listing.title}`,
    `<p>Une nouvelle annonce correspond à votre alerte :</p>
     <p><strong>${esc(listing.title)}</strong> — ${esc(listing.city)} (${esc(listing.department)})</p>
     <p><a href="${link}">Voir l’annonce et postuler</a></p>
     <p><a href="${unsubscribeLink}">Se désabonner de cette alerte</a></p>`,
    { link }
  );
}
```

Et ajouter `sendListingAlert,` dans l'objet `module.exports`.

- [ ] **Étape 4 : ajouter `notifyNewListing` au service**

Dans `src/services/alertService.js`, juste AVANT `module.exports`, ajouter :

```js
// Notifie les alertes confirmées correspondant à une annonce qui vient d'être
// publiée. NE LÈVE JAMAIS : appelée en fire-and-forget depuis le contrôleur — la
// publication ne dépend pas des emails, et un destinataire en erreur n'empêche
// pas les autres (Promise.allSettled).
async function notifyNewListing(listing) {
  try {
    const alerts = await prisma.alert.findMany({
      where: { department: listing.department, confirmedAt: { not: null } },
    });
    const haystack = `${listing.titleLower || ''} ${listing.descriptionLower || ''} ${listing.cityLower || ''}`;
    const matching = alerts.filter((a) => !a.keywordLower || haystack.includes(a.keywordLower));
    await Promise.allSettled(matching.map((a) => mailer.sendListingAlert(a.email, listing, a.unsubscribeToken)));
  } catch (err) {
    console.error(`[alertes] notification impossible pour l'annonce ${listing && listing.id} : ${err.message}`);
  }
}
```

Et remplacer l'export par :
`module.exports = { subscribe, confirmByToken, findByUnsubscribeToken, deleteByUnsubscribeToken, notifyNewListing };`

- [ ] **Étape 5 : déclencher depuis le contrôleur des annonces**

Dans `src/controllers/listingController.js` :
1. ajouter en tête, avec les autres requires : `const alertService = require('../services/alertService');`
2. dans la fonction `create`, remplacer :

```js
    await listingService.createForSchool(req.school.id, value);
```

par :

```js
    const listing = await listingService.createForSchool(req.school.id, value);
    alertService.notifyNewListing(listing); // fire-and-forget : la publication n'attend pas les emails
```

(PAS de `await` sur `notifyNewListing` — c'est le point de la spec.)

- [ ] **Étape 6 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-i.cjs`
Attendu : `✅ Lot I tests reussis - 33 assertions.`

- [ ] **Étape 7 : suite complète puis commit**

Lancer : `npm test` — tout doit rester vert (les autres suites créent leurs annonces via Prisma directement, sans passer par `create`).

```powershell
git add src/services/mailer.js src/services/alertService.js src/controllers/listingController.js test/lot-i.cjs
git commit -m "I: notification des alertes a la publication d une annonce (fire-and-forget)"
```

---

### Tâche 6 : points d'entrée, passation

**Fichiers :**
- Modifier : `src/controllers/listingController.js` (fonction `browse` — `alerteUrl`)
- Modifier : `views/listings/index.twig`, `views/partials/nav.twig`
- Modifier : `AGENTS.md`
- Modifier : `test/lot-i.cjs`

**Interfaces :**
- Consomme : `GET /alertes` avec pré-remplissage `?departement=&q=` (Tâche 2).

- [ ] **Étape 1 : ajouter les tests (RED)**

Dans `test/lot-i.cjs`, insérer ce bloc juste AVANT la ligne ``console.log(`\n✅ Lot I tests reussis - ${passed} assertions.`);`` :

```js
    // --- 6. points d'entree ---
    r = await get('/annonces?departement=13&q=moto');
    ok(r.text.includes('Créer une alerte') && r.text.includes('/alertes?departement=13&amp;q=moto'),
      'annonces : lien « Creer une alerte » pre-rempli avec les filtres');
    ok(r.text.includes('>Alertes<'), 'nav : entree publique Alertes');
```

- [ ] **Étape 2 : vérifier l'échec (RED)**

Lancer : `node test/lot-i.cjs`
Attendu : `❌ ECHEC : annonces : lien « Creer une alerte » pre-rempli avec les filtres`.

- [ ] **Étape 3 : construire `alerteUrl` dans le contrôleur**

Dans `src/controllers/listingController.js`, fonction `browse`, juste AVANT la déclaration `const common = {`, ajouter :

```js
    // Lien « créer une alerte » pré-rempli avec la recherche courante (URL encodée
    // côté serveur, échappée par Twig à l'affichage).
    const alertParams = new URLSearchParams();
    if (query.departement) alertParams.set('departement', query.departement);
    if (query.q) alertParams.set('q', query.q);
    const alerteUrl = alertParams.toString() ? `/alertes?${alertParams.toString()}` : '/alertes';
```

Et dans l'objet `common`, ajouter la propriété `alerteUrl,` (par exemple après `villeIntrouvable,`).

- [ ] **Étape 4 : points d'entrée dans les vues**

Dans `views/listings/index.twig`, juste APRÈS le `</div>` fermant de `<div class="view-toggle">`, ajouter :

```twig
  <p class="muted"><a href="{{ alerteUrl }}">Créer une alerte pour cette recherche</a> — recevez les prochaines annonces par email.</p>
```

Dans `views/partials/nav.twig`, juste APRÈS la ligne `<a href="/annonces">Annonces</a>`, ajouter :

```twig
    <a href="/alertes">Alertes</a>
```

- [ ] **Étape 5 : vérifier que le test passe (GREEN)**

Lancer : `node test/lot-i.cjs`
Attendu : `✅ Lot I tests reussis - 35 assertions.`

- [ ] **Étape 6 : mettre à jour `AGENTS.md` (passation)**

1. Remplacer la ligne `- **Prochain travail : Lot I (alertes email moniteurs)** — spec et plan à écrire.` (ou sa variante pointant vers le plan) par :

```markdown
- **Lot I (alertes email moniteurs) : LIVRÉ** — abonnement public double opt-in
  (département + mot-clé), jeton de confirmation haché / désabonnement opaque,
  notification fire-and-forget à la publication (`alertService.notifyNewListing`),
  désabonnement en deux temps avec suppression réelle. Tests : `test/lot-i.cjs`.
- **Prochain travail : Lot J (purge RGPD automatique)** — spec et plan à écrire.
  À prévoir : purger aussi les alertes jamais confirmées (décision de la spec du Lot I).
```

2. Dans Conventions, remplacer `(4057-4064 déjà pris)` par `(4057-4065 déjà pris)`.

3. Dans « Stack & commandes », remplacer `suite complète (9 fichiers .cjs, ~275 assertions)` par `suite complète (10 fichiers .cjs, ~310 assertions)`.

4. Dans « Pièges connus », ajouter à la fin de la section :

```markdown
- **Alertes email** (Lot I) : `notifyNewListing` est fire-and-forget et ne lève
  jamais ; le mailer s'appelle toujours via l'objet (`mailer.sendListingAlert(...)`,
  jamais destructuré) pour rester interceptable dans les tests.
```

- [ ] **Étape 7 : suite complète puis commit final**

Lancer : `npm test` — les 10 fichiers doivent être verts.

```powershell
git add src/controllers/listingController.js views/listings/index.twig views/partials/nav.twig AGENTS.md test/lot-i.cjs
git commit -m "I: points d entree des alertes (lien recherche + navigation) et passation"
```

---

## Récapitulatif des assertions attendues

| Après la tâche | `node test/lot-i.cjs` affiche |
|---|---|
| 1 | `✅ Lot I tests reussis - 7 assertions.` |
| 2 | `✅ ... 15 assertions.` |
| 3 | `✅ ... 20 assertions.` |
| 4 | `✅ ... 25 assertions.` |
| 5 | `✅ ... 33 assertions.` |
| 6 | `✅ ... 35 assertions.` |
