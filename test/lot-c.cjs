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
const { createOrUpdateAdmin } = require('../scripts/create-admin');
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
