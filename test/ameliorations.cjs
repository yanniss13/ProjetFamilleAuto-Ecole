/**
 * Tests des améliorations de la revue de code (points 5-8) :
 *   5. Sessions persistées en base via PrismaSessionStore (plus de MemoryStore).
 *   6. Limites de longueur sur les champs texte libres + format du département.
 *   7. Contrôle des magic bytes des fichiers téléversés (le mimetype client est déclaratif).
 *   8. L'inscription répond sans attendre le géocodage (fire-and-forget).
 */
'use strict';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'ameliorations-test-secret-not-for-prod';
process.env.SMTP_HOST = '';
process.env.GEOCODING_DISABLED = '1';
process.env.SIRET_LOOKUP_DISABLED = '1';

const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const geocoder = require('../src/services/geocoder');
const { validateListing } = require('../src/validators/listingValidator');
const { validateApplication } = require('../src/validators/applicationValidator');
const { validateRegister, validateProfile } = require('../src/validators/schoolValidator');
const { STORAGE_DIR } = require('../src/config/storage');
const { configureViewport } = require('../scripts/captures-jury');

const PORT = 4060;
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
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function listDir(sub) { return new Set(fs.readdirSync(path.join(STORAGE_DIR, sub))); }

const createdSchoolIds = [];

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));
  try {
    const pageNavigationMobile = await req(makeJar(), 'GET', '/');
    ok(pageNavigationMobile.status === 200
      && pageNavigationMobile.text.includes('id="navigation-toggle"')
      && pageNavigationMobile.text.includes('aria-expanded="false"')
      && pageNavigationMobile.text.includes('aria-controls="navigation-principale"')
      && pageNavigationMobile.text.includes('id="navigation-principale"')
      && pageNavigationMobile.text.includes('src="/js/mobile-nav.js"'),
    'navigation mobile : contrat HTML accessible et script charge');

    const mobileNavPath = path.join(__dirname, '..', 'public', 'js', 'mobile-nav.js');
    ok(fs.existsSync(mobileNavPath), 'navigation mobile : script statique present');
    const { setMenuState } = require(mobileNavPath);
    const classesNavigation = new Set();
    const fauxHeader = {
      classList: {
        toggle: (nom, actif) => (actif ? classesNavigation.add(nom) : classesNavigation.delete(nom)),
        contains: (nom) => classesNavigation.has(nom),
      },
    };
    const attributsNavigation = {};
    const fauxBoutonNavigation = {
      setAttribute: (nom, valeur) => { attributsNavigation[nom] = valeur; },
      getAttribute: (nom) => attributsNavigation[nom],
    };
    setMenuState(fauxHeader, fauxBoutonNavigation, true);
    ok(classesNavigation.has('navbar-mobile-open')
      && attributsNavigation['aria-expanded'] === 'true'
      && attributsNavigation['aria-label'] === 'Fermer le menu',
    'navigation mobile : ouverture synchronise classe et attributs ARIA');
    setMenuState(fauxHeader, fauxBoutonNavigation, false);
    ok(!classesNavigation.has('navbar-mobile-open')
      && attributsNavigation['aria-expanded'] === 'false'
      && attributsNavigation['aria-label'] === 'Ouvrir le menu',
    'navigation mobile : fermeture synchronise classe et attributs ARIA');

    // --- Captures jury : le viewport CDP ne depend pas de la fenetre Edge ---
    {
      const appels = [];
      const fauxCdp = {
        cmd: async (methode, parametres) => appels.push({ methode, parametres }),
      };
      await configureViewport(fauxCdp, 320, 1000);
      ok(appels[0].methode === 'Emulation.setDeviceMetricsOverride'
        && appels[0].parametres.width === 320
        && appels[0].parametres.height === 1000
        && appels[0].parametres.deviceScaleFactor === 1
        && appels[0].parametres.mobile === true
        && appels[1]
        && appels[1].methode === 'Emulation.setScrollbarsHidden'
        && appels[1].parametres.hidden === true,
      'captures jury : viewport mobile fixe exactement a 320 px');

      await configureViewport(fauxCdp, 768, 1000);
      ok(appels[2].parametres.width === 768 && appels[2].parametres.mobile === false,
        'captures jury : 768 px utilise le viewport desktop exact');
    }

    // ------------------- 5. Sessions persistées en base (Prisma) -------------------
    const PrismaSessionStore = require('../src/config/sessionStore');
    const store = new PrismaSessionStore(prisma);
    const sid = `test-sid-${STAMP}`;

    await new Promise((res, rej) => store.set(sid, { cookie: { maxAge: 60000 }, foo: 'bar' }, (e) => (e ? rej(e) : res())));
    let sess = await new Promise((res, rej) => store.get(sid, (e, s) => (e ? rej(e) : res(s))));
    ok(sess && sess.foo === 'bar', 'Sessions : set/get aller-retour via la base');

    await new Promise((res, rej) => store.destroy(sid, (e) => (e ? rej(e) : res())));
    sess = await new Promise((res, rej) => store.get(sid, (e, s) => (e ? rej(e) : res(s))));
    ok(sess == null, 'Sessions : destroy supprime la session');

    await new Promise((res, rej) => store.set(sid, { cookie: { expires: new Date(Date.now() - 1000).toISOString() } }, (e) => (e ? rej(e) : res())));
    sess = await new Promise((res, rej) => store.get(sid, (e, s) => (e ? rej(e) : res(s))));
    ok(sess == null, 'Sessions : une session expirée n’est pas restituée');

    // Intégration : une connexion réelle écrit la session (schoolId) en base.
    const school = await prisma.school.create({
      data: {
        email: `amel.school.${STAMP}@example.test`, passwordHash: await require('../src/utils/password').hash('motdepasse123'),
        businessName: 'Amel School', siret: `4${String(STAMP).slice(-13).padStart(13, '0')}`,
        emailVerified: true,
      },
    });
    createdSchoolIds.push(school.id);
    const jar = makeJar();
    let r = await req(jar, 'GET', '/connexion');
    r = await req(jar, 'POST', '/connexion', form({ _csrf: csrfFrom(r.text), email: school.email, password: 'motdepasse123' }));
    ok(r.status === 302 && r.location === '/tableau-de-bord', 'Sessions : connexion école OK');
    const row = await prisma.session.findFirst({ where: { data: { contains: `"schoolId":${school.id}` } } });
    ok(Boolean(row), 'Sessions : la session de connexion est persistée en base');

    // --------------- 6. Limites de longueur + format du département ---------------
    const okListing = { title: 'Titre', description: 'Desc', city: 'Pau', department: '64' };
    let v = validateListing({ ...okListing, title: 'x'.repeat(151) });
    ok(!v.isValid && v.errors.title, 'Longueurs : titre d’annonce > 150 refusé');
    v = validateListing({ ...okListing, description: 'x'.repeat(5001) });
    ok(!v.isValid && v.errors.description, 'Longueurs : description d’annonce > 5000 refusée');
    v = validateListing({ ...okListing, city: 'x'.repeat(101) });
    ok(!v.isValid && v.errors.city, 'Longueurs : ville > 100 refusée');
    v = validateListing({ ...okListing, department: 'ABC' });
    ok(!v.isValid && v.errors.department, 'Département : format invalide refusé');
    v = validateListing({ ...okListing, department: '2a' });
    ok(v.isValid && v.value.department === '2A', 'Département : "2a" accepté et normalisé en "2A"');
    v = validateListing({ ...okListing, department: '971' });
    ok(v.isValid, 'Département : DOM "971" accepté');

    const okApp = { applicantName: 'Nom', applicantEmail: 'a@b.fr', message: 'Bonjour' };
    v = validateApplication({ ...okApp, message: 'x'.repeat(3001) });
    ok(!v.isValid && v.errors.message, 'Longueurs : message de candidature > 3000 refusé');
    v = validateApplication({ ...okApp, applicantName: 'x'.repeat(101) });
    ok(!v.isValid && v.errors.applicantName, 'Longueurs : nom de candidat > 100 refusé');

    const okReg = { businessName: 'AE', email: 'r@e.fr', siret: '12345678901234', password: 'motdepasse123', passwordConfirm: 'motdepasse123' };
    v = validateRegister({ ...okReg, businessName: 'x'.repeat(151) });
    ok(!v.isValid && v.errors.businessName, 'Longueurs : raison sociale > 150 refusée');
    v = validateProfile({ address: 'x'.repeat(251), phone: '0611' });
    ok(!v.isValid && v.errors.address, 'Longueurs : adresse de profil > 250 refusée');

    // ---------------- 7. Magic bytes des fichiers téléversés ----------------
    const listing = await prisma.listing.create({
      data: {
        title: `AmelAnnonce ${STAMP}`, description: 'test', city: 'Pau', department: '64',
        schoolId: school.id, titleLower: `amelannonce ${STAMP}`, descriptionLower: 'test', cityLower: 'pau',
      },
    });
    const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const PDF_BYTES = '%PDF-1.4\n%%EOF\n';
    const anon = makeJar();
    r = await req(anon, 'GET', `/annonces/${listing.id}`);
    const anonToken = csrfFrom(r.text);

    const fd = new FormData();
    fd.append('_csrf', anonToken);
    fd.append('applicantName', 'Faux PDF');
    fd.append('applicantEmail', `faux.${STAMP}@example.test`);
    fd.append('message', 'Bonjour.');
    // CV : contenu PNG déguisé en PDF (mimetype et extension mentent sur le contenu).
    fd.append('cv', new Blob([PNG_BYTES], { type: 'application/pdf' }), 'cv.pdf');
    fd.append('idCard', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'id.pdf');
    fd.append('license', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'permis.pdf');
    fd.append('teachingCard', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'carte.pdf');

    const cvBefore = listDir('cv');
    r = await req(anon, 'POST', `/annonces/${listing.id}/postuler`, { body: fd });
    ok(r.status === 400, 'Magic bytes : contenu PNG déguisé en PDF -> 400');
    ok((await prisma.application.count({ where: { listingId: listing.id } })) === 0,
      'Magic bytes : aucune candidature créée');
    ok([...listDir('cv')].every((f) => cvBefore.has(f)),
      'Magic bytes : le fichier au contenu invalide est supprimé du disque');

    // ------------- 8. Inscription : géocodage hors du chemin de réponse -------------
    const origCoordsFor = geocoder.coordsFor;
    let resolveGeo;
    try {
      geocoder.coordsFor = () => new Promise((res2) => { resolveGeo = res2; });
      const geoJar = makeJar();
      r = await req(geoJar, 'GET', '/inscription');
      const geoToken = csrfFrom(r.text);
      const geoEmail = `amel.geo.${STAMP}@example.test`;
      const postP = req(geoJar, 'POST', '/inscription', form({
        _csrf: geoToken, businessName: 'Geo School', email: geoEmail,
        siret: `3${String(STAMP).slice(-13).padStart(13, '0')}`,
        address: '1 rue de la Paix, Paris',
        password: 'motdepasse123', passwordConfirm: 'motdepasse123',
      }));
      const winner = await Promise.race([postP.then(() => 'response'), delay(1500).then(() => 'timeout')]);
      ok(winner === 'response', 'Géocodage : l’inscription répond sans attendre le géocodage');

      const created = await prisma.school.findUnique({ where: { email: geoEmail } });
      createdSchoolIds.push(created.id);
      ok(created && created.latitude == null, 'Géocodage : école créée immédiatement, coordonnées encore nulles');

      resolveGeo({ latitude: 43.6, longitude: 1.44 });
      resolveGeo = null;
      await delay(150);
      const after = await prisma.school.findUnique({ where: { email: geoEmail } });
      ok(after.latitude === 43.6 && after.longitude === 1.44,
        'Géocodage : coordonnées enregistrées après coup (fire-and-forget)');
    } finally {
      if (resolveGeo) resolveGeo({ latitude: null, longitude: null });
      geocoder.coordsFor = origCoordsFor;
    }

    // --- Gabarit HTML commun des emails ---
    {
      const mailer = require('../src/services/mailer');
      ok(typeof mailer.emailLayout === 'function', 'email : gabarit HTML exporté');
      const html = mailer.emailLayout({
        title: 'Titre <b>test</b>',
        contentHtml: '<p>Corps du message.</p>',
        cta: { label: 'Ouvrir', url: 'https://exemple.test/action' },
      });
      ok(html.includes('MoniteurConnect') && html.includes('Corps du message.'), 'email : marque + contenu présents');
      ok(html.includes('Titre &lt;b&gt;test&lt;/b&gt;'), 'email : titre échappé (anti-injection)');
      ok(html.includes('href="https://exemple.test/action"') && html.includes('>Ouvrir<') && html.includes('copiez ce lien'),
        'email : bouton d’action + lien de secours en clair');
      ok(!html.includes('<script') && !html.includes('<link'), 'email : aucun script ni ressource externe');
    }

    // --- Transport SMTP : auth seulement si SMTP_USER est défini (Mailpit) ---
    {
      const mailer = require('../src/services/mailer');
      ok(typeof mailer.buildTransportOptions === 'function', 'smtp : buildTransportOptions exportée');
      const sans = mailer.buildTransportOptions({ SMTP_HOST: 'localhost', SMTP_PORT: '1025' });
      ok(!('auth' in sans), 'smtp : pas de bloc auth sans SMTP_USER (Mailpit)');
      ok(sans.port === 1025 && sans.secure === false, 'smtp : port et sécurité conservés');
      const avec = mailer.buildTransportOptions({ SMTP_HOST: 'smtp.exemple.test', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p' });
      ok(avec.auth && avec.auth.user === 'u' && avec.secure === true, 'smtp : auth présent avec SMTP_USER');
    }

    console.log(`\n✅ Tests des améliorations réussis — ${passed} assertions.`);
  } finally {
    if (prisma.session) await prisma.session.deleteMany({ where: { sid: { startsWith: 'test-sid-' } } }).catch(() => {});
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
    await prisma.$disconnect();
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
