/**
 * Tests du Lot F - verification SIRET (Sirene).
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
  if (!cond) throw new Error(`ECHEC : ${label}`);
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

    // --- 1. colonnes Sirene sur School (defaut unverified) ---
    const s0 = await prisma.school.create({
      data: {
        email: `f.cols.${STAMP}@example.test`, passwordHash: 'x',
        businessName: 'F Cols', siret: `9${String(STAMP).slice(-13).padStart(13, '0')}`,
      },
    });
    createdSchoolIds.push(s0.id);
    ok(s0.siretStatus === 'unverified', 'schema : siretStatus par defaut "unverified"');
    ok(s0.siretVerifiedName === null && s0.siretCheckedAt === null, 'schema : nom officiel et date null par defaut');

    // --- 2. service siret (fetch simule) ---
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
          'siret : etablissement actif -> verified + nom + adresse');
        await siretService.lookupSiret('11111111100001');
        ok(calls === 1, 'siret : 2e appel servi par le cache');

        global.fetch = async () => { calls += 1; return okResponse([{ nom_complet: 'FERMEE SARL', matching_etablissements: [{ etat_administratif: 'F', adresse: 'X' }] }]); };
        ok((await siretService.lookupSiret('22222222200002')).status === 'closed', 'siret : etablissement ferme -> closed');

        global.fetch = async () => { calls += 1; return okResponse([]); };
        ok((await siretService.lookupSiret('33333333300003')).status === 'not_found', 'siret : aucun resultat -> not_found');

        global.fetch = async () => { calls += 1; return { ok: false }; };
        ok((await siretService.lookupSiret('44444444400004')).status === 'error', 'siret : reponse API non-ok -> error');
        const callsBefore = calls;
        Date.now = () => origNow() + 2 * 60 * 1000; // TTL erreur (1 min) expire
        global.fetch = async () => { calls += 1; return okResponse([{ nom_complet: 'REVENUE', matching_etablissements: [{ etat_administratif: 'A', adresse: 'Y' }] }]); };
        ok((await siretService.lookupSiret('44444444400004')).status === 'verified' && calls === callsBefore + 1,
          'siret : une erreur n est pas mise en cache longtemps (re-verifiee apres 2 min)');
        Date.now = origNow;

        global.fetch = async () => { throw new Error('reseau'); };
        ok((await siretService.lookupSiret('55555555500005')).status === 'error', 'siret : exception reseau -> error');

        ok((await siretService.lookupSiret('123')).status === 'not_found', 'siret : format invalide -> not_found sans reseau');

        process.env.SIRET_LOOKUP_DISABLED = '1';
        const before = calls;
        global.fetch = async () => { calls += 1; return okResponse([]); };
        ok((await siretService.lookupSiret('66666666600006')).status === 'error' && calls === before,
          'siret : SIRET_LOOKUP_DISABLED court-circuite sans reseau');
      } finally {
        global.fetch = origFetch;
        process.env.SIRET_LOOKUP_DISABLED = origDisabled;
        Date.now = origNow;
      }
    }

    // --- 3. endpoint interne /api/siret ---
    let r = await get('/api/siret/abc');
    ok(r.status === 400 && JSON.parse(r.text).status === 'invalid', 'api : format invalide -> 400 invalid');

    r = await get('/api/siret/12345678901234'); // SIRET_LOOKUP_DISABLED=1 -> error
    ok(r.status === 200 && JSON.parse(r.text).status === 'error', 'api : service court-circuite -> error (jamais 500)');

    {
      const siretService = require('../src/services/siret');
      const orig = siretService.lookupSiret;
      try {
        siretService.lookupSiret = async () => ({ status: 'verified', name: 'AUTO-ECOLE DEMO', address: '2 RUE Y 13002 MARSEILLE' });
        r = await get('/api/siret/12345678901234');
        const body = JSON.parse(r.text);
        ok(body.status === 'verified' && body.name === 'AUTO-ECOLE DEMO' && body.address === '2 RUE Y 13002 MARSEILLE',
          'api : relaie status/nom/adresse du service, rien d autre');
      } finally {
        siretService.lookupSiret = orig;
      }
    }

    // --- 4. inscription : statut Sirene stocke + page equipee ---
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
          'inscription : statut verified + nom officiel + date stockes');

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
        ok(s2 && s2.siretStatus === 'unverified', 'inscription : API en panne -> compte cree, statut unverified');
      } finally {
        siretService.lookupSiret = origLookup;
      }

      r = await get('/inscription');
      ok(r.text.includes('id="siret-status"') && r.text.includes('/js/siret-check.js'),
        'inscription : zone d etat + script de verification presents');
    }

    // --- 5. badges "Ecole verifiee" ---
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
      'badge : present une seule fois sur la liste (ecole verifiee uniquement)');
    r = await get(`/annonces/${lV.id}`);
    ok(r.text.includes('École vérifiée'), 'badge : present sur la page detail (ecole verifiee)');
    r = await get(`/annonces/${lU.id}`);
    ok(!r.text.includes('École vérifiée'), 'badge : absent sur la page detail (ecole non verifiee)');

    // Colonne Sirene cote admin.
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

    console.log(`\n✅ Lot F tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    if (createdAdminIds.length) await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
