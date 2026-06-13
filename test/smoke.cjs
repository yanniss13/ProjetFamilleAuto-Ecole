/**
 * Smoke test de bout en bout — MoniteurConnect.
 *
 * Rejoue le parcours complet contre un serveur dédié (port distinct), sans framework
 * de test (Node >= 18 : fetch / FormData / Blob natifs). En cas d'échec, lève → exit 1.
 *
 * Couvre : inscription -> vérif email (via Prisma) -> connexion (régénération de session)
 * -> CRUD annonce -> liste publique + filtre + recherche -> candidature (CV + pièce
 * d'identité) stockée dans le stockage PRIVÉ -> consultation -> téléchargement protégé
 * (CV / CNI) -> acceptation + génération de contrat (PDF) -> refus -> envoi du contrat au
 * candidat -> rejet CSRF -> validation -> cloisonnement entre écoles. Nettoie ses données.
 */
'use strict';

const path = require('path');
const fs = require('fs');

// --- Environnement de test (avant de charger l'app, qui lit process.env au require) ---
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'smoke-test-secret-not-for-prod';
process.env.SMTP_HOST = ''; // mode dev : pas d'envoi réel d'email
process.env.GEOCODING_DISABLED = '1'; // pas d'appel réseau Nominatim en test

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { STORAGE_DIR } = require('../src/config/storage');

const PORT = 4055;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const emailA = `smoke.a.${STAMP}@example.test`;
const emailB = `smoke.b.${STAMP}@example.test`;
// SIRET uniques (14 chiffres) dérivés de l'horodatage, pour ne pas heurter d'éventuelles
// données réelles déjà en base.
const SIRET_BASE = String(STAMP).slice(-13).padStart(13, '0');
const siretA = `1${SIRET_BASE}`;
const siretB = `2${SIRET_BASE}`;
const PASSWORD = 'motdepasse123';

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`ÉCHEC : ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

// --- Mini client HTTP avec gestion manuelle des cookies (un "jar" par session) ---
function makeJar() {
  return { cookie: '' };
}
function storeCookies(jar, res) {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const sc of setCookies) jar.cookie = sc.split(';')[0];
}
async function req(jar, method, urlPath, { body, headers = {} } = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    redirect: 'manual',
    headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...headers },
    body,
  });
  storeCookies(jar, res);
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), text };
}
function csrfFrom(html) {
  const m = html.match(/name="csrf-token" content="([^"]+)"/);
  if (!m) throw new Error('Jeton CSRF introuvable dans la page.');
  return m[1];
}
function form(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) p.append(k, v);
  return { body: p.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } };
}

const MINIMAL_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'utf8');
const TINY_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f8d0000000049454e44ae426082', 'hex');

// Construit le multipart d'une candidature (CV PDF + 3 pièces image : CNI, permis, carte).
function applicationForm(name, email) {
  const fd = new FormData();
  fd.append('applicantName', name);
  fd.append('applicantEmail', email);
  fd.append('applicantPhone', '0611223344');
  fd.append('message', `Bonjour, candidature de ${name}.`);
  fd.append('cv', new Blob([MINIMAL_PDF], { type: 'application/pdf' }), 'cv.pdf');
  fd.append('idCard', new Blob([TINY_PNG], { type: 'image/png' }), 'cni.png');
  fd.append('license', new Blob([TINY_PNG], { type: 'image/png' }), 'permis.png');
  fd.append('teachingCard', new Blob([TINY_PNG], { type: 'image/png' }), 'carte.png');
  return fd;
}

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));
  console.log(`Serveur de test sur ${BASE}\n`);

  const jarA = makeJar();
  const createdSchoolIds = [];

  try {
    // 1) Inscription + vérification (posée via Prisma) + connexion
    let r = await req(jarA, 'GET', '/inscription');
    let csrf = csrfFrom(r.text);
    r = await req(jarA, 'POST', '/inscription', form({
      _csrf: csrf, businessName: 'Auto-École Smoke', email: emailA, siret: siretA,
      phone: '0600000000', address: '1 rue de la Conduite, 13001 Marseille',
      password: PASSWORD, passwordConfirm: PASSWORD,
    }));
    ok(r.status === 302 && r.location === '/connexion', 'Inscription (avec adresse) -> /connexion');
    const schoolA = await prisma.school.findUnique({ where: { email: emailA } });
    createdSchoolIds.push(schoolA.id);
    ok(schoolA.address === '1 rue de la Conduite, 13001 Marseille', 'Adresse optionnelle enregistrée à l’inscription');
    await prisma.school.update({ where: { id: schoolA.id }, data: { emailVerified: true } });

    r = await req(jarA, 'GET', '/connexion');
    csrf = csrfFrom(r.text);
    r = await req(jarA, 'POST', '/connexion', form({ _csrf: csrf, email: emailA, password: PASSWORD }));
    ok(r.status === 302 && r.location === '/tableau-de-bord', 'Connexion OK -> /tableau-de-bord');

    // Jeton CSRF stable de la session connectée (réutilisé pour tous les POST de gestion).
    r = await req(jarA, 'GET', '/mes-annonces/nouvelle');
    const csrfA = csrfFrom(r.text);

    // 2) Création d'annonce
    const keyword = `MoniteurB${STAMP}`;
    r = await req(jarA, 'POST', '/mes-annonces', form({
      _csrf: csrfA, title: `Recherche ${keyword}`, description: 'Poste de moniteur, temps plein.',
      city: 'Marseille', department: '13', contractType: 'cdi', hoursPerWeek: '35', compensation: '2200€ brut/mois',
    }));
    ok(r.status === 302, 'Annonce créée');
    const listing = await prisma.listing.findFirst({ where: { schoolId: schoolA.id }, orderBy: { id: 'desc' } });
    ok(listing && listing.status === 'open', 'Annonce ouverte en base');

    // 3) Liste publique + filtre + recherche
    const pub = makeJar();
    r = await req(pub, 'GET', '/annonces?departement=13');
    ok(r.text.includes(keyword), 'Annonce visible (filtre département)');
    r = await req(pub, 'GET', `/annonces?q=${keyword}`);
    ok(r.text.includes(keyword), 'Annonce trouvée par recherche');

    // 4) Carte de localisation (page détail)
    r = await req(pub, 'GET', `/annonces/${listing.id}`);
    ok(!r.text.includes('id="map"') && /Localisation indisponible/.test(r.text), 'Carte : fallback quand l’école n’a pas de coordonnées');
    await prisma.school.update({ where: { id: schoolA.id }, data: { latitude: 43.2965, longitude: 5.3698 } });
    r = await req(pub, 'GET', `/annonces/${listing.id}`);
    ok(r.text.includes('id="map"') && r.text.includes('data-lat="43.2965"'), 'Carte : conteneur #map rendu avec les coordonnées');

    // 5) Candidature SANS pièce d'identité -> rejetée
    const csrfPub = csrfFrom(r.text);
    {
      const fd = new FormData();
      fd.append('applicantName', 'Sans CNI');
      fd.append('applicantEmail', 'sanscni@example.test');
      fd.append('message', 'Test sans pièce.');
      fd.append('cv', new Blob([MINIMAL_PDF], { type: 'application/pdf' }), 'cv.pdf');
      r = await req(pub, 'POST', `/annonces/${listing.id}/postuler?_csrf=${encodeURIComponent(csrfPub)}`, { body: fd });
      ok(r.status === 400 && /pièce d'identité/i.test(r.text), 'Candidature sans pièce d’identité rejetée (400)');
    }

    // 5) Deux candidatures complètes (CV + CNI)
    r = await req(pub, 'POST', `/annonces/${listing.id}/postuler?_csrf=${encodeURIComponent(csrfPub)}`, { body: applicationForm('Jean Moniteur', 'jean@example.test') });
    ok(r.status === 302, 'Candidature Jean (CV + CNI) déposée');
    r = await req(pub, 'POST', `/annonces/${listing.id}/postuler?_csrf=${encodeURIComponent(csrfPub)}`, { body: applicationForm('Marie Conduite', 'marie@example.test') });
    ok(r.status === 302, 'Candidature Marie (CV + CNI) déposée');

    const apps = await prisma.application.findMany({ where: { listingId: listing.id }, orderBy: { id: 'asc' } });
    ok(apps.length === 2, 'Deux candidatures complètes en base (celle sans CNI a été refusée)');
    const [jean, marie] = apps;
    ok(jean.cvPath.startsWith('cv/') && jean.idCardPath.startsWith('id/'), 'Chemins CV (cv/) et CNI (id/) stockés');
    ok(jean.licensePath.startsWith('license/') && jean.teachingCardPath.startsWith('teaching/'), 'Chemins permis (license/) et carte (teaching/) stockés');
    ok(jean.status === 'pending', 'Candidature en statut "pending" par défaut');

    // Fichiers présents dans le stockage PRIVÉ, et ABSENTS de public/
    const cvAbs = path.join(STORAGE_DIR, jean.cvPath);
    const idAbs = path.join(STORAGE_DIR, jean.idCardPath);
    const licAbs = path.join(STORAGE_DIR, jean.licensePath);
    const teachAbs = path.join(STORAGE_DIR, jean.teachingCardPath);
    ok(fs.existsSync(cvAbs) && fs.existsSync(idAbs), 'CV + CNI présents dans storage/');
    ok(fs.existsSync(licAbs) && fs.existsSync(teachAbs), 'Permis + carte d’enseignant présents dans storage/');
    const publicCv = path.join(__dirname, '..', 'public', 'uploads', path.basename(jean.cvPath));
    ok(!fs.existsSync(publicCv), 'Aucun fichier sensible servi depuis public/uploads/');

    // 6) Téléchargement protégé des pièces (école propriétaire)
    const apBase = `/mes-annonces/${listing.id}/candidatures/${jean.id}`;
    r = await req(jarA, 'GET', `${apBase}/cv`);
    ok(r.status === 200 && r.text.startsWith('%PDF'), 'École télécharge le CV (PDF)');
    r = await req(jarA, 'GET', `${apBase}/piece-identite`);
    ok(r.status === 200, 'École télécharge la pièce d’identité');
    r = await req(jarA, 'GET', `${apBase}/permis`);
    ok(r.status === 200, 'École télécharge le permis de conduire');
    r = await req(jarA, 'GET', `${apBase}/carte-enseignant`);
    ok(r.status === 200, 'École télécharge la carte d’enseignant');

    // 7) Acceptation : validation (date manquante -> 400) puis génération du contrat
    r = await req(jarA, 'GET', `${apBase}/accepter`);
    const csrfAccept = csrfFrom(r.text);
    ok(/Établir le contrat/.test(r.text), 'Mini-formulaire de contrat affiché');

    r = await req(jarA, 'POST', `${apBase}/accepter`, form({
      _csrf: csrfAccept, type: 'freelance', grossSalary: '25€/h', workplace: 'Marseille',
      schoolAddress: '1 rue du Test', applicantAddress: '2 rue du Candidat', providerSiret: '99999999999999',
    }));
    ok(r.status === 400 && /date de début/i.test(r.text), 'Contrat sans date de début rejeté (400)');

    r = await req(jarA, 'POST', `${apBase}/accepter`, form({
      _csrf: csrfAccept, type: 'freelance', startDate: '2026-07-01', grossSalary: '25€/h', weeklyHours: '20',
      workplace: 'Marseille', schoolAddress: '1 rue du Test', applicantAddress: '2 rue du Candidat',
      providerSiret: '99999999999999', extraClauses: 'Mission renouvelable.',
      birthDate: '1990-05-12', birthPlace: 'Lyon (69)', nationality: 'Française',
      teachingAuthNumber: 'AE-2024-12345', teachingAuthValidUntil: '2030-01-01',
      licenseNumber: '13AB45678', licenseCategories: 'B, A2',
    }));
    ok(r.status === 302, 'Acceptation + génération du contrat');

    const jeanAfter = await prisma.application.findUnique({ where: { id: jean.id }, include: { contract: true } });
    ok(jeanAfter.status === 'accepted', 'Candidature passée en "accepted"');
    ok(jeanAfter.contract && jeanAfter.contract.type === 'freelance', 'Contrat créé (freelance)');
    ok(jeanAfter.contract.teachingAuthNumber === 'AE-2024-12345' && jeanAfter.contract.licenseNumber === '13AB45678' && jeanAfter.contract.birthPlace === 'Lyon (69)', 'Données d’identité (état civil, autorisation, permis) enregistrées sur le contrat');
    const pdfAbs = path.join(STORAGE_DIR, jeanAfter.contract.pdfPath);
    ok(fs.existsSync(pdfAbs) && fs.readFileSync(pdfAbs).slice(0, 4).toString() === '%PDF', 'PDF de contrat généré (en-tête %PDF)');

    // 8) Refus de l'autre candidature
    r = await req(jarA, 'POST', `/mes-annonces/${listing.id}/candidatures/${marie.id}/refuser`, form({ _csrf: csrfA }));
    ok(r.status === 302, 'Refus de la candidature Marie');
    const marieAfter = await prisma.application.findUnique({ where: { id: marie.id } });
    ok(marieAfter.status === 'rejected', 'Candidature Marie en "rejected"');

    // 9) Téléchargement + envoi du contrat
    r = await req(jarA, 'GET', `${apBase}/contrat/telecharger`);
    ok(r.status === 200 && r.text.startsWith('%PDF'), 'École télécharge le contrat (PDF)');
    r = await req(jarA, 'POST', `${apBase}/contrat/envoyer`, form({ _csrf: csrfA }));
    ok(r.status === 302, 'Envoi du contrat au candidat');
    const sent = await prisma.contract.findUnique({ where: { applicationId: jean.id } });
    ok(sent.sentToApplicantAt, 'Date d’envoi du contrat enregistrée');

    // Profil : mise à jour de l'adresse (géocodage désactivé en test)
    r = await req(jarA, 'POST', '/mon-compte', form({ _csrf: csrfA, address: '5 rue Test, 13002 Marseille', phone: '0490000000' }));
    ok(r.status === 302, 'Mise à jour du profil (adresse) -> redirection');
    const schoolUpdated = await prisma.school.findUnique({ where: { id: schoolA.id } });
    ok(schoolUpdated.address === '5 rue Test, 13002 Marseille', 'Nouvelle adresse enregistrée en base');

    // 10) CSRF & cloisonnement
    r = await req(jarA, 'POST', `/mes-annonces/${listing.id}/candidatures/${marie.id}/refuser`, form({}));
    ok(r.status === 403, 'POST sans jeton CSRF rejeté (403)');

    const jarB = makeJar();
    r = await req(jarB, 'GET', '/inscription');
    csrf = csrfFrom(r.text);
    await req(jarB, 'POST', '/inscription', form({
      _csrf: csrf, businessName: 'École B', email: emailB, siret: siretB, password: PASSWORD, passwordConfirm: PASSWORD,
    }));
    const schoolB = await prisma.school.findUnique({ where: { email: emailB } });
    createdSchoolIds.push(schoolB.id);
    await prisma.school.update({ where: { id: schoolB.id }, data: { emailVerified: true } });
    r = await req(jarB, 'GET', '/connexion');
    csrf = csrfFrom(r.text);
    await req(jarB, 'POST', '/connexion', form({ _csrf: csrf, email: emailB, password: PASSWORD }));

    r = await req(jarB, 'GET', `${apBase}/cv`);
    ok(r.status === 404, 'École B ne peut pas télécharger le CV d’une candidature de A (404)');
    r = await req(jarB, 'GET', `${apBase}/permis`);
    ok(r.status === 404, 'École B ne peut pas télécharger le permis de A (404)');
    r = await req(jarB, 'GET', `${apBase}/contrat/telecharger`);
    ok(r.status === 404, 'École B ne peut pas télécharger le contrat de A (404)');

    console.log(`\n✅ Smoke test réussi — ${passed} assertions.`);
  } finally {
    // Nettoyage exhaustif des fichiers : toutes les pièces (CV/CNI) + contrats des écoles
    // de test, puis suppression en base (cascade) et arrêt du serveur.
    if (createdSchoolIds.length) {
      const apps = await prisma.application.findMany({
        where: { listing: { schoolId: { in: createdSchoolIds } } },
        include: { contract: true },
      });
      for (const a of apps) {
        const rels = [a.cvPath, a.idCardPath, a.licensePath, a.teachingCardPath, a.contract && a.contract.pdfPath];
        for (const rel of rels) {
          if (rel) { const abs = path.join(STORAGE_DIR, rel); try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch {} }
        }
      }
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    }
    await prisma.$disconnect();
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
