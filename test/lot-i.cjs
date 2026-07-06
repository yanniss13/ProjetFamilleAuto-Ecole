/**
 * Tests du Lot I — alertes email moniteurs.
 * Spec : docs/superpowers/specs/2026-07-06-lot-i-alertes-email-design.md
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'loti-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const prisma = require('../src/config/prisma');
const app = require('../src/app');
const passwordUtil = require('../src/utils/password');

const PORT = 4065;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ECHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}
// Les envois d'alertes sont fire-and-forget : on attend (borné) qu'ils soient partis.
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

async function main() {
  let server;
  try {
    server = app.listen(PORT);
    await new Promise((r) => server.once('listening', r));

    // --- 1. modele Alert + subscribe (jetons, doublons) ---
    const alertService = require('../src/services/alertService');
    const s1 = await alertService.subscribe(`i.moniteur.${STAMP}@example.test`, '13', 'Moto');
    ok(s1.alert.id > 0 && s1.alert.confirmedAt === null, 'subscribe : alerte creee non confirmee');
    ok(typeof s1.rawConfirmToken === 'string' && s1.rawConfirmToken.length >= 32, 'subscribe : jeton de confirmation genere');
    ok(s1.alert.keyword === 'Moto' && s1.alert.keywordLower === 'moto', 'subscribe : mot-cle conserve + copie minuscule');
    ok(typeof s1.alert.unsubscribeToken === 'string' && s1.alert.unsubscribeToken.length >= 32, 'subscribe : jeton de desabonnement opaque');

    const s2 = await alertService.subscribe(`i.moniteur.${STAMP}@example.test`, '13', 'moto');
    ok(s2.alert.id === s1.alert.id, 'subscribe : doublon (meme triplet, casse differente) -> pas de seconde ligne');
    ok(typeof s2.rawConfirmToken === 'string' && s2.rawConfirmToken !== s1.rawConfirmToken, 'subscribe : doublon non confirme -> jeton regenere');

    const s3 = await alertService.subscribe(`i.moniteur2.${STAMP}@example.test`, '75', '');
    ok(s3.alert.keyword === null && s3.alert.keywordLower === '', 'subscribe : sans mot-cle -> keyword null, keywordLower vide');

    // --- 2. inscription publique (formulaire + email de confirmation) ---
    const mailer = require('../src/services/mailer');
    const confirmCalls = [];
    mailer.sendAlertConfirmation = async (email, department, keyword, rawToken) => {
      confirmCalls.push({ email, department, keyword, rawToken });
      return true;
    };

    let r = await get('/alertes');
    ok(r.status === 200 && r.text.includes('name="email"') && r.text.includes('name="department"') && r.text.includes('name="keyword"'),
      'alertes : formulaire public avec les trois champs');
    r = await get('/alertes?departement=13&q=moto');
    ok(r.text.includes('value="13"') && r.text.includes('value="moto"'), 'alertes : formulaire pre-rempli depuis la query string');

    const jarI = makeJar();
    let rf = await req(jarI, 'GET', '/alertes');
    rf = await req(jarI, 'POST', '/alertes', form({ _csrf: csrfFrom(rf.text), email: `i.form.${STAMP}@example.test`, department: '13', keyword: 'CDI' }));
    ok(rf.status === 302 && rf.location === '/alertes', 'alertes : POST -> redirection (PRG)');
    rf = await req(jarI, 'GET', '/alertes');
    ok(rf.text.includes('Si votre adresse est valide'), 'alertes : message neutre affiche');
    ok(confirmCalls.length === 1 && confirmCalls[0].email === `i.form.${STAMP}@example.test`
      && typeof confirmCalls[0].rawToken === 'string',
      'alertes : email de confirmation envoye avec le jeton');
    const created = await prisma.alert.findFirst({ where: { email: `i.form.${STAMP}@example.test` } });
    ok(created && created.confirmedAt === null && created.confirmTokenHash !== confirmCalls[0].rawToken,
      'alertes : jeton stocke hache (jamais en clair)');

    rf = await req(jarI, 'GET', '/alertes');
    rf = await req(jarI, 'POST', '/alertes', form({ _csrf: csrfFrom(rf.text), email: 'pas-un-email', department: '13', keyword: '' }));
    ok(rf.status === 400 && rf.text.includes('email n’est pas valide'), 'alertes : email invalide -> 400 + formulaire');
    rf = await req(jarI, 'GET', '/alertes');
    rf = await req(jarI, 'POST', '/alertes', form({ _csrf: csrfFrom(rf.text), email: `i.form.${STAMP}@example.test`, department: 'ZZ', keyword: '' }));
    ok(rf.status === 400, 'alertes : departement invalide -> 400');

    // --- 3. confirmation (double opt-in, idempotente) ---
    const rawToken = confirmCalls[0].rawToken;
    r = await get(`/alertes/confirmer/${rawToken}`);
    ok(r.status === 200 && r.text.includes('activée'), 'confirmation : alerte activee');
    const confirmed = await prisma.alert.findFirst({ where: { email: `i.form.${STAMP}@example.test` } });
    ok(confirmed.confirmedAt instanceof Date, 'confirmation : confirmedAt pose');
    r = await get(`/alertes/confirmer/${rawToken}`);
    ok(r.status === 200 && r.text.includes('activée'), 'confirmation : re-clic idempotent (toujours succes)');
    r = await get(`/alertes/confirmer/jetoninconnu${STAMP}`);
    ok(r.status === 404, 'confirmation : jeton inconnu -> 404');

    const sDup = await alertService.subscribe(`i.form.${STAMP}@example.test`, '13', 'cdi');
    ok(sDup.rawConfirmToken === null, 'subscribe : doublon deja confirme -> aucun nouveau jeton');

    // --- 4. desabonnement (page + bouton, suppression reelle) ---
    const unsubToken = confirmed.unsubscribeToken;
    r = await get(`/alertes/desabonner/${unsubToken}`);
    ok(r.status === 200 && r.text.includes('<form') && r.text.includes('Se désabonner'),
      'desabonnement : page avec bouton (pas de suppression au GET)');
    ok(Boolean(await prisma.alert.findUnique({ where: { unsubscribeToken: unsubToken } })),
      'desabonnement : le GET ne supprime rien');
    let ru = await req(jarI, 'GET', `/alertes/desabonner/${unsubToken}`);
    ru = await req(jarI, 'POST', `/alertes/desabonner/${unsubToken}`, form({ _csrf: csrfFrom(ru.text) }));
    ok(ru.status === 200 && ru.text.includes('supprimée'), 'desabonnement : confirmation affichee');
    ok((await prisma.alert.findUnique({ where: { unsubscribeToken: unsubToken } })) === null,
      'desabonnement : ligne supprimee (RGPD)');
    r = await get(`/alertes/desabonner/${unsubToken}`);
    ok(r.status === 404, 'desabonnement : jeton deja consomme -> 404');

    console.log(`\n✅ Lot I tests reussis - ${passed} assertions.`);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    // Garde : le modele n'existe pas encore pendant le premier RED.
    if (prisma.alert) await prisma.alert.deleteMany({ where: { email: { contains: String(STAMP) } } });
    // Les suppressions d'ecoles cascadent (annonces -> candidatures -> contrats).
    if (createdSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
