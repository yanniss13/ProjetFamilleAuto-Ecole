/**
 * Tests du Lot J — purge RGPD automatique.
 * Spec : docs/superpowers/specs/2026-07-07-lot-j-purge-rgpd-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotj-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const passwordUtil = require('../src/utils/password');
const { STORAGE_DIR } = require('../src/config/storage');

const PORT = 4066;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

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
const createdPurgeRunIds = [];

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

    // --- 1. rejectedAt + modeles ---
    const schoolJ = await prisma.school.create({
      data: {
        email: `j.ecole.${STAMP}@example.test`, passwordHash: 'x',
        businessName: `Ecole Lot J ${STAMP}`, siret: `9${String(STAMP).slice(-13).padStart(13, '0')}`,
      },
    });
    createdSchoolIds.push(schoolJ.id);
    const listJ = await prisma.listing.create({
      data: {
        title: `Lot J annonce ${STAMP}`, description: 'd', city: 'Nantes', department: '44',
        schoolId: schoolJ.id, titleLower: `lot j annonce ${STAMP}`, descriptionLower: 'd', cityLower: 'nantes',
      },
    });

    const appService = require('../src/services/applicationService');
    const aPend = await prisma.application.create({
      data: { applicantName: 'M', applicantEmail: `j.cand.${STAMP}@example.test`, message: 'm', listingId: listJ.id },
    });
    await appService.updateStatus(aPend.id, 'rejected');
    let row = await prisma.application.findUnique({ where: { id: aPend.id } });
    ok(row.status === 'rejected' && row.rejectedAt instanceof Date, 'updateStatus : refus -> rejectedAt pose');
    await appService.updateStatus(aPend.id, 'accepted');
    row = await prisma.application.findUnique({ where: { id: aPend.id } });
    ok(row.status === 'accepted' && row.rejectedAt === null, 'updateStatus : autre statut -> rejectedAt efface');

    const run0 = await prisma.purgeRun.create({ data: { unconfirmedAlerts: 0, rejectedApplications: 0, expiredTokens: 0 } });
    createdPurgeRunIds.push(run0.id);
    ok(run0.ranAt instanceof Date, 'schema : PurgeRun avec date automatique');

    // --- 2. runPurge : les trois categories ---
    const mkAlert = (email, confirmedAt, createdAt) => prisma.alert.create({
      data: { email, department: '44', keywordLower: '', confirmedAt, createdAt, unsubscribeToken: crypto.randomBytes(32).toString('hex') },
    });
    const alOld = await mkAlert(`j.al.old.${STAMP}@example.test`, null, daysAgo(10));
    const alRecent = await mkAlert(`j.al.recent.${STAMP}@example.test`, null, daysAgo(2));
    const alConf = await mkAlert(`j.al.conf.${STAMP}@example.test`, daysAgo(29), daysAgo(30));

    const mkFile = (rel) => { fs.writeFileSync(path.join(STORAGE_DIR, rel), 'contenu de test'); return rel; };
    const cvRel = mkFile(`cv/lot-j-${STAMP}.pdf`);
    const idRel = mkFile(`id/lot-j-${STAMP}.pdf`);
    const mkAppJ = (data) => prisma.application.create({
      data: { applicantName: 'M', applicantEmail: `j.cand.${STAMP}@example.test`, message: 'm', listingId: listJ.id, ...data },
    });
    const appOldRej = await mkAppJ({ status: 'rejected', cvPath: cvRel, idCardPath: idRel });
    await prisma.application.update({ where: { id: appOldRej.id }, data: { rejectedAt: daysAgo(200), createdAt: daysAgo(210) } });
    const appLegacy = await mkAppJ({ status: 'rejected' }); // rejectedAt null : refus anterieur au Lot J
    await prisma.application.update({ where: { id: appLegacy.id }, data: { createdAt: daysAgo(200) } });
    const appRecentRej = await mkAppJ({ status: 'rejected' });
    await prisma.application.update({ where: { id: appRecentRej.id }, data: { rejectedAt: daysAgo(10), createdAt: daysAgo(15) } });
    const appOldAcc = await mkAppJ({ status: 'accepted' });
    await prisma.application.update({ where: { id: appOldAcc.id }, data: { createdAt: daysAgo(300) } });
    const appOldPend = await mkAppJ({ status: 'pending' });
    await prisma.application.update({ where: { id: appOldPend.id }, data: { createdAt: daysAgo(300) } });

    const schoolTok = await prisma.school.create({
      data: {
        email: `j.tok.${STAMP}@example.test`, passwordHash: 'x', businessName: `Jetons ${STAMP}`,
        siret: `0${String(STAMP).slice(-13).padStart(13, '0')}`,
        verifyTokenHash: `vh${STAMP}`, verifyTokenExpiry: daysAgo(1),
        resetTokenHash: `rh${STAMP}`, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    createdSchoolIds.push(schoolTok.id);

    const purgeService = require('../src/services/purgeService');
    const res2 = await purgeService.runPurge();
    ok((await prisma.alert.findUnique({ where: { id: alOld.id } })) === null, 'purge : vieille alerte non confirmee supprimee');
    ok(Boolean(await prisma.alert.findUnique({ where: { id: alRecent.id } }))
      && Boolean(await prisma.alert.findUnique({ where: { id: alConf.id } })),
      'purge : alerte recente et alerte confirmee conservees');
    ok((await prisma.application.findUnique({ where: { id: appOldRej.id } })) === null, 'purge : vieille candidature refusee supprimee');
    ok(!fs.existsSync(path.join(STORAGE_DIR, cvRel)) && !fs.existsSync(path.join(STORAGE_DIR, idRel)),
      'purge : fichiers de la candidature purges du disque');
    ok((await prisma.application.findUnique({ where: { id: appLegacy.id } })) === null,
      'purge : refusee sans rejectedAt (repli createdAt) supprimee');
    ok(Boolean(await prisma.application.findUnique({ where: { id: appRecentRej.id } })), 'purge : refusee recente conservee');
    ok(Boolean(await prisma.application.findUnique({ where: { id: appOldAcc.id } }))
      && Boolean(await prisma.application.findUnique({ where: { id: appOldPend.id } })),
      'purge : acceptee et en attente conservees meme anciennes');
    const tokRow = await prisma.school.findUnique({ where: { id: schoolTok.id } });
    ok(tokRow.verifyTokenHash === null && tokRow.verifyTokenExpiry === null, 'purge : jeton de verification expire nettoye');
    ok(tokRow.resetTokenHash === `rh${STAMP}` && tokRow.resetTokenExpiry instanceof Date, 'purge : jeton de reset encore valide conserve');
    ok(res2.unconfirmedAlerts >= 1 && res2.rejectedApplications >= 2 && res2.expiredTokens >= 1, 'purge : compteurs renvoyes');
    const latest = await purgeService.findLatestRun();
    ok(latest && latest.unconfirmedAlerts === res2.unconfirmedAlerts
      && latest.rejectedApplications === res2.rejectedApplications && latest.expiredTokens === res2.expiredTokens,
      'purge : PurgeRun ecrite et findLatestRun coherente');
    createdPurgeRunIds.push(latest.id);

    // --- 3. dashboard admin : tuile + purge manuelle ---
    const adminService = require('../src/services/adminService');
    const admin = await adminService.create({ email: `j.admin.${STAMP}@example.test`, passwordHash: await passwordUtil.hash('adminpass123') });
    createdAdminIds.push(admin.id);
    const adminJar = makeJar();
    let ra = await req(adminJar, 'GET', '/admin/connexion');
    ra = await req(adminJar, 'POST', '/admin/connexion', form({ _csrf: csrfFrom(ra.text), email: admin.email, password: 'adminpass123' }));
    ra = await req(adminJar, 'GET', '/admin');
    ok(ra.status === 200 && ra.text.includes('Purge RGPD') && ra.text.includes('Lancer une purge maintenant'),
      'admin : bloc purge + bouton presents');
    ok(ra.text.includes('Dernière purge'), 'admin : derniere purge affichee');

    const alOld2 = await mkAlert(`j.al.old2.${STAMP}@example.test`, null, daysAgo(10));
    ra = await req(adminJar, 'GET', '/admin');
    ra = await req(adminJar, 'POST', '/admin/purge', form({ _csrf: csrfFrom(ra.text) }));
    ok(ra.status === 302 && ra.location === '/admin', 'admin : POST purge -> redirection dashboard');
    ok((await prisma.alert.findUnique({ where: { id: alOld2.id } })) === null, 'admin : la purge manuelle a bien purge');
    ra = await req(adminJar, 'GET', '/admin');
    ok(ra.text.includes('Purge effectuée'), 'admin : flash avec les compteurs affiche');
    createdPurgeRunIds.push((await purgeService.findLatestRun()).id);

    const anonJar = makeJar();
    let rAnon = await req(anonJar, 'GET', '/admin/connexion');
    rAnon = await req(anonJar, 'POST', '/admin/purge', form({ _csrf: csrfFrom(rAnon.text) }));
    ok(rAnon.status === 302 && rAnon.location === '/admin/connexion', 'admin : purge refusee sans session admin');

    console.log(`\n✅ Lot J tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (prisma.alert) await prisma.alert.deleteMany({ where: { email: { contains: String(STAMP) } } });
    if (prisma.purgeRun && createdPurgeRunIds.length) await prisma.purgeRun.deleteMany({ where: { id: { in: createdPurgeRunIds } } });
    // Les suppressions d'ecoles cascadent (annonces -> candidatures -> contrats).
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    if (createdAdminIds.length) await prisma.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
