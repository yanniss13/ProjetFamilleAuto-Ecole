/**
 * Tests de la messagerie école ↔ moniteur (lot N) : un fil par candidature,
 * écrit par l'école connectée ou par le moniteur via son lien de suivi,
 * notifié par email et en temps réel, fermé après un refus.
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'messagerie-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';
process.env.ADRESSE_LOOKUP_DISABLED = '1';

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const passwordUtil = require('../src/utils/password');
const messageService = require('../src/services/messageService');

const PORT = 4075;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
function makeJar() { return { cookie: '' }; }
async function req(jar, method, urlPath, { body, headers = {} } = {}) {
  const res = await fetch(BASE + urlPath, {
    method, redirect: 'manual',
    headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...headers }, body,
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

const created = { schoolIds: [] };
let seq = 0;

async function makeSchool(label) {
  seq += 1;
  const school = await prisma.school.create({
    data: {
      email: `msg.${label}.${STAMP}@example.test`,
      passwordHash: await passwordUtil.hash('motdepasse123'),
      businessName: `Ecole ${label}`,
      siret: `7${String(STAMP + seq).slice(-13).padStart(13, '0')}`,
      emailVerified: true,
    },
  });
  created.schoolIds.push(school.id);
  return school;
}
async function makeApplication(school, status = 'pending') {
  seq += 1;
  const listing = await prisma.listing.create({
    data: {
      schoolId: school.id, title: `Annonce messagerie ${seq}`, description: 'Annonce de test messagerie.',
      city: 'Lyon', department: '69', contractType: 'freelance',
    },
  });
  return prisma.application.create({
    data: {
      listingId: listing.id, applicantName: 'Mona Moniteur', applicantEmail: `mona.${STAMP}.${seq}@example.test`,
      message: 'Candidature de test.', status, trackingToken: `msg-${STAMP}-${seq}-${'x'.repeat(20)}`,
    },
  });
}

async function testService() {
  const MAX = messageService.MAX_BODY;
  ok(MAX === 2000, 'service : longueur maximale de 2 000 caracteres');
  ok('error' in messageService.validateBody('   '), 'service : message fait d espaces refuse');
  ok('error' in messageService.validateBody(undefined), 'service : message absent refuse');
  ok('error' in messageService.validateBody('x'.repeat(2001)), 'service : message de 2 001 caracteres refuse');
  ok(messageService.validateBody('x'.repeat(2000)).value.length === 2000, 'service : 2 000 caracteres acceptes');
  ok(messageService.validateBody(' Bonjour ').value === 'Bonjour', 'service : espaces autour retires');
  ok(messageService.isThreadOpen({ status: 'rejected' }) === false, 'service : fil ferme apres refus');
  ok(messageService.isThreadOpen({ status: 'pending' }) && messageService.isThreadOpen({ status: 'accepted' }),
    'service : fil ouvert en attente et acceptee');

  const school = await makeSchool('service');
  const application = await makeApplication(school);
  await messageService.create(application.id, 'school', 'Premier message');
  await messageService.create(application.id, 'applicant', 'Reponse du moniteur');
  let list = await messageService.listForApplication(application.id);
  ok(list.length === 2 && list[0].body === 'Premier message' && list[1].author === 'applicant',
    'service : fil rendu dans l ordre d ecriture');
  let threw = false;
  try { await messageService.create(application.id, 'admin', 'x'); } catch { threw = true; }
  ok(threw, 'service : auteur inconnu refuse');

  const marked = await messageService.markReadBy(application.id, 'school');
  list = await messageService.listForApplication(application.id);
  ok(marked === 1 && list[1].readAt && !list[0].readAt,
    'service : l ecole ne marque lus que les messages du moniteur');
  ok(await messageService.markReadBy(application.id, 'school') === 0, 'service : deja lus, rien a marquer');

  await prisma.application.delete({ where: { id: application.id } });
  ok(await prisma.message.count({ where: { applicationId: application.id } }) === 0,
    'service : messages supprimes avec la candidature');
}

async function main() {
  let server;
  try {
    server = await new Promise((resolve) => { const s = app.listen(PORT, () => resolve(s)); });
    await testService();
    console.log(`\n✅ Messagerie tests reussis - ${passed} assertions.`);
  } finally {
    for (const id of created.schoolIds) await prisma.school.delete({ where: { id } }).catch(() => {});
    if (server) await new Promise((r) => server.close(r));
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
