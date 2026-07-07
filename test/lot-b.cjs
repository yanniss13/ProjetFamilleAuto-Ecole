/**
 * Tests ciblés du Lot B (notifications & suivi candidat) — couverture dédiée
 * restée en dette depuis la revue du 2026-07-06 :
 *   - dépôt de candidature : jeton de suivi opaque + emails câblés (école + candidat) ;
 *   - page publique /suivi/:token : lecture seule, sans donnée personnelle ;
 *   - jeton inconnu -> 404 ; statuts reflétés (en attente / acceptée / refusée).
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'lotb-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const mailer = require('../src/services/mailer');
const passwordUtil = require('../src/utils/password');
const { STORAGE_DIR } = require('../src/config/storage');

const PORT = 4069;
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

const PDF_BYTES = '%PDF-1.4\n%%EOF\n';
const APPLICANT_EMAIL = `candidat.b.${STAMP}@example.test`;
const APPLICANT_PHONE = '0611223344';

const createdSchoolIds = [];

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));
  const origConfirmation = mailer.sendApplicationConfirmation;
  const origNotification = mailer.sendApplicationNotification;
  try {
    const school = await prisma.school.create({
      data: {
        email: `b.school.${STAMP}@example.test`,
        passwordHash: await passwordUtil.hash('motdepasse123'),
        businessName: 'LotB École', siret: `6${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(school.id);
    const listing = await prisma.listing.create({
      data: {
        title: `LotB Annonce ${STAMP}`, description: 'poste', city: 'Nantes', department: '44',
        schoolId: school.id, titleLower: `lotb annonce ${STAMP}`, descriptionLower: 'poste', cityLower: 'nantes',
      },
    });

    // --- Dépôt de candidature : jeton opaque + emails câblés ---
    const mailCalls = [];
    mailer.sendApplicationConfirmation = (...a) => { mailCalls.push(['confirmation', ...a]); return true; };
    mailer.sendApplicationNotification = (...a) => { mailCalls.push(['notification', ...a]); return true; };

    const pub = makeJar();
    let r = await req(pub, 'GET', `/annonces/${listing.id}`);
    const fd = new FormData();
    fd.append('_csrf', csrfFrom(r.text));
    fd.append('applicantName', 'Bertrand Candidat');
    fd.append('applicantEmail', APPLICANT_EMAIL);
    fd.append('applicantPhone', APPLICANT_PHONE);
    fd.append('message', 'Bonjour, je suis intéressé.');
    fd.append('cv', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'cv.pdf');
    fd.append('idCard', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'cni.pdf');
    fd.append('license', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'permis.pdf');
    fd.append('teachingCard', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'carte.pdf');
    r = await req(pub, 'POST', `/annonces/${listing.id}/postuler`, { body: fd });
    ok(r.status === 302 && r.location === `/annonces/${listing.id}`, 'B : candidature déposée -> retour annonce');

    const application = await prisma.application.findFirst({ where: { listingId: listing.id } });
    ok(Boolean(application), 'B : candidature en base');
    ok(typeof application.trackingToken === 'string' && application.trackingToken.length >= 32,
      'B : jeton de suivi opaque présent (longueur non devinable)');

    const confirmation = mailCalls.find((c) => c[0] === 'confirmation');
    const notification = mailCalls.find((c) => c[0] === 'notification');
    ok(confirmation && confirmation[1] === APPLICANT_EMAIL && confirmation[4] === application.trackingToken,
      'B : email de confirmation au candidat avec SON jeton de suivi');
    ok(notification && notification[1] === school.email && String(notification[2]).includes(`LotB Annonce ${STAMP}`),
      'B : école notifiée de la nouvelle candidature');

    // --- Page publique de suivi : lecture seule, sans PII ---
    const suivi = `/suivi/${application.trackingToken}`;
    r = await req(pub, 'GET', suivi);
    ok(r.status === 200 && r.text.includes(`LotB Annonce ${STAMP}`) && r.text.includes('LotB École'),
      'B : page de suivi accessible sans compte (annonce + école)');
    ok(r.text.includes('En attente'), 'B : statut initial « En attente » affiché');
    ok(!r.text.includes(APPLICANT_EMAIL) && !r.text.includes(APPLICANT_PHONE) && !r.text.includes('Bertrand Candidat'),
      'B : la page de suivi n’expose aucune donnée personnelle du candidat');

    r = await req(pub, 'GET', `/suivi/jetonbidon${STAMP}`);
    ok(r.status === 404, 'B : jeton de suivi inconnu -> 404');

    // --- Statuts reflétés sur la page ---
    await prisma.application.update({ where: { id: application.id }, data: { status: 'accepted' } });
    r = await req(pub, 'GET', suivi);
    ok(r.text.includes('Acceptée') && r.text.includes('prépare votre contrat'),
      'B : statut « Acceptée » (contrat en préparation) affiché');

    await prisma.application.update({ where: { id: application.id }, data: { status: 'rejected', rejectedAt: new Date() } });
    r = await req(pub, 'GET', suivi);
    ok(r.text.includes('Refusée') && r.text.includes('pas été retenue'),
      'B : statut « Refusée » affiché avec un message clair');

    console.log(`\n✅ Lot B tests réussis — ${passed} assertions.`);
  } finally {
    mailer.sendApplicationConfirmation = origConfirmation;
    mailer.sendApplicationNotification = origNotification;
    if (createdSchoolIds.length) {
      const apps = await prisma.application.findMany({
        where: { listing: { schoolId: { in: createdSchoolIds } } },
      });
      for (const a of apps) {
        for (const rel of [a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath]) {
          if (rel) { try { const abs = path.join(STORAGE_DIR, rel); if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch {} }
        }
      }
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    await prisma.$disconnect();
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
