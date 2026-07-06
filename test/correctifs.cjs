/**
 * Tests des correctifs de la revue de code :
 *   1. CSRF multipart : jeton en champ de formulaire (vérifié après multer), plus
 *      jamais en query string ; fichiers téléversés supprimés si le jeton est invalide.
 *   2. Vérification d'email idempotente : re-cliquer le lien reste un succès
 *      (scanners d'emails qui pré-visitent les liens).
 *   3. Inscription : une course sur l'unicité (P2002) rend un 400 propre, pas un 500.
 *   4. Admin : 404 uniquement pour un enregistrement introuvable (P2025) ; toute
 *      autre erreur suit le circuit d'erreur normal (500).
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'correctifs-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const adminService = require('../src/services/adminService');
const schoolService = require('../src/services/schoolService');
const listingService = require('../src/services/listingService');
const tokens = require('../src/services/tokens');
const passwordUtil = require('../src/utils/password');
const { STORAGE_DIR } = require('../src/config/storage');

const PORT = 4059;
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

// Corps multipart d'une candidature complète (4 pièces PDF factices).
function pdfBlob() { return new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }); }
function applyForm(csrfToken) {
  const fd = new FormData();
  if (csrfToken != null) fd.append('_csrf', csrfToken);
  fd.append('applicantName', 'Candidat Test');
  fd.append('applicantEmail', `cand.${STAMP}@example.test`);
  fd.append('message', 'Bonjour, je postule.');
  fd.append('cv', pdfBlob(), 'cv.pdf');
  fd.append('idCard', pdfBlob(), 'id.pdf');
  fd.append('license', pdfBlob(), 'permis.pdf');
  fd.append('teachingCard', pdfBlob(), 'carte.pdf');
  return fd;
}
function listDir(sub) {
  return new Set(fs.readdirSync(path.join(STORAGE_DIR, sub)));
}

const createdSchoolIds = [];
const createdAdminIds = [];

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));
  try {
    // ------------------------------ Données de base ------------------------------
    const school = await prisma.school.create({
      data: {
        email: `fix.school.${STAMP}@example.test`, passwordHash: 'x',
        businessName: 'Fix School', siret: `9${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(school.id);
    const listing = await prisma.listing.create({
      data: {
        title: `FixAnnonce ${STAMP}`, description: 'test', city: 'Pau', department: '64',
        schoolId: school.id, titleLower: `fixannonce ${STAMP}`, descriptionLower: 'test', cityLower: 'pau',
      },
    });

    // ------------------- 1. CSRF multipart en champ de formulaire -------------------
    const anon = makeJar();
    let r = await req(anon, 'GET', `/annonces/${listing.id}`);
    const anonToken = csrfFrom(r.text);

    r = await req(anon, 'POST', `/annonces/${listing.id}/postuler`, { body: applyForm(anonToken) });
    ok(r.status === 302 && r.location === `/annonces/${listing.id}`,
      'CSRF : jeton en champ multipart accepté (candidature déposée)');
    ok((await prisma.application.count({ where: { listingId: listing.id } })) === 1,
      'CSRF : la candidature est bien enregistrée');

    // Jeton invalide -> 403, aucune candidature, aucun fichier orphelin sur disque.
    const cvBefore = listDir('cv');
    r = await req(anon, 'POST', `/annonces/${listing.id}/postuler`, { body: applyForm('mauvais-jeton') });
    ok(r.status === 403, 'CSRF : jeton multipart invalide -> 403');
    ok((await prisma.application.count({ where: { listingId: listing.id } })) === 1,
      'CSRF : aucune candidature créée avec un jeton invalide');
    const cvAfter = listDir('cv');
    ok([...cvAfter].every((f) => cvBefore.has(f)),
      'CSRF : fichiers téléversés supprimés quand le jeton est invalide');

    // Le jeton en query string n'est plus accepté nulle part.
    const qJar = makeJar();
    r = await req(qJar, 'GET', '/connexion');
    const qToken = csrfFrom(r.text);
    r = await req(qJar, 'POST', `/connexion?_csrf=${qToken}`, form({ email: '', password: '' }));
    ok(r.status === 403, 'CSRF : jeton en query string refusé (403)');

    // ---------------- 2. Vérification d'email idempotente (re-clic) ----------------
    const { raw, hash } = tokens.generateToken();
    const school2 = await prisma.school.create({
      data: {
        email: `fix.verify.${STAMP}@example.test`, passwordHash: 'x',
        businessName: 'Fix Verify', siret: `6${String(STAMP).slice(-13).padStart(13, '0')}`,
        verifyTokenHash: hash, verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    createdSchoolIds.push(school2.id);

    r = await req(makeJar(), 'GET', `/verifier-email/${raw}`);
    ok(r.status === 200 && /Adresse confirmée/.test(r.text), 'Email : premier clic -> succès');
    ok((await prisma.school.findUnique({ where: { id: school2.id } })).emailVerified === true,
      'Email : le compte est marqué vérifié');
    r = await req(makeJar(), 'GET', `/verifier-email/${raw}`);
    ok(r.status === 200 && /Adresse confirmée/.test(r.text),
      'Email : re-clic sur le lien -> toujours un succès (idempotent)');

    // ----------------- 3. Course à l'inscription (P2002) -> 400 propre -----------------
    // Simule la fenêtre de course : les pré-vérifications d'unicité ne voient rien,
    // mais la contrainte @unique en base refuse la création (P2002).
    const origFindByEmail = schoolService.findByEmail;
    const origFindBySiret = schoolService.findBySiret;
    try {
      schoolService.findByEmail = async () => null;
      schoolService.findBySiret = async () => null;
      const raceJar = makeJar();
      r = await req(raceJar, 'GET', '/inscription');
      const raceToken = csrfFrom(r.text);
      r = await req(raceJar, 'POST', '/inscription', form({
        _csrf: raceToken, businessName: 'Race', email: school.email,
        siret: `5${String(STAMP).slice(-13).padStart(13, '0')}`,
        password: 'motdepasse123', passwordConfirm: 'motdepasse123',
      }));
      ok(r.status === 400 && /existe déjà/.test(r.text),
        'Inscription : doublon en course (P2002) -> 400 avec message, pas 500');
    } finally {
      schoolService.findByEmail = origFindByEmail;
      schoolService.findBySiret = origFindBySiret;
    }

    // ------------- 4. Admin : 404 réservé à P2025, vraies erreurs -> 500 -------------
    const adminEmail = `fix.admin.${STAMP}@example.test`;
    const admin = await adminService.create({ email: adminEmail, passwordHash: await passwordUtil.hash('adminpass123') });
    createdAdminIds.push(admin.id);
    const adminJar = makeJar();
    r = await req(adminJar, 'GET', '/admin/connexion');
    r = await req(adminJar, 'POST', '/admin/connexion', form({ _csrf: csrfFrom(r.text), email: adminEmail, password: 'adminpass123' }));
    ok(r.status === 302 && r.location === '/admin', 'Admin : connexion OK');

    async function adminCsrf() {
      const rr = await req(adminJar, 'GET', '/admin/ecoles');
      return csrfFrom(rr.text);
    }

    // Cible inexistante : toujours 404 (régression).
    r = await req(adminJar, 'POST', '/admin/ecoles/999999/suspendre', form({ _csrf: await adminCsrf() }));
    ok(r.status === 404, 'Admin : suspension d’une école inexistante -> 404');
    r = await req(adminJar, 'POST', '/admin/annonces/999999/supprimer', form({ _csrf: await adminCsrf() }));
    ok(r.status === 404, 'Admin : retrait d’une annonce inexistante -> 404');

    // Erreur non-P2025 (ex. base indisponible) : ne doit PLUS être maquillée en 404.
    const origSetSuspended = schoolService.setSuspended;
    try {
      schoolService.setSuspended = async () => { throw new Error('ERREUR-SIMULEE'); };
      r = await req(adminJar, 'POST', `/admin/ecoles/${school.id}/suspendre`, form({ _csrf: await adminCsrf() }));
      ok(r.status === 500, 'Admin : erreur interne à la suspension -> 500 (pas 404)');
    } finally {
      schoolService.setSuspended = origSetSuspended;
    }
    const origDeleteAny = listingService.deleteAny;
    try {
      listingService.deleteAny = async () => { throw new Error('ERREUR-SIMULEE'); };
      r = await req(adminJar, 'POST', `/admin/annonces/${listing.id}/supprimer`, form({ _csrf: await adminCsrf() }));
      ok(r.status === 500, 'Admin : erreur interne au retrait d’annonce -> 500 (pas 404)');
    } finally {
      listingService.deleteAny = origDeleteAny;
    }

    console.log(`\n✅ Tests des correctifs réussis — ${passed} assertions.`);
  } finally {
    // Nettoyage : fichiers des candidatures puis données de test.
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
