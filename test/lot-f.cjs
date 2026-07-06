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

    console.log(`\n✅ Lot F tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    if (createdAdminIds.length) await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
