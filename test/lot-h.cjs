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

    // --- 2. unitaires : weeklyBuckets et rate ---
    const statsService = require('../src/services/statsService');
    const buckets = statsService.weeklyBuckets([], 12);
    ok(buckets.length === 12, 'weeklyBuckets : exactement 12 entrees');
    ok(buckets.every((b) => b.count === 0), 'weeklyBuckets : semaines vides a 0');
    ok(buckets.every((b) => /^\d{2}\/\d{2}$/.test(b.label)), 'weeklyBuckets : labels JJ/MM');
    const b2 = statsService.weeklyBuckets([new Date(), new Date(), new Date(Date.now() - 8 * 24 * 3600 * 1000)], 12);
    ok(b2[11].count === 2, 'weeklyBuckets : dates du jour dans la derniere semaine');
    ok(b2[10].count + b2[9].count === 1, 'weeklyBuckets : date d il y a 8 jours dans une semaine precedente');
    const b3 = statsService.weeklyBuckets([new Date(Date.now() - 100 * 24 * 3600 * 1000)], 12);
    ok(b3.reduce((s, b) => s + b.count, 0) === 0, 'weeklyBuckets : date hors fenetre ignoree');
    ok(statsService.rate(1, 4) === 25, 'rate : 1/4 -> 25');
    ok(statsService.rate(0, 0) === 0, 'rate : total nul -> 0 (jamais NaN)');
    ok(statsService.rate(3, 3) === 100, 'rate : 3/3 -> 100');

    // --- 3. statsService.forSchool ---
    await prisma.listing.update({ where: { id: l1.id }, data: { viewsCount: 10 } });
    const l2 = await prisma.listing.create({
      data: {
        title: `Lot H seconde ${STAMP}`, description: 'd', city: 'Aix-en-Provence', department: '13',
        viewsCount: 4, schoolId: schoolA.id,
        titleLower: `lot h seconde ${STAMP}`, descriptionLower: 'd', cityLower: 'aix-en-provence',
      },
    });
    await prisma.listing.create({
      data: {
        title: `Lot H cloturee ${STAMP}`, description: 'd', city: 'Aubagne', department: '13',
        status: 'closed', schoolId: schoolA.id,
        titleLower: `lot h cloturee ${STAMP}`, descriptionLower: 'd', cityLower: 'aubagne',
      },
    });
    const mkApp = (listingId, status) => prisma.application.create({
      data: { applicantName: 'Moniteur Test', applicantEmail: `h.cand.${STAMP}@example.test`, message: 'm', status, listingId },
    });
    const a1 = await mkApp(l1.id, 'accepted');
    await mkApp(l1.id, 'pending');
    await mkApp(l1.id, 'pending');
    await mkApp(l2.id, 'pending');
    // Contrat signé (posé directement en base : l'entonnoir compte applicantSignedAt non nul).
    await prisma.contract.create({
      data: {
        type: 'cdi', startDate: new Date(), grossSalary: '2200€ brut/mois', workplace: 'Marseille',
        pdfPath: 'contracts/lot-h-test.pdf', applicantSignedAt: new Date(), applicationId: a1.id,
      },
    });

    // Autre ecole : ses donnees ne doivent JAMAIS apparaitre dans les stats de A.
    const schoolB = await prisma.school.create({
      data: {
        email: `h.autre.${STAMP}@example.test`, passwordHash: 'x',
        businessName: `Autre ecole ${STAMP}`, siret: `6${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(schoolB.id);
    const lB = await prisma.listing.create({
      data: {
        title: `Lot H autre ${STAMP}`, description: 'd', city: 'Lyon', department: '69', schoolId: schoolB.id,
        titleLower: `lot h autre ${STAMP}`, descriptionLower: 'd', cityLower: 'lyon',
      },
    });
    await mkApp(lB.id, 'pending');

    const sStats = await statsService.forSchool(schoolA.id);
    ok(sStats.tiles.openListings === 2, 'forSchool : annonces ouvertes (la cloturee est exclue)');
    ok(sStats.tiles.totalViews === 14, 'forSchool : total des vues (10 + 4)');
    ok(sStats.tiles.applications === 4, 'forSchool : candidatures - isolation (celle de l autre ecole exclue)');
    ok(sStats.tiles.acceptRate === 25, 'forSchool : taux d acceptation 1/4 -> 25');
    ok(sStats.tiles.signedContracts === 1, 'forSchool : contrats signes');
    ok(sStats.weekly.length === 12 && sStats.weekly[11].count === 4, 'forSchool : serie hebdo - 12 entrees, 4 candidatures cette semaine');
    ok(JSON.stringify(sStats.funnel.map((s) => s.count)) === '[14,4,1,1]' && sStats.funnel[0].label === 'Vues',
      'forSchool : entonnoir 14 -> 4 -> 1 -> 1');
    ok(JSON.stringify(sStats.funnel.map((s) => s.rateFromPrevious)) === '[null,29,25,100]',
      'forSchool : taux de conversion entre etapes');
    ok(sStats.topListings.length === 3 && sStats.topListings[0].id === l1.id && sStats.topListings[1].id === l2.id
      && sStats.topListings[0].conversionRate === 30,
      'forSchool : top annonces triees (candidatures puis vues), conversion 3/10 -> 30');

    const schoolNeuf = await prisma.school.create({
      data: {
        email: `h.neuf.${STAMP}@example.test`, passwordHash: 'x',
        businessName: `Neuf ${STAMP}`, siret: `7${String(STAMP).slice(-13).padStart(13, '0')}`,
      },
    });
    createdSchoolIds.push(schoolNeuf.id);
    const vide = await statsService.forSchool(schoolNeuf.id);
    ok(vide.tiles.openListings === 0 && vide.tiles.totalViews === 0 && vide.tiles.applications === 0
      && vide.tiles.acceptRate === 0 && vide.tiles.signedContracts === 0,
      'forSchool : compte neuf - toutes les tuiles a 0 (pas de NaN)');
    ok(vide.weekly.length === 12 && vide.weekly.every((b) => b.count === 0)
      && vide.funnel.every((s) => s.count === 0) && vide.topListings.length === 0,
      'forSchool : compte neuf - series vides mais completes');

    // --- 4. statsService.forPlatform ---
    // Comptes globaux : la base peut contenir d'autres donnees, on teste en >=.
    const plat = await statsService.forPlatform();
    ok(plat.tiles.schools >= 3 && plat.tiles.listings >= 4 && plat.tiles.applications >= 5 && plat.tiles.signedContracts >= 1,
      'forPlatform : tuiles >= donnees semees');
    ok(plat.schoolsWeekly.length === 12 && plat.applicationsWeekly.length === 12, 'forPlatform : deux series de 12 semaines');
    ok(plat.schoolsWeekly[11].count >= 3 && plat.applicationsWeekly[11].count >= 5, 'forPlatform : creations de la semaine comptees');

    // --- 5. tableau de bord ecole ---
    const jar = makeJar();
    let r5 = await req(jar, 'GET', '/connexion');
    r5 = await req(jar, 'POST', '/connexion', form({ _csrf: csrfFrom(r5.text), email: schoolA.email, password: 'motdepasse123' }));
    r5 = await req(jar, 'GET', '/tableau-de-bord');
    ok(r5.status === 200 && r5.text.includes('id="stats-data"'), 'ecole : bloc de donnees #stats-data present');
    ok(r5.text.includes('/js/dashboard-charts.js'), 'ecole : script des graphiques reference');
    const m5 = r5.text.match(/<script type="application\/json" id="stats-data">([\s\S]*?)<\/script>/);
    const dash = JSON.parse(m5[1]);
    ok(dash.tiles.applications === 4 && dash.tiles.totalViews === 14 && dash.tiles.acceptRate === 25,
      'ecole : JSON - tuiles exactes');
    ok(dash.funnel.length === 4 && dash.funnel[0].label === 'Vues', 'ecole : JSON - entonnoir de 4 etapes');
    ok(!m5[1].includes('Lot H annonce vedette'), 'ecole : les titres d annonces ne transitent pas par le JSON');
    ok(r5.text.includes('Top annonces') && r5.text.includes(`Lot H annonce vedette ${STAMP}`),
      'ecole : tableau top annonces avec le titre (via Twig)');
    ok(r5.text.includes('id="chart-weekly"') && r5.text.includes('id="chart-funnel"'),
      'ecole : conteneurs des graphiques presents');
    ok(r5.text.includes('Taux d’acceptation') && r5.text.includes('Contrats signés'),
      'ecole : libelles des nouvelles tuiles');

    // --- 6. dashboard admin ---
    const adminService = require('../src/services/adminService');
    const admin = await adminService.create({ email: `h.admin.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('adminpass123') });
    createdAdminIds.push(admin.id);
    const adminJar = makeJar();
    let r6 = await req(adminJar, 'GET', '/admin/connexion');
    r6 = await req(adminJar, 'POST', '/admin/connexion', form({ _csrf: csrfFrom(r6.text), email: admin.email, password: 'adminpass123' }));
    r6 = await req(adminJar, 'GET', '/admin');
    ok(r6.status === 200 && r6.text.includes('id="stats-data"') && r6.text.includes('/js/dashboard-charts.js'),
      'admin : bloc de donnees + script presents');
    const m6 = r6.text.match(/<script type="application\/json" id="stats-data">([\s\S]*?)<\/script>/);
    const padm = JSON.parse(m6[1]);
    ok(padm.tiles.schools >= 3 && padm.tiles.signedContracts >= 1, 'admin : JSON - tuiles plateforme');
    ok(padm.schoolsWeekly.length === 12 && padm.applicationsWeekly.length === 12, 'admin : JSON - deux series de 12 semaines');
    ok(r6.text.includes('Contrats signés') && r6.text.includes('id="chart-schools-weekly"') && r6.text.includes('id="chart-applications-weekly"'),
      'admin : tuile contrats signes + conteneurs des deux graphiques');

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
