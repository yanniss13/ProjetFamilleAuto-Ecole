/**
 * Tests du mode démonstration (DEMO_MODE=true) — instance publique de démo.
 * Le mode affiche un bandeau « données fictives » et les accès de démonstration
 * sur les pages de connexion ; sans lui, rien de tout cela n'apparaît.
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'demo-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';
process.env.ADRESSE_LOOKUP_DISABLED = '1';
delete process.env.DEMO_MODE;

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const { DEMO_ACCOUNTS, isDemoMode } = require('../src/config/demo');
const { DEMO_DOMAIN } = require('../scripts/seed-demo');

const passwordUtil = require('../src/utils/password');

const PORT = 4073;
const STAMP = Date.now();
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
async function page(urlPath) {
  const res = await fetch(BASE + urlPath, { redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}
async function req(jar, method, urlPath, { body, headers = {} } = {}) {
  const res = await fetch(BASE + urlPath, {
    method, redirect: 'manual', headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...headers }, body,
  });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of sc) jar.cookie = c.split(';')[0];
  return { status: res.status, location: res.headers.get('location'), text: await res.text() };
}
function csrfFrom(html) {
  const m = html.match(/name="csrf-token" content="([^"]+)"/);
  if (!m) throw new Error('Jeton CSRF introuvable.');
  return m[1];
}
function form(obj) {
  return { body: new URLSearchParams(obj).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } };
}

const created = {};

async function main() {
  let server;
  try {
    server = await new Promise((resolve) => { const s = app.listen(PORT, () => resolve(s)); });

    // --- Comptes de démonstration : une seule source, alignée sur le seed ---
    ok(DEMO_ACCOUNTS.school.email === `ecole.vitrine@${DEMO_DOMAIN}`,
      'comptes : l ecole de demo est l ecole vitrine du seed');
    ok(DEMO_ACCOUNTS.admin.email === `admin@${DEMO_DOMAIN}`,
      'comptes : l admin de demo est celui du seed');

    // --- Hors démo : aucun accès ni bandeau ---
    ok(isDemoMode() === false, 'hors demo : DEMO_MODE absent => mode inactif');
    let r = await page('/connexion');
    ok(r.status === 200 && !r.text.includes(DEMO_ACCOUNTS.school.email)
      && !r.text.includes(DEMO_ACCOUNTS.school.password),
    'hors demo : la connexion ecole n affiche aucun identifiant');
    r = await page('/admin/connexion');
    ok(r.status === 200 && !r.text.includes(DEMO_ACCOUNTS.admin.email)
      && !r.text.includes(DEMO_ACCOUNTS.admin.password),
    'hors demo : la connexion admin n affiche aucun identifiant');
    r = await page('/');
    ok(r.status === 200 && !r.text.includes('data-demo-banner'), 'hors demo : pas de bandeau de demonstration');

    process.env.DEMO_MODE = 'oui';
    ok(isDemoMode() === false, 'hors demo : seule la valeur exacte "true" active le mode');

    // --- En démo ---
    process.env.DEMO_MODE = 'true';
    ok(isDemoMode() === true, 'demo : DEMO_MODE=true active le mode');
    r = await page('/');
    ok(r.status === 200 && r.text.includes('data-demo-banner') && r.text.includes('fictives'),
      'demo : bandeau donnees fictives sur l accueil');
    r = await page('/connexion');
    ok(r.text.includes(DEMO_ACCOUNTS.school.email) && r.text.includes(DEMO_ACCOUNTS.school.password),
      'demo : la connexion ecole affiche les acces de l ecole vitrine');
    ok(!r.text.includes(DEMO_ACCOUNTS.admin.password),
      'demo : la connexion ecole n affiche pas le mot de passe admin');
    r = await page('/admin/connexion');
    ok(r.text.includes(DEMO_ACCOUNTS.admin.email) && r.text.includes(DEMO_ACCOUNTS.admin.password),
      'demo : la connexion admin affiche les acces admin');

    // --- Admin en lecture seule pendant la démo ---
    const admin = await prisma.admin.create({
      data: { email: `demo.admin.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('motdepasse123') },
    });
    created.adminId = admin.id;
    const school = await prisma.school.create({
      data: {
        email: `demo.ecole.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'Demo Lecture Seule', siret: `5${String(STAMP).slice(-13).padStart(13, '0')}`, emailVerified: true,
      },
    });
    created.schoolId = school.id;
    const jar = { cookie: '' };
    r = await req(jar, 'GET', '/admin/connexion');
    r = await req(jar, 'POST', '/admin/connexion', form({ _csrf: csrfFrom(r.text), email: admin.email, password: 'motdepasse123' }));
    ok(r.status === 302, 'demo admin : connexion admin');
    r = await req(jar, 'GET', '/admin/ecoles');
    ok(r.status === 200, 'demo admin : la liste des ecoles reste consultable');
    const csrf = csrfFrom(r.text);
    r = await req(jar, 'POST', `/admin/ecoles/${school.id}/suspendre`, form({ _csrf: csrf }));
    ok(r.status === 302, 'demo admin : suspension refusee par redirection');
    ok((await prisma.school.findUnique({ where: { id: school.id } })).suspended === false,
      'demo admin : l ecole n est pas suspendue');
    r = await req(jar, 'GET', r.location || '/admin');
    ok(/lecture seule/i.test(r.text), 'demo admin : message lecture seule affiche');
    const runsAvant = await prisma.purgeRun.count();
    r = await req(jar, 'POST', '/admin/purge', form({ _csrf: csrf }));
    ok(r.status === 302 && await prisma.purgeRun.count() === runsAvant, 'demo admin : purge manuelle refusee');

    delete process.env.DEMO_MODE;
    r = await req(jar, 'POST', `/admin/ecoles/${school.id}/suspendre`, form({ _csrf: csrf }));
    ok((await prisma.school.findUnique({ where: { id: school.id } })).suspended === true,
      'hors demo : la suspension admin fonctionne toujours');

    console.log(`\n✅ Mode demo tests reussis - ${passed} assertions.`);
  } finally {
    delete process.env.DEMO_MODE;
    if (created.adminId) await prisma.admin.delete({ where: { id: created.adminId } }).catch(() => {});
    if (created.schoolId) await prisma.school.delete({ where: { id: created.schoolId } }).catch(() => {});
    if (server) await new Promise((r) => server.close(r));
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
