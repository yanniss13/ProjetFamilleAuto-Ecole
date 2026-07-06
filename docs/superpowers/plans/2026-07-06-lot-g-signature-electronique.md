# Lot G — Signature électronique du contrat : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'école signe le contrat au moment de l'établir (pad canvas), le candidat contresigne en ligne depuis sa page de suivi, et le PDF final signé (deux signatures, horodatages, empreintes SHA-256) est envoyé automatiquement aux deux parties.

**Architecture:** Colonnes de signature sur `Contract` → service `signatureImage` (validation stricte des PNG de pad) → `contractPdf` gagne une page « Signatures » → flux école (pad dans le formulaire d'acceptation, PDF « proposé » + empreinte) → invitation email → flux candidat (`/suivi/:token/…` : lecture PDF, page de signature, contreseing → PDF final + emails). Invalidation complète à la ré-édition, nettoyage disque partout.

**Tech Stack:** Node.js (CommonJS), Express 5, Twig, Prisma, pdfkit (existant), canvas HTML5 (JS vanilla statique, CSP), `crypto` natif (SHA-256).

## Global Constraints

- Spec de référence : `docs/superpowers/specs/2026-07-06-lot-g-signature-electronique-design.md`.
- Français partout ; **typographie française dans les textes utilisateur ( — … « » ✓ ✍️ ), ne PAS remplacer par de l'ASCII** ; commits préfixe `G:` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- CSP stricte : aucun JS inline ; le pad est un fichier statique `public/js/signature-pad.js`.
- Signatures : PNG uniquement, transmis en `data:image/png;base64,...` (champ `signatureData`), validées serveur (préfixe, base64, magic bytes, ≤ 200 Ko), stockées sous `storage/signatures/` (stockage privé, noms régénérés).
- Empreintes : SHA-256 hex (`src/utils/hash.js`). `proposedPdfHash` = PDF proposé (signé école seule) ; `signedPdfHash` = PDF final.
- État dérivé, pas de colonne statut : signé ⇔ `applicantSignedAt != null` ; à signer ⇔ `sentToApplicantAt != null && applicantSignedAt == null`.
- Ré-édition (re-accept) : signatures candidat + PDF signé invalidés (colonnes null) et fichiers supprimés ; l'école re-signe (pad dans le formulaire).
- Migration Prisma : recette non-interactive (diff → fichier → `migrate deploy` → `generate`), JAMAIS `migrate dev`.
- Tests : `test/lot-g.cjs`, port **4063** ; `node test/lot-g.cjs` vert après chaque tâche ; `npm test` complet en fin de lot. Mailer intercepté par réassignation de propriétés (motif smoke).
- ⚠️ `test/smoke.cjs` accepte un contrat : il DOIT être adapté en Task 4 (signature désormais obligatoire).

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` + migration | 7 colonnes Contract |
| `src/config/storage.js` | sous-dossier `signatures` |
| `src/utils/hash.js` (nouveau) | `sha256Hex`, `formatHash` |
| `src/services/signatureImage.js` (nouveau) | `decodeSignature`, `saveSignature` |
| `src/services/contractPdf.js` | page « Signatures » (param `signatures`) |
| `src/services/contractService.js` | `signByApplicant` |
| `src/controllers/contractController.js` | signature école, invalidation, invitation, download signé |
| `src/controllers/signatureController.js` (nouveau) | lecture PDF, page + POST signer |
| `src/routes/trackingRoutes.js`, `src/routes/manageRoutes.js` | nouvelles routes |
| `src/services/mailer.js` | `sendSignatureInvitation`, `sendSignedContract` (remplacent `sendContractToApplicant`) |
| `views/dashboard/contract_form.twig`, `views/dashboard/applications.twig` | pad école, états |
| `views/tracking/show.twig`, `views/tracking/sign.twig` (nouveau) | bloc contrat, page de signature |
| `public/js/signature-pad.js` (nouveau), `public/css/style.css` | pad, styles |
| `src/services/listingService.js` | chemins à nettoyer |
| `test/lot-g.cjs` (nouveau), `test/smoke.cjs`, `package.json`, `AGENTS.md` | tests + intégration |

---

### Task 1 : colonnes de signature sur `Contract` + sous-dossier `signatures`

**Files:**
- Modify: `prisma/schema.prisma` (modèle `Contract`)
- Modify: `src/config/storage.js`
- Create: `prisma/migrations/<YYYYMMDDHHMMSS>_contract_signatures/migration.sql`
- Create: `test/lot-g.cjs`

**Interfaces:**
- Produces: colonnes `schoolSignaturePath`, `schoolSignedAt`, `applicantSignaturePath`, `applicantSignedAt`, `proposedPdfHash`, `signedPdfPath`, `signedPdfHash` (toutes nullables) ; `SUBDIRS.signatures === 'signatures'`.

- [ ] **Step 1 : test qui échoue** — créer `test/lot-g.cjs` :

```js
/**
 * Tests du Lot G — signature électronique du contrat.
 * Spec : docs/superpowers/specs/2026-07-06-lot-g-signature-electronique-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotg-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const path = require('path');
const fs = require('fs');
const prisma = require('../src/config/prisma');
const app = require('../src/app');
const mailer = require('../src/services/mailer');
const passwordUtil = require('../src/utils/password');
const { STORAGE_DIR } = require('../src/config/storage');

const PORT = 4063;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

// Fixture : vrai PNG 1×1 (~85 octets) au format data URL, comme un export de canvas.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SIGNATURE_PNG = `data:image/png;base64,${PNG_B64}`;

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
function absStored(rel) { return path.join(STORAGE_DIR, rel); }

const createdSchoolIds = [];

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

    // Interception du mailer (même objet exports que les contrôleurs).
    const mailCalls = [];
    mailer.sendApplicationAccepted = (...a) => { mailCalls.push(['accepted', ...a]); return true; };
    mailer.sendApplicationRejected = (...a) => { mailCalls.push(['rejected', ...a]); return true; };
    mailer.sendSignatureInvitation = (...a) => { mailCalls.push(['invitation', ...a]); return true; };
    mailer.sendSignedContract = (...a) => { mailCalls.push(['signed', ...a]); return true; };

    // Données de base : école connectée + annonce + candidature acceptable.
    const school = await prisma.school.create({
      data: {
        email: `g.school.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'G École', siret: `7${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(school.id);
    const listing = await prisma.listing.create({
      data: {
        title: `LotG annonce ${STAMP}`, description: 'd', city: 'Pau', department: '64',
        schoolId: school.id, titleLower: `lotg annonce ${STAMP}`, descriptionLower: 'd', cityLower: 'pau',
      },
    });
    const application = await prisma.application.create({
      data: {
        listingId: listing.id, applicantName: 'G Candidat', applicantEmail: `g.cand.${STAMP}@example.test`,
        message: 'm', trackingToken: `g${STAMP}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.slice(0, 64),
      },
    });

    // --- 1. colonnes de signature (nulles par défaut) + sous-dossier storage ---
    const c0 = await prisma.contract.create({
      data: {
        applicationId: application.id, type: 'cdi', startDate: new Date('2026-08-01'),
        grossSalary: '2000€', workplace: 'Pau', pdfPath: 'contracts/lotg-placeholder.pdf',
      },
    });
    ok(c0.schoolSignaturePath === null && c0.schoolSignedAt === null
      && c0.applicantSignaturePath === null && c0.applicantSignedAt === null
      && c0.proposedPdfHash === null && c0.signedPdfPath === null && c0.signedPdfHash === null,
      'schema : 7 colonnes de signature nulles par défaut');
    ok(fs.existsSync(path.join(STORAGE_DIR, 'signatures')), 'storage : sous-dossier signatures créé');
    await prisma.contract.delete({ where: { id: c0.id } });

    console.log(`\n✅ Lot G tests réussis — ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    // Nettoyage : fichiers privés rattachés aux écoles de test, puis cascade en base.
    if (createdSchoolIds.length) {
      const apps = await prisma.application.findMany({
        where: { listing: { schoolId: { in: createdSchoolIds } } }, include: { contract: true },
      });
      for (const a of apps) {
        const rels = [a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath];
        if (a.contract) rels.push(a.contract.pdfPath, a.contract.signedPdfPath, a.contract.schoolSignaturePath, a.contract.applicantSignaturePath);
        for (const rel of rels) {
          if (rel) { try { if (fs.existsSync(absStored(rel))) fs.unlinkSync(absStored(rel)); } catch {} }
        }
      }
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-g.cjs`
Attendu : erreur Prisma « Unknown argument » ou `❌ ÉCHEC : schema : 7 colonnes...`

- [ ] **Step 3 : schéma** — dans `prisma/schema.prisma`, modèle `Contract`, insérer après la ligne `sentToApplicantAt DateTime?` :

```prisma
  // Signature électronique (Lot G) : images PNG des signatures sous storage/signatures/,
  // horodatages, et empreintes SHA-256 (preuve d'intégrité entre la signature de l'école
  // et le contreseing du candidat). État dérivé : signé <=> applicantSignedAt non nul.
  schoolSignaturePath    String?
  schoolSignedAt         DateTime?
  applicantSignaturePath String?
  applicantSignedAt      DateTime?
  proposedPdfHash        String? // SHA-256 hex du PDF proposé (signé école seulement)
  signedPdfPath          String? // PDF final contresigné, sous storage/contracts/
  signedPdfHash          String? // SHA-256 hex du PDF final
```

- [ ] **Step 4 : sous-dossier de stockage** — dans `src/config/storage.js`, remplacer :

```js
const SUBDIRS = { cv: 'cv', id: 'id', license: 'license', teaching: 'teaching', contracts: 'contracts' };
```

par :

```js
const SUBDIRS = { cv: 'cv', id: 'id', license: 'license', teaching: 'teaching', contracts: 'contracts', signatures: 'signatures' };
```

- [ ] **Step 5 : migration (recette non-interactive)**

```bash
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script
```

Copier la sortie EXACTE dans `prisma/migrations/<YYYYMMDDHHMMSS>_contract_signatures/migration.sql`, puis :

```bash
npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 6 : vérifier le succès**

Run : `node test/lot-g.cjs`
Attendu : 2 ✓.

- [ ] **Step 7 : commit**

```bash
git add prisma/schema.prisma prisma/migrations src/config/storage.js test/lot-g.cjs
git commit -m "G: colonnes de signature sur Contract + stockage prive des signatures

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : `src/utils/hash.js` + `src/services/signatureImage.js`

**Files:**
- Create: `src/utils/hash.js`
- Create: `src/services/signatureImage.js`
- Modify: `test/lot-g.cjs`

**Interfaces:**
- Produces: `sha256Hex(buffer|string) -> string` (hex 64) ; `formatHash(hex) -> string` (groupes de 8) ; `decodeSignature(dataUrl) -> Buffer|null` ; `saveSignature(buf) -> Promise<string>` (chemin relatif `signatures/<hex>.png`). Consommés par les Tasks 3, 4 et 6.

- [ ] **Step 1 : test qui échoue** — dans `test/lot-g.cjs`, insérer avant le `console.log` final :

```js
    // --- 2. hash + validation des signatures ---
    {
      const { sha256Hex, formatHash } = require('../src/utils/hash');
      const signatureImage = require('../src/services/signatureImage');

      ok(sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        'hash : sha256Hex vecteur connu');
      ok(formatHash('aabbccdd11223344').startsWith('aabbccdd 11223344'), 'hash : formatHash groupe par 8');

      const buf = signatureImage.decodeSignature(SIGNATURE_PNG);
      ok(Buffer.isBuffer(buf) && buf.length > 50, 'signature : data URL PNG valide décodée');
      ok(signatureImage.decodeSignature(`data:image/jpeg;base64,${PNG_B64}`) === null,
        'signature : préfixe non-PNG refusé');
      ok(signatureImage.decodeSignature('data:image/png;base64,@@@@') === null,
        'signature : base64 corrompu refusé');
      const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
      ok(signatureImage.decodeSignature(`data:image/png;base64,${fakeJpeg.toString('base64')}`) === null,
        'signature : contenu JPEG déguisé en PNG refusé (magic bytes)');
      const huge = Buffer.concat([buf, Buffer.alloc(201 * 1024)]);
      ok(signatureImage.decodeSignature(`data:image/png;base64,${huge.toString('base64')}`) === null,
        'signature : plus de 200 Ko refusé');

      const rel = await signatureImage.saveSignature(buf);
      ok(rel.startsWith('signatures/') && fs.existsSync(absStored(rel)), 'signature : PNG écrit dans storage/signatures/');
      fs.unlinkSync(absStored(rel));
    }
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-g.cjs`
Attendu : `Cannot find module '../src/utils/hash'`

- [ ] **Step 3 : implémentation** — créer `src/utils/hash.js` :

```js
// Empreintes de documents (preuve d'intégrité pour la signature électronique).
const crypto = require('crypto');

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Présentation lisible d'une empreinte : groupes de 8 caractères hexadécimaux.
function formatHash(hex) {
  return String(hex || '').replace(/(.{8})(?=.)/g, '$1 ');
}

module.exports = { sha256Hex, formatHash };
```

puis créer `src/services/signatureImage.js` :

```js
// Validation et écriture des images de signature (export PNG du pad canvas).
// Aucune confiance dans le client : préfixe data URL, base64, magic bytes PNG et
// taille sont vérifiés avant toute écriture. Stockage PRIVÉ (storage/signatures/),
// noms régénérés — mêmes règles que les pièces de candidature.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { STORAGE_DIR, SUBDIRS } = require('../config/storage');

const PREFIX = 'data:image/png;base64,';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 200 * 1024; // 200 Ko : très large pour un trait de signature
const MIN_BYTES = 50; // garde-fou contre un contenu manifestement vide

// Décode et valide une signature transmise par formulaire. Buffer PNG, ou null.
function decodeSignature(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX)) return null;
  const b64 = dataUrl.slice(PREFIX.length);
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return null;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < MIN_BYTES || buf.length > MAX_BYTES) return null;
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return buf;
}

// Écrit la signature dans le stockage privé ; renvoie le chemin relatif (stocké en base).
async function saveSignature(buf) {
  const filename = `${crypto.randomBytes(16).toString('hex')}.png`;
  await fs.promises.writeFile(path.join(STORAGE_DIR, SUBDIRS.signatures, filename), buf);
  return `${SUBDIRS.signatures}/${filename}`;
}

module.exports = { decodeSignature, saveSignature, MAX_BYTES };
```

- [ ] **Step 4 : vérifier le succès**

Run : `node test/lot-g.cjs`
Attendu : 10 ✓.

- [ ] **Step 5 : commit**

```bash
git add src/utils/hash.js src/services/signatureImage.js test/lot-g.cjs
git commit -m "G: utilitaires d'empreinte SHA-256 + validation des PNG de signature

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : page « Signatures » dans `contractPdf.js`

**Files:**
- Modify: `src/services/contractPdf.js`
- Modify: `test/lot-g.cjs`

**Interfaces:**
- Consumes: `formatHash` (Task 2).
- Produces: `buildContractPdf({ type, school, applicant, listing, terms, signatures })` — `signatures` optionnel :
  `{ school: { imagePath, signedAt, name } | null, applicant: { imagePath, signedAt, name } | null, proposedHash: string | null }`.
  Sans `signatures` : PDF actuel inchangé (bloc de signature manuscrite). Avec : page finale « Signatures électroniques » (cadres école/candidat, image + nom + horodatage, « En attente de signature » si absent, empreinte du PDF proposé si fournie).

- [ ] **Step 1 : test qui échoue** — dans `test/lot-g.cjs`, insérer avant le `console.log` final :

```js
    // --- 3. page « Signatures » du PDF ---
    {
      const { buildContractPdf } = require('../src/services/contractPdf');
      const signatureImage = require('../src/services/signatureImage');
      const relSig = await signatureImage.saveSignature(signatureImage.decodeSignature(SIGNATURE_PNG));

      const fakeSchool = { businessName: 'PDF École', siret: '12345678901234', email: 'e@x.fr', phone: null };
      const fakeApplicant = { applicantName: 'PDF Candidat', applicantEmail: 'c@x.fr', applicantPhone: null };
      const fakeListing = { title: 'Annonce PDF', city: 'Pau', department: '64' };
      const terms = { startDate: new Date('2026-08-01'), grossSalary: '2000€ brut/mois', workplace: 'Pau' };

      const base = await buildContractPdf({ type: 'cdi', school: fakeSchool, applicant: fakeApplicant, listing: fakeListing, terms });
      ok(base.subarray(0, 4).toString() === '%PDF', 'pdf : sans signatures, PDF valide (compat)');

      const signed = await buildContractPdf({
        type: 'cdi', school: fakeSchool, applicant: fakeApplicant, listing: fakeListing, terms,
        signatures: {
          school: { imagePath: absStored(relSig), signedAt: new Date(), name: 'PDF École' },
          applicant: { imagePath: absStored(relSig), signedAt: new Date(), name: 'PDF Candidat' },
          proposedHash: 'a'.repeat(64),
        },
      });
      ok(signed.subarray(0, 4).toString() === '%PDF' && signed.length > base.length,
        'pdf : avec signatures, page supplémentaire générée');

      fs.unlinkSync(absStored(relSig));
    }
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-g.cjs`
Attendu : `❌ ÉCHEC : pdf : avec signatures...` (paramètre ignoré → même taille) — ou passe si la taille varie ; dans ce cas vérifier visuellement que l'échec vient bien de l'absence de page (le step 3 reste requis).

- [ ] **Step 3 : implémentation** — dans `src/services/contractPdf.js` :

(a) en tête, sous `const PDFDocument = require('pdfkit');` :

```js
const { formatHash } = require('../utils/hash');
```

(b) changer la signature de la fonction :

```js
function buildContractPdf({ type, school, applicant, listing, terms, signatures = null }) {
```

(c) remplacer le bloc existant commençant par `// Signatures` (de `doc.moveDown(1.2);` jusqu'à la fin du bloc `.fillColor('#000');` qui suit les deux mentions « Lu et approuvé ») par :

```js
    // Signatures : manuscrites (PDF historique, sans param `signatures`) ou
    // électroniques (page dédiée avec images, horodatages et empreinte).
    if (!signatures) {
      doc.moveDown(1.2);
      doc.font('Helvetica').fontSize(10).text('Fait à ____________________, le ____________________, en deux exemplaires originaux.');
      doc.moveDown(1.5);
      const y = doc.y;
      doc.fontSize(10).text(`${parties.a}`, 56, y);
      doc.text(`${parties.b}`, 320, y);
      doc.moveDown(0.3);
      doc.fontSize(8).fillColor('#777')
        .text('(signature précédée de « Lu et approuvé »)', 56, doc.y)
        .text('(signature précédée de « Lu et approuvé »)', 320, doc.y)
        .fillColor('#000');
    } else {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).text('Signatures électroniques', 56, 70, { width: 480, align: 'center' });

      const drawBox = (x, title, sig) => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(title, x, 130, { width: 210 });
        doc.rect(x, 160, 210, 110).strokeColor('#999').stroke();
        if (sig) {
          doc.image(sig.imagePath, x + 10, 170, { fit: [190, 70] });
          doc.font('Helvetica').fontSize(9).fillColor('#333')
            .text(sig.name, x, 278, { width: 210 })
            .text(`Signé le ${sig.signedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`, x, 290, { width: 210 })
            .fillColor('#000');
        } else {
          doc.font('Helvetica-Oblique').fontSize(9).fillColor('#999')
            .text('En attente de signature', x + 10, 205, { width: 190, align: 'center' })
            .fillColor('#000');
        }
      };
      drawBox(56, `${parties.a} — ${school.businessName}`, signatures.school);
      drawBox(326, `${parties.b} — ${applicant.applicantName}`, signatures.applicant);

      if (signatures.proposedHash) {
        doc.font('Helvetica').fontSize(8).fillColor('#777').text(
          `Empreinte SHA-256 du contrat proposé (avant contreseing) : ${formatHash(signatures.proposedHash)}`,
          56, 330, { width: 480 }
        ).fillColor('#000');
      }
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#999').text(
        'Signature électronique simple (art. 25 du règlement eIDAS) réalisée via MoniteurConnect : ' +
        'images de signature, horodatages et empreintes du document sont conservés par la plateforme.',
        56, 355, { width: 480, align: 'justify' }
      ).fillColor('#000');
    }
```

- [ ] **Step 4 : vérifier le succès**

Run : `node test/lot-g.cjs`
Attendu : 12 ✓.

- [ ] **Step 5 : commit**

```bash
git add src/services/contractPdf.js test/lot-g.cjs
git commit -m "G: page Signatures electroniques dans le PDF de contrat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : signature de l'école à l'acceptation (+ invalidation, + adaptation smoke)

**Files:**
- Modify: `src/controllers/contractController.js` (fonction `accept`)
- Modify: `views/dashboard/contract_form.twig`
- Create: `public/js/signature-pad.js`
- Modify: `public/css/style.css`
- Modify: `test/smoke.cjs`
- Modify: `test/lot-g.cjs`

**Interfaces:**
- Consumes: `decodeSignature`/`saveSignature` (Task 2), `sha256Hex` (Task 2), `buildContractPdf(signatures)` (Task 3).
- Produces: à l'acceptation, `Contract.schoolSignaturePath/schoolSignedAt/proposedPdfHash` renseignés, PDF proposé signé école ; ré-édition = invalidation des champs candidat/signés + suppression des anciens fichiers ; champ de formulaire `signatureData` requis.

- [ ] **Step 1 : test qui échoue** — dans `test/lot-g.cjs`, insérer avant le `console.log` final :

```js
    // --- 4. signature école à l'acceptation ---
    const { sha256Hex } = require('../src/utils/hash');
    const jarE = makeJar();
    let r = await req(jarE, 'GET', '/connexion');
    r = await req(jarE, 'POST', '/connexion', form({ _csrf: csrfFrom(r.text), email: school.email, password: 'motdepasse123' }));
    ok(r.status === 302, 'école : connexion OK');
    const apBase = `/mes-annonces/${listing.id}/candidatures/${application.id}`;

    r = await req(jarE, 'GET', `${apBase}/accepter`);
    const csrfE = csrfFrom(r.text);
    ok(r.text.includes('data-signature-pad') && r.text.includes('/js/signature-pad.js'),
      'école : pad de signature présent sur le formulaire de contrat');

    const termsForm = {
      _csrf: csrfE, type: 'cdi', startDate: '2026-08-01', grossSalary: '2200€ brut/mois',
      workplace: 'Pau', schoolAddress: '1 rue G', applicantAddress: '2 rue G',
    };
    r = await req(jarE, 'POST', `${apBase}/accepter`, form(termsForm)); // sans signature
    ok(r.status === 400 && /signature/i.test(r.text), 'école : acceptation sans signature refusée (400)');
    ok(!(await prisma.contract.findUnique({ where: { applicationId: application.id } })),
      'école : aucun contrat créé sans signature');

    r = await req(jarE, 'POST', `${apBase}/accepter`, form({ ...termsForm, signatureData: SIGNATURE_PNG }));
    ok(r.status === 302, 'école : acceptation avec signature OK');
    let contract = await prisma.contract.findUnique({ where: { applicationId: application.id } });
    ok(contract.schoolSignaturePath && fs.existsSync(absStored(contract.schoolSignaturePath))
      && contract.schoolSignedAt instanceof Date,
      'école : PNG de signature stocké + horodatage');
    ok(contract.proposedPdfHash === sha256Hex(fs.readFileSync(absStored(contract.pdfPath))),
      'école : empreinte du PDF proposé exacte (recalculée)');

    // Ré-édition : les champs candidat/signés (posés artificiellement) sont invalidés
    // et les fichiers correspondants supprimés.
    const fakeApplicantSig = 'signatures/lotg-fake-sig.png';
    const fakeSignedPdf = 'contracts/lotg-fake-signed.pdf';
    fs.writeFileSync(absStored(fakeApplicantSig), 'x');
    fs.writeFileSync(absStored(fakeSignedPdf), 'x');
    await prisma.contract.update({
      where: { id: contract.id },
      data: { applicantSignaturePath: fakeApplicantSig, applicantSignedAt: new Date(), signedPdfPath: fakeSignedPdf, signedPdfHash: 'h' },
    });
    r = await req(jarE, 'GET', `${apBase}/accepter`);
    r = await req(jarE, 'POST', `${apBase}/accepter`, form({ ...termsForm, _csrf: csrfFrom(r.text), signatureData: SIGNATURE_PNG }));
    ok(r.status === 302, 'école : ré-édition du contrat OK');
    contract = await prisma.contract.findUnique({ where: { applicationId: application.id } });
    ok(contract.applicantSignaturePath === null && contract.applicantSignedAt === null
      && contract.signedPdfPath === null && contract.signedPdfHash === null,
      'école : ré-édition -> signature candidat et PDF signé invalidés');
    ok(!fs.existsSync(absStored(fakeApplicantSig)) && !fs.existsSync(absStored(fakeSignedPdf)),
      'école : ré-édition -> anciens fichiers supprimés du disque');
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-g.cjs`
Attendu : `❌ ÉCHEC : école : pad de signature présent...`

- [ ] **Step 3 : contrôleur** — dans `src/controllers/contractController.js` :

(a) compléter les requires :

```js
const signatureImage = require('../services/signatureImage');
const { sha256Hex } = require('../utils/hash');
```

(b) remplacer intégralement la fonction `accept` par :

```js
// POST .../:appId/accepter  (valide les termes + signature école -> PDF proposé -> accepté)
async function accept(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;

    const { isValid, errors, value } = validateContract(req.body);
    // Signature de l'école obligatoire (dessinée dans le formulaire).
    const sigBuf = signatureImage.decodeSignature(req.body.signatureData);
    if (!sigBuf) errors.signatureData = 'La signature de l’auto-école est obligatoire — dessinez-la dans le cadre.';
    if (!isValid || !sigBuf) {
      return res.status(400).render('dashboard/contract_form', {
        title: 'Établir le contrat',
        application,
        listing: application.listing,
        errors,
        values: req.body,
      });
    }

    const schoolSignaturePath = await signatureImage.saveSignature(sigBuf);
    const schoolSignedAt = new Date();

    // PDF « proposé » : contrat + page de signatures avec le cadre école rempli.
    const pdf = await buildContractPdf({
      type: value.type,
      school: application.listing.school,
      applicant: application,
      listing: application.listing,
      terms: value,
      signatures: {
        school: { imagePath: resolveStored(schoolSignaturePath), signedAt: schoolSignedAt, name: application.listing.school.businessName },
        applicant: null,
        proposedHash: null,
      },
    });
    const proposedPdfHash = sha256Hex(pdf);
    const filename = `${crypto.randomBytes(16).toString('hex')}.pdf`;
    const relPath = `${SUBDIRS.contracts}/${filename}`;
    await fs.promises.writeFile(path.join(STORAGE_DIR, SUBDIRS.contracts, filename), pdf);

    // Ré-édition : l'ancien PDF, l'ancienne signature école, et tout ce qui touche au
    // contreseing candidat (signature + PDF final) sont supprimés — le candidat devra
    // re-signer la nouvelle version.
    if (application.contract) {
      const old = application.contract;
      for (const rel of [old.pdfPath, old.schoolSignaturePath, old.applicantSignaturePath, old.signedPdfPath]) {
        if (rel) {
          const abs = resolveStored(rel);
          if (abs) fs.unlink(abs, () => {});
        }
      }
    }

    await contractService.upsertForApplication(application.id, {
      ...value,
      pdfPath: relPath,
      schoolSignaturePath,
      schoolSignedAt,
      proposedPdfHash,
      applicantSignaturePath: null,
      applicantSignedAt: null,
      signedPdfPath: null,
      signedPdfHash: null,
    });
    await applicationService.updateStatus(application.id, 'accepted');
    // Best-effort : informe le candidat de l'acceptation (lien de suivi rappelé).
    await mailer.sendApplicationAccepted(application.applicantEmail, application.applicantName, application.listing.title, application.trackingToken);

    req.flash('success', 'Candidature acceptée et contrat signé côté école.');
    res.redirect(candidaturesUrl(application));
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 4 : formulaire** — dans `views/dashboard/contract_form.twig` :

(a) insérer AVANT la ligne `<button type="submit" ...>` :

```twig
      <div class="form-group">
        <label for="signature-canvas">Signature de l'auto-école</label>
        <p class="muted">Dessinez votre signature ci-dessous (souris ou doigt) — elle sera apposée sur le contrat.</p>
        <canvas id="signature-canvas" data-signature-pad width="420" height="140" class="signature-pad"></canvas>
        <div class="signature-actions">
          <button type="button" class="btn btn-small" data-signature-clear>Effacer</button>
        </div>
        <input type="hidden" name="signatureData" id="signatureData">
        <p class="field-error" data-signature-error hidden>Veuillez dessiner votre signature avant de valider.</p>
        {% if errors.signatureData %}<p class="field-error">{{ errors.signatureData }}</p>{% endif %}
      </div>
```

(b) ajouter en toute fin de fichier (après le `{% endblock %}` existant) :

```twig

{% block scripts %}
  <script src="/js/signature-pad.js" defer></script>
{% endblock %}
```

- [ ] **Step 5 : pad JS** — créer `public/js/signature-pad.js` :

```js
// Pad de signature (canvas) partagé : formulaire de contrat (école) et page de
// signature du candidat. Trace au pointeur (souris/tactile), bouton « Effacer », et
// au submit exporte le dessin en PNG dans le champ caché #signatureData. Bloque le
// submit si le pad est vierge (message [data-signature-error]).
(function () {
  var canvas = document.querySelector('canvas[data-signature-pad]');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var field = document.getElementById('signatureData');
  var clearBtn = document.querySelector('[data-signature-clear]');
  var errorEl = document.querySelector('[data-signature-error]');
  var form = canvas.closest('form');
  var drawing = false;
  var dirty = false;

  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1f2937';

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('pointerdown', function (e) {
    drawing = true;
    dirty = true;
    canvas.setPointerCapture(e.pointerId);
    var p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    e.preventDefault();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { drawing = false; });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty = false;
      if (field) field.value = '';
    });
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      if (!dirty) {
        if (errorEl) errorEl.hidden = false;
        e.preventDefault();
        return;
      }
      if (errorEl) errorEl.hidden = true;
      if (field) field.value = canvas.toDataURL('image/png');
    });
  }
})();
```

- [ ] **Step 6 : styles** — ajouter en fin de `public/css/style.css` :

```css
/* ---------- Lot G : signature électronique ---------- */
.signature-pad {
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  background: #fff;
  touch-action: none;
  max-width: 100%;
  display: block;
}
.signature-actions { margin-top: 0.25rem; }
```

- [ ] **Step 7 : adapter le smoke test** — dans `test/smoke.cjs` :

(a) sous la ligne `const MINIMAL_PDF = ...` (ou à proximité des fixtures existantes), ajouter :

```js
// Signature de pad (Lot G) : vrai PNG 1×1 en data URL, requis pour accepter un contrat.
const SIGNATURE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
```

(b) dans l'acceptation VALIDE (le `form({...})` qui contient `startDate: '2026-07-01'`), ajouter la paire :

```js
      signatureData: SIGNATURE_PNG,
```

(Le POST d'acceptation invalide — sans date — reste sans signature : il vérifie
toujours le 400, dont le message de date.)

- [ ] **Step 8 : vérifier le succès**

Run : `node test/lot-g.cjs`
Attendu : 22 ✓.
Run : `node test/smoke.cjs`
Attendu : 65 ✓ (inchangé).

- [ ] **Step 9 : commit**

```bash
git add src/controllers/contractController.js views/dashboard/contract_form.twig public/js/signature-pad.js public/css/style.css test/smoke.cjs test/lot-g.cjs
git commit -m "G: signature de l'ecole a l'acceptation (pad, PDF propose, invalidation)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 : invitation à signer (mailer + envoi + états côté école)

**Files:**
- Modify: `src/services/mailer.js`
- Modify: `src/controllers/contractController.js` (fonction `sendContract`)
- Modify: `views/dashboard/applications.twig`
- Modify: `test/lot-g.cjs`

**Interfaces:**
- Produces: `mailer.sendSignatureInvitation(applicantEmail, applicantName, listingTitle, token)` ; `mailer.sendSignedContract(to, name, listingTitle, pdfPath)` ; `mailer.sendContractToApplicant` SUPPRIMÉ. Vue candidatures : bouton « Envoyer pour signature », mention « en attente de signature », branche « contrat signé » (lien `contrat/telecharger-signe`, route en Task 6).

- [ ] **Step 1 : test qui échoue** — dans `test/lot-g.cjs`, insérer avant le `console.log` final :

```js
    // --- 5. invitation à signer ---
    r = await req(jarE, 'GET', `${apBase}/accepter`);
    r = await req(jarE, 'POST', `${apBase}/contrat/envoyer`, form({ _csrf: csrfFrom(r.text) }));
    ok(r.status === 302, 'invitation : envoi -> redirection');
    const invit = mailCalls.find((c) => c[0] === 'invitation');
    ok(invit && invit[1] === application.applicantEmail && invit[4] === application.trackingToken,
      'invitation : email au candidat avec le jeton de suivi');
    contract = await prisma.contract.findUnique({ where: { applicationId: application.id } });
    ok(contract.sentToApplicantAt instanceof Date, 'invitation : date d’envoi enregistrée');
    r = await req(jarE, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(r.text.includes('Envoyer pour signature') && /en attente de signature/i.test(r.text),
      'invitation : états visibles côté école');
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-g.cjs`
Attendu : `❌ ÉCHEC : invitation : email au candidat...` (l'espion `sendSignatureInvitation` n'est jamais appelé)

- [ ] **Step 3 : mailer** — dans `src/services/mailer.js` :

(a) remplacer intégralement la fonction `sendContractToApplicant` par :

```js
// Invite le candidat à lire et signer son contrat en ligne (page de suivi).
function sendSignatureInvitation(applicantEmail, applicantName, listingTitle, token) {
  const link = `${APP_URL}/suivi/${token}`;
  return send(
    applicantEmail,
    `Votre contrat est prêt à signer — ${listingTitle}`,
    `<p>Bonjour ${esc(applicantName)},</p>
     <p>L'auto-école a établi et signé votre contrat pour « ${esc(listingTitle)} ».
     Lisez-le puis signez-le en ligne depuis votre page de suivi :</p>
     <p><a href="${link}">Lire et signer mon contrat</a></p>`,
    { link }
  );
}

// Envoie le contrat signé par les deux parties (PDF final) à un destinataire.
function sendSignedContract(to, name, listingTitle, pdfPath) {
  return send(
    to,
    `Contrat signé — ${listingTitle}`,
    `<p>Bonjour ${esc(name)},</p>
     <p>Le contrat lié à « ${esc(listingTitle)} » a été signé par les deux parties.
     Vous trouverez le document final en pièce jointe — conservez-le précieusement.</p>`,
    { attachments: [{ filename: 'contrat-signe.pdf', path: pdfPath, contentType: 'application/pdf' }] }
  );
}
```

(b) dans `module.exports`, remplacer `sendContractToApplicant,` par :

```js
  sendSignatureInvitation,
  sendSignedContract,
```

- [ ] **Step 4 : contrôleur** — dans `src/controllers/contractController.js`, remplacer intégralement la fonction `sendContract` par :

```js
// POST .../:appId/contrat/envoyer  (invitation à signer en ligne — plus de PDF joint :
// le candidat lit et signe depuis sa page de suivi, le PDF final signé partira ensuite)
async function sendContract(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;
    if (!application.contract) return notFound(res);

    const ok = await mailer.sendSignatureInvitation(
      application.applicantEmail,
      application.applicantName,
      application.listing.title,
      application.trackingToken
    );

    if (ok) {
      await contractService.markSent(application.contract.id);
      req.flash('success', 'Invitation à signer envoyée au candidat.');
    } else {
      req.flash('error', "L'envoi de l'invitation a échoué. Réessayez plus tard.");
    }
    res.redirect(candidaturesUrl(application));
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 5 : vue candidatures** — dans `views/dashboard/applications.twig`, remplacer le bloc `{% if a.status == 'accepted' and a.contract %} ... {% endif %}` (celui qui contient « Télécharger le contrat ») par :

```twig
          {% if a.status == 'accepted' and a.contract %}
            <div class="application-actions section">
              {% if a.contract.applicantSignedAt %}
                <span class="badge badge-available">✍️ Contrat signé le {{ a.contract.applicantSignedAt|date('d/m/Y à H:i') }}</span>
                <a href="{{ base }}/contrat/telecharger-signe" class="btn btn-small btn-primary">Télécharger le contrat signé</a>
              {% else %}
                <a href="{{ base }}/contrat/telecharger" class="btn btn-small btn-primary">Télécharger le contrat</a>
                <a href="{{ base }}/accepter" class="btn btn-small">Modifier le contrat</a>
                <form action="{{ base }}/contrat/envoyer" method="post" class="inline-form">
                  <input type="hidden" name="_csrf" value="{{ csrfToken }}">
                  <button type="submit" class="btn btn-small">Envoyer pour signature</button>
                </form>
                {% if a.contract.sentToApplicantAt %}
                  <span class="muted">Invitation envoyée le {{ a.contract.sentToApplicantAt|date('d/m/Y à H:i') }} — en attente de signature du candidat</span>
                {% endif %}
              {% endif %}
            </div>
          {% endif %}
```

- [ ] **Step 6 : vérifier le succès**

Run : `node test/lot-g.cjs`
Attendu : 26 ✓.

- [ ] **Step 7 : commit**

```bash
git add src/services/mailer.js src/controllers/contractController.js views/dashboard/applications.twig test/lot-g.cjs
git commit -m "G: invitation a signer en ligne (remplace l'envoi du PDF non signe)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6 : contreseing du candidat (lecture PDF, page de signature, PDF final)

**Files:**
- Create: `src/controllers/signatureController.js`
- Create: `views/tracking/sign.twig`
- Modify: `src/routes/trackingRoutes.js`, `src/routes/manageRoutes.js`
- Modify: `src/services/contractService.js`
- Modify: `src/controllers/contractController.js` (nouvelle fonction `downloadSignedContract`)
- Modify: `views/tracking/show.twig`
- Modify: `test/lot-g.cjs`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: `GET /suivi/:token/contrat` (PDF proposé, final si signé) ; `GET|POST /suivi/:token/signer` ; `contractService.signByApplicant(id, data)` ; `GET /mes-annonces/:id/candidatures/:appId/contrat/telecharger-signe` (école).

- [ ] **Step 1 : test qui échoue** — dans `test/lot-g.cjs`, insérer avant le `console.log` final :

```js
    // --- 6. contreseing du candidat ---
    const pub = makeJar();
    const suivi = `/suivi/${application.trackingToken}`;
    r = await req(pub, 'GET', `${suivi}/contrat`);
    ok(r.status === 200 && r.text.startsWith('%PDF'), 'candidat : lecture du PDF proposé via le jeton');
    r = await req(makeJar(), 'GET', `/suivi/${'0'.repeat(64)}/contrat`);
    ok(r.status === 404, 'candidat : mauvais jeton -> 404');

    r = await req(pub, 'GET', suivi);
    ok(r.text.includes(`${suivi}/signer`) && /signer le contrat/i.test(r.text),
      'candidat : bloc « à signer » sur la page de suivi');
    r = await req(pub, 'GET', `${suivi}/signer`);
    const csrfP = csrfFrom(r.text);
    ok(r.status === 200 && r.text.includes('data-signature-pad') && /J'ai lu et j'accepte/i.test(r.text),
      'candidat : page de signature (pad + case d’acceptation)');

    r = await req(pub, 'POST', `${suivi}/signer`, form({ _csrf: csrfP, signatureData: SIGNATURE_PNG }));
    ok(r.status === 400, 'candidat : case « j’ai lu et j’accepte » obligatoire');
    r = await req(pub, 'POST', `${suivi}/signer`, form({ _csrf: csrfP, accept: '1', signatureData: 'data:image/png;base64,@@' }));
    ok(r.status === 400, 'candidat : signature invalide refusée');

    r = await req(pub, 'POST', `${suivi}/signer`, form({ _csrf: csrfP, accept: '1', signatureData: SIGNATURE_PNG }));
    ok(r.status === 302 && r.location === suivi, 'candidat : signature acceptée -> retour suivi');
    contract = await prisma.contract.findUnique({ where: { applicationId: application.id } });
    ok(contract.applicantSignedAt instanceof Date && contract.applicantSignaturePath
      && fs.existsSync(absStored(contract.applicantSignaturePath)),
      'candidat : signature stockée + horodatage');
    ok(contract.signedPdfPath && fs.existsSync(absStored(contract.signedPdfPath))
      && contract.signedPdfHash === sha256Hex(fs.readFileSync(absStored(contract.signedPdfPath))),
      'candidat : PDF final généré, empreinte exacte');
    const signedMails = mailCalls.filter((c) => c[0] === 'signed').map((c) => c[1]);
    ok(signedMails.includes(application.applicantEmail) && signedMails.includes(school.email),
      'candidat : PDF signé envoyé aux DEUX parties');

    r = await req(pub, 'GET', suivi);
    ok(/Contrat signé/.test(r.text) && r.text.includes(`${suivi}/contrat`),
      'candidat : suivi affiche « signé » + téléchargement');
    r = await req(pub, 'GET', `${suivi}/contrat`);
    ok(r.status === 200 && r.text.startsWith('%PDF'), 'candidat : télécharge le PDF final');
    r = await req(pub, 'GET', `${suivi}/signer`);
    ok(r.status === 302, 'candidat : page de signature refusée une fois signé (redirection)');

    r = await req(jarE, 'GET', `${apBase}/contrat/telecharger-signe`);
    ok(r.status === 200 && r.text.startsWith('%PDF'), 'école : télécharge le PDF signé');
    r = await req(jarE, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    ok(/Contrat signé/.test(r.text), 'école : badge « contrat signé » sur la liste');
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-g.cjs`
Attendu : `❌ ÉCHEC : candidat : lecture du PDF proposé...` (route inexistante → 404)

- [ ] **Step 3 : service** — dans `src/services/contractService.js`, ajouter avant `module.exports` :

```js
// Contreseing du candidat : fige la signature, le PDF final et son empreinte.
function signByApplicant(id, data) {
  return prisma.contract.update({ where: { id }, data });
}
```

et l'ajouter à `module.exports`.

- [ ] **Step 4 : contrôleur candidat** — créer `src/controllers/signatureController.js` :

```js
// Contreseing du contrat par le candidat, authentifié par son jeton de suivi (aucun
// compte). Lecture du PDF, page de signature, puis génération du PDF final (deux
// signatures + horodatages + empreinte) envoyé aux deux parties.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const applicationService = require('../services/applicationService');
const contractService = require('../services/contractService');
const signatureImage = require('../services/signatureImage');
const { buildContractPdf } = require('../services/contractPdf');
const { sha256Hex, formatHash } = require('../utils/hash');
const mailer = require('../services/mailer');
const { STORAGE_DIR, SUBDIRS, resolveStored } = require('../config/storage');
const { notFound } = require('../utils/http');

// Candidature dont le contrat a été transmis pour signature, ou null (404 chez l'appelant).
async function loadSignable(req) {
  const application = await applicationService.findByTrackingToken(req.params.token);
  if (!application || !application.contract || !application.contract.sentToApplicantAt) return null;
  return application;
}

// GET /suivi/:token/contrat — PDF final si signé, sinon PDF proposé.
async function downloadContract(req, res, next) {
  try {
    const application = await loadSignable(req);
    if (!application) return notFound(res);
    const signed = Boolean(application.contract.signedPdfPath);
    const abs = resolveStored(signed ? application.contract.signedPdfPath : application.contract.pdfPath);
    if (!abs || !fs.existsSync(abs)) return notFound(res);
    return res.download(abs, signed ? 'contrat-signe.pdf' : 'contrat.pdf');
  } catch (err) {
    next(err);
  }
}

// GET /suivi/:token/signer — page de signature (contrat transmis, pas encore signé).
async function showSign(req, res, next) {
  try {
    const application = await loadSignable(req);
    if (!application) return notFound(res);
    if (application.contract.applicantSignedAt) {
      req.flash('success', 'Ce contrat est déjà signé.');
      return res.redirect(`/suivi/${req.params.token}`);
    }
    res.render('tracking/sign', {
      title: 'Signer le contrat',
      application,
      contract: application.contract,
      proposedHash: formatHash(application.contract.proposedPdfHash),
      errors: {},
    });
  } catch (err) {
    next(err);
  }
}

// POST /suivi/:token/signer
async function sign(req, res, next) {
  try {
    const application = await loadSignable(req);
    if (!application) return notFound(res);
    const contract = application.contract;
    if (contract.applicantSignedAt) {
      req.flash('error', 'Ce contrat est déjà signé.');
      return res.redirect(`/suivi/${req.params.token}`);
    }

    const errors = {};
    if (req.body.accept !== '1') errors.accept = 'Vous devez déclarer avoir lu et accepté le contrat.';
    const sigBuf = signatureImage.decodeSignature(req.body.signatureData);
    if (!sigBuf) errors.signatureData = 'La signature est obligatoire — dessinez-la dans le cadre.';
    if (Object.keys(errors).length > 0) {
      return res.status(400).render('tracking/sign', {
        title: 'Signer le contrat',
        application,
        contract,
        proposedHash: formatHash(contract.proposedPdfHash),
        errors,
      });
    }

    const applicantSignaturePath = await signatureImage.saveSignature(sigBuf);
    const applicantSignedAt = new Date();

    // PDF final : contrat + page de signatures complète + empreinte du PDF proposé.
    const school = application.listing.school;
    const pdf = await buildContractPdf({
      type: contract.type,
      school,
      applicant: application,
      listing: application.listing,
      terms: contract,
      signatures: {
        school: contract.schoolSignaturePath
          ? { imagePath: resolveStored(contract.schoolSignaturePath), signedAt: contract.schoolSignedAt, name: school.businessName }
          : null,
        applicant: { imagePath: resolveStored(applicantSignaturePath), signedAt: applicantSignedAt, name: application.applicantName },
        proposedHash: contract.proposedPdfHash,
      },
    });
    const filename = `${crypto.randomBytes(16).toString('hex')}.pdf`;
    const abs = path.join(STORAGE_DIR, SUBDIRS.contracts, filename);
    await fs.promises.writeFile(abs, pdf);

    await contractService.signByApplicant(contract.id, {
      applicantSignaturePath,
      applicantSignedAt,
      signedPdfPath: `${SUBDIRS.contracts}/${filename}`,
      signedPdfHash: sha256Hex(pdf),
    });

    // Best-effort : le PDF final part aux deux parties ; un échec d'email n'annule
    // pas la signature (le document reste téléchargeable des deux côtés).
    await Promise.all([
      mailer.sendSignedContract(application.applicantEmail, application.applicantName, application.listing.title, abs),
      mailer.sendSignedContract(school.email, school.businessName, application.listing.title, abs),
    ]);

    req.flash('success', 'Contrat signé. Le document final vous a été envoyé par email.');
    res.redirect(`/suivi/${req.params.token}`);
  } catch (err) {
    next(err);
  }
}

module.exports = { downloadContract, showSign, sign };
```

- [ ] **Step 5 : routes** :

(a) remplacer intégralement `src/routes/trackingRoutes.js` par :

```js
// Routes publiques de suivi de candidature (montées sous /suivi) : page de suivi,
// lecture du contrat et signature en ligne — le jeton opaque fait office d'auth.
const express = require('express');
const rateLimit = require('express-rate-limit');
const trackingController = require('../controllers/trackingController');
const signatureController = require('../controllers/signatureController');

const router = express.Router();

// Anti-abus sur la signature (écriture disque + génération PDF).
const signLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Trop de tentatives. Veuillez réessayer plus tard.');
    res.status(429).redirect(`/suivi/${req.params.token}`);
  },
});

router.get('/:token', trackingController.show);
router.get('/:token/contrat', signatureController.downloadContract);
router.get('/:token/signer', signatureController.showSign);
router.post('/:token/signer', signLimiter, signatureController.sign);

module.exports = router;
```

(b) dans `src/routes/manageRoutes.js`, ajouter après la ligne `router.get('/:id/candidatures/:appId/contrat/telecharger', ...)` :

```js
router.get('/:id/candidatures/:appId/contrat/telecharger-signe', contractController.downloadSignedContract);
```

- [ ] **Step 6 : téléchargement signé côté école** — dans `src/controllers/contractController.js`, ajouter après la fonction `downloadContract` :

```js
// GET .../:appId/contrat/telecharger-signe  (PDF final signé, école)
async function downloadSignedContract(req, res, next) {
  try {
    const application = await loadOwnedApplication(req, res);
    if (!application) return;
    if (!application.contract || !application.contract.signedPdfPath) return notFound(res);
    const abs = resolveStored(application.contract.signedPdfPath);
    if (!abs || !fs.existsSync(abs)) return notFound(res);
    return res.download(abs, `contrat-signe-${application.id}.pdf`);
  } catch (err) {
    next(err);
  }
}
```

et l'ajouter à `module.exports`.

- [ ] **Step 7 : vues** :

(a) dans `views/tracking/show.twig`, remplacer le bloc `{% if application.status == 'accepted' %} ... {% endif %}` (celui qui parle du contrat transmis par email) par :

```twig
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
```

(b) créer `views/tracking/sign.twig` :

```twig
{% extends 'layouts/base.twig' %}

{% block content %}
  <section class="form-card">
    <h1>Signer votre contrat</h1>
    <p class="muted">
      Annonce : <strong>{{ application.listing.title }}</strong>
      — {{ application.listing.school.businessName }}
    </p>
    <p>
      Type de contrat : <strong>{{ contract.type }}</strong> ·
      Rémunération : <strong>{{ contract.grossSalary }}</strong> ·
      Lieu : <strong>{{ contract.workplace }}</strong>
    </p>
    <p>
      <a class="btn" href="/suivi/{{ application.trackingToken }}/contrat">Lire le contrat complet (PDF)</a>
    </p>
    <p class="fine-print">Empreinte SHA-256 du document que vous signez : {{ proposedHash }}</p>

    <form action="/suivi/{{ application.trackingToken }}/signer" method="post" novalidate>
      <input type="hidden" name="_csrf" value="{{ csrfToken }}">

      <div class="form-group">
        <label>
          <input type="checkbox" name="accept" value="1">
          J'ai lu et j'accepte le contrat proposé.
        </label>
        {% if errors.accept %}<p class="field-error">{{ errors.accept }}</p>{% endif %}
      </div>

      <div class="form-group">
        <label for="signature-canvas">Votre signature</label>
        <p class="muted">Dessinez votre signature ci-dessous (souris ou doigt).</p>
        <canvas id="signature-canvas" data-signature-pad width="420" height="140" class="signature-pad"></canvas>
        <div class="signature-actions">
          <button type="button" class="btn btn-small" data-signature-clear>Effacer</button>
        </div>
        <input type="hidden" name="signatureData" id="signatureData">
        <p class="field-error" data-signature-error hidden>Veuillez dessiner votre signature avant de valider.</p>
        {% if errors.signatureData %}<p class="field-error">{{ errors.signatureData }}</p>{% endif %}
      </div>

      <button type="submit" class="btn btn-primary">Signer le contrat</button>
    </form>

    <p class="form-footer"><a href="/suivi/{{ application.trackingToken }}">Retour au suivi</a></p>
  </section>
{% endblock %}

{% block scripts %}
  <script src="/js/signature-pad.js" defer></script>
{% endblock %}
```

- [ ] **Step 8 : vérifier le succès**

Run : `node test/lot-g.cjs`
Attendu : 41 ✓.

- [ ] **Step 9 : commit**

```bash
git add src/controllers/signatureController.js src/controllers/contractController.js src/services/contractService.js src/routes/trackingRoutes.js src/routes/manageRoutes.js views/tracking/show.twig views/tracking/sign.twig views/dashboard/applications.twig test/lot-g.cjs
git commit -m "G: contreseing du candidat (lecture, signature en ligne, PDF final aux deux parties)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7 : nettoyage disque (refus / suppressions) + intégration `npm test`

**Files:**
- Modify: `src/controllers/contractController.js` (fonction `reject`)
- Modify: `src/services/listingService.js` (les deux collecteurs de chemins)
- Modify: `package.json`, `AGENTS.md`
- Modify: `test/lot-g.cjs`

- [ ] **Step 1 : test qui échoue** — dans `test/lot-g.cjs`, insérer avant le `console.log` final :

```js
    // --- 7. nettoyage disque ---
    // Refus d'une candidature signée : contrat + signatures + PDF final supprimés.
    const relsAvantRefus = [contract.pdfPath, contract.schoolSignaturePath, contract.applicantSignaturePath, contract.signedPdfPath];
    ok(relsAvantRefus.every((rel) => rel && fs.existsSync(absStored(rel))), 'nettoyage : fichiers présents avant refus');
    r = await req(jarE, 'GET', `/mes-annonces/${listing.id}/candidatures`);
    r = await req(jarE, 'POST', `${apBase}/refuser`, form({ _csrf: csrfFrom(r.text) }));
    ok(r.status === 302, 'nettoyage : refus -> redirection');
    ok(relsAvantRefus.every((rel) => !fs.existsSync(absStored(rel))), 'nettoyage : refus -> tous les fichiers du contrat supprimés');
    ok(!(await prisma.contract.findUnique({ where: { applicationId: application.id } })), 'nettoyage : contrat supprimé en base');

    // Suppression d'annonce : les chemins de signature sont collectés aussi.
    const listingService = require('../src/services/listingService');
    const app2 = await prisma.application.create({
      data: { listingId: listing.id, applicantName: 'G2', applicantEmail: `g2.${STAMP}@example.test`, message: 'm' },
    });
    const relSig2 = 'signatures/lotg-collect.png';
    fs.writeFileSync(absStored(relSig2), 'x');
    await prisma.contract.create({
      data: {
        applicationId: app2.id, type: 'cdi', startDate: new Date(), grossSalary: 'x', workplace: 'x',
        pdfPath: 'contracts/lotg-collect.pdf', schoolSignaturePath: relSig2, signedPdfPath: 'contracts/lotg-collect-signe.pdf',
      },
    });
    const collected = await listingService.findFilePathsForListing(school.id, listing.id);
    ok(collected.includes(relSig2) && collected.includes('contracts/lotg-collect-signe.pdf'),
      'nettoyage : chemins de signatures et PDF signé collectés pour la suppression');
    fs.unlinkSync(absStored(relSig2));
```

- [ ] **Step 2 : vérifier l'échec**

Run : `node test/lot-g.cjs`
Attendu : `❌ ÉCHEC : nettoyage : refus -> tous les fichiers...` (les nouveaux chemins ne sont pas supprimés)

- [ ] **Step 3 : refus** — dans `src/controllers/contractController.js`, fonction `reject`, remplacer :

```js
    if (application.contract) {
      const abs = resolveStored(application.contract.pdfPath);
      if (abs) fs.unlink(abs, () => {});
      await contractService.deleteForApplication(application.id);
    }
```

par :

```js
    if (application.contract) {
      const c = application.contract;
      // Contrat + signatures + PDF signé : plus rien ne doit rester téléchargeable
      // ni sur disque pour un candidat refusé.
      for (const rel of [c.pdfPath, c.schoolSignaturePath, c.applicantSignaturePath, c.signedPdfPath]) {
        if (rel) {
          const abs = resolveStored(rel);
          if (abs) fs.unlink(abs, () => {});
        }
      }
      await contractService.deleteForApplication(application.id);
    }
```

- [ ] **Step 4 : collecteurs** — dans `src/services/listingService.js`, dans `findFilePathsForListing` ET `findAnyFilePathsForListing`, remplacer la ligne :

```js
    if (a.contract) paths.push(a.contract.pdfPath);
```

par :

```js
    if (a.contract) paths.push(a.contract.pdfPath, a.contract.schoolSignaturePath, a.contract.applicantSignaturePath, a.contract.signedPdfPath);
```

(les deux occurrences — le `filter(Boolean)` existant élimine les null).

- [ ] **Step 5 : intégration** :

(a) dans `package.json`, ajouter ` && node test/lot-g.cjs` à la fin du script `"test"`.

(b) dans `AGENTS.md` : section « État », remplacer le bloc « Prochain travail : Lot G … » par :

```markdown
- **Lot G (signature électronique du contrat) : LIVRÉ** — pad canvas école + candidat,
  PDF final avec page de signatures (horodatages + empreintes SHA-256), invitation par
  email, invalidation à la ré-édition. Tests : `test/lot-g.cjs`.
- **Prochain travail : Lot H (dashboard statistiques)** — spec et plan à écrire.
```

et dans « Pièges connus », ajouter :

```markdown
- **Signatures** (Lot G) : PNG de pad validés par `src/services/signatureImage.js`
  (data URL, magic bytes, 200 Ko max), stockés sous `storage/signatures/` ; toute
  suppression de contrat doit nettoyer `pdfPath`, `schoolSignaturePath`,
  `applicantSignaturePath` ET `signedPdfPath`.
```

- [ ] **Step 6 : vérifier le succès**

Run : `node test/lot-g.cjs`
Attendu : 46 ✓, `✅ Lot G tests réussis — 46 assertions.`
Run : `npm test`
Attendu : les 8 fichiers verts (65 + 9 + 25 + 15 + 21 + 33 + 21 + 46).

- [ ] **Step 7 : commit**

```bash
git add src/controllers/contractController.js src/services/listingService.js package.json AGENTS.md test/lot-g.cjs
git commit -m "G: nettoyage disque des signatures + lot-g.cjs dans npm test

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
