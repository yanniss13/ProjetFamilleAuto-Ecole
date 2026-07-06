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
