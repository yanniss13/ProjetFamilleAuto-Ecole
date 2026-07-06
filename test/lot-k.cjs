/**
 * Tests du Lot K — seed de démo.
 * Spec : docs/superpowers/specs/2026-07-07-lot-k-seed-demo-design.md
 * Particularité : le seed est fait pour RESTER en base (données de démo) — le test
 * ne nettoie que son école témoin, pas les données démo.
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotk-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const fs = require('fs');

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const { resolveStored } = require('../src/config/storage');

const PORT = 4067;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const DEMO_SUFFIX = '@demo.moniteur-connect.example';

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

let temoinId = null;

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

    // École témoin NON-démo : elle doit survivre au seed (données perso intactes).
    const temoin = await prisma.school.create({
      data: {
        email: `k.temoin.${STAMP}@example.test`, passwordHash: 'x',
        businessName: `Temoin ${STAMP}`, siret: `1${String(STAMP).slice(-13).padStart(13, '0')}`,
      },
    });
    temoinId = temoin.id;

    const { seedDemo } = require('../scripts/seed-demo');
    const r1 = await seedDemo();
    ok(Boolean(await prisma.school.findUnique({ where: { id: temoinId } })),
      'seed : l ecole temoin (non demo) survit');
    const countSchools1 = await prisma.school.count({ where: { email: { endsWith: DEMO_SUFFIX } } });
    ok(r1.schools === 15 && countSchools1 === 15, 'seed : 15 ecoles demo creees');

    const r2 = await seedDemo();
    const countSchools2 = await prisma.school.count({ where: { email: { endsWith: DEMO_SUFFIX } } });
    ok(countSchools2 === 15 && r2.listings === r1.listings && r2.applications === r1.applications,
      'seed : relance sans doublons (delete puis recreate)');
    ok(r2.listings >= 35 && r2.applications >= 55 && r2.alerts >= 4 && r2.signedContracts === 1,
      'seed : volumes riches (annonces, candidatures, alertes, contrat signe)');

    const unlocated = await prisma.school.count({
      where: { email: { endsWith: DEMO_SUFFIX }, OR: [{ latitude: null }, { longitude: null }] },
    });
    ok(unlocated === 0, 'seed : toutes les ecoles demo geolocalisees');

    const recente = await prisma.application.findFirst({
      where: { applicantEmail: { endsWith: DEMO_SUFFIX }, createdAt: { gte: daysAgo(7) } },
    });
    const ancienne = await prisma.application.findFirst({
      where: { applicantEmail: { endsWith: DEMO_SUFFIX }, createdAt: { gte: daysAgo(84), lt: daysAgo(60) } },
    });
    ok(Boolean(recente) && Boolean(ancienne), 'seed : candidatures etalees sur 12 semaines');

    const vitrine = await prisma.school.findUnique({ where: { email: `ecole.vitrine${DEMO_SUFFIX}` } });
    const contrat = vitrine
      ? await prisma.contract.findFirst({ where: { application: { listing: { schoolId: vitrine.id } } } })
      : null;
    ok(Boolean(vitrine) && Boolean(contrat) && contrat.applicantSignedAt instanceof Date
      && typeof contrat.signedPdfHash === 'string' && contrat.sentToApplicantAt instanceof Date,
      'seed : ecole vitrine avec un contrat reellement signe');
    ok(fs.existsSync(resolveStored(contrat.pdfPath)) && fs.existsSync(resolveStored(contrat.signedPdfPath)),
      'seed : PDF propose et PDF signe presents sur disque');

    const appAvecCv = await prisma.application.findFirst({
      where: { listing: { schoolId: vitrine.id }, cvPath: { not: null } },
    });
    ok(Boolean(appAvecCv) && fs.existsSync(resolveStored(appAvecCv.cvPath)),
      'seed : au moins un CV telechargeable sur disque');

    const vieilleAlerte = await prisma.alert.findFirst({
      where: { email: { endsWith: DEMO_SUFFIX }, confirmedAt: null },
    });
    ok(Boolean(vieilleAlerte) && vieilleAlerte.createdAt < daysAgo(9),
      'seed : alerte non confirmee antidatee (candidate a la purge)');

    const jar = makeJar();
    let rl = await req(jar, 'GET', '/connexion');
    rl = await req(jar, 'POST', '/connexion', form({
      _csrf: csrfFrom(rl.text), email: r2.credentials.school.email, password: r2.credentials.school.password,
    }));
    ok(rl.status === 302 && rl.location === '/tableau-de-bord',
      'seed : connexion ecole vitrine avec les identifiants annonces');

    const rs = await get(`/suivi/${r2.trackingToken}`);
    ok(rs.status === 200 && rs.text.toLowerCase().includes('contrat'),
      'seed : page de suivi du dossier signe accessible');

    console.log(`\n✅ Lot K tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    // On ne nettoie QUE le temoin : les donnees demo sont le produit du seed.
    if (temoinId) await prisma.school.deleteMany({ where: { id: temoinId } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
